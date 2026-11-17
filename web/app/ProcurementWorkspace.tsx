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

const STORAGE_KEY = "procureyeti-requests";

export function ProcurementWorkspace() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setRequests(JSON.parse(saved) as PurchaseRequest[]);
      }
    } catch {
      console.error("Could not load saved procurement requests.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    }
  }, [requests, loaded]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const request: PurchaseRequest = {
      id: `${Date.now()}`,
      item: String(data.get("item") || "").trim(),
      category: String(data.get("category") || ""),
      quantity: Number(data.get("quantity")),
      budget: Number(data.get("budget")),
      currency: String(data.get("currency") || "NGN"),
      deliveryDate: String(data.get("deliveryDate") || ""),
      notes: String(data.get("notes") || "").trim(),
      createdAt: new Date().toISOString(),
    };

    setRequests((current) => [request, ...current]);
    form.reset();
    setFormOpen(false);
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Purchase requests</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {requests.length} {requests.length === 1 ? "request" : "requests"} created
          </p>
        </div>

        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {formOpen ? "Close form" : "+ New request"}
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60 sm:p-5"
        >
          <div>
            <h4 className="font-semibold">Create a purchase request</h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Describe what your business needs to purchase.
            </p>
          </div>

          <div>
            <label htmlFor="request-item" className="text-xs font-semibold">
              Item or service *
            </label>
            <input
              id="request-item"
              name="item"
              required
              maxLength={120}
              placeholder="e.g. Office laptops"
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="request-category" className="text-xs font-semibold">
                Category *
              </label>
              <select
                id="request-category"
                name="category"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>Select a category</option>
                <option value="Technology">Technology</option>
                <option value="Office supplies">Office supplies</option>
                <option value="Equipment">Equipment</option>
                <option value="Raw materials">Raw materials</option>
                <option value="Services">Services</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="request-quantity" className="text-xs font-semibold">
                Quantity *
              </label>
              <input
                id="request-quantity"
                name="quantity"
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                placeholder="e.g. 5"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="request-budget" className="text-xs font-semibold">
                Estimated total budget *
              </label>
              <input
                id="request-budget"
                name="budget"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="e.g. 250000"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="request-currency" className="text-xs font-semibold">
                Currency *
              </label>
              <select
                id="request-currency"
                name="currency"
                defaultValue="NGN"
                className={inputClass}
              >
                <option value="NGN">NGN - Nigerian Naira</option>
                <option value="USD">USD - US Dollar</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="request-delivery" className="text-xs font-semibold">
              Required delivery date
            </label>
            <input
              id="request-delivery"
              name="deliveryDate"
              type="date"
              min={new Date().toISOString().split("T")[0]}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="request-notes" className="text-xs font-semibold">
              Specifications and requirements
            </label>
            <textarea
              id="request-notes"
              name="notes"
              rows={3}
              maxLength={1000}
              placeholder="Describe quality, specifications, preferred brands or other requirements..."
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500"
            >
              Create request
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center dark:border-slate-700">
            <p className="text-sm font-semibold">No purchase requests yet</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Create your first request to start organising a purchase.
            </p>
          </div>
        ) : (
          requests.map((request) => (
            <article
              key={request.id}
              className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">{request.item}</h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {request.category} · Quantity: {request.quantity}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  Draft
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {request.currency}{" "}
                  {request.budget.toLocaleString("en-NG", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                {request.deliveryDate && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Delivery: {request.deliveryDate}
                  </span>
                )}
              </div>

              {request.notes && (
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {request.notes}
                </p>
              )}
            </article>
          ))
        )}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-slate-400">
        Requests are currently saved in this browser only. They are not yet
        submitted for approval or recorded on Sui.
      </p>
    </div>
  );
}