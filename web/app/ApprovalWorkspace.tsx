"use client";

import { useEffect, useState } from "react";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import { type SuiGrpcClient } from "@mysten/sui/grpc";

import { PROCUREYETI_PACKAGE_ID, SUI_CLOCK_OBJECT_ID } from "./config";
import { dAppKit } from "./dapp-kit";
import { getBtnClass } from "./button-styles";
import type { PolicyStatus } from "./policy-engine";

type PurchaseRequest = {
  id: string;
  item: string;
  category: string;
  quantity: number;
  budget: number;
  currency: string;
  deliveryDate: string;
  notes: string;
  createdAt: string;
  policyStatus?: PolicyStatus;
  policyReason?: string;
};

type Supplier = {
  id: string;
  name: string;
  status: "Active" | "Inactive";
  suiAddress?: string;
};

type Quotation = {
  id: string;
  requestId: string;
  supplierId: string;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  deliveryDays: number;
  paymentTerms: string;
  validUntil: string;
  notes: string;
  createdAt: string;
  policyStatus?: PolicyStatus;
  policyReason?: string;
  unitPriceDecimal?: string;
  totalPriceDecimal?: string;
};

const MIST_PER_SUI = BigInt("1000000000");
const SUI_ADDRESS_REGEX = /^0x[0-9a-fA-F]{64}$/;

function parseSuiToMist(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Amount must be a valid positive number.");
  }
  const parts = trimmed.split(".");
  const intPart = parts[0] || "0";
  const decPart = parts[1] || "";
  if (decPart.length > 9) {
    throw new Error("SUI unit price cannot have more than 9 decimal places.");
  }
  const paddedDec = decPart.padEnd(9, "0");
  const mist = BigInt(intPart) * MIST_PER_SUI + BigInt(paddedDec);
  if (mist <= BigInt(0)) {
    throw new Error("SUI unit price must be greater than zero.");
  }
  return mist;
}

function getSuiSortKey(q: Quotation):
  | { kind: 0; mist: bigint }
  | { kind: 1; total: number }
  | { kind: 2; total: number } {
  if (typeof q.totalPriceDecimal === "string" && q.totalPriceDecimal.trim() !== "") {
    try {
      const mist = parseSuiToMist(q.totalPriceDecimal);
      return { kind: 0, mist };
    } catch {
      return {
        kind: 2,
        total: Number.isFinite(q.totalPrice) ? q.totalPrice : Number.MAX_VALUE,
      };
    }
  }
  return {
    kind: 1,
    total: Number.isFinite(q.totalPrice) ? q.totalPrice : Number.MAX_VALUE,
  };
}

function compareQuotations(a: Quotation, b: Quotation): number {
  if (a.currency === "SUI" || b.currency === "SUI") {
    const keyA = getSuiSortKey(a);
    const keyB = getSuiSortKey(b);

    if (keyA.kind !== keyB.kind) {
      return keyA.kind - keyB.kind;
    }

    if (keyA.kind === 0 && keyB.kind === 0) {
      if (keyA.mist < keyB.mist) return -1;
      if (keyA.mist > keyB.mist) return 1;
      return a.id.localeCompare(b.id);
    }

    if (keyA.kind === 1 && keyB.kind === 1) {
      if (keyA.total !== keyB.total) {
        return keyA.total - keyB.total;
      }
      return a.id.localeCompare(b.id);
    }

    if (keyA.kind === 2 && keyB.kind === 2) {
      if (keyA.total !== keyB.total) {
        return keyA.total - keyB.total;
      }
      return a.id.localeCompare(b.id);
    }
  }

  // Preserve existing NGN/USD sorting behavior
  return a.totalPrice - b.totalPrice;
}

function safeNormalizeAddress(address: string): string {
  try {
    return normalizeSuiAddress(address);
  } catch {
    const trimmed = address.trim().toLowerCase();
    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return "0x" + hex.padStart(64, "0");
  }
}

function mistToSuiDecimal(mist: bigint): string {
  const whole = (mist / MIST_PER_SUI).toString();
  const rem = (mist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
  return rem ? `${whole}.${rem}` : whole;
}

export const PurchaseApprovalBcs = bcs.struct("PurchaseApproval", {
  purchase_id: bcs.u64(),
  supplier: bcs.Address,
  amount_mist: bcs.u64(),
  approved: bcs.bool(),
  executed: bcs.bool(),
});

export const ProcurementPolicyBcs = bcs.struct("ProcurementPolicy", {
  id: bcs.Address,
  owner: bcs.Address,
  agent: bcs.Address,
  max_per_purchase_mist: bcs.u64(),
  daily_limit_mist: bcs.u64(),
  daily_spent_mist: bcs.u64(),
  current_day: bcs.u64(),
  active: bcs.bool(),
  allowance_id: bcs.option(bcs.Address),
  next_purchase_id: bcs.u64(),
  purchases: bcs.vector(PurchaseApprovalBcs),
});

export type PurchaseApprovalRecord = {
  purchase_id: string;
  supplier: string;
  amount_mist: string;
  approved: boolean;
  executed: boolean;
};

export type DecodedProcurementPolicy = {
  id: string;
  owner: string;
  agent: string;
  max_per_purchase_mist: string;
  daily_limit_mist: string;
  daily_spent_mist: string;
  current_day: string;
  active: boolean;
  allowance_id: string | null;
  next_purchase_id: string;
  purchases: PurchaseApprovalRecord[];
};

export async function fetchOnChainPolicy(
  client: SuiGrpcClient,
  policyId: string
): Promise<DecodedProcurementPolicy> {
  const res = await client.getObject({
    objectId: policyId,
    include: { content: true },
  });

  if (!res.object) {
    throw new Error(`ProcurementPolicy object ${policyId} not found on Sui Testnet.`);
  }

  if (!res.object.type || !res.object.type.endsWith("::procureyeti::ProcurementPolicy")) {
    throw new Error(
      `Object ${policyId} is not a valid ProcurementPolicy (found type: ${res.object.type || "missing"}).`
    );
  }

  if (!res.object.content) {
    throw new Error(`ProcurementPolicy object ${policyId} has no Move struct content.`);
  }

  try {
    return ProcurementPolicyBcs.parse(res.object.content) as DecodedProcurementPolicy;
  } catch (err) {
    throw new Error(
      `Failed to decode ProcurementPolicy object content: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export type PendingApprovalRecovery = {
  requestId: string;
  quotationId: string;
  supplierAddress: string;
  amountMist: string;
  beforePurchaseIds: string[];
  beforeNextPurchaseId: string;
  txDigest?: string;
  status: "submitted" | "tx_confirmed" | "reconciliation_failed";
  timestamp: string;
  reason?: string;
};

type ReconciliationResult =
  | { success: true; purchaseId: string; purchase: PurchaseApprovalRecord }
  | { success: false; reason: string; matchingCount: number };

export function reconcilePurchaseWithPolicy(
  policy: DecodedProcurementPolicy,
  marker: PendingApprovalRecovery
): ReconciliationResult {
  const beforeIds = new Set(marker.beforePurchaseIds);
  const beforeNext = BigInt(marker.beforeNextPurchaseId);
  const afterNext = BigInt(policy.next_purchase_id);

  // 1. Consistency check: on-chain next_purchase_id counter must have advanced
  if (afterNext <= beforeNext) {
    return {
      success: false,
      reason: `On-chain counter has not advanced (before: ${beforeNext.toString()}, current: ${afterNext.toString()}). The transaction may still be propagating or indexing.`,
      matchingCount: 0,
    };
  }

  // 2. Inspect purchase records added since pre-submission state
  const newPurchases = policy.purchases.filter(
    (p) => !beforeIds.has(p.purchase_id)
  );

  // 3. Filter candidates strictly against all recorded criteria:
  // - Purchase ID in valid counter window [beforeNext, afterNext)
  // - Normalized supplier address matches
  // - Exact amount in MIST matches
  // - Approved flag is true
  const matchingCandidates = newPurchases.filter((p) => {
    const idBig = BigInt(p.purchase_id);
    const matchesCounterWindow = idBig >= beforeNext && idBig < afterNext;
    const matchesSupplier =
      safeNormalizeAddress(p.supplier) ===
      safeNormalizeAddress(marker.supplierAddress);
    const matchesAmount = p.amount_mist === marker.amountMist;
    const isApproved = p.approved === true;

    return (
      matchesCounterWindow && matchesSupplier && matchesAmount && isApproved
    );
  });

  if (matchingCandidates.length === 0) {
    return {
      success: false,
      reason: `No matching approved purchase found for supplier ${marker.supplierAddress.slice(
        0,
        8
      )}... and amount ${marker.amountMist} MIST in counter range [${beforeNext.toString()}, ${afterNext.toString()}).`,
      matchingCount: 0,
    };
  }

  if (matchingCandidates.length > 1) {
    return {
      success: false,
      reason: `Ambiguous matching records: found ${matchingCandidates.length} matching purchases in counter range [${beforeNext.toString()}, ${afterNext.toString()}). Manual reconciliation required.`,
      matchingCount: matchingCandidates.length,
    };
  }

  return {
    success: true,
    purchaseId: matchingCandidates[0].purchase_id,
    purchase: matchingCandidates[0],
  };
}

const MAX_U64 = BigInt("18446744073709551615");

function isValidU64String(str: unknown, allowZero = true): boolean {
  if (typeof str !== "string" || !/^\d+$/.test(str.trim())) return false;
  try {
    const val = BigInt(str.trim());
    return allowZero
      ? val >= BigInt(0) && val <= MAX_U64
      : val > BigInt(0) && val <= MAX_U64;
  } catch {
    return false;
  }
}

/**
 * In Web3 and Sui wallet extensions, client cancellation error codes (such as EIP-1193 code 4001)
 * or user cancellation strings cannot reliably prove that a transaction was not broadcast before
 * the rejection event was triggered (e.g. extension RPC timeout, window close during transmission).
 * Per security audit requirements, no wallet error signal is assumed to be a definitive pre-broadcast rejection.
 * All wallet/RPC failures must preserve recovery tracking and require on-chain reconciliation.
 */
export function isDefinitivePreBroadcastRejection(_err: unknown): boolean {
  void _err;
  return false;
}

export function validateRecoveryMarker(
  item: unknown
):
  | { valid: true; marker: PendingApprovalRecovery }
  | { valid: false; error: string } {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { valid: false, error: "Recovery entry is not an object" };
  }
  const obj = item as Record<string, unknown>;

  if (typeof obj.requestId !== "string" || obj.requestId.trim() === "") {
    return { valid: false, error: "Missing or invalid requestId" };
  }
  if (typeof obj.quotationId !== "string" || obj.quotationId.trim() === "") {
    return {
      valid: false,
      error: `Invalid quotationId for request ${String(obj.requestId)}`,
    };
  }
  if (
    typeof obj.supplierAddress !== "string" ||
    !SUI_ADDRESS_REGEX.test(obj.supplierAddress)
  ) {
    return {
      valid: false,
      error: `Invalid supplierAddress for request ${String(obj.requestId)}`,
    };
  }
  if (
    typeof obj.amountMist !== "string" ||
    !isValidU64String(obj.amountMist, false)
  ) {
    return {
      valid: false,
      error: `Invalid amountMist for request ${String(obj.requestId)}`,
    };
  }
  if (
    typeof obj.beforeNextPurchaseId !== "string" ||
    !isValidU64String(obj.beforeNextPurchaseId, true)
  ) {
    return {
      valid: false,
      error: `Invalid beforeNextPurchaseId for request ${String(obj.requestId)}`,
    };
  }
  if (
    !Array.isArray(obj.beforePurchaseIds) ||
    !obj.beforePurchaseIds.every(
      (id) => typeof id === "string" && isValidU64String(id, true)
    )
  ) {
    return {
      valid: false,
      error: `Invalid beforePurchaseIds for request ${String(obj.requestId)}`,
    };
  }
  const validStatuses = ["submitted", "tx_confirmed", "reconciliation_failed"];
  if (typeof obj.status !== "string" || !validStatuses.includes(obj.status)) {
    return {
      valid: false,
      error: `Invalid status "${String(obj.status)}" for request ${String(
        obj.requestId
      )}`,
    };
  }
  if (
    obj.txDigest !== undefined &&
    (typeof obj.txDigest !== "string" || obj.txDigest.trim() === "")
  ) {
    return {
      valid: false,
      error: `Invalid txDigest for request ${String(obj.requestId)}`,
    };
  }
  if (
    typeof obj.timestamp !== "string" ||
    isNaN(Date.parse(obj.timestamp))
  ) {
    return {
      valid: false,
      error: `Invalid timestamp for request ${String(obj.requestId)}`,
    };
  }
  if (obj.reason !== undefined && typeof obj.reason !== "string") {
    return {
      valid: false,
      error: `Invalid reason for request ${String(obj.requestId)}`,
    };
  }

  return {
    valid: true,
    marker: {
      requestId: obj.requestId.trim(),
      quotationId: obj.quotationId.trim(),
      supplierAddress: obj.supplierAddress.trim(),
      amountMist: obj.amountMist.trim(),
      beforePurchaseIds: obj.beforePurchaseIds.map((id) => String(id).trim()),
      beforeNextPurchaseId: String(obj.beforeNextPurchaseId).trim(),
      status: obj.status as
        | "submitted"
        | "tx_confirmed"
        | "reconciliation_failed",
      timestamp: obj.timestamp,
      txDigest:
        typeof obj.txDigest === "string" ? obj.txDigest.trim() : undefined,
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
    },
  };
}

export type LoadRecoveriesResult = {
  recoveries: Record<string, PendingApprovalRecovery>;
  corruptionError: string | null;
};

export function loadStoredRecoveries(): LoadRecoveriesResult {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw || raw.trim() === "") {
      return { recoveries: {}, corruptionError: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      return {
        recoveries: {},
        corruptionError: `Corrupted recovery JSON in localStorage: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`,
      };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        recoveries: {},
        corruptionError:
          "Corrupted recovery storage format (expected an object of records).",
      };
    }

    const dict = parsed as Record<string, unknown>;
    const validated: Record<string, PendingApprovalRecovery> = {};

    for (const [key, value] of Object.entries(dict)) {
      const res = validateRecoveryMarker(value);
      if (!res.valid) {
        return {
          recoveries: validated,
          corruptionError: `Corrupted recovery record for key "${key}": ${res.error}.`,
        };
      }
      if (res.marker.requestId !== key) {
        return {
          recoveries: validated,
          corruptionError: `Mismatched key "${key}" with recovery requestId "${res.marker.requestId}".`,
        };
      }
      validated[key] = res.marker;
    }

    return { recoveries: validated, corruptionError: null };
  } catch (err) {
    return {
      recoveries: {},
      corruptionError: `Unexpected error reading recovery storage: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

export function persistStoredRecoveries(
  recoveries: Record<string, PendingApprovalRecovery>
): boolean {
  try {
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(recoveries));
    return true;
  } catch (err) {
    console.error("Could not persist pending recoveries to localStorage:", err);
    return false;
  }
}

export const EXECUTION_RECOVERY_STORAGE_KEY = "procureyeti-pending-executions";
export const VERIFIED_ALLOWANCE_ID = "0x4a58de319fc88b935ce9518ea9a1cd8561a51225663857a42d54d1592457a8cb";

export type PendingExecutionRecovery = {
  requestId: string;
  purchaseId: string;
  supplierAddress: string;
  amountMist: string;
  txDigest?: string;
  status: "submitted" | "tx_confirmed" | "reconciliation_failed";
  timestamp: string;
};

export function validateExecutionMarker(
  item: unknown
):
  | { valid: true; marker: PendingExecutionRecovery }
  | { valid: false; error: string } {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { valid: false, error: "Execution recovery entry is not an object" };
  }
  const obj = item as Record<string, unknown>;

  if (typeof obj.requestId !== "string" || obj.requestId.trim() === "") {
    return { valid: false, error: "Missing or invalid requestId" };
  }
  if (
    typeof obj.purchaseId !== "string" ||
    !isValidU64String(obj.purchaseId, false)
  ) {
    return {
      valid: false,
      error: `Invalid purchaseId for request ${String(obj.requestId)}`,
    };
  }
  if (
    typeof obj.supplierAddress !== "string" ||
    !SUI_ADDRESS_REGEX.test(obj.supplierAddress)
  ) {
    return {
      valid: false,
      error: `Invalid supplierAddress for request ${String(obj.requestId)}`,
    };
  }
  if (
    typeof obj.amountMist !== "string" ||
    !isValidU64String(obj.amountMist, false)
  ) {
    return {
      valid: false,
      error: `Invalid amountMist for request ${String(obj.requestId)}`,
    };
  }
  const validStatuses = ["submitted", "tx_confirmed", "reconciliation_failed"];
  if (typeof obj.status !== "string" || !validStatuses.includes(obj.status)) {
    return {
      valid: false,
      error: `Invalid status "${String(obj.status)}" for request ${String(
        obj.requestId
      )}`,
    };
  }
  if (
    obj.txDigest !== undefined &&
    (typeof obj.txDigest !== "string" || obj.txDigest.trim() === "")
  ) {
    return {
      valid: false,
      error: `Invalid txDigest for request ${String(obj.requestId)}`,
    };
  }
  if (
    typeof obj.timestamp !== "string" ||
    isNaN(Date.parse(obj.timestamp))
  ) {
    return {
      valid: false,
      error: `Invalid timestamp for request ${String(obj.requestId)}`,
    };
  }

  return {
    valid: true,
    marker: {
      requestId: obj.requestId.trim(),
      purchaseId: obj.purchaseId.trim(),
      supplierAddress: obj.supplierAddress.trim(),
      amountMist: obj.amountMist.trim(),
      status: obj.status as
        | "submitted"
        | "tx_confirmed"
        | "reconciliation_failed",
      timestamp: obj.timestamp,
      txDigest:
        typeof obj.txDigest === "string" ? obj.txDigest.trim() : undefined,
    },
  };
}

export type LoadExecutionRecoveriesResult = {
  recoveries: Record<string, PendingExecutionRecovery>;
  corruptionError: string | null;
};

export function loadStoredExecutionRecoveries(): LoadExecutionRecoveriesResult {
  try {
    const raw = localStorage.getItem(EXECUTION_RECOVERY_STORAGE_KEY);
    if (!raw || raw.trim() === "") {
      return { recoveries: {}, corruptionError: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      return {
        recoveries: {},
        corruptionError: `Corrupted execution recovery JSON in localStorage: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`,
      };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        recoveries: {},
        corruptionError:
          "Corrupted execution recovery storage format (expected an object of records).",
      };
    }

    const dict = parsed as Record<string, unknown>;
    const validated: Record<string, PendingExecutionRecovery> = {};

    for (const [key, value] of Object.entries(dict)) {
      const res = validateExecutionMarker(value);
      if (!res.valid) {
        return {
          recoveries: validated,
          corruptionError: `Corrupted execution recovery record for key "${key}": ${res.error}.`,
        };
      }
      if (res.marker.purchaseId !== key && res.marker.requestId !== key) {
        return {
          recoveries: validated,
          corruptionError: `Mismatched key "${key}" with execution recovery purchaseId "${res.marker.purchaseId}".`,
        };
      }
      validated[key] = res.marker;
    }

    return { recoveries: validated, corruptionError: null };
  } catch (err) {
    return {
      recoveries: {},
      corruptionError: `Unexpected error reading execution recovery storage: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

export function persistStoredExecutionRecoveries(
  recoveries: Record<string, PendingExecutionRecovery>
): boolean {
  try {
    localStorage.setItem(EXECUTION_RECOVERY_STORAGE_KEY, JSON.stringify(recoveries));
    return true;
  } catch (err) {
    console.error("Could not persist pending executions to localStorage:", err);
    return false;
  }
}

type ApprovalDecision = {
  requestId: string;
  status: "Approved" | "Rejected";
  quotationId: string | null;
  reason: string;
  decidedAt: string;
  onChainPurchaseId?: string;
  approvalTxDigest?: string;
  executionTxDigest?: string;
  executedAt?: string;
};

const REQUESTS_KEY = "procureyeti-requests";
const SUPPLIERS_KEY = "procureyeti-suppliers";
const QUOTATIONS_KEY = "procureyeti-quotations";
const APPROVALS_KEY = "procureyeti-approvals";
const POLICY_STORAGE_KEY = "procureyeti-policy";
const RECOVERY_STORAGE_KEY = "procureyeti-pending-approvals";
const VERIFIED_POLICY_ID = "0x253ae60c635ceec06b63caa32111e3c8f1ade723dba8a7ec866b49bc0213c3ae";

export function ApprovalWorkspace() {
  const dAppKitInstance = useDAppKit(dAppKit);
  const currentAccount = useCurrentAccount({ dAppKit });

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [decisions, setDecisions] = useState<ApprovalDecision[]>([]);
  const [recoveries, setRecoveries] = useState<Record<string, PendingApprovalRecovery>>({});
  const [recoveryCorruptedError, setRecoveryCorruptedError] = useState<string | null>(null);
  const [executionRecoveries, setExecutionRecoveries] = useState<Record<string, PendingExecutionRecovery>>({});
  const [executionCorruptedError, setExecutionCorruptedError] = useState<string | null>(null);
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [submittingRequestId, setSubmittingRequestId] = useState<string | null>(null);
  const [reconcilingRequestId, setReconcilingRequestId] = useState<string | null>(null);
  const [executingPurchaseId, setExecutingPurchaseId] = useState<string | null>(null);
  const [reconcilingExecutionId, setReconcilingExecutionId] = useState<string | null>(null);

  const [onChainPolicyId, setOnChainPolicyId] = useState<string>(VERIFIED_POLICY_ID);
  const [onChainPolicy, setOnChainPolicy] = useState<DecodedProcurementPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyError, setPolicyError] = useState("");

  useEffect(() => {
    try {
      const storedPolicy = localStorage.getItem(POLICY_STORAGE_KEY);
      if (storedPolicy) {
        const parsed = JSON.parse(storedPolicy) as { onChainPolicyId?: string };
        if (parsed.onChainPolicyId) {
          // Hydrate configured policy ID from client localStorage on initial mount (SSR cannot access localStorage)
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setOnChainPolicyId(parsed.onChainPolicyId);
        }
      }
    } catch {
      console.error("Could not load policy configuration from localStorage.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPolicy() {
      setPolicyLoading(true);
      setPolicyError("");
      try {
        const client = dAppKitInstance.getClient();
        const effectiveId = onChainPolicyId || VERIFIED_POLICY_ID;
        const decoded = await fetchOnChainPolicy(client, effectiveId);
        if (!cancelled) {
          setOnChainPolicy(decoded);
          setPolicyError("");
        }
      } catch (err) {
        console.error("Could not fetch on-chain policy:", err);
        if (!cancelled) {
          setOnChainPolicy(null);
          setPolicyError(
            err instanceof Error
              ? err.message
              : "Could not fetch or decode on-chain procurement policy."
          );
        }
      } finally {
        if (!cancelled) {
          setPolicyLoading(false);
        }
      }
    }
    loadPolicy();
    return () => {
      cancelled = true;
    };
  }, [dAppKitInstance, onChainPolicyId]);

  useEffect(() => {
    try {
      const savedRequests = localStorage.getItem(REQUESTS_KEY);
      const savedSuppliers = localStorage.getItem(SUPPLIERS_KEY);
      const savedQuotations = localStorage.getItem(QUOTATIONS_KEY);
      const savedDecisions = localStorage.getItem(APPROVALS_KEY);

      const requestData = savedRequests
        ? (JSON.parse(savedRequests) as PurchaseRequest[])
        : [];

      const supplierData = savedSuppliers
        ? (JSON.parse(savedSuppliers) as Supplier[])
        : [];

      const quotationData = savedQuotations
        ? (JSON.parse(savedQuotations) as Quotation[])
        : [];

      const decisionData = savedDecisions
        ? (JSON.parse(savedDecisions) as ApprovalDecision[])
        : [];

      const { recoveries: recoveryData, corruptionError } = loadStoredRecoveries();
      const { recoveries: execRecoveryData, corruptionError: execCorruptionError } = loadStoredExecutionRecoveries();

      // Hydrate procurement records and recovery state from client localStorage on mount (SSR cannot access localStorage)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRequests(requestData);
      setSuppliers(supplierData);
      setQuotations(quotationData);
      setDecisions(decisionData);
      setRecoveries(recoveryData);
      setExecutionRecoveries(execRecoveryData);
      if (corruptionError) {
        setRecoveryCorruptedError(corruptionError);
      }
      if (execCorruptionError) {
        setExecutionCorruptedError(execCorruptionError);
      }

      const initialSelections: Record<string, string> = {};

      requestData.forEach((request) => {
        const available = quotationData
          .filter((quote) => quote.requestId === request.id)
          .sort(compareQuotations);

        if (available.length > 0) {
          initialSelections[request.id] = available[0].id;
        }
      });

      setSelectedQuotes(initialSelections);
    } catch {
      setError("Some saved procurement data could not be loaded.");
    }

    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(APPROVALS_KEY, JSON.stringify(decisions));
      } catch (err) {
        console.error("Could not persist approval decisions to localStorage:", err);
      }
    }
  }, [decisions, loaded]);

  function updateRecoveryMarker(marker: PendingApprovalRecovery): boolean {
    const updated = { ...recoveries, [marker.requestId]: marker };
    const persisted = persistStoredRecoveries(updated);
    setRecoveries(updated);
    if (!persisted) {
      setWarning(
        `Warning: Recovery marker for request ${marker.requestId} could not be persisted to browser storage. In-memory state preserved.`
      );
    }
    return persisted;
  }

  function removeRecoveryMarker(requestId: string): boolean {
    const updated = { ...recoveries };
    delete updated[requestId];
    const persisted = persistStoredRecoveries(updated);
    setRecoveries(updated);
    return persisted;
  }

  function updateExecutionRecoveryMarker(
    marker: PendingExecutionRecovery
  ): boolean {
    const updated = { ...executionRecoveries, [marker.purchaseId]: marker };
    const persisted = persistStoredExecutionRecoveries(updated);
    setExecutionRecoveries(updated);
    if (!persisted) {
      setWarning(
        `Warning: Execution marker for purchase #${marker.purchaseId} could not be persisted to browser storage. In-memory state preserved.`
      );
    }
    return persisted;
  }

  function removeExecutionRecoveryMarker(purchaseId: string): boolean {
    const updated = { ...executionRecoveries };
    delete updated[purchaseId];
    for (const [key, val] of Object.entries(updated)) {
      if (val.purchaseId === purchaseId) {
        delete updated[key];
      }
    }
    const persisted = persistStoredExecutionRecoveries(updated);
    setExecutionRecoveries(updated);
    return persisted;
  }

  async function handleReconcile(marker: PendingApprovalRecovery) {
    setError("");
    setWarning("");
    setReconcilingRequestId(marker.requestId);

    try {
      const client = dAppKitInstance.getClient();
      const effectivePolicyId = onChainPolicyId || VERIFIED_POLICY_ID;
      const currentPolicy = await fetchOnChainPolicy(client, effectivePolicyId);
      setOnChainPolicy(currentPolicy);

      const recon = reconcilePurchaseWithPolicy(currentPolicy, marker);
      if (!recon.success) {
        const updatedMarker: PendingApprovalRecovery = {
          ...marker,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateRecoveryMarker(updatedMarker);
        setWarning(
          `Could not reconcile request ${marker.requestId}: ${recon.reason} ` +
            (marker.txDigest
              ? `(Tx Digest: ${marker.txDigest} — https://suiscan.xyz/testnet/tx/${marker.txDigest})`
              : "")
        );
        return;
      }

      // Reconciliation succeeded unambiguously
      const decision: ApprovalDecision = {
        requestId: marker.requestId,
        status: "Approved",
        quotationId: marker.quotationId,
        reason: marker.reason || "",
        decidedAt: new Date().toISOString(),
        onChainPurchaseId: recon.purchaseId,
        approvalTxDigest: marker.txDigest,
      };

      const updatedDecisions = [
        ...decisions.filter((entry) => entry.requestId !== marker.requestId),
        decision,
      ];

      setDecisions(updatedDecisions);

      // Attempt to persist decision to localStorage (Requirement 3)
      let decisionPersisted = false;
      try {
        localStorage.setItem(APPROVALS_KEY, JSON.stringify(updatedDecisions));
        decisionPersisted = true;
      } catch (storageErr) {
        console.error("Could not persist approval to localStorage:", storageErr);
      }

      if (!decisionPersisted) {
        // Retain recovery marker until decision persistence succeeds!
        const retainedMarker: PendingApprovalRecovery = {
          ...marker,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateRecoveryMarker(retainedMarker);
        setWarning(
          `On-chain purchase #${recon.purchaseId} was confirmed, but browser storage could not save the approval decision. The recovery marker has been retained. Free storage space and click "Reconcile on-chain status" to retry. (Tx Digest: ${marker.txDigest || "N/A"})`
        );
        return;
      }

      // Remove recovery marker ONLY after approval persistence succeeds
      removeRecoveryMarker(marker.requestId);
      setWarning(
        `Successfully reconciled on-chain purchase #${recon.purchaseId} for request ${marker.requestId}.` +
          (marker.txDigest ? ` (Tx Digest: ${marker.txDigest})` : "")
      );
    } catch (err) {
      console.error("Error during manual reconciliation:", err);
      setError(
        err instanceof Error
          ? `Reconciliation failed: ${err.message}`
          : "Reconciliation failed."
      );
    } finally {
      setReconcilingRequestId(null);
    }
  }

  function formatMoney(amount: number, currency: string) {
    if (currency === "SUI") {
      return `${amount.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 9,
      })} SUI`;
    }
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  function formatQuotationPrice(
    amount: number,
    currency: string,
    decimalStr?: string
  ) {
    if (currency === "SUI") {
      if (decimalStr) {
        return `${decimalStr} SUI`;
      }
      return `${amount.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 9,
      })} SUI`;
    }
    return formatMoney(amount, currency);
  }

  function makeDecision(
    request: PurchaseRequest,
    status: "Approved" | "Rejected"
  ) {
    setError("");
    setWarning("");

    if (recoveryCorruptedError) {
      setError(
        `Cannot modify decision: Recovery storage contains corrupted data (${recoveryCorruptedError}).`
      );
      return;
    }

    if (recoveries[request.id]) {
      setError(
        `Cannot modify decision: Request "${request.item}" has an unresolved on-chain approval marker. Please reconcile it before making any decision.`
      );
      return;
    }

    const reason = (reasons[request.id] || "").trim();
    const requestQuotes = quotations.filter(
      (quote) => quote.requestId === request.id
    );

    const quotationId = selectedQuotes[request.id] || "";

    if (status === "Approved") {
      if (!quotationId) {
        setError(`Select a supplier quotation before approving ${request.item}.`);
        return;
      }

      const selectedQuotation = requestQuotes.find(
        (quote) => quote.id === quotationId
      );

      if (!selectedQuotation) {
        setError("The selected quotation could not be found.");
        return;
      }

      if (selectedQuotation.totalPrice > request.budget) {
        setError("This quotation exceeds the purchase request budget.");
        return;
      }

      const isSui =
        request.currency === "SUI" || selectedQuotation.currency === "SUI";
      if (isSui) {
        const supplier = suppliers.find(
          (entry) => entry.id === selectedQuotation.supplierId
        );
        if (
          !supplier?.suiAddress ||
          !SUI_ADDRESS_REGEX.test(supplier.suiAddress)
        ) {
          setError(
            `Cannot approve SUI purchase: Supplier "${
              supplier?.name || "Unknown"
            }" does not have a valid Sui wallet address. Please update the supplier in Supplier Management.`
          );
          return;
        }
      }
    }

    if (status === "Rejected" && !reason) {
      setError("Please provide a reason before rejecting this request.");
      return;
    }

    const decision: ApprovalDecision = {
      requestId: request.id,
      status,
      quotationId: status === "Approved" ? quotationId : null,
      reason,
      decidedAt: new Date().toISOString(),
    };

    setDecisions((current) => [
      ...current.filter((entry) => entry.requestId !== request.id),
      decision,
    ]);

    setReasons((current) => ({
      ...current,
      [request.id]: "",
    }));
  }

  async function handleApproveSui(request: PurchaseRequest) {
    setError("");
    setWarning("");

    if (submittingRequestId || reconcilingRequestId) return;

    if (recoveryCorruptedError) {
      setError(
        `Cannot initiate on-chain approval: Recovery storage contains corrupted data (${recoveryCorruptedError}). New approvals are disabled until resolved.`
      );
      return;
    }

    if (recoveries[request.id]) {
      setError(
        `Cannot approve SUI purchase: Request "${request.item}" has an unresolved on-chain approval marker. Please reconcile it first.`
      );
      return;
    }

    const quotationId = selectedQuotes[request.id] || "";
    if (!quotationId) {
      setError(`Select a supplier quotation before approving ${request.item}.`);
      return;
    }

    const requestQuotes = quotations.filter(
      (quote) => quote.requestId === request.id
    );
    const selectedQuotation = requestQuotes.find(
      (quote) => quote.id === quotationId
    );
    if (!selectedQuotation) {
      setError("The selected quotation could not be found.");
      return;
    }

    if (selectedQuotation.totalPrice > request.budget) {
      setError("This quotation exceeds the purchase request budget.");
      return;
    }

    const supplier = suppliers.find(
      (entry) => entry.id === selectedQuotation.supplierId
    );
    if (!supplier) {
      setError("The selected supplier could not be found.");
      return;
    }

    if (!supplier.suiAddress || !SUI_ADDRESS_REGEX.test(supplier.suiAddress)) {
      setError(
        `Cannot approve SUI purchase: Supplier "${supplier.name}" does not have a valid 64-character hexadecimal Sui wallet address.`
      );
      return;
    }

    if (!currentAccount) {
      setError("Please connect your owner wallet to approve this SUI purchase.");
      return;
    }

    let amountMist: bigint;
    try {
      const rawDecimal =
        selectedQuotation.totalPriceDecimal ||
        String(selectedQuotation.totalPrice);
      amountMist = parseSuiToMist(rawDecimal);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Invalid SUI price: ${err.message}`
          : "Invalid quotation price."
      );
      return;
    }

    if (amountMist <= BigInt(0)) {
      setError("Quotation amount must be greater than zero.");
      return;
    }

    setSubmittingRequestId(request.id);

    let activeMarker: PendingApprovalRecovery | null = null;

    try {
      const client = dAppKitInstance.getClient();
      const effectivePolicyId = onChainPolicyId || VERIFIED_POLICY_ID;

      // 1. Fetch on-chain policy and record before-state
      const beforePolicy = await fetchOnChainPolicy(client, effectivePolicyId);

      // Verify all policy conditions
      if (!beforePolicy.active) {
        throw new Error(
          "The on-chain procurement policy is currently deactivated."
        );
      }

      if (!beforePolicy.allowance_id) {
        throw new Error(
          "The on-chain procurement policy has no registered allowance. Please register an allowance in Policy Management first."
        );
      }

      if (
        safeNormalizeAddress(currentAccount.address) !==
        safeNormalizeAddress(beforePolicy.owner)
      ) {
        throw new Error(
          `Connected account (${currentAccount.address.slice(
            0,
            6
          )}...${currentAccount.address.slice(
            -4
          )}) is not the on-chain policy owner. Switch to ${beforePolicy.owner} to approve.`
        );
      }

      const maxMist = BigInt(beforePolicy.max_per_purchase_mist);
      if (amountMist > maxMist) {
        throw new Error(
          `Quotation amount (${mistToSuiDecimal(
            amountMist
          )} SUI) exceeds the on-chain per-purchase limit of ${mistToSuiDecimal(
            maxMist
          )} SUI.`
        );
      }

      const beforeIds = beforePolicy.purchases.map((p) => p.purchase_id);
      const beforeNextPurchaseId = beforePolicy.next_purchase_id;

      // Create pre-submission recovery marker
      activeMarker = {
        requestId: request.id,
        quotationId,
        supplierAddress: supplier.suiAddress,
        amountMist: amountMist.toString(),
        beforePurchaseIds: beforeIds,
        beforeNextPurchaseId,
        status: "submitted",
        timestamp: new Date().toISOString(),
        reason: (reasons[request.id] || "").trim(),
      };

      // 1b. Durable persistence requirement (Requirement 1): Must succeed before opening wallet
      const currentStored = loadStoredRecoveries();
      if (currentStored.corruptionError) {
        throw new Error(
          `Cannot proceed: Browser recovery storage contains corrupted data (${currentStored.corruptionError}). Please inspect storage before submitting.`
        );
      }
      if (currentStored.recoveries[request.id]) {
        throw new Error(
          `Cannot proceed: An approval recovery marker for request ${request.id} already exists in browser storage. Aborting duplicate submission.`
        );
      }
      const updatedRecoveries = {
        ...currentStored.recoveries,
        [request.id]: activeMarker,
      };
      const persisted = persistStoredRecoveries(updatedRecoveries);
      if (!persisted) {
        throw new Error(
          "Browser storage (localStorage) is unavailable or storage quota was exceeded. To prevent loss of recovery tracking, the on-chain approval was not submitted."
        );
      }
      setRecoveries(updatedRecoveries);

      // 2. Build transaction
      const tx = new Transaction();
      tx.moveCall({
        target: `${PROCUREYETI_PACKAGE_ID}::procureyeti::approve_purchase`,
        arguments: [
          tx.object(effectivePolicyId),
          tx.pure.address(supplier.suiAddress),
          tx.pure.u64(amountMist),
        ],
      });

      // 3. Sign and execute transaction
      let result;
      try {
        result = await dAppKitInstance.signAndExecuteTransaction({
          transaction: tx,
        });
      } catch (walletErr) {
        // Conservative safety: Do not assume cancellation text, error 4001, or wallet errors prove
        // that no transaction was broadcast. Always preserve the marker in reconciliation_failed.
        if (activeMarker) {
          activeMarker = {
            ...activeMarker,
            status: "reconciliation_failed",
            timestamp: new Date().toISOString(),
          };
          updateRecoveryMarker(activeMarker);
        }
        const errText =
          walletErr instanceof Error ? walletErr.message : String(walletErr);
        setWarning(
          `Transaction submission ended with an unconfirmed outcome: ${errText}. The transaction may have been broadcast. To prevent duplicate spending, this request has been safely locked in recovery state. Please check SuiScan or click &quot;Reconcile on-chain status&quot;.`
        );
        return;
      }

      if (result.$kind === "FailedTransaction") {
        if (activeMarker) {
          activeMarker = {
            ...activeMarker,
            status: "reconciliation_failed",
            timestamp: new Date().toISOString(),
          };
          updateRecoveryMarker(activeMarker);
        }
        const errorDetail = result.FailedTransaction.status.error;
        const errorMsg =
          typeof errorDetail === "object" &&
          errorDetail &&
          "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Transaction execution failed on-chain.";
        throw new Error(errorMsg);
      }

      const txRecord = result.Transaction;
      if (txRecord.status.success === false) {
        if (activeMarker) {
          activeMarker = {
            ...activeMarker,
            txDigest:
              txRecord.digest || txRecord.effects?.transactionDigest || undefined,
            status: "reconciliation_failed",
            timestamp: new Date().toISOString(),
          };
          updateRecoveryMarker(activeMarker);
        }
        const errorDetail = txRecord.status.error;
        const errorMsg =
          typeof errorDetail === "object" &&
          errorDetail &&
          "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Transaction execution was not successful.";
        throw new Error(errorMsg);
      }

      const txDigest =
        txRecord.digest || txRecord.effects?.transactionDigest || "";

      // Transaction succeeded on-chain!
      // Immediately update marker with txDigest and status 'tx_confirmed' BEFORE second fetch
      activeMarker = {
        ...activeMarker,
        txDigest,
        status: "tx_confirmed",
        timestamp: new Date().toISOString(),
      };
      updateRecoveryMarker(activeMarker);

      // 4. Fetch policy again and reconcile newly approved purchase
      let afterPolicy: DecodedProcurementPolicy;
      try {
        afterPolicy = await fetchOnChainPolicy(client, effectivePolicyId);
        setOnChainPolicy(afterPolicy);
      } catch {
        // Policy re-fetch failed: lock marker in reconciliation_failed state
        activeMarker = {
          ...activeMarker,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateRecoveryMarker(activeMarker);
        setWarning(
          `Approval transaction succeeded on-chain (Tx Digest: ${txDigest}), but could not re-fetch the policy to confirm the purchase ID. The request has been placed in recovery state to prevent duplicate submissions. Please click "Reconcile on-chain status" below. SuiScan: https://suiscan.xyz/testnet/tx/${txDigest}`
        );
        return;
      }

      // Reconcile
      const recon = reconcilePurchaseWithPolicy(afterPolicy, activeMarker);
      if (!recon.success) {
        activeMarker = {
          ...activeMarker,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateRecoveryMarker(activeMarker);
        setWarning(
          `Approval transaction succeeded on-chain (Tx Digest: ${txDigest}), but automatic reconciliation could not confirm the purchase ID (${recon.reason}). The request is locked in recovery state. Please use "Reconcile on-chain status". SuiScan: https://suiscan.xyz/testnet/tx/${txDigest}`
        );
        return;
      }

      const verifiedPurchaseId = recon.purchaseId;
      const reason = (reasons[request.id] || "").trim();

      const decision: ApprovalDecision = {
        requestId: request.id,
        status: "Approved",
        quotationId,
        reason,
        decidedAt: new Date().toISOString(),
        onChainPurchaseId: verifiedPurchaseId,
        approvalTxDigest: txDigest,
      };

      const updatedDecisions = [
        ...decisions.filter((entry) => entry.requestId !== request.id),
        decision,
      ];

      setDecisions(updatedDecisions);
      setReasons((current) => ({
        ...current,
        [request.id]: "",
      }));

      // Requirement 3: Retain markers until approval persistence succeeds
      let decisionPersisted = false;
      try {
        localStorage.setItem(APPROVALS_KEY, JSON.stringify(updatedDecisions));
        decisionPersisted = true;
      } catch (storageErr) {
        console.error("Could not persist approval to localStorage:", storageErr);
      }

      if (!decisionPersisted) {
        activeMarker = {
          ...activeMarker,
          txDigest,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateRecoveryMarker(activeMarker);
        setWarning(
          `Purchase approved on-chain (Purchase ID: #${verifiedPurchaseId}, Tx Digest: ${txDigest}), but browser storage could not be updated. The recovery marker has been retained to protect this record. Free storage space and click "Reconcile on-chain status" to retry. Link: https://suiscan.xyz/testnet/tx/${txDigest}`
        );
        return;
      }

      // Clear recovery marker safely ONLY after completed decision persistence
      removeRecoveryMarker(request.id);
      activeMarker = null;
    } catch (err) {
      console.error("Error approving purchase on-chain:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to execute on-chain purchase approval."
      );
    } finally {
      setSubmittingRequestId(null);
    }
  }

  function handleApprove(request: PurchaseRequest) {
    if (request.currency === "SUI") {
      void handleApproveSui(request);
    } else {
      makeDecision(request, "Approved");
    }
  }

  async function handleExecutePurchase(decision: ApprovalDecision) {
    setError("");
    setWarning("");

    if (!decision.onChainPurchaseId) {
      setError("Cannot execute payment: Missing on-chain purchase ID for this decision.");
      return;
    }

    const purchaseId = decision.onChainPurchaseId;

    if (!currentAccount) {
      setError("Please connect your agent wallet to execute this payment.");
      return;
    }

    if (executingPurchaseId || submittingRequestId || reconcilingRequestId || reconcilingExecutionId) {
      setError("Another transaction or reconciliation is currently in progress. Please wait.");
      return;
    }

    if (executionCorruptedError || recoveryCorruptedError) {
      setError(
        "Cannot execute payment: Recovery storage contains corrupted data. New executions are disabled until resolved."
      );
      return;
    }

    const freshExecStored = loadStoredExecutionRecoveries();
    if (freshExecStored.corruptionError) {
      setExecutionCorruptedError(freshExecStored.corruptionError);
      setError(
        `Cannot execute payment: Execution recovery storage contains corrupted data (${freshExecStored.corruptionError}). New executions are disabled until resolved.`
      );
      return;
    }

    if (
      freshExecStored.recoveries[purchaseId] ||
      freshExecStored.recoveries[decision.requestId]
    ) {
      setExecutionRecoveries(freshExecStored.recoveries);
      setError(
        `Cannot execute payment: Purchase #${purchaseId} already has an unresolved execution marker in storage (Status: ${
          (
            freshExecStored.recoveries[purchaseId] ||
            freshExecStored.recoveries[decision.requestId]
          ).status
        }). Please reconcile its status first.`
      );
      return;
    }

    const effectivePolicyId = onChainPolicyId || VERIFIED_POLICY_ID;
    const client = dAppKitInstance.getClient();

    setExecutingPurchaseId(purchaseId);

    let activeMarker: PendingExecutionRecovery | null = null;

    try {
      // 1. Fetch fresh policy state from Sui before execution
      let freshPolicy: DecodedProcurementPolicy;
      try {
        freshPolicy = await fetchOnChainPolicy(client, effectivePolicyId);
        setOnChainPolicy(freshPolicy);
      } catch (fetchErr) {
        throw new Error(
          `Failed to fetch latest on-chain policy state: ${
            fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          }`
        );
      }

      // 2. Validate agent authorization
      const connectedNormalized = safeNormalizeAddress(currentAccount.address);
      const agentNormalized = safeNormalizeAddress(freshPolicy.agent);
      if (connectedNormalized !== agentNormalized) {
        throw new Error(
          `Unauthorized: Connected wallet (${currentAccount.address.slice(0, 6)}...${currentAccount.address.slice(
            -4
          )}) is not the designated policy agent (${freshPolicy.agent.slice(0, 6)}...${freshPolicy.agent.slice(
            -4
          )}). Switch to the agent wallet to execute.`
        );
      }

      // 3. Validate policy liveness
      if (!freshPolicy.active) {
        throw new Error("On-chain procurement policy is currently deactivated. Payment cannot be executed.");
      }

      // 4. Validate registered allowance
      if (!freshPolicy.allowance_id) {
        throw new Error("No allowance is registered with this policy. An allowance must be registered first.");
      }
      if (
        safeNormalizeAddress(freshPolicy.allowance_id) !==
        safeNormalizeAddress(VERIFIED_ALLOWANCE_ID)
      ) {
        throw new Error(
          `Allowance mismatch: Policy allowance (${freshPolicy.allowance_id}) does not match the verified registered allowance (${VERIFIED_ALLOWANCE_ID}).`
        );
      }

      // 5. Locate purchase in fresh policy state
      const onChainPurchase = freshPolicy.purchases.find(
        (p) => p.purchase_id === purchaseId
      );

      if (!onChainPurchase) {
        throw new Error(
          `Purchase #${purchaseId} was not found in on-chain policy records. It may not have been approved on-chain.`
        );
      }

      if (!onChainPurchase.approved) {
        throw new Error(
          `Purchase #${purchaseId} is marked as not approved in on-chain policy records.`
        );
      }

      if (onChainPurchase.executed) {
        // Already executed on-chain! Update local decision
        const updatedDecisions = decisions.map((d) =>
          d.requestId === decision.requestId
            ? {
                ...d,
                executedAt: d.executedAt || new Date().toISOString(),
              }
            : d
        );
        setDecisions(updatedDecisions);
        let persisted = false;
        try {
          localStorage.setItem(APPROVALS_KEY, JSON.stringify(updatedDecisions));
          persisted = true;
        } catch (storageErr) {
          console.error("Could not persist executed decision to localStorage:", storageErr);
        }
        if (!persisted) {
          setWarning(
            `Purchase #${purchaseId} has already been executed on-chain, but updated decision could not be saved to browser storage. Recovery marker is retained. Free storage space and retry.`
          );
          return;
        }
        removeExecutionRecoveryMarker(purchaseId);
        setWarning(`Purchase #${purchaseId} has already been executed on-chain.`);
        return;
      }

      // 6. Read supplier and amount exclusively from on-chain purchase record
      const onChainSupplier = onChainPurchase.supplier;
      const onChainAmountMist = onChainPurchase.amount_mist;

      if (!isValidU64String(onChainAmountMist, false)) {
        throw new Error(
          `Invalid on-chain amount ${onChainAmountMist} MIST for purchase #${purchaseId}.`
        );
      }

      const amountMistBig = BigInt(onChainAmountMist);
      const maxPerPurchaseBig = BigInt(freshPolicy.max_per_purchase_mist);
      if (amountMistBig > maxPerPurchaseBig) {
        throw new Error(
          `Purchase amount (${mistToSuiDecimal(amountMistBig)} SUI) exceeds maximum per-purchase limit (${mistToSuiDecimal(
            maxPerPurchaseBig
          )} SUI).`
        );
      }

      if (
        !SUI_ADDRESS_REGEX.test(onChainSupplier) ||
        BigInt(onChainSupplier) === BigInt(0)
      ) {
        throw new Error(
          `Invalid on-chain supplier address (${onChainSupplier}) for purchase #${purchaseId}.`
        );
      }

      // 7. Check execution recovery storage and persist pre-submission marker (Requirement 4)
      const currentStored = loadStoredExecutionRecoveries();
      if (currentStored.corruptionError) {
        throw new Error(
          `Cannot proceed: Browser execution recovery storage contains corrupted data (${currentStored.corruptionError}). Please inspect storage before executing.`
        );
      }

      if (
        currentStored.recoveries[purchaseId] ||
        currentStored.recoveries[decision.requestId]
      ) {
        throw new Error(
          `Cannot proceed: An execution marker for purchase #${purchaseId} already exists in storage. Aborting duplicate submission.`
        );
      }

      activeMarker = {
        requestId: decision.requestId,
        purchaseId,
        supplierAddress: onChainSupplier,
        amountMist: onChainAmountMist,
        status: "submitted",
        timestamp: new Date().toISOString(),
      };

      const updatedRecoveries = {
        ...currentStored.recoveries,
        [purchaseId]: activeMarker,
      };

      const persisted = persistStoredExecutionRecoveries(updatedRecoveries);
      if (!persisted) {
        throw new Error(
          "Browser storage (localStorage) is unavailable or storage quota was exceeded. To prevent untracked payment execution, the transaction was not submitted."
        );
      }
      setExecutionRecoveries(updatedRecoveries);

      // 8. Build execution transaction block
      const tx = new Transaction();

      const withdrawal = tx.withdrawal({
        amount: onChainAmountMist,
        type: "0x2::sui::SUI",
        from: "allowance",
        allowance: freshPolicy.allowance_id,
        funder: freshPolicy.owner,
      });

      tx.moveCall({
        target: `${PROCUREYETI_PACKAGE_ID}::procureyeti::execute_purchase`,
        arguments: [
          tx.object(effectivePolicyId),
          tx.object(freshPolicy.allowance_id),
          tx.object(SUI_CLOCK_OBJECT_ID),
          tx.pure.u64(onChainPurchase.purchase_id),
          withdrawal,
        ],
      });

      // 9. Sign and execute transaction
      let result;
      try {
        result = await dAppKitInstance.signAndExecuteTransaction({
          transaction: tx,
        });
      } catch (walletErr) {
        // Conservative safety: Do not assume cancellation text, error 4001, or wallet errors prove
        // that no transaction was broadcast. Always preserve the marker in reconciliation_failed.
        if (activeMarker) {
          activeMarker = {
            ...activeMarker,
            status: "reconciliation_failed",
            timestamp: new Date().toISOString(),
          };
          updateExecutionRecoveryMarker(activeMarker);
        }
        const errText =
          walletErr instanceof Error ? walletErr.message : String(walletErr);
        setWarning(
          `Payment execution submission ended with an unconfirmed outcome: ${errText}. The transaction may have been broadcast. To prevent duplicate payment, this purchase has been safely locked in recovery state. Please check SuiScan or click &quot;Reconcile execution status&quot;.`
        );
        return;
      }

      if (result.$kind === "FailedTransaction") {
        if (activeMarker) {
          activeMarker = {
            ...activeMarker,
            status: "reconciliation_failed",
            timestamp: new Date().toISOString(),
          };
          updateExecutionRecoveryMarker(activeMarker);
        }
        const errorDetail = result.FailedTransaction.status.error;
        const errorMsg =
          typeof errorDetail === "object" &&
          errorDetail &&
          "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Payment execution failed on-chain.";
        throw new Error(errorMsg);
      }

      const txRecord = result.Transaction;
      if (txRecord.status.success === false) {
        if (activeMarker) {
          activeMarker = {
            ...activeMarker,
            txDigest:
              txRecord.digest || txRecord.effects?.transactionDigest || undefined,
            status: "reconciliation_failed",
            timestamp: new Date().toISOString(),
          };
          updateExecutionRecoveryMarker(activeMarker);
        }
        const errorDetail = txRecord.status.error;
        const errorMsg =
          typeof errorDetail === "object" &&
          errorDetail &&
          "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Payment execution was not successful on-chain.";
        throw new Error(errorMsg);
      }

      const txDigest =
        txRecord.digest || txRecord.effects?.transactionDigest || "";

      // Transaction succeeded on-chain!
      activeMarker = {
        ...activeMarker,
        txDigest,
        status: "tx_confirmed",
        timestamp: new Date().toISOString(),
      };
      updateExecutionRecoveryMarker(activeMarker);

      // 10. Re-fetch policy and verify executed === true (Requirement 5)
      let afterPolicy: DecodedProcurementPolicy;
      try {
        afterPolicy = await fetchOnChainPolicy(client, effectivePolicyId);
        setOnChainPolicy(afterPolicy);
      } catch {
        activeMarker = {
          ...activeMarker,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateExecutionRecoveryMarker(activeMarker);
        setWarning(
          `Execution transaction succeeded on-chain (Tx Digest: ${txDigest}), but re-fetching policy state failed. Please click &quot;Reconcile execution status&quot;. SuiScan: https://suiscan.xyz/testnet/tx/${txDigest}`
        );
        return;
      }

      const verifiedPurchase = afterPolicy.purchases.find(
        (p) => p.purchase_id === purchaseId
      );

      if (!verifiedPurchase || !verifiedPurchase.executed) {
        activeMarker = {
          ...activeMarker,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateExecutionRecoveryMarker(activeMarker);
        setWarning(
          `Execution transaction completed (Tx Digest: ${txDigest}), but on-chain purchase #${purchaseId} is not yet marked as executed. Please use &quot;Reconcile execution status&quot;. SuiScan: https://suiscan.xyz/testnet/tx/${txDigest}`
        );
        return;
      }

      // 11. Persist executionTxDigest and executedAt in ApprovalDecision
      const executedAt = new Date().toISOString();
      const updatedDecision: ApprovalDecision = {
        ...decision,
        executionTxDigest: txDigest,
        executedAt,
      };

      const updatedDecisions = decisions.map((d) =>
        d.requestId === decision.requestId ? updatedDecision : d
      );

      setDecisions(updatedDecisions);

      let decisionPersisted = false;
      try {
        localStorage.setItem(APPROVALS_KEY, JSON.stringify(updatedDecisions));
        decisionPersisted = true;
      } catch (storageErr) {
        console.error("Could not persist executed decision to localStorage:", storageErr);
      }

      if (!decisionPersisted) {
        activeMarker = {
          ...activeMarker,
          txDigest,
          status: "reconciliation_failed",
          timestamp: new Date().toISOString(),
        };
        updateExecutionRecoveryMarker(activeMarker);
        setWarning(
          `Payment for purchase #${purchaseId} executed on-chain (Tx Digest: ${txDigest}), but browser storage could not be updated. The execution marker is retained. Free browser storage and click &quot;Reconcile execution status&quot; to retry saving. SuiScan: https://suiscan.xyz/testnet/tx/${txDigest}`
        );
        return;
      }

      // 12. Remove execution marker ONLY after decision persistence succeeds
      removeExecutionRecoveryMarker(purchaseId);
      activeMarker = null;

      setWarning(
        `Payment for purchase #${purchaseId} successfully executed on-chain! Sent ${mistToSuiDecimal(
          BigInt(onChainAmountMist)
        )} SUI to ${onChainSupplier.slice(0, 8)}... (Tx Digest: ${txDigest})`
      );
    } catch (err) {
      console.error("Error executing purchase on-chain:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to execute on-chain purchase payment."
      );
    } finally {
      setExecutingPurchaseId(null);
    }
  }

  async function handleReconcileExecution(marker: PendingExecutionRecovery) {
    setError("");
    setWarning("");
    setReconcilingExecutionId(marker.purchaseId);

    try {
      const client = dAppKitInstance.getClient();
      const effectivePolicyId = onChainPolicyId || VERIFIED_POLICY_ID;
      const currentPolicy = await fetchOnChainPolicy(client, effectivePolicyId);
      setOnChainPolicy(currentPolicy);

      const p = currentPolicy.purchases.find(
        (item) => item.purchase_id === marker.purchaseId
      );

      if (!p) {
        setWarning(
          `Purchase #${marker.purchaseId} was not found in on-chain policy records.` +
            (marker.txDigest
              ? ` (Tx Digest: ${marker.txDigest} — https://suiscan.xyz/testnet/tx/${marker.txDigest})`
              : "")
        );
        return;
      }

      if (p.executed) {
        // Purchase confirmed executed on-chain!
        const existingDecision = decisions.find(
          (d) =>
            d.onChainPurchaseId === marker.purchaseId ||
            d.requestId === marker.requestId
        );

        if (existingDecision) {
          const updatedDecision: ApprovalDecision = {
            ...existingDecision,
            executionTxDigest:
              existingDecision.executionTxDigest || marker.txDigest,
            executedAt:
              existingDecision.executedAt ||
              marker.timestamp ||
              new Date().toISOString(),
          };

          const updatedDecisions = decisions.map((d) =>
            d.requestId === existingDecision.requestId ? updatedDecision : d
          );

          setDecisions(updatedDecisions);

          let persisted = false;
          try {
            localStorage.setItem(APPROVALS_KEY, JSON.stringify(updatedDecisions));
            persisted = true;
          } catch (storageErr) {
            console.error("Could not persist reconciled execution decision:", storageErr);
          }

          if (!persisted) {
            setWarning(
              `Purchase #${marker.purchaseId} is confirmed executed on-chain, but browser storage could not save the updated decision. Free storage space and click &quot;Reconcile execution status&quot; again.`
            );
            return;
          }
        }

        removeExecutionRecoveryMarker(marker.purchaseId);
        setWarning(
          `Purchase #${marker.purchaseId} successfully reconciled: confirmed executed on-chain.` +
            (marker.txDigest ? ` (Tx Digest: ${marker.txDigest})` : "")
        );
      } else {
        // Purchase is still unexecuted on-chain
        // Requirement 4: "If the purchase is still unexecuted, do not automatically assume an earlier ambiguous transaction can never land."
        setWarning(
          `On-chain purchase #${marker.purchaseId} is currently unexecuted. If an earlier transaction was broadcast, it may still be indexing or may have failed. Please inspect SuiScan before attempting any re-execution.` +
            (marker.txDigest
              ? ` (Tx Digest: ${marker.txDigest} — https://suiscan.xyz/testnet/tx/${marker.txDigest})`
              : "")
        );
      }
    } catch (err) {
      console.error("Error reconciling execution:", err);
      setError(
        err instanceof Error
          ? `Execution reconciliation failed: ${err.message}`
          : "Execution reconciliation failed."
      );
    } finally {
      setReconcilingExecutionId(null);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  if (!loaded) {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700">
        Loading approval records...
      </div>
    );
  }

  const pendingRequests = requests.filter(
    (request) =>
      request.policyStatus !== "Allowed" &&
      request.policyStatus !== "Blocked" &&
      !decisions.some((decision) => decision.requestId === request.id)
  );

  type ExecutionQueueItem = {
    decision: ApprovalDecision;
    request: PurchaseRequest;
    quotation?: Quotation;
    supplier?: Supplier;
    onChainRecord?: PurchaseApprovalRecord;
    executionMarker?: PendingExecutionRecovery;
  };

  const executionQueue: ExecutionQueueItem[] = [];
  for (const decision of decisions) {
    if (decision.status !== "Approved" || !decision.onChainPurchaseId) {
      continue;
    }
    const executionMarker =
      executionRecoveries[decision.onChainPurchaseId] ||
      executionRecoveries[decision.requestId];
    const hasExecutionMarker = Boolean(executionMarker);

    if (onChainPolicy) {
      const p = onChainPolicy.purchases.find(
        (item) => item.purchase_id === decision.onChainPurchaseId
      );
      if (!p || !p.approved || (p.executed && !hasExecutionMarker)) {
        continue;
      }
    } else {
      if ((decision.executedAt || decision.executionTxDigest) && !hasExecutionMarker) {
        continue;
      }
    }

    const request = requests.find((r) => r.id === decision.requestId);
    if (!request) continue;

    const quotation = decision.quotationId
      ? quotations.find((q) => q.id === decision.quotationId)
      : undefined;
    const supplier = quotation
      ? suppliers.find((s) => s.id === quotation.supplierId)
      : undefined;
    const onChainRecord = onChainPolicy?.purchases.find(
      (p) => p.purchase_id === decision.onChainPurchaseId
    );

    executionQueue.push({
      decision,
      request,
      quotation,
      supplier,
      onChainRecord,
      executionMarker,
    });
  }

  const completedDecisions = decisions
    .map((decision) => ({
      decision,
      request: requests.find((request) => request.id === decision.requestId),
    }))
    .filter(
      (entry): entry is {
        decision: ApprovalDecision;
        request: PurchaseRequest;
      } => Boolean(entry.request)
    )
    .sort(
      (a, b) =>
        new Date(b.decision.decidedAt).getTime() -
        new Date(a.decision.decidedAt).getTime()
    );

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Awaiting decision
          </p>
          <p className="mt-2 text-2xl font-bold text-amber-800 dark:text-amber-200">
            {pendingRequests.length}
          </p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
            Ready for execution
          </p>
          <p className="mt-2 text-2xl font-bold text-indigo-800 dark:text-indigo-200">
            {executionQueue.length}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Executed on-chain
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-800 dark:text-emerald-200">
            {
              decisions.filter((d) =>
                Boolean(
                  d.executionTxDigest ||
                    d.executedAt ||
                    onChainPolicy?.purchases.find(
                      (p) => p.purchase_id === d.onChainPurchaseId
                    )?.executed
                )
              ).length
            }
          </p>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
            Rejected
          </p>
          <p className="mt-2 text-2xl font-bold text-rose-800 dark:text-rose-200">
            {decisions.filter((entry) => entry.status === "Rejected").length}
          </p>
        </div>
      </div>

      {recoveryCorruptedError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <p className="font-semibold">⚠️ Critical Approval Recovery Storage Error</p>
          <p className="mt-1 text-xs">{recoveryCorruptedError}</p>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
            New SUI approvals are disabled to prevent duplicate purchases or double-spending until recovery storage is resolved.
          </p>
        </div>
      )}

      {executionCorruptedError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <p className="font-semibold">⚠️ Critical Execution Storage Error</p>
          <p className="mt-1 text-xs">{executionCorruptedError}</p>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
            Payment executions are disabled until browser execution storage is repaired or cleared.
          </p>
        </div>
      )}

      {Object.keys(executionRecoveries).length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p className="font-semibold">⚠️ Unresolved Payment Execution Outlines Detected</p>
          <p className="mt-1 text-xs">
            There {Object.keys(executionRecoveries).length === 1 ? "is 1 purchase" : `are ${Object.keys(executionRecoveries).length} purchases`} with in-flight or unconfirmed payment executions. Please click &quot;Reconcile execution status&quot; on the affected card in the Execution Queue below.
          </p>
        </div>
      )}

      {policyError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          Policy Verification Unavailable: {policyError}. SUI approvals are disabled until the policy is verified on-chain.
        </div>
      )}

      {Object.keys(recoveries).length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p className="font-semibold">⚠️ Unresolved On-Chain Approvals Detected</p>
          <p className="mt-1 text-xs">
            There {Object.keys(recoveries).length === 1 ? "is 1 purchase request" : `are ${Object.keys(recoveries).length} purchase requests`} with in-flight or unconfirmed on-chain approvals. Re-approval is blocked to prevent duplicate transactions. Please use the &quot;Reconcile on-chain status&quot; button on the affected request card.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {warning && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        >
          {warning}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Pending owner authorization</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Review each request and its supplier offers before making a decision.
          </p>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
            <p className="text-sm font-semibold">No pending requests</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              New purchase requests will appear here for owner review.
            </p>
          </div>
        ) : (
          pendingRequests.map((request) => {
            const requestQuotes = quotations
              .filter((quote) => quote.requestId === request.id)
              .sort(compareQuotations);

            const selectedQuotation = requestQuotes.find(
              (quote) => quote.id === selectedQuotes[request.id]
            );

            const selectedSupplier = selectedQuotation
              ? suppliers.find(
                  (entry) => entry.id === selectedQuotation.supplierId
                )
              : undefined;

            const isSui =
              request.currency === "SUI" || selectedQuotation?.currency === "SUI";
            const hasValidSupplierSuiAddress = Boolean(
              selectedSupplier?.suiAddress &&
                SUI_ADDRESS_REGEX.test(selectedSupplier.suiAddress)
            );
            const suiAddressInvalid = Boolean(isSui && !hasValidSupplierSuiAddress);

            const isNoWallet = Boolean(isSui && !currentAccount);
            const isPolicyUnavailable = Boolean(
              isSui && (policyLoading || !onChainPolicy || Boolean(policyError))
            );
            const isOwnerMismatch = Boolean(
              isSui &&
                currentAccount &&
                onChainPolicy &&
                safeNormalizeAddress(currentAccount.address) !==
                  safeNormalizeAddress(onChainPolicy.owner)
            );
            const isPolicyInactive = Boolean(
              isSui && onChainPolicy && !onChainPolicy.active
            );
            const isNoAllowance = Boolean(
              isSui && onChainPolicy && !onChainPolicy.allowance_id
            );

            let isSuiOverLimit = false;
            if (isSui && onChainPolicy && selectedQuotation) {
              try {
                const rawDecimal =
                  selectedQuotation.totalPriceDecimal ||
                  String(selectedQuotation.totalPrice);
                const mist = parseSuiToMist(rawDecimal);
                if (mist > BigInt(onChainPolicy.max_per_purchase_mist)) {
                  isSuiOverLimit = true;
                }
              } catch {}
            }

            const recoveryMarker = recoveries[request.id];
            const isRecoveryCorrupted = Boolean(recoveryCorruptedError);
            const isSubmittingThis = submittingRequestId === request.id;
            const isReconcilingThis = reconcilingRequestId === request.id;
            const isApproveDisabled =
              requestQuotes.length === 0 ||
              !selectedQuotation ||
              Boolean(
                selectedQuotation &&
                  selectedQuotation.totalPrice > request.budget
              ) ||
              suiAddressInvalid ||
              isNoWallet ||
              isPolicyUnavailable ||
              isRecoveryCorrupted ||
              isOwnerMismatch ||
              isPolicyInactive ||
              isNoAllowance ||
              isSuiOverLimit ||
              Boolean(recoveryMarker) ||
              Boolean(submittingRequestId) ||
              Boolean(reconcilingRequestId);

            return (
              <article
                key={request.id}
                className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{request.item}</h4>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {request.category} · Quantity: {request.quantity}
                    </p>
                  </div>

                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    Pending
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Approved spending limit
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {formatMoney(request.budget, request.currency)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Required delivery date
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {request.deliveryDate || "Not specified"}
                    </p>
                  </div>
                </div>

                {request.notes && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Request details
                    </p>
                    <p className="mt-1 text-sm">{request.notes}</p>
                  </div>
                )}

                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-sm font-semibold">Supplier quotations</h5>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {requestQuotes.length} available
                    </span>
                  </div>

                  {requestQuotes.length === 0 ? (
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                      No supplier quotations have been recorded for this request.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <label className="block text-xs font-medium">
                        Select the supplier offer to authorize
                        <select
                          className={`${inputClass} mt-2`}
                          value={selectedQuotes[request.id] || ""}
                          onChange={(event) =>
                            setSelectedQuotes((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                        >
                          {requestQuotes.map((quote) => {
                            const supplier = suppliers.find(
                              (entry) => entry.id === quote.supplierId
                            );

                            return (
                              <option key={quote.id} value={quote.id}>
                                {supplier?.name || "Unknown supplier"} ·{" "}
                                {formatQuotationPrice(
                                  quote.totalPrice,
                                  quote.currency,
                                  quote.totalPriceDecimal
                                )}
                                {quote.id === requestQuotes[0]?.id
                                  ? " · Lowest price"
                                  : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      {selectedQuotation && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                            Selected supplier
                          </p>
                          <p className="mt-1 font-semibold">
                            {selectedSupplier?.name || "Unknown supplier"}
                          </p>

                          {isSui && (
                            <div className="mt-2 rounded-lg bg-white/70 p-2.5 text-xs dark:bg-slate-900/50">
                              <p className="font-medium text-slate-500 dark:text-slate-400">
                                Sui wallet address
                              </p>
                              {selectedSupplier?.suiAddress ? (
                                <p className="mt-0.5 break-all font-mono text-[11px] text-slate-800 dark:text-slate-200">
                                  {selectedSupplier.suiAddress}
                                </p>
                              ) : (
                                <p className="mt-0.5 font-medium text-rose-600 dark:text-rose-400">
                                  No Sui wallet address found. Supplier must have a valid Sui address before approval.
                                </p>
                              )}
                            </div>
                          )}

                          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">
                                Total quotation
                              </p>
                              <p className="mt-1 font-semibold">
                                {formatQuotationPrice(
                                  selectedQuotation.totalPrice,
                                  selectedQuotation.currency,
                                  selectedQuotation.totalPriceDecimal
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">
                                Unit price
                              </p>
                              <p className="mt-1 font-semibold">
                                {formatQuotationPrice(
                                  selectedQuotation.unitPrice,
                                  selectedQuotation.currency,
                                  selectedQuotation.unitPriceDecimal
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">
                                Delivery
                              </p>
                              <p className="mt-1 font-semibold">
                                {selectedQuotation.deliveryDays} days
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">
                                Payment terms
                              </p>
                              <p className="mt-1 font-semibold">
                                {selectedQuotation.paymentTerms || "Not specified"}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">
                                Valid until
                              </p>
                              <p className="mt-1 font-semibold">
                                {selectedQuotation.validUntil || "Not specified"}
                              </p>
                            </div>
                          </div>

                          {selectedQuotation.notes && (
                            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                              {selectedQuotation.notes}
                            </p>
                          )}

                          <div className="mt-3 border-t border-indigo-200 pt-3 dark:border-indigo-900/60">
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {selectedQuotation.totalPrice <= request.budget
                                ? `Within budget by ${formatMoney(
                                    request.budget - selectedQuotation.totalPrice,
                                    request.currency
                                  )}`
                                : `Over budget by ${formatMoney(
                                    selectedQuotation.totalPrice - request.budget,
                                    request.currency
                                  )}`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {recoveryMarker && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-sm">
                        Action Required: Unresolved On-Chain Approval
                      </span>
                      <span className="rounded-md bg-amber-200/80 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                        Status: {recoveryMarker.status}
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      An on-chain approval was initiated for this request on {new Date(recoveryMarker.timestamp).toLocaleString()} (Supplier: <code className="font-mono text-[11px]">{recoveryMarker.supplierAddress.slice(0, 8)}...{recoveryMarker.supplierAddress.slice(-6)}</code>, Amount: <code className="font-mono text-[11px]">{mistToSuiDecimal(BigInt(recoveryMarker.amountMist))} SUI</code>).
                      To prevent duplicate spending, direct re-approval is blocked. Please reconcile this request with on-chain policy records.
                    </p>

                    {recoveryMarker.txDigest && (
                      <p className="mt-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        Tx Digest:{" "}
                        <a
                          href={`https://suiscan.xyz/testnet/tx/${recoveryMarker.txDigest}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                          {recoveryMarker.txDigest.slice(0, 10)}...{recoveryMarker.txDigest.slice(-8)} ↗
                        </a>
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleReconcile(recoveryMarker)}
                        disabled={Boolean(reconcilingRequestId) || Boolean(submittingRequestId)}
                        className={getBtnClass("warning", "sm")}
                      >
                        {isReconcilingThis ? "Reconciling on-chain..." : "Reconcile on-chain status"}
                      </button>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Checks on-chain policy and restores approval without sending a new transaction.
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-5">
                  <label className="block text-xs font-medium">
                    Owner&apos;s decision note
                    <textarea
                      className={`${inputClass} mt-2 min-h-20 resize-y`}
                      placeholder="Record the reason for your decision..."
                      value={reasons[request.id] || ""}
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleApprove(request)}
                    disabled={isApproveDisabled}
                    className={getBtnClass("success", "md")}
                  >
                    {isSubmittingThis
                      ? "Approving on-chain..."
                      : "Approve purchase"}
                  </button>

                  <button
                    type="button"
                    onClick={() => makeDecision(request, "Rejected")}
                    disabled={
                      Boolean(submittingRequestId) ||
                      Boolean(reconcilingRequestId) ||
                      Boolean(recoveryMarker)
                    }
                    className={getBtnClass("destructive", "md")}
                  >
                    Reject request
                  </button>
                </div>

                {recoveryMarker && (
                  <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                    This request has an in-flight or unconfirmed on-chain approval. Direct re-approval is blocked until reconciled above.
                  </p>
                )}

                {isRecoveryCorrupted && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    SUI approvals are disabled because recovery storage contains corrupted or unvalidated data.
                  </p>
                )}

                {isPolicyUnavailable && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {policyLoading
                      ? "Verifying on-chain procurement policy..."
                      : `On-chain procurement policy verification is unavailable (${policyError || "Policy data not loaded"}). SUI approval is disabled until the policy is verified.`}
                  </p>
                )}

                {suiAddressInvalid && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    A valid Sui wallet address is required for the supplier before this SUI purchase can be approved.
                  </p>
                )}

                {isNoWallet && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    Please connect your owner wallet in the top navigation to approve this SUI purchase.
                  </p>
                )}

                {isOwnerMismatch && onChainPolicy && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    Connected wallet ({currentAccount?.address.slice(0, 6)}...{currentAccount?.address.slice(-4)}) is not the on-chain policy owner. Switch to {onChainPolicy.owner.slice(0, 6)}...{onChainPolicy.owner.slice(-4)} to approve.
                  </p>
                )}

                {isPolicyInactive && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    The on-chain procurement policy is currently deactivated.
                  </p>
                )}

                {isNoAllowance && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    No allowance is registered with this policy. Register an allowance in Policy Management first.
                  </p>
                )}

                {isSuiOverLimit && onChainPolicy && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    Quotation exceeds the on-chain maximum per-purchase limit of {mistToSuiDecimal(BigInt(onChainPolicy.max_per_purchase_mist))} SUI.
                  </p>
                )}

                {requestQuotes.length === 0 && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    A supplier quotation is required before this request can be approved.
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* Agent Execution Queue */}
      <section className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Agent execution queue</h3>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              Agent authority
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Owner-approved SUI purchases ready for agent-signed payment execution via native Sui allowance.
          </p>
        </div>

        {executionQueue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
            <p className="text-sm font-semibold">No purchases awaiting execution</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Approved SUI purchases will appear here for the designated agent to execute.
            </p>
          </div>
        ) : (
          executionQueue.map(
            ({
              decision,
              request,
              quotation,
              supplier,
              onChainRecord,
              executionMarker,
            }) => {
              const purchaseId = decision.onChainPurchaseId!;
              const isExecutingThis = executingPurchaseId === purchaseId;
              const isReconcilingThis = reconcilingExecutionId === purchaseId;

              const isAgentWallet = Boolean(
                currentAccount &&
                  onChainPolicy &&
                  safeNormalizeAddress(currentAccount.address) ===
                    safeNormalizeAddress(onChainPolicy.agent)
              );
              const isPolicyActive = Boolean(onChainPolicy?.active);
              const isAllowanceValid = Boolean(
                onChainPolicy?.allowance_id &&
                  safeNormalizeAddress(onChainPolicy.allowance_id) ===
                    safeNormalizeAddress(VERIFIED_ALLOWANCE_ID)
              );
              const isPurchaseExecutable = Boolean(
                onChainRecord?.approved && !onChainRecord?.executed
              );
              const isExecutionBlocked = Boolean(
                executionCorruptedError ||
                  recoveryCorruptedError ||
                  Boolean(executionMarker)
              );
              const isAnyBusy = Boolean(
                executingPurchaseId ||
                  submittingRequestId ||
                  reconcilingRequestId ||
                  reconcilingExecutionId
              );

              const isExecuteDisabled =
                !currentAccount ||
                !isAgentWallet ||
                !isPolicyActive ||
                !isAllowanceValid ||
                !isPurchaseExecutable ||
                isExecutionBlocked ||
                isAnyBusy;

              const displayAmountMist = onChainRecord
                ? onChainRecord.amount_mist
                : quotation?.totalPriceDecimal
                ? String(parseSuiToMist(quotation.totalPriceDecimal))
                : "0";

              const displaySui = mistToSuiDecimal(BigInt(displayAmountMist));
              const displaySupplierAddr =
                onChainRecord?.supplier || supplier?.suiAddress || "N/A";

              const executionStatusLabel = isExecutingThis
                ? "Executing..."
                : executionMarker
                ? "Execution unconfirmed"
                : "Ready for execution";

              const executionStatusClass = isExecutingThis
                ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                : executionMarker
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300";

              return (
                <article
                  key={`exec-${decision.requestId}`}
                  className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm dark:border-indigo-900/50 dark:bg-[#101729]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          Purchase #{purchaseId}
                        </span>
                        <h4 className="font-semibold text-sm">{request.item}</h4>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {request.category} · Qty: {request.quantity} · Approved:{" "}
                        {new Date(decision.decidedAt).toLocaleString()}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${executionStatusClass}`}
                    >
                      {executionStatusLabel}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        Authorized Supplier
                      </span>
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {supplier?.name || "Verified Supplier"}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {displaySupplierAddr}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-500 dark:text-slate-400">
                        Approved Payment Amount
                      </span>
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {displaySui} SUI
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {displayAmountMist} MIST (Read from on-chain policy)
                      </p>
                    </div>
                  </div>

                  {decision.approvalTxDigest && (
                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Owner Approval Transaction: </span>
                      <a
                        href={`https://suiscan.xyz/testnet/tx/${decision.approvalTxDigest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-medium text-indigo-600 underline dark:text-indigo-400"
                      >
                        {decision.approvalTxDigest.slice(0, 10)}...{decision.approvalTxDigest.slice(-8)} ↗
                      </a>
                    </div>
                  )}

                  {executionMarker && (
                    <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-sm">
                          Action Required: Unresolved Payment Execution
                        </span>
                        <span className="rounded-md bg-amber-200/80 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                          Status: {executionMarker.status}
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        A payment execution was initiated for purchase #{purchaseId} on{" "}
                        {new Date(executionMarker.timestamp).toLocaleString()} (Amount:{" "}
                        <code className="font-mono text-[11px]">
                          {mistToSuiDecimal(BigInt(executionMarker.amountMist))} SUI
                        </code>
                        ). To prevent duplicate payments, direct re-execution is locked.
                        Please check SuiScan and click &quot;Reconcile execution status&quot;.
                      </p>

                      {executionMarker.txDigest && (
                        <p className="mt-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          Tx Digest:{" "}
                          <a
                            href={`https://suiscan.xyz/testnet/tx/${executionMarker.txDigest}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline hover:text-indigo-600 dark:hover:text-indigo-400"
                          >
                            {executionMarker.txDigest.slice(0, 10)}...{executionMarker.txDigest.slice(-8)} ↗
                          </a>
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleReconcileExecution(executionMarker)}
                          disabled={Boolean(reconcilingExecutionId) || Boolean(executingPurchaseId)}
                          className={getBtnClass("warning", "sm")}
                        >
                          {isReconcilingThis
                            ? "Reconciling execution..."
                            : "Reconcile execution status"}
                        </button>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Checks on-chain policy and updates status without sending a new transaction.
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleExecutePurchase(decision)}
                      disabled={isExecuteDisabled}
                      className={getBtnClass("primary", "md", "px-5")}
                    >
                      {isExecutingThis
                        ? "Executing payment on-chain..."
                        : "Execute payment via Sui"}
                    </button>
                  </div>

                  {!currentAccount && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Please connect your agent wallet in the top navigation to execute this payment.
                    </p>
                  )}

                  {currentAccount && !isAgentWallet && onChainPolicy && (
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                      Connected wallet ({currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}) is not the authorized agent. Switch to {onChainPolicy.agent.slice(0, 6)}...{onChainPolicy.agent.slice(-4)} to execute payment.
                    </p>
                  )}

                  {!isPolicyActive && onChainPolicy && (
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                      The on-chain procurement policy is currently deactivated.
                    </p>
                  )}

                  {!isAllowanceValid && onChainPolicy && (
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                      Policy does not have a valid registered allowance matching the verified allowance.
                    </p>
                  )}

                  {executionMarker?.status === "reconciliation_failed" && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      This purchase has an unresolved execution outcome. Reconcile on-chain status above before re-attempting.
                    </p>
                  )}
                </article>
              );
            }
          )
        )}
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-semibold">Decision history</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Previously recorded owner decisions.
          </p>
        </div>

        {completedDecisions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No approval decisions have been recorded yet.
          </p>
        ) : (
          completedDecisions.map(({ decision, request }) => {
            const approvedQuote = decision.quotationId
              ? quotations.find(
                  (quote) => quote.id === decision.quotationId
                )
              : undefined;

            const supplier = approvedQuote
              ? suppliers.find(
                  (entry) => entry.id === approvedQuote.supplierId
                )
              : undefined;

            const onChainRecord = onChainPolicy?.purchases.find(
              (p) => p.purchase_id === decision.onChainPurchaseId
            );

            const isExecuted = Boolean(
              decision.executionTxDigest ||
                decision.executedAt ||
                onChainRecord?.executed
            );

            return (
              <article
                key={decision.requestId}
                className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{request.item}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(decision.decidedAt).toLocaleString()}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      decision.status === "Approved"
                        ? isExecuted
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    }`}
                  >
                    {decision.status === "Approved"
                      ? isExecuted
                        ? "Executed on-chain"
                        : "Approved (Ready for execution)"
                      : decision.status}
                  </span>
                </div>

                {supplier && approvedQuote && (
                  <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <p>
                      Authorized supplier: {supplier.name} ·{" "}
                      {formatQuotationPrice(
                        approvedQuote.totalPrice,
                        approvedQuote.currency,
                        approvedQuote.totalPriceDecimal
                      )}
                    </p>
                    {(approvedQuote.currency === "SUI" || request.currency === "SUI") && supplier.suiAddress && (
                      <p className="break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        Supplier address: {supplier.suiAddress}
                      </p>
                    )}
                    {decision.onChainPurchaseId && (
                      <p className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                        On-chain Purchase ID: #{decision.onChainPurchaseId}
                      </p>
                    )}
                    {decision.approvalTxDigest && (
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        Owner Approval Tx:{" "}
                        <a
                          href={`https://suiscan.xyz/testnet/tx/${decision.approvalTxDigest}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                          {decision.approvalTxDigest.slice(0, 8)}...{decision.approvalTxDigest.slice(-6)} ↗
                        </a>
                      </p>
                    )}
                    {decision.executionTxDigest && (
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        Agent Payment Tx:{" "}
                        <a
                          href={`https://suiscan.xyz/testnet/tx/${decision.executionTxDigest}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400"
                        >
                          {decision.executionTxDigest.slice(0, 8)}...{decision.executionTxDigest.slice(-6)} ↗
                        </a>
                      </p>
                    )}
                    {decision.executedAt && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Executed at: {new Date(decision.executedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {decision.reason && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Decision note: {decision.reason}
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>

      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        SUI purchase authorizations are recorded on Sui Testnet via the deployed ProcurementPolicy contract.
        Fiat purchases (NGN / USD) remain stored locally within this browser workspace.
      </p>
    </div>
  );
}