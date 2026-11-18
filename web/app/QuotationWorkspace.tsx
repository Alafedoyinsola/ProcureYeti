"use client";

import { useEffect, useState, type FormEvent } from "react";

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
};

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

  useEffect(() => {
    try {
      const savedRequests = localStorage.getItem(REQUESTS_KEY);
      const savedSuppliers = localStorage.getItem(SUPPLIERS_KEY);
      const savedQuotations = localStorage.getItem(QUOTATIONS_KEY);

      if (savedRequests) {
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
    .sort((a, b) => a.totalPrice - b.totalPrice);

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  const editingQuotation = quotations.find(
    (quotation) => quotation.id === editingId
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const requestId = String(data.get("requestId") || "");
    const supplierId = String(data.get("supplierId") || "");
    const request = requests.find((item) => item.id === requestId);
    const supplier = suppliers.find((item) => item.id === supplierId);

    const unitPrice = Number(data.get("unitPrice"));
    const deliveryDays = Number(data.get("deliveryDays"));

    if (!request || !supplier || supplier.status !== "Active") {
      alert("Select a valid purchase request and active supplier.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      alert("Enter a valid unit price greater than zero.");
      return;
    }

    if (!Number.isFinite(deliveryDays) || deliveryDays < 0) {
      alert("Enter a valid delivery time.");
      return;
    }

    const duplicate = quotations.some(
      (quotation) =>
        quotation.requestId === requestId &&
        quotation.supplierId === supplierId &&
        quotation.id !== editingId
    );

    if (duplicate) {
      alert("This supplier already has a quotation for this request.");
      return;
    }

    const quotationData = {
      requestId,
      supplierId,
      unitPrice,
      totalPrice: unitPrice * request.quantity,
      currency: request.currency,
      deliveryDays,
      paymentTerms: String(data.get("paymentTerms") || "").trim(),
      validUntil: String(data.get("validUntil") || ""),
      notes: String(data.get("notes") || "").trim(),
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
  }

  function editQuotation(quotation: Quotation) {
    setEditingId(quotation.id);
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
    return `${currency} ${amount.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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
            setFormOpen((open) => !open);
          }}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
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
              Enter the details from the supplier's offer.
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
                  {request.currency} {request.budget.toLocaleString("en-NG")}
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
              min="0.01"
              step="0.01"
              required
              defaultValue={editingQuotation?.unitPrice ?? ""}
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

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500"
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
                  {formatMoney(
                    requestQuotations[0].totalPrice,
                    requestQuotations[0].currency
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
                    {formatMoney(quotation.totalPrice, quotation.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Unit price
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatMoney(quotation.unitPrice, quotation.currency)}
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
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuotation(quotation.id)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
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
