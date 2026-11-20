"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getBtnClass } from "./button-styles";

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
};

type Supplier = {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  category: string;
  status: "Active" | "Inactive";
  createdAt: string;
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
  unitPriceDecimal?: string;
  totalPriceDecimal?: string;
};

const MIST_PER_SUI = BigInt("1000000000");

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

function mistToSuiDecimal(mist: bigint): string {
  const whole = (mist / MIST_PER_SUI).toString();
  const rem = (mist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
  return rem ? `${whole}.${rem}` : whole;
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

const REQUESTS_KEY = "procureyeti-requests";
const SUPPLIERS_KEY = "procureyeti-suppliers";
const QUOTATIONS_KEY = "procureyeti-quotations";

export function QuotationWorkspace() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const savedRequests = localStorage.getItem(REQUESTS_KEY);
      const savedSuppliers = localStorage.getItem(SUPPLIERS_KEY);
      const savedQuotations = localStorage.getItem(QUOTATIONS_KEY);

      if (savedRequests) {
        // Hydrate requests from client localStorage on initial mount (SSR cannot access localStorage)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRequests(JSON.parse(savedRequests) as PurchaseRequest[]);
      }

      if (savedSuppliers) {
        setSuppliers(JSON.parse(savedSuppliers) as Supplier[]);
      }

      if (savedQuotations) {
        setQuotations(JSON.parse(savedQuotations) as Quotation[]);
      }
    } catch {
      console.error("Could not load quotation workspace data.");
    }

    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(QUOTATIONS_KEY, JSON.stringify(quotations));
    }
  }, [quotations, loaded]);

  const activeSuppliers = suppliers.filter(
    (supplier) => supplier.status === "Active"
  );

  const selectedRequest = requests.find(
    (request) => request.id === selectedRequestId
  );

  const requestQuotations = quotations
    .filter((quotation) => quotation.requestId === selectedRequestId)
    .sort(compareQuotations);

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  const editingQuotation = quotations.find(
    (quotation) => quotation.id === editingId
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);

    const requestId = String(data.get("requestId") || "");
    const supplierId = String(data.get("supplierId") || "");
    const request = requests.find((item) => item.id === requestId);
    const supplier = suppliers.find((item) => item.id === supplierId);

    const rawUnitPrice = String(data.get("unitPrice") || "").trim();
    const deliveryDays = Number(data.get("deliveryDays"));

    if (!request || !supplier || supplier.status !== "Active") {
      setError("Select a valid purchase request and active supplier.");
      return;
    }

    let unitPrice = 0;
    let totalPrice = 0;
    let unitPriceDecimal: string | undefined = undefined;
    let totalPriceDecimal: string | undefined = undefined;

    if (request.currency === "SUI") {
      const suiAddr = supplier.suiAddress?.trim() || "";
      if (!/^0x[0-9a-fA-F]{64}$/.test(suiAddr)) {
        setError(
          `Selected supplier "${supplier.name}" does not have a valid Sui wallet address. SUI quotations require a supplier with a configured Sui Testnet address.`
        );
        return;
      }

      if (!/^\d+(\.\d+)?$/.test(rawUnitPrice)) {
        setError("Enter a valid SUI unit price greater than zero.");
        return;
      }

      const [, decPart = ""] = rawUnitPrice.split(".");
      if (decPart.length > 9) {
        setError("SUI unit price cannot have more than 9 decimal places.");
        return;
      }

      let unitPriceMist: bigint;
      try {
        unitPriceMist = parseSuiToMist(rawUnitPrice);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid SUI price.");
        return;
      }

      if (
        !Number.isInteger(request.quantity) ||
        request.quantity < 1 ||
        request.quantity > 1000000
      ) {
        setError(
          "The purchase request quantity must be a positive whole number between 1 and 1,000,000."
        );
        return;
      }

      const quantityBigInt = BigInt(request.quantity);
      const totalPriceMist = unitPriceMist * quantityBigInt;

      unitPriceDecimal = mistToSuiDecimal(unitPriceMist);
      totalPriceDecimal = mistToSuiDecimal(totalPriceMist);

      unitPrice = Number(rawUnitPrice);
      totalPrice = unitPrice * request.quantity;
    } else {
      const numPrice = Number(rawUnitPrice);
      if (!Number.isFinite(numPrice) || numPrice <= 0) {
        setError("Enter a valid unit price greater than zero.");
        return;
      }
      unitPrice = numPrice;
      totalPrice = unitPrice * request.quantity;
    }

    if (!Number.isFinite(deliveryDays) || deliveryDays < 0) {
      setError("Enter a valid delivery time.");
      return;
    }

    const duplicate = quotations.some(
      (quotation) =>
        quotation.requestId === requestId &&
        quotation.supplierId === supplierId &&
        quotation.id !== editingId
    );

    if (duplicate) {
      setError("This supplier already has a quotation for this request.");
      return;
    }

    const quotationData = {
      requestId,
      supplierId,
      unitPrice,
      totalPrice,
      currency: request.currency,
      deliveryDays,
      paymentTerms: String(data.get("paymentTerms") || "").trim(),
      validUntil: String(data.get("validUntil") || ""),
      notes: String(data.get("notes") || "").trim(),
      unitPriceDecimal,
      totalPriceDecimal,
    };

    if (editingId) {
      setQuotations((current) =>
        current.map((quotation) =>
          quotation.id === editingId
            ? { ...quotation, ...quotationData }
            : quotation
        )
      );
    } else {
      setQuotations((current) => [
        {
          id: `${Date.now()}`,
          ...quotationData,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    }

    form.reset();
    setEditingId(null);
    setFormOpen(false);
    setError("");
  }

  function editQuotation(quotation: Quotation) {
    setEditingId(quotation.id);
    setError("");
    setFormOpen(true);
  }

  function deleteQuotation(id: string) {
    if (!window.confirm("Delete this quotation?")) return;

    setQuotations((current) =>
      current.filter((quotation) => quotation.id !== id)
    );
  }

  function getSupplierName(supplierId: string) {
    return (
      suppliers.find((supplier) => supplier.id === supplierId)?.name ??
      "Unknown supplier"
    );
  }

  function getRequestName(requestId: string) {
    return (
      requests.find((request) => request.id === requestId)?.item ??
      "Unknown request"
    );
  }

  function formatMoney(amount: number, currency: string) {
    if (currency === "SUI") {
      return `${amount.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 9,
      })} SUI`;
    }
    return `${currency} ${amount.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Supplier quotations</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {quotations.length} quotation{quotations.length === 1 ? "" : "s"} recorded
          </p>
        </div>

        <button
          type="button"
          disabled={requests.length === 0 || activeSuppliers.length === 0}
          onClick={() => {
            setEditingId(null);
            setError("");
            setFormOpen((open) => !open);
          }}
          className={getBtnClass(formOpen ? "secondary" : "primary", "md")}
        >
          {formOpen ? "Close form" : "+ Add quotation"}
        </button>
      </div>

      {(requests.length === 0 || activeSuppliers.length === 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300">
          {requests.length === 0
            ? "Create a purchase request before recording quotations."
            : "Register at least one active supplier before recording quotations."}
        </div>
      )}

      {formOpen && (
        <form
          key={editingId ?? "new"}
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60 sm:p-5"
        >
          <div>
            <h4 className="font-semibold">
              {editingId ? "Edit quotation" : "Record supplier quotation"}
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Enter the details from the supplier&apos;s offer.
            </p>
          </div>

          <div>
            <label htmlFor="quote-request" className="text-xs font-semibold">
              Purchase request *
            </label>
            <select
              id="quote-request"
              name="requestId"
              required
              defaultValue={editingQuotation?.requestId ?? ""}
              onChange={(event) => setSelectedRequestId(event.target.value)}
              className={inputClass}
            >
              <option value="" disabled>Select a purchase request</option>
              {requests.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.item} | Qty: {request.quantity} | Budget:{" "}
                  {formatMoney(request.budget, request.currency)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="quote-supplier" className="text-xs font-semibold">
              Supplier *
            </label>
            <select
              id="quote-supplier"
              name="supplierId"
              required
              defaultValue={editingQuotation?.supplierId ?? ""}
              className={inputClass}
            >
              <option value="" disabled>Select a supplier</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="quote-unit-price" className="text-xs font-semibold">
              Unit price *
            </label>
            <input
              id="quote-unit-price"
              name="unitPrice"
              type="number"
              step="any"
              required
              defaultValue={
                editingQuotation?.unitPriceDecimal ??
                editingQuotation?.unitPrice ??
                ""
              }
              placeholder="Price per unit"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Total is calculated from the purchase request quantity.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="quote-delivery" className="text-xs font-semibold">
                Delivery time (days) *
              </label>
              <input
                id="quote-delivery"
                name="deliveryDays"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={editingQuotation?.deliveryDays ?? ""}
                placeholder="e.g. 7"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="quote-validity" className="text-xs font-semibold">
                Quotation valid until
              </label>
              <input
                id="quote-validity"
                name="validUntil"
                type="date"
                defaultValue={editingQuotation?.validUntil ?? ""}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="quote-terms" className="text-xs font-semibold">
              Payment terms
            </label>
            <input
              id="quote-terms"
              name="paymentTerms"
              maxLength={200}
              defaultValue={editingQuotation?.paymentTerms ?? ""}
              placeholder="e.g. 50% upfront, balance on delivery"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="quote-notes" className="text-xs font-semibold">
              Additional notes
            </label>
            <textarea
              id="quote-notes"
              name="notes"
              rows={3}
              maxLength={1000}
              defaultValue={editingQuotation?.notes ?? ""}
              placeholder="Warranty, delivery conditions, exclusions, etc."
              className={inputClass}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
                setError("");
              }}
              className={getBtnClass("secondary", "md")}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={getBtnClass("primary", "md")}
            >
              {editingId ? "Save changes" : "Save quotation"}
            </button>
          </div>
        </form>
      )}

      <div>
        <label htmlFor="compare-request" className="text-xs font-semibold">
          Compare quotations for
        </label>
        <select
          id="compare-request"
          value={selectedRequestId}
          onChange={(event) => setSelectedRequestId(event.target.value)}
          className={inputClass}
        >
          <option value="">Select a purchase request</option>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.item} ({request.quantity} units)
            </option>
          ))}
        </select>
      </div>

      {selectedRequest && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                {selectedRequest.item}
              </h4>
              <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
                Quantity: {selectedRequest.quantity}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-indigo-700 dark:text-indigo-300">
                Budget
              </p>
              <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                {formatMoney(selectedRequest.budget, selectedRequest.currency)}
              </p>
            </div>
          </div>

          {requestQuotations.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lowest quotation
                </p>
                <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatQuotationPrice(
                    requestQuotations[0].totalPrice,
                    requestQuotations[0].currency,
                    requestQuotations[0].totalPriceDecimal
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Budget remaining / exceeded
                </p>
                <p
                  className={`mt-1 text-sm font-bold ${
                    selectedRequest.budget - requestQuotations[0].totalPrice >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {formatMoney(
                    Math.abs(selectedRequest.budget - requestQuotations[0].totalPrice),
                    selectedRequest.currency
                  )}
                  {selectedRequest.budget >= requestQuotations[0].totalPrice
                    ? " under budget"
                    : " over budget"}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {selectedRequestId && requestQuotations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center dark:border-slate-700">
            <p className="text-sm font-semibold">No quotations for this request</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Add supplier offers to compare their prices and delivery terms.
            </p>
          </div>
        ) : (
          requestQuotations.map((quotation, index) => (
            <article
              key={quotation.id}
              className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">
                    {getSupplierName(quotation.supplierId)}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {getRequestName(quotation.requestId)}
                  </p>
                </div>

                {index === 0 && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Lowest price
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total quotation
                  </p>
                  <p className="mt-1 text-sm font-bold">
                    {formatQuotationPrice(
                      quotation.totalPrice,
                      quotation.currency,
                      quotation.totalPriceDecimal
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Unit price
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatQuotationPrice(
                      quotation.unitPrice,
                      quotation.currency,
                      quotation.unitPriceDecimal
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Delivery
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {quotation.deliveryDays} days
                  </p>
                </div>
              </div>

              {quotation.paymentTerms && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Payment: {quotation.paymentTerms}
                </p>
              )}

              {quotation.validUntil && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Valid until: {quotation.validUntil}
                </p>
              )}

              {quotation.notes && (
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {quotation.notes}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => editQuotation(quotation)}
                  className={getBtnClass("outline", "xs")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuotation(quotation.id)}
                  className={getBtnClass("destructive", "xs")}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <p className="text-[11px] leading-5 text-slate-400">
        Quotations are saved in this browser only. Prices are compared
        mathematically. No AI analysis, approval or blockchain transaction has
        been performed.
      </p>
    </div>
  );
}
