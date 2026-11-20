"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getBtnClass } from "./button-styles";

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

const STORAGE_KEY = "procureyeti-suppliers";

export function SupplierWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // Hydrate suppliers from client localStorage on initial mount (SSR cannot access localStorage)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSuppliers(JSON.parse(saved) as Supplier[]);
      }
    } catch {
      console.error("Could not load saved suppliers.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers));
    }
  }, [suppliers, loaded]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);

    const rawSuiAddress = String(data.get("suiAddress") || "").trim();
    if (rawSuiAddress && !/^0x[0-9a-fA-F]{64}$/.test(rawSuiAddress)) {
      setError(
        "Sui wallet address must start with 0x followed by exactly 64 hexadecimal characters."
      );
      return;
    }

    const supplierData = {
      name: String(data.get("name") || "").trim(),
      contactPerson: String(data.get("contactPerson") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      address: String(data.get("address") || "").trim(),
      category: String(data.get("category") || ""),
      status: String(data.get("status") || "Active") as "Active" | "Inactive",
      suiAddress: rawSuiAddress ? rawSuiAddress.toLowerCase() : undefined,
    };

    if (editingId) {
      setSuppliers((current) =>
        current.map((supplier) =>
          supplier.id === editingId
            ? { ...supplier, ...supplierData }
            : supplier
        )
      );
    } else {
      setSuppliers((current) => [
        {
          id: `${Date.now()}`,
          ...supplierData,
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

  function editSupplier(supplier: Supplier) {
    setEditingId(supplier.id);
    setFormOpen(true);
    setError("");
  }

  function deleteSupplier(id: string) {
    if (!window.confirm("Delete this supplier record?")) return;

    setSuppliers((current) =>
      current.filter((supplier) => supplier.id !== id)
    );
  }

  const filteredSuppliers = suppliers.filter((supplier) =>
    [
      supplier.name,
      supplier.contactPerson,
      supplier.email,
      supplier.category,
      supplier.suiAddress || "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  const editingSupplier = suppliers.find(
    (supplier) => supplier.id === editingId
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Supplier directory</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {suppliers.length} registered{" "}
            {suppliers.length === 1 ? "supplier" : "suppliers"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setError("");
            setFormOpen((open) => !open);
          }}
          className={getBtnClass(formOpen ? "secondary" : "primary", "md")}
        >
          {formOpen ? "Close form" : "+ Add supplier"}
        </button>
      </div>

      {formOpen && (
        <form
          key={editingId ?? "new"}
          onSubmit={handleSubmit}
          className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60 sm:p-5"
        >
          <div>
            <h4 className="font-semibold">
              {editingId ? "Edit supplier" : "Register a supplier"}
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Save the supplier&apos;s business and contact details.
            </p>
          </div>

          <div>
            <label htmlFor="supplier-name" className="text-xs font-semibold">
              Supplier or business name *
            </label>
            <input
              id="supplier-name"
              name="name"
              required
              maxLength={120}
              defaultValue={editingSupplier?.name ?? ""}
              placeholder="e.g. TechWorld Supplies Ltd"
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplier-contact" className="text-xs font-semibold">
                Contact person *
              </label>
              <input
                id="supplier-contact"
                name="contactPerson"
                required
                maxLength={100}
                defaultValue={editingSupplier?.contactPerson ?? ""}
                placeholder="Full name"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="supplier-category" className="text-xs font-semibold">
                Product or service category *
              </label>
              <select
                id="supplier-category"
                name="category"
                required
                defaultValue={editingSupplier?.category ?? ""}
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplier-email" className="text-xs font-semibold">
                Email address *
              </label>
              <input
                id="supplier-email"
                name="email"
                type="email"
                required
                maxLength={150}
                defaultValue={editingSupplier?.email ?? ""}
                placeholder="supplier@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="supplier-phone" className="text-xs font-semibold">
                Phone number *
              </label>
              <input
                id="supplier-phone"
                name="phone"
                type="tel"
                required
                maxLength={30}
                defaultValue={editingSupplier?.phone ?? ""}
                placeholder="+234..."
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="supplier-address" className="text-xs font-semibold">
              Business address
            </label>
            <input
              id="supplier-address"
              name="address"
              maxLength={200}
              defaultValue={editingSupplier?.address ?? ""}
              placeholder="City, state or business address"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="supplier-sui-address" className="text-xs font-semibold">
              Sui Wallet Address
            </label>
            <input
              id="supplier-sui-address"
              name="suiAddress"
              type="text"
              maxLength={66}
              defaultValue={editingSupplier?.suiAddress ?? ""}
              placeholder="0x... (64-character hexadecimal address)"
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Supplier&apos;s Sui Testnet payment address for on-chain purchase payments (0x followed by 64 hexadecimal characters).
            </p>
          </div>

          <div>
            <label htmlFor="supplier-status" className="text-xs font-semibold">
              Supplier status
            </label>
            <select
              id="supplier-status"
              name="status"
              defaultValue={editingSupplier?.status ?? "Active"}
              className={inputClass}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
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
              {editingId ? "Save changes" : "Register supplier"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5">
        <label htmlFor="supplier-search" className="text-xs font-semibold">
          Search suppliers
        </label>
        <input
          id="supplier-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, contact, email or category..."
          className={inputClass}
        />
      </div>

      <div className="mt-5 space-y-3">
        {filteredSuppliers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center dark:border-slate-700">
            <p className="text-sm font-semibold">
              {suppliers.length === 0
                ? "No suppliers registered yet"
                : "No matching suppliers"}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {suppliers.length === 0
                ? "Register your first supplier to build your directory."
                : "Try a different search term."}
            </p>
          </div>
        ) : (
          filteredSuppliers.map((supplier) => (
            <article
              key={supplier.id}
              className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">{supplier.name}</h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {supplier.category} · {supplier.contactPerson}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    supplier.status === "Active"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {supplier.status}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <p>{supplier.email}</p>
                <p>{supplier.phone}</p>
                {supplier.address && <p>{supplier.address}</p>}
                {supplier.suiAddress && (
                  <p className="break-all font-mono text-slate-700 dark:text-slate-300">
                    <span className="font-sans font-medium text-slate-500 dark:text-slate-400">
                      Sui address:{" "}
                    </span>
                    {supplier.suiAddress}
                  </p>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => editSupplier(supplier)}
                  className={getBtnClass("outline", "xs")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteSupplier(supplier.id)}
                  className={getBtnClass("destructive", "xs")}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-slate-400">
        Supplier records are currently saved in this browser only. They are not
        yet verified or stored on Sui.
      </p>
    </div>
  );
}
