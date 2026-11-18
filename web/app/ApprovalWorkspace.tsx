"use client";

import { useEffect, useState } from "react";
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
};

type ApprovalDecision = {
  requestId: string;
  status: "Approved" | "Rejected";
  quotationId: string | null;
  reason: string;
  decidedAt: string;
};

const REQUESTS_KEY = "procureyeti-requests";
const SUPPLIERS_KEY = "procureyeti-suppliers";
const QUOTATIONS_KEY = "procureyeti-quotations";
const APPROVALS_KEY = "procureyeti-approvals";

export function ApprovalWorkspace() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [decisions, setDecisions] = useState<ApprovalDecision[]>([]);
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

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

      setRequests(requestData);
      setSuppliers(supplierData);
      setQuotations(quotationData);
      setDecisions(decisionData);

      const initialSelections: Record<string, string> = {};

      requestData.forEach((request) => {
        const available = quotationData
          .filter((quote) => quote.requestId === request.id)
          .sort((a, b) => a.totalPrice - b.totalPrice);

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
      localStorage.setItem(APPROVALS_KEY, JSON.stringify(decisions));
    }
  }, [decisions, loaded]);

  function formatMoney(amount: number, currency: string) {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  function makeDecision(
    request: PurchaseRequest,
    status: "Approved" | "Rejected"
  ) {
    setError("");

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
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Awaiting decision
          </p>
          <p className="mt-2 text-2xl font-bold text-amber-800 dark:text-amber-200">
            {pendingRequests.length}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Approved
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-800 dark:text-emerald-200">
            {decisions.filter((entry) => entry.status === "Approved").length}
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

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {error}
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
              .sort((a, b) => a.totalPrice - b.totalPrice);

            const selectedQuotation = requestQuotes.find(
              (quote) => quote.id === selectedQuotes[request.id]
            );

            const lowestPrice = requestQuotes[0]?.totalPrice;

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
                                {formatMoney(quote.totalPrice, quote.currency)}
                                {quote.totalPrice === lowestPrice
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
                            {suppliers.find(
                              (entry) =>
                                entry.id === selectedQuotation.supplierId
                            )?.name || "Unknown supplier"}
                          </p>

                          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">
                                Total quotation
                              </p>
                              <p className="mt-1 font-semibold">
                                {formatMoney(
                                  selectedQuotation.totalPrice,
                                  selectedQuotation.currency
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

                <div className="mt-5">
                  <label className="block text-xs font-medium">
                    Owner's decision note
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
                    onClick={() => makeDecision(request, "Approved")}
                    disabled={
                      requestQuotes.length === 0 ||
                      !selectedQuotation ||
                      Boolean(
                        selectedQuotation &&
                          selectedQuotation.totalPrice > request.budget
                      )
                    }
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Approve purchase
                  </button>

                  <button
                    type="button"
                    onClick={() => makeDecision(request, "Rejected")}
                    className="rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  >
                    Reject request
                  </button>
                </div>

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
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    }`}
                  >
                    {decision.status}
                  </span>
                </div>

                {supplier && approvedQuote && (
                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    Authorized supplier: {supplier.name} ·{" "}
                    {formatMoney(
                      approvedQuote.totalPrice,
                      approvedQuote.currency
                    )}
                  </p>
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
        Owner decisions are currently stored in this browser. They are not yet
        enforced by a Sui smart contract and do not authorize a payment or
        blockchain transaction.
      </p>
    </div>
  );
}