"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";

import { PROCUREYETI_PACKAGE_ID } from "./config";
import { dAppKit } from "./dapp-kit";
import { getBtnClass } from "./button-styles";
import { DEFAULT_POLICY, PROCUREMENT_CATEGORIES } from "./policy-engine";
import type { CurrencyPolicy, ProcurementPolicy } from "./policy-engine";

const STORAGE_KEY = "procureyeti-policy";

const MIST_PER_SUI = BigInt("1000000000");
const MAX_U64 = BigInt("18446744073709551615");
const MAX_U256 = (BigInt(1) << BigInt(256)) - BigInt(1);

// Verified on-chain deployment defaults
const VERIFIED_POLICY_ID = "0x253ae60c635ceec06b63caa32111e3c8f1ade723dba8a7ec866b49bc0213c3ae";
const VERIFIED_AGENT_ADDRESS = "0x0039b51dfb95f49d10255a54575786e36b0b223bf3f4ef91685db0f42b150c8e";

/**
 * Normalizes a Sui hexadecimal address string safely with 64-char zero padding fallback.
 */
function safeNormalizeAddress(address: string): string {
  try {
    return normalizeSuiAddress(address);
  } catch {
    const trimmed = address.trim().toLowerCase();
    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return "0x" + hex.padStart(64, "0");
  }
}

/**
 * Parses a SUI decimal string to MIST without floating-point precision loss.
 */
function parseSuiToMist(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Amount cannot be empty.");
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Amount must be a valid positive number.");
  }
  const parts = trimmed.split(".");
  const intPart = parts[0];
  const decPart = parts[1] || "";
  if (decPart.length > 9) {
    throw new Error("Amount cannot have more than 9 decimal places (minimum unit is 1 MIST).");
  }
  const paddedDec = decPart.padEnd(9, "0");
  const mist = BigInt(intPart) * MIST_PER_SUI + BigInt(paddedDec);
  if (mist <= BigInt(0)) {
    throw new Error("Amount must be greater than 0.");
  }
  return mist;
}

/**
 * Converts a SUI decimal string to MIST bounded by Move u64 (for policy limits).
 */
function suiToMistU64(value: string): bigint {
  const mist = parseSuiToMist(value);
  if (mist > MAX_U64) {
    throw new Error("Amount exceeds maximum u64 limit.");
  }
  return mist;
}

/**
 * Converts a SUI decimal string to MIST bounded by Move u256 (for allowance lifetime cap).
 */
function suiToMistU256(value: string): bigint {
  const mist = parseSuiToMist(value);
  if (mist > MAX_U256) {
    throw new Error("Amount exceeds maximum u256 limit.");
  }
  return mist;
}

/**
 * Formats MIST string into SUI decimal string for display.
 */
function mistToSuiString(mistStr: string | null): string {
  if (!mistStr) return "";
  try {
    const mist = BigInt(mistStr);
    const whole = (mist / MIST_PER_SUI).toString();
    const rem = (mist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
    return rem ? `${whole}.${rem}` : whole;
  } catch {
    return mistStr;
  }
}

/**
 * Formats epoch timestamp in milliseconds to human-readable string.
 */
function formatExpiration(timestampMs: string | null): string {
  if (!timestampMs) return "Not configured";
  try {
    const ms = Number(timestampMs);
    if (!Number.isFinite(ms)) return timestampMs;
    const date = new Date(ms);
    const diffDays = Math.max(0, Math.round((ms - Date.now()) / 86400000));
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()} (${diffDays} days remaining)`;
  } catch {
    return timestampMs;
  }
}

/**
 * Validates a hexadecimal Sui address string.
 */
function isValidSuiAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(trimmed)) {
    return false;
  }
  try {
    return BigInt(trimmed) !== BigInt(0);
  } catch {
    return false;
  }
}

/**
 * Extracts address owner string from an outputOwner structure.
 */
function getAddressOwner(outputOwner: unknown): string | null {
  if (!outputOwner || typeof outputOwner !== "object") return null;
  const ownerObj = outputOwner as { $kind?: string; AddressOwner?: string };
  if (ownerObj.$kind === "AddressOwner" && typeof ownerObj.AddressOwner === "string") {
    return ownerObj.AddressOwner;
  }
  if ("AddressOwner" in ownerObj && typeof ownerObj.AddressOwner === "string") {
    return ownerObj.AddressOwner;
  }
  return null;
}

/**
 * Extracts object type from a changed object structure if available.
 */
function getObjectType(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as { objectType?: string; type?: string };
  if (typeof o.objectType === "string") return o.objectType;
  if (typeof o.type === "string") return o.type;
  return null;
}

export function PolicyWorkspace() {
  const dAppKitInstance = useDAppKit(dAppKit);
  const currentAccount = useCurrentAccount({ dAppKit });

  const [policy, setPolicy] = useState<ProcurementPolicy>(DEFAULT_POLICY);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // On-chain policy state
  const [agentAddress, setAgentAddress] = useState(VERIFIED_AGENT_ADDRESS);
  const [maxPerPurchaseSui, setMaxPerPurchaseSui] = useState("0.1");
  const [dailyLimitSui, setDailyLimitSui] = useState("0.5");
  const [onChainPolicyId, setOnChainPolicyId] = useState<string | null>(VERIFIED_POLICY_ID);
  const [onChainTxDigest, setOnChainTxDigest] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [onChainError, setOnChainError] = useState("");
  const [onChainSuccess, setOnChainSuccess] = useState("");

  // On-chain allowance state
  const [lifetimeCapSui, setLifetimeCapSui] = useState("2");
  const [expirationDays, setExpirationDays] = useState("30");
  const [onChainAllowanceId, setOnChainAllowanceId] = useState<string | null>(null);
  const [onChainAllowanceCapId, setOnChainAllowanceCapId] = useState<string | null>(null);
  const [onChainAllowanceLifetimeCapMist, setOnChainAllowanceLifetimeCapMist] = useState<string | null>(null);
  const [onChainAllowanceExpirationMs, setOnChainAllowanceExpirationMs] = useState<string | null>(null);
  const [onChainAllowanceTxDigest, setOnChainAllowanceTxDigest] = useState<string | null>(null);
  const [onChainAllowanceRegistered, setOnChainAllowanceRegistered] = useState(false);
  const [onChainAllowanceRegistrationTxDigest, setOnChainAllowanceRegistrationTxDigest] = useState<string | null>(null);
  const [isCreatingAllowance, setIsCreatingAllowance] = useState(false);
  const [isRegisteringAllowance, setIsRegisteringAllowance] = useState(false);
  const [allowanceError, setAllowanceError] = useState("");
  const [allowanceWarning, setAllowanceWarning] = useState("");
  const [allowanceSuccess, setAllowanceSuccess] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ProcurementPolicy> & {
          onChainPolicyId?: string;
          onChainAgent?: string;
          onChainMaxPerPurchaseMist?: string;
          onChainDailyLimitMist?: string;
          onChainTxDigest?: string;
          onChainAllowanceId?: string;
          onChainAllowanceCapId?: string;
          onChainAllowanceLifetimeCapMist?: string;
          onChainAllowanceExpirationMs?: string;
          onChainAllowanceTxDigest?: string;
          onChainAllowanceRegistered?: boolean;
          onChainAllowanceRegistrationTxDigest?: string;
        };

        // Hydrate policy configuration from client localStorage on initial mount (SSR cannot access localStorage)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPolicy({
          NGN: {
            maxRequestAmount: parsed.NGN?.maxRequestAmount ?? null,
            approvalThreshold: parsed.NGN?.approvalThreshold ?? null,
          },
          USD: {
            maxRequestAmount: parsed.USD?.maxRequestAmount ?? null,
            approvalThreshold: parsed.USD?.approvalThreshold ?? null,
          },
          allowedCategories: Array.isArray(parsed.allowedCategories)
            ? parsed.allowedCategories.filter((category) =>
                PROCUREMENT_CATEGORIES.includes(category)
              )
            : [...PROCUREMENT_CATEGORIES],
        });

        const policyId = parsed.onChainPolicyId || VERIFIED_POLICY_ID;
        setOnChainPolicyId(policyId);
        setOnChainTxDigest(parsed.onChainTxDigest || null);
        setAgentAddress(parsed.onChainAgent || VERIFIED_AGENT_ADDRESS);

        if (parsed.onChainMaxPerPurchaseMist) {
          try {
            const maxMist = BigInt(parsed.onChainMaxPerPurchaseMist);
            const whole = (maxMist / MIST_PER_SUI).toString();
            const rem = (maxMist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
            setMaxPerPurchaseSui(rem ? `${whole}.${rem}` : whole);
          } catch {}
        } else {
          setMaxPerPurchaseSui("0.1");
        }

        if (parsed.onChainDailyLimitMist) {
          try {
            const dailyMist = BigInt(parsed.onChainDailyLimitMist);
            const whole = (dailyMist / MIST_PER_SUI).toString();
            const rem = (dailyMist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
            setDailyLimitSui(rem ? `${whole}.${rem}` : whole);
          } catch {}
        } else {
          setDailyLimitSui("0.5");
        }

        if (parsed.onChainAllowanceId) {
          setOnChainAllowanceId(parsed.onChainAllowanceId);
          setOnChainAllowanceCapId(parsed.onChainAllowanceCapId || null);
          setOnChainAllowanceLifetimeCapMist(parsed.onChainAllowanceLifetimeCapMist || null);
          setOnChainAllowanceExpirationMs(parsed.onChainAllowanceExpirationMs || null);
          setOnChainAllowanceTxDigest(parsed.onChainAllowanceTxDigest || null);
          setOnChainAllowanceRegistered(Boolean(parsed.onChainAllowanceRegistered));
          setOnChainAllowanceRegistrationTxDigest(parsed.onChainAllowanceRegistrationTxDigest || null);

          if (parsed.onChainAllowanceLifetimeCapMist) {
            try {
              const capMist = BigInt(parsed.onChainAllowanceLifetimeCapMist);
              const whole = (capMist / MIST_PER_SUI).toString();
              const rem = (capMist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
              setLifetimeCapSui(rem ? `${whole}.${rem}` : whole);
            } catch {}
          }
        }
      } else {
        // Fall back to verified deployment values
        setOnChainPolicyId(VERIFIED_POLICY_ID);
        setAgentAddress(VERIFIED_AGENT_ADDRESS);
        setMaxPerPurchaseSui("0.1");
        setDailyLimitSui("0.5");
      }
    } catch {
      console.error("Could not load procurement policy.");
    }

    setLoaded(true);
  }, []);

  function updateCurrency(
    currency: "NGN" | "USD",
    field: keyof CurrencyPolicy,
    value: string
  ) {
    setPolicy((current) => ({
      ...current,
      [currency]: {
        ...current[currency],
        [field]: value === "" ? null : Number(value),
      },
    }));
    setSaved(false);
    setError("");
  }

  function toggleCategory(category: string) {
    setPolicy((current) => ({
      ...current,
      allowedCategories: current.allowedCategories.includes(category)
        ? current.allowedCategories.filter((item) => item !== category)
        : [...current.allowedCategories, category],
    }));
    setSaved(false);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    for (const currency of ["NGN", "USD"] as const) {
      const settings = policy[currency];
      const maximum = settings.maxRequestAmount;
      const threshold = settings.approvalThreshold;

      if (
        maximum !== null &&
        (!Number.isFinite(maximum) || maximum <= 0)
      ) {
        setError(`${currency} maximum spending limit must be greater than zero.`);
        return;
      }

      if (
        threshold !== null &&
        (!Number.isFinite(threshold) || threshold <= 0)
      ) {
        setError(`${currency} approval threshold must be greater than zero.`);
        return;
      }

      if (
        maximum !== null &&
        threshold !== null &&
        threshold > maximum
      ) {
        setError(
          `${currency} approval threshold cannot exceed the maximum spending limit.`
        );
        return;
      }
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      const updated = {
        ...existing,
        ...policy,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setSaved(true);
    } catch {
      setError("Could not save the policy in this browser.");
    }
  }

  async function handleCreateOnChainPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOnChainError("");
    setOnChainSuccess("");

    if (!currentAccount) {
      setOnChainError("Please connect your Sui wallet to create an on-chain procurement policy.");
      return;
    }

    if (!agentAddress.trim()) {
      setOnChainError("Agent address is required.");
      return;
    }

    if (!isValidSuiAddress(agentAddress)) {
      setOnChainError("Please enter a valid non-zero Sui agent address (e.g. 0x...).");
      return;
    }

    let maxMist: bigint;
    let dailyMist: bigint;

    try {
      maxMist = suiToMistU64(maxPerPurchaseSui);
    } catch (err) {
      setOnChainError(err instanceof Error ? `Maximum per-purchase limit error: ${err.message}` : "Invalid maximum per-purchase limit.");
      return;
    }

    try {
      dailyMist = suiToMistU64(dailyLimitSui);
    } catch (err) {
      setOnChainError(err instanceof Error ? `Daily spending limit error: ${err.message}` : "Invalid daily spending limit.");
      return;
    }

    if (maxMist > dailyMist) {
      setOnChainError("Maximum per-purchase limit cannot exceed the daily spending limit.");
      return;
    }

    setIsDeploying(true);

    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${PROCUREYETI_PACKAGE_ID}::procureyeti::create_policy`,
        arguments: [
          tx.pure.address(agentAddress.trim()),
          tx.pure.u64(maxMist),
          tx.pure.u64(dailyMist),
        ],
      });

      const result = await dAppKitInstance.signAndExecuteTransaction({
        transaction: tx,
      });

      if (result.$kind === "FailedTransaction") {
        const errorDetail = result.FailedTransaction.status.error;
        const errorMsg =
          typeof errorDetail === "object" && errorDetail && "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Transaction execution failed on-chain.";
        throw new Error(errorMsg);
      }

      const txRecord = result.Transaction;
      if (txRecord.status.success === false) {
        const errorDetail = txRecord.status.error;
        const errorMsg =
          typeof errorDetail === "object" && errorDetail && "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Transaction execution was not successful.";
        throw new Error(errorMsg);
      }

      const changedObjects = txRecord.effects?.changedObjects || [];
      const sharedPolicy = changedObjects.find(
        (obj: { idOperation?: string; outputOwner?: { $kind?: string } | null }) =>
          obj.idOperation === "Created" &&
          (obj.outputOwner?.$kind === "Shared" || (obj.outputOwner && "Shared" in obj.outputOwner))
      );

      if (!sharedPolicy?.objectId) {
        throw new Error(
          "Policy creation transaction completed, but no shared ProcurementPolicy object was found in transaction effects."
        );
      }

      const createdPolicyId = sharedPolicy.objectId;
      const txDigest = txRecord.digest || txRecord.effects?.transactionDigest || "";

      setOnChainPolicyId(createdPolicyId);
      setOnChainTxDigest(txDigest);
      setOnChainSuccess("On-chain procurement policy created and shared successfully on Sui Testnet!");

      // Persist alongside existing localStorage data, preserving unrelated records
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        const updated = {
          ...existing,
          onChainPolicyId: createdPolicyId,
          onChainAgent: agentAddress.trim(),
          onChainMaxPerPurchaseMist: maxMist.toString(),
          onChainDailyLimitMist: dailyMist.toString(),
          onChainTxDigest: txDigest,
          onChainOwner: currentAccount.address,
          onChainCreatedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (storageErr) {
        console.error("Could not persist on-chain policy to localStorage:", storageErr);
      }
    } catch (err) {
      console.error("Error creating on-chain policy:", err);
      setOnChainError(err instanceof Error ? err.message : "Failed to create on-chain policy.");
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleCreateAllowance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAllowanceError("");
    setAllowanceWarning("");
    setAllowanceSuccess("");

    if (!currentAccount) {
      setAllowanceError("Please connect your owner wallet to create an allowance.");
      return;
    }

    const effectivePolicyId = onChainPolicyId || VERIFIED_POLICY_ID;
    if (!effectivePolicyId) {
      setAllowanceError("An on-chain procurement policy is required before creating an allowance.");
      return;
    }

    const effectiveAgent = agentAddress.trim() || VERIFIED_AGENT_ADDRESS;
    if (!isValidSuiAddress(effectiveAgent)) {
      setAllowanceError("A valid agent Sui address is required for the allowance spender.");
      return;
    }

    let lifetimeCapMist: bigint;
    try {
      // Safe u256 conversion for Move lifetime cap
      lifetimeCapMist = suiToMistU256(lifetimeCapSui);
    } catch (err) {
      setAllowanceError(
        err instanceof Error
          ? `Lifetime cap error: ${err.message}`
          : "Invalid lifetime cap."
      );
      return;
    }

    const days = Number(expirationDays.trim());
    if (!Number.isFinite(days) || days <= 0) {
      setAllowanceError("Expiration must be a positive number of days.");
      return;
    }
    if (days > 3650) {
      setAllowanceError("Expiration cannot exceed 10 years (3650 days).");
      return;
    }

    const nowMs = Date.now();
    const expirationTimestampMs = BigInt(Math.floor(nowMs + days * 86400 * 1000));

    setIsCreatingAllowance(true);

    try {
      const tx = new Transaction();

      const [noRateLimit] = tx.moveCall({
        target: "0x1::option::none",
        typeArguments: ["0x2::allowance::RateLimit"],
      });

      // Propose the app-bound allowance and destructure the returned proposal
      const [proposal] = tx.moveCall({
        target: "0x2::allowance::propose_for_app",
        typeArguments: [
          "0x2::balance::Balance<0x2::sui::SUI>",
          `${PROCUREYETI_PACKAGE_ID}::procureyeti::ProcureYetiApp`,
        ],
        arguments: [
          tx.pure.string("ProcureYeti Spending Allowance"),
          tx.pure.address(effectiveAgent),
          tx.pure.option("u256", lifetimeCapMist),
          tx.pure.option("u64", null),
          tx.pure.option("u64", expirationTimestampMs),
          noRateLimit,
        ],
      });

      // Accept and issue the allowance in the same programmable transaction block
      tx.moveCall({
        target: `${PROCUREYETI_PACKAGE_ID}::procureyeti::accept_allowance`,
        arguments: [
          tx.object(effectivePolicyId),
          proposal,
        ],
      });

      const result = await dAppKitInstance.signAndExecuteTransaction({
        transaction: tx,
      });

      if (result.$kind === "FailedTransaction") {
        const errorDetail = result.FailedTransaction.status.error;
        const errorMsg =
          typeof errorDetail === "object" && errorDetail && "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Transaction execution failed on-chain.";
        throw new Error(errorMsg);
      }

      const txRecord = result.Transaction;
      if (txRecord.status.success === false) {
        const errorDetail = txRecord.status.error;
        const errorMsg =
          typeof errorDetail === "object" && errorDetail && "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Transaction execution was not successful.";
        throw new Error(errorMsg);
      }

      // Immediately capture and retain the transaction digest
      const txDigest = txRecord.digest || txRecord.effects?.transactionDigest || "";
      if (txDigest) {
        setOnChainAllowanceTxDigest(txDigest);
      }

      const changedObjects = txRecord.effects?.changedObjects || [];

      // Extract created shared Allowance object
      const createdSharedObjects = changedObjects.filter(
        (obj: { idOperation?: string; outputOwner?: { $kind?: string } | null }) =>
          obj.idOperation === "Created" &&
          (obj.outputOwner?.$kind === "Shared" || (obj.outputOwner && "Shared" in obj.outputOwner))
      );

      let createdAllowanceId: string | null = null;
      const typedAllowance = createdSharedObjects.find((obj) => {
        const t = getObjectType(obj);
        return Boolean(t && (t.includes("::allowance::Allowance<") || t.includes("::allowance::Allowance")));
      });

      if (typedAllowance?.objectId) {
        createdAllowanceId = typedAllowance.objectId;
      } else if (createdSharedObjects.length === 1) {
        createdAllowanceId = createdSharedObjects[0].objectId;
      } else if (createdSharedObjects.length === 0) {
        throw new Error(
          `Allowance creation transaction succeeded on-chain (digest: ${txDigest || "unknown"}), but no newly created shared object was found in transaction effects. Please check SuiScan before retrying.`
        );
      } else {
        throw new Error(
          `Allowance creation transaction succeeded on-chain (digest: ${txDigest || "unknown"}), but found multiple newly created shared objects (${createdSharedObjects.map((o: { objectId?: string }) => o.objectId).join(", ")}) without type metadata. Registration halted to avoid ambiguity; please verify the Allowance object ID on SuiScan.`
        );
      }

      // Extract created owner-owned AllowanceCap object matching currentAccount.address
      const connectedOwnerNormalized = safeNormalizeAddress(currentAccount.address);
      const createdOwnedObjects = changedObjects.filter(
        (obj: { idOperation?: string; outputOwner?: unknown }) =>
          obj.idOperation === "Created" && getAddressOwner(obj.outputOwner) !== null
      );

      const userOwnedObjects = createdOwnedObjects.filter((obj) => {
        const addr = getAddressOwner(obj.outputOwner);
        return addr && safeNormalizeAddress(addr) === connectedOwnerNormalized;
      });

      let createdAllowanceCapId: string | null = null;
      const typedCap = userOwnedObjects.find((obj) => {
        const t = getObjectType(obj);
        return Boolean(t && (t.includes("::allowance::AllowanceCap<") || t.includes("::allowance::AllowanceCap")));
      });

      if (typedCap?.objectId) {
        createdAllowanceCapId = typedCap.objectId;
      } else if (userOwnedObjects.length === 1) {
        createdAllowanceCapId = userOwnedObjects[0].objectId;
      } else if (userOwnedObjects.length === 0) {
        throw new Error(
          `Allowance creation transaction succeeded on-chain (digest: ${txDigest || "unknown"}), but no newly created object owned by ${currentAccount.address} was found in transaction effects. Please verify your wallet on SuiScan before retrying.`
        );
      } else {
        throw new Error(
          `Allowance creation transaction succeeded on-chain (digest: ${txDigest || "unknown"}), but found multiple newly created objects owned by ${currentAccount.address} (${userOwnedObjects.map((o: { objectId?: string }) => o.objectId).join(", ")}) without type metadata. Registration halted to avoid ambiguity; please verify the AllowanceCap ID on SuiScan.`
        );
      }

      setOnChainAllowanceId(createdAllowanceId);
      setOnChainAllowanceCapId(createdAllowanceCapId);
      setOnChainAllowanceLifetimeCapMist(lifetimeCapMist.toString());
      setOnChainAllowanceExpirationMs(expirationTimestampMs.toString());
      setOnChainAllowanceRegistered(false);
      setOnChainAllowanceRegistrationTxDigest(null);

      // Persist in localStorage without overwriting existing policy settings
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        const updated = {
          ...existing,
          onChainAllowanceId: createdAllowanceId,
          onChainAllowanceCapId: createdAllowanceCapId,
          onChainAllowanceLifetimeCapMist: lifetimeCapMist.toString(),
          onChainAllowanceExpirationMs: expirationTimestampMs.toString(),
          onChainAllowanceTxDigest: txDigest,
          onChainAllowanceRegistered: false,
          onChainAllowanceRegistrationTxDigest: null,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setAllowanceSuccess(
          "Native Sui Allowance created and accepted on-chain! Register the AllowanceCap next."
        );
      } catch (storageErr) {
        console.error("Could not persist allowance to localStorage:", storageErr);
        setAllowanceWarning(
          `Transaction succeeded on-chain (digest: ${txDigest}), but browser storage could not be updated. Your allowance details are loaded in memory for this session.`
        );
      }
    } catch (err) {
      console.error("Error creating allowance:", err);
      setAllowanceError(
        err instanceof Error ? err.message : "Failed to create allowance."
      );
    } finally {
      setIsCreatingAllowance(false);
    }
  }

  async function handleRegisterAllowance() {
    setAllowanceError("");
    setAllowanceWarning("");
    setAllowanceSuccess("");

    if (!currentAccount) {
      setAllowanceError("Please connect your owner wallet to register the allowance.");
      return;
    }

    const effectivePolicyId = onChainPolicyId || VERIFIED_POLICY_ID;
    if (!effectivePolicyId) {
      setAllowanceError("Policy object ID is missing.");
      return;
    }

    if (!onChainAllowanceCapId) {
      setAllowanceError("AllowanceCap object ID is missing. Create an allowance first.");
      return;
    }

    setIsRegisteringAllowance(true);

    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${PROCUREYETI_PACKAGE_ID}::procureyeti::register_allowance`,
        arguments: [
          tx.object(effectivePolicyId),
          tx.object(onChainAllowanceCapId),
        ],
      });

      const result = await dAppKitInstance.signAndExecuteTransaction({
        transaction: tx,
      });

      if (result.$kind === "FailedTransaction") {
        const errorDetail = result.FailedTransaction.status.error;
        const errorMsg =
          typeof errorDetail === "object" && errorDetail && "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Registration transaction failed on-chain.";
        throw new Error(errorMsg);
      }

      const txRecord = result.Transaction;
      if (txRecord.status.success === false) {
        const errorDetail = txRecord.status.error;
        const errorMsg =
          typeof errorDetail === "object" && errorDetail && "message" in errorDetail
            ? String((errorDetail as { message?: string }).message)
            : "Registration transaction was not successful.";
        throw new Error(errorMsg);
      }

      const regTxDigest = txRecord.digest || txRecord.effects?.transactionDigest || "";
      if (regTxDigest) {
        setOnChainAllowanceRegistrationTxDigest(regTxDigest);
      }
      setOnChainAllowanceRegistered(true);

      // Persist registration in localStorage
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        const updated = {
          ...existing,
          onChainAllowanceRegistered: true,
          onChainAllowanceRegistrationTxDigest: regTxDigest,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setAllowanceSuccess(
          "AllowanceCap successfully registered with the on-chain ProcurementPolicy!"
        );
      } catch (storageErr) {
        console.error("Could not persist allowance registration to localStorage:", storageErr);
        setAllowanceWarning(
          `Allowance registration succeeded on-chain (digest: ${regTxDigest}), but browser storage could not be updated. Registration status is active in memory for this session.`
        );
      }
    } catch (err) {
      console.error("Error registering allowance:", err);
      setAllowanceError(
        err instanceof Error ? err.message : "Failed to register allowance."
      );
    } finally {
      setIsRegisteringAllowance(false);
    }
  }

  function formatAmount(value: number | null, currency: string) {
    if (value === null) return "Not configured";

    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  if (!loaded) {
    return (
      <div className="mt-6 text-sm text-slate-500">
        Loading procurement policies...
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {/* On-Chain Sui Policy & Allowance Section */}
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-indigo-50/20 p-5 shadow-sm dark:border-indigo-900/40 dark:bg-[#101729]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                On-chain Sui procurement policy & allowance
              </h3>
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                Sui Testnet
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Manage on-chain policy limits and app-bound spending allowances enforced by Move contracts.
            </p>
          </div>
          {currentAccount ? (
            <div className="text-right text-xs">
              <span className="text-slate-400">Owner wallet: </span>
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
              </span>
            </div>
          ) : (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Wallet not connected
            </span>
          )}
        </div>

        {onChainPolicyId ? (
          <div className="mt-5 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Shared policy deployed on-chain
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOnChainPolicyId(null)}
                className={getBtnClass("outline", "xs")}
              >
                Deploy new policy
              </button>
            </div>

            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="font-semibold text-slate-500 dark:text-slate-400">Policy Object ID (Shared)</p>
                <p className="mt-1 font-mono font-bold text-slate-900 break-all dark:text-slate-100">
                  {onChainPolicyId}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-500 dark:text-slate-400">Transaction Digest</p>
                <p className="mt-1 font-mono font-bold text-slate-900 break-all dark:text-slate-100">
                  {onChainTxDigest || "Recorded on Testnet"}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-500 dark:text-slate-400">Authorized Agent</p>
                <p className="mt-1 font-mono text-slate-800 break-all dark:text-slate-200">
                  {agentAddress || "Not recorded"}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-500 dark:text-slate-400">Spending Limits</p>
                <p className="mt-1 text-slate-800 dark:text-slate-200">
                  Max: <span className="font-semibold">{maxPerPurchaseSui} SUI</span> / Daily: <span className="font-semibold">{dailyLimitSui} SUI</span>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateOnChainPolicy} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Agent Sui address
                <input
                  type="text"
                  value={agentAddress}
                  onChange={(e) => {
                    setAgentAddress(e.target.value);
                    setOnChainError("");
                  }}
                  placeholder="0x... (address of the AI purchasing agent)"
                  className={inputClass}
                  disabled={isDeploying}
                />
              </label>
              <p className="mt-1 text-[11px] text-slate-400">
                Only this registered agent address will be permitted to call execute_purchase.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Max per-purchase limit (SUI)
                <input
                  type="text"
                  value={maxPerPurchaseSui}
                  onChange={(e) => {
                    setMaxPerPurchaseSui(e.target.value);
                    setOnChainError("");
                  }}
                  placeholder="e.g. 0.1"
                  className={inputClass}
                  disabled={isDeploying}
                />
              </label>

              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Daily spending limit (SUI)
                <input
                  type="text"
                  value={dailyLimitSui}
                  onChange={(e) => {
                    setDailyLimitSui(e.target.value);
                    setOnChainError("");
                  }}
                  placeholder="e.g. 0.5"
                  className={inputClass}
                  disabled={isDeploying}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Creates a shared on-chain ProcurementPolicy object with you as the owner.
              </p>
              <button
                type="submit"
                disabled={isDeploying || !currentAccount}
                className={getBtnClass("primary", "lg")}
              >
                {isDeploying ? "Deploying on-chain policy..." : "Create on-chain policy"}
              </button>
            </div>
          </form>
        )}

        {onChainError && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          >
            {onChainError}
          </p>
        )}

        {onChainSuccess && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          >
            {onChainSuccess}
          </p>
        )}

        {/* Sui Native Allowance Section */}
        <div className="mt-6 rounded-xl border border-indigo-200/70 bg-white/80 p-5 shadow-xs dark:border-indigo-800/40 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  App-bound Sui Allowance
                </h4>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    onChainAllowanceRegistered
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : onChainAllowanceId
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {onChainAllowanceRegistered
                    ? "Active & Registered"
                    : onChainAllowanceId
                    ? "Issued (Pending Registration)"
                    : "Not Configured"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Authorizes the agent to draw payments from the owner balance through ProcureYetiApp.
              </p>
            </div>
            {onChainAllowanceId && (
              <button
                type="button"
                onClick={() => {
                  setOnChainAllowanceId(null);
                  setOnChainAllowanceCapId(null);
                  setOnChainAllowanceRegistered(false);
                  setOnChainAllowanceTxDigest(null);
                  setOnChainAllowanceRegistrationTxDigest(null);
                  setAllowanceWarning("");
                }}
                className={getBtnClass("outline", "xs")}
              >
                Reconfigure allowance
              </button>
            )}
          </div>

          {onChainAllowanceId ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-slate-500 dark:text-slate-400">
                    Shared Allowance Object ID
                  </p>
                  <p className="mt-1 font-mono font-bold text-slate-900 break-all dark:text-slate-100">
                    {onChainAllowanceId}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500 dark:text-slate-400">
                    Owned AllowanceCap ID
                  </p>
                  <p className="mt-1 font-mono font-bold text-slate-900 break-all dark:text-slate-100">
                    {onChainAllowanceCapId || "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500 dark:text-slate-400">
                    Lifetime Spending Cap
                  </p>
                  <p className="mt-1 text-slate-800 font-semibold dark:text-slate-200">
                    {mistToSuiString(onChainAllowanceLifetimeCapMist) || lifetimeCapSui} SUI
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500 dark:text-slate-400">
                    Expiration Window
                  </p>
                  <p className="mt-1 text-slate-800 dark:text-slate-200">
                    {formatExpiration(onChainAllowanceExpirationMs)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500 dark:text-slate-400">
                    Issuance Transaction Digest
                  </p>
                  <p className="mt-1 font-mono text-slate-800 break-all dark:text-slate-200">
                    {onChainAllowanceTxDigest || "Recorded"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500 dark:text-slate-400">
                    Registration Transaction Digest
                  </p>
                  <p className="mt-1 font-mono text-slate-800 break-all dark:text-slate-200">
                    {onChainAllowanceRegistrationTxDigest || (onChainAllowanceRegistered ? "Confirmed" : "Not yet registered")}
                  </p>
                </div>
              </div>

              {!onChainAllowanceRegistered && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Step 2: Register AllowanceCap with ProcurementPolicy
                      </p>
                      <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                        The Allowance is shared and the AllowanceCap is held in your owner wallet. Register the cap with the policy so ProcureYeti can enforce permissions on purchase execution.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRegisterAllowance}
                      disabled={isRegisteringAllowance || !currentAccount}
                      className={getBtnClass("warning", "sm")}
                    >
                      {isRegisteringAllowance ? "Registering cap..." : "Register Allowance with Policy"}
                    </button>
                  </div>
                </div>
              )}

              {onChainAllowanceRegistered && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  ✓ AllowanceCap is successfully registered with your ProcurementPolicy. The agent is authorized to execute approved purchases within these limits.
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateAllowance} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Allowance lifetime cap (SUI)
                  <input
                    type="text"
                    value={lifetimeCapSui}
                    onChange={(e) => {
                      setLifetimeCapSui(e.target.value);
                      setAllowanceError("");
                      setAllowanceWarning("");
                    }}
                    placeholder="e.g. 2.0"
                    className={inputClass}
                    disabled={isCreatingAllowance}
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    Default 2 SUI. Cumulative authorization cap across all purchases (supports up to u256 limits).
                  </span>
                </label>

                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Expiration duration (Days)
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={expirationDays}
                    onChange={(e) => {
                      setExpirationDays(e.target.value);
                      setAllowanceError("");
                      setAllowanceWarning("");
                    }}
                    placeholder="e.g. 30"
                    className={inputClass}
                    disabled={isCreatingAllowance}
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    Default 30 days. Allowance expires automatically after this duration.
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Submits a PTB calling propose_for_app and accept_allowance.
                </p>
                <button
                  type="submit"
                  disabled={isCreatingAllowance || !currentAccount}
                  className={getBtnClass("primary", "md")}
                >
                  {isCreatingAllowance ? "Creating allowance..." : "Create & accept allowance"}
                </button>
              </div>
            </form>
          )}

          {allowanceWarning && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
            >
              ⚠️ {allowanceWarning}
            </p>
          )}

          {allowanceError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
            >
              {allowanceError}
            </p>
          )}

          {allowanceSuccess && (
            <p
              role="status"
              className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              {allowanceSuccess}
            </p>
          )}
        </div>
      </section>

      {/* Prototype / Off-chain Policy Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Local workspace spending policy (NGN / USD)
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200/80">
            Configure local fiat budget limits for request validation.
          </p>
        </div>

        <section>
          <h3 className="text-sm font-bold">Spending limits</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Set the maximum permitted amount and the threshold requiring owner
            approval for each currency.
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {(["NGN", "USD"] as const).map((currency) => (
              <article
                key={currency}
                className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <h4 className="font-semibold">
                  {currency === "NGN" ? "Nigerian Naira (NGN)" : "US Dollar (USD)"}
                </h4>

                <label className="mt-4 block text-xs font-semibold">
                  Maximum spending per request
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={policy[currency].maxRequestAmount ?? ""}
                    onChange={(event) =>
                      updateCurrency(
                        currency,
                        "maxRequestAmount",
                        event.target.value
                      )
                    }
                    placeholder="Enter maximum amount"
                    className={inputClass}
                  />
                </label>

                <label className="mt-4 block text-xs font-semibold">
                  Owner approval threshold
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={policy[currency].approvalThreshold ?? ""}
                    onChange={(event) =>
                      updateCurrency(
                        currency,
                        "approvalThreshold",
                        event.target.value
                      )
                    }
                    placeholder="Enter approval threshold"
                    className={inputClass}
                  />
                </label>

                <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Requests above the approval threshold but within the maximum
                  will require owner authorization.
                </p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold">Permitted purchasing categories</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Select the categories your business is permitted to purchase.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {PROCUREMENT_CATEGORIES.map((category) => {
              const enabled = policy.allowedCategories.includes(category);

              return (
                <label
                  key={category}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700"
                >
                  <span className="font-medium">{category}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleCategory(category)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                </label>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="text-sm font-bold">Current policy summary</h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(["NGN", "USD"] as const).map((currency) => (
              <div key={currency}>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {currency} maximum
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {formatAmount(policy[currency].maxRequestAmount, currency)}
                </p>
                <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {currency} approval threshold
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {formatAmount(policy[currency].approvalThreshold, currency)}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            {policy.allowedCategories.length} of {PROCUREMENT_CATEGORIES.length} purchasing
            categories enabled.
          </p>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {saved && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          >
            Procurement policy saved successfully in this browser.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Changes take effect when saved.
          </p>
          <button
            type="submit"
            className={getBtnClass("primary", "lg")}
          >
            Save procurement policy
          </button>
        </div>

        <p className="text-[11px] leading-5 text-slate-400">
          Prototype settings are stored in this browser. They are not yet
          enforced by a Sui smart contract or protected by backend authorization.
        </p>
      </form>
    </div>
  );
}
