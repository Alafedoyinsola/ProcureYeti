"use client";

import { useEffect, useState, type FormEvent } from "react";

import { DEFAULT_POLICY, PROCUREMENT_CATEGORIES } from "./policy-engine";
import type { CurrencyPolicy, ProcurementPolicy } from "./policy-engine";

const STORAGE_KEY = "procureyeti-policy";


export function PolicyWorkspace() {
  const [policy, setPolicy] = useState<ProcurementPolicy>(DEFAULT_POLICY);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ProcurementPolicy>;

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
      setSaved(true);
    } catch {
      setError("Could not save the policy in this browser.");
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
    <form onSubmit={handleSave} className="mt-6 space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Policy configuration
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200/80">
          Configure the limits your business wants to enforce. Unconfigured
          limits are not yet available for automated policy evaluation.
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
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          Save procurement policy
        </button>
      </div>

      <p className="text-[11px] leading-5 text-slate-400">
        Prototype settings are stored in this browser. They are not yet
        enforced by a Sui smart contract or protected by backend authorization.
      </p>
    </form>
  );
}