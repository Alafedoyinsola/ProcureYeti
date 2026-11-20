"use client";

import { useEffect, useState } from "react";
import { WalletConnect } from "./WalletConnect";
import { ThemeToggle } from "./ThemeToggle";
import { ProcurementWorkspace } from "./ProcurementWorkspace";
import { SupplierWorkspace } from "./SupplierWorkspace";
import { QuotationWorkspace } from "./QuotationWorkspace";
import { ApprovalWorkspace } from "./ApprovalWorkspace";
import { PolicyWorkspace } from "./PolicyWorkspace";
import {
  ShoppingCartIcon,
  ClockIcon,
  UsersIcon,
  ShieldCheckIcon,
  LayoutDashboardIcon,
  ShoppingBagIcon,
  FileTextIcon,
  Building2Icon,
  CheckCircle2Icon,
  ShieldIcon,
  ActivityIcon,
  ArrowRightIcon,
  MenuIcon,
  XIcon,
} from "./icons";

const navigation = [
  { label: "Overview", href: "#overview", icon: LayoutDashboardIcon },
  { label: "Procurement", href: "#procurement", icon: ShoppingBagIcon },
  { label: "Quotations", href: "#quotations", icon: FileTextIcon },
  { label: "Suppliers", href: "#suppliers", icon: Building2Icon },
  { label: "Approvals", href: "#approvals", icon: CheckCircle2Icon },
  { label: "Policies", href: "#policies", icon: ShieldIcon },
  { label: "Blockchain activity", href: "#activity", icon: ActivityIcon },
];

export default function Home() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  // Summary card metrics with live fallback to existing default text
  const [metrics, setMetrics] = useState([
    {
      label: "Total procurement",
      value: "0",
      detail: "No purchases recorded",
      icon: ShoppingCartIcon,
      iconColor:
        "bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400",
      tooltip:
        "Total cumulative volume and count of recorded purchase requests across all procurement categories.",
    },
    {
      label: "Pending approvals",
      value: "0",
      detail: "Nothing awaiting review",
      icon: ClockIcon,
      iconColor:
        "bg-amber-50 border border-amber-100 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400",
      tooltip:
        "Purchase requests awaiting owner authorization or agent-signed smart-contract payment execution.",
    },
    {
      label: "Suppliers compared",
      value: "0",
      detail: "No quotations analysed",
      icon: UsersIcon,
      iconColor:
        "bg-blue-50 border border-blue-100 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400",
      tooltip:
        "Active suppliers registered and evaluated across item quotations and pricing proposals.",
    },
    {
      label: "Policy violations",
      value: "0",
      detail: "No violations recorded",
      icon: ShieldCheckIcon,
      iconColor:
        "bg-emerald-50 border border-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400",
      tooltip:
        "Purchases checked against category budget limits, allowance caps, and policy compliance rules.",
    },
  ]);

  // Compute live metrics if localStorage records exist, preserving default format
  useEffect(() => {
    try {
      const rawRequests = localStorage.getItem("procureyeti-requests");
      const rawApprovals = localStorage.getItem("procureyeti-approvals");
      const rawSuppliers = localStorage.getItem("procureyeti-suppliers");

      const requests = rawRequests ? JSON.parse(rawRequests) : [];
      const approvals = rawApprovals ? JSON.parse(rawApprovals) : [];
      const suppliers = rawSuppliers ? JSON.parse(rawSuppliers) : [];

      const totalCount = Array.isArray(requests) ? requests.length : 0;
      const approvedIds = new Set(
        Array.isArray(approvals) ? approvals.map((a: { requestId: string }) => a.requestId) : []
      );
      const pendingCount = Array.isArray(requests)
        ? requests.filter((r: { id: string; policyStatus?: string }) => !approvedIds.has(r.id)).length
        : 0;
      const supplierCount = Array.isArray(suppliers) ? suppliers.length : 0;
      const violationCount = Array.isArray(requests)
        ? requests.filter((r: { policyStatus?: string }) => r.policyStatus === "Blocked").length
        : 0;

      // Hydrate metrics from client localStorage on initial mount (SSR cannot access localStorage)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMetrics([
        {
          label: "Total procurement",
          value: String(totalCount),
          detail:
            totalCount === 0
              ? "No purchases recorded"
              : totalCount === 1
              ? "1 purchase request recorded"
              : `${totalCount} purchase requests recorded`,
          icon: ShoppingCartIcon,
          iconColor:
            "bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400",
          tooltip:
            "Total cumulative volume and count of recorded purchase requests across all procurement categories.",
        },
        {
          label: "Pending approvals",
          value: String(pendingCount),
          detail:
            pendingCount === 0
              ? "Nothing awaiting review"
              : pendingCount === 1
              ? "1 request awaiting review"
              : `${pendingCount} requests awaiting review`,
          icon: ClockIcon,
          iconColor:
            "bg-amber-50 border border-amber-100 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400",
          tooltip:
            "Purchase requests awaiting owner authorization or agent-signed smart-contract payment execution.",
        },
        {
          label: "Suppliers compared",
          value: String(supplierCount),
          detail:
            supplierCount === 0
              ? "No quotations analysed"
              : supplierCount === 1
              ? "1 supplier registered"
              : `${supplierCount} suppliers compared`,
          icon: UsersIcon,
          iconColor:
            "bg-blue-50 border border-blue-100 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400",
          tooltip:
            "Active suppliers registered and evaluated across item quotations and pricing proposals.",
        },
        {
          label: "Policy violations",
          value: String(violationCount),
          detail:
            violationCount === 0
              ? "No violations recorded"
              : violationCount === 1
              ? "1 policy violation flagged"
              : `${violationCount} policy violations flagged`,
          icon: ShieldCheckIcon,
          iconColor:
            violationCount > 0
              ? "bg-rose-50 border border-rose-100 text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400"
              : "bg-emerald-50 border border-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400",
          tooltip:
            "Purchases checked against category budget limits, allowance caps, and policy compliance rules.",
        },
      ]);
    } catch {
      // Fallback to initial values if storage is inaccessible
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-900 dark:bg-[#0b1020] dark:text-slate-100 lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-screen lg:h-screen">
        {/* Left Stationary Sidebar (Desktop) */}
        <aside
          aria-label="Sidebar navigation"
          className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-5 py-7 dark:border-slate-800 dark:bg-[#101729] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto z-30 select-none shadow-xs"
        >
          <a
            href="#overview"
            onClick={() => setActiveSection("overview")}
            className="mb-8 flex items-center gap-3 group transition"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-xl font-bold text-white shadow-md shadow-indigo-600/25 transition-transform group-hover:scale-105">
              Y
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                ProcureYeti
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Intelligent procurement
              </p>
            </div>
          </a>

          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </p>

          <nav className="space-y-1.5 flex-1" aria-label="Main Navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.href.slice(1);
              return (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setActiveSection(item.href.slice(1))}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 font-semibold shadow-2xs dark:bg-indigo-500/15 dark:text-indigo-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white"
                  }`}
                >
                  <Icon
                    size={18}
                    className={
                      isActive
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-slate-400 dark:text-slate-500"
                    }
                  />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/40 p-4 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-indigo-500/5">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              Purchasing, under control.
            </p>
            <p className="mt-1.5 text-xs leading-5 text-indigo-800/75 dark:text-indigo-200/70">
              AI recommends. Owners authorize. Sui enforces.
            </p>
            <div className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-white px-3 py-1 text-[10px] font-semibold text-indigo-700 shadow-2xs dark:border-indigo-500/30 dark:bg-slate-900 dark:text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sui Testnet
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer Backdrop & Modal */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-72 bg-white p-6 shadow-2xl dark:bg-[#101729] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm">
                    Y
                  </div>
                  <div>
                    <p className="font-bold text-base leading-tight">ProcureYeti</p>
                    <p className="text-xs text-slate-500">Navigation</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <nav className="space-y-1.5 flex-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.href.slice(1);
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={() => {
                        setActiveSection(item.href.slice(1));
                        setMobileNavOpen(false);
                      }}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      <Icon size={18} className={isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Sui Testnet Active
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Independently Scrollable Main Viewport */}
        <main
          id="overview"
          tabIndex={-1}
          className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto scroll-smooth outline-none"
        >
          {/* Top Sticky Header */}
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/90 bg-white/90 px-5 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#101729]/90 sm:px-8 shadow-2xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 lg:hidden"
              >
                <MenuIcon size={20} />
              </button>

              <div>
                <div className="flex items-center gap-2 lg:hidden">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                    Y
                  </div>
                  <span className="font-bold text-base">ProcureYeti</span>
                </div>
                <p className="hidden text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:block">
                  WORKSPACE / OVERVIEW
                </p>
                <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                  Procurement overview
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 sm:inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Testnet environment
              </span>
              <ThemeToggle />
              <WalletConnect />
            </div>
          </header>

          {/* Main Dashboard Content */}
          <div className="mx-auto max-w-[1500px] space-y-8 p-5 sm:p-8">
            {/* Hero Banner */}
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-6 text-white shadow-xl shadow-indigo-900/10 sm:p-9">
              <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[35px] border-white/5" />
              <div className="pointer-events-none absolute -bottom-32 right-1/4 h-64 w-64 rounded-full border-[30px] border-white/5" />
              <div className="relative max-w-2xl">
                <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-indigo-100">
                  YOUR PROCUREMENT COMMAND CENTRE
                </span>
                <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                  Make every purchase a smarter decision.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100 sm:text-base">
                  Compare supplier quotations, identify purchasing risks and enforce spending rules with transparent on-chain controls.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <a
                    href="#procurement"
                    onClick={() => setActiveSection("procurement")}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-md shadow-indigo-950/20 transition-all duration-150 hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Explore procurement <ArrowRightIcon size={16} />
                  </a>
                  <span className="text-xs text-indigo-100">AI-assisted. Owner-controlled.</span>
                </div>
              </div>
            </section>

            {/* Workspace Summary Cards with Lucide Icons */}
            <section aria-label="Procurement metrics">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Workspace summary</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your procurement activity at a glance</p>
                </div>
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Current workspace</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <article
                      key={metric.label}
                      className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-[#101729]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                          {metric.label}
                        </span>
                        <div
                          title={metric.tooltip}
                          aria-label={metric.tooltip}
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-2xs transition-transform duration-150 group-hover:scale-105 ${metric.iconColor}`}
                        >
                          <Icon size={20} />
                          <span className="sr-only">{metric.tooltip}</span>
                        </div>
                      </div>
                      <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {metric.value}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {metric.detail}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Procurement & Approvals Grid */}
            <section className="grid gap-5 xl:grid-cols-3">
              <article
                id="procurement"
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#101729] xl:col-span-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">Recent procurement</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Purchase requests and quotation reviews</p>
                  </div>
                </div>
                <ProcurementWorkspace />
              </article>

              <article
                id="approvals"
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#101729]"
              >
                <h2 className="font-bold text-slate-900 dark:text-white">Approval centre</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Owner authorization queue</p>
                <ApprovalWorkspace />
                <div className="mt-5 flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
                  <span className="text-slate-500 dark:text-slate-400">Approval authority</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">Business owner</span>
                </div>
              </article>
            </section>

            {/* Quotations & Suppliers Grid */}
            <section className="grid gap-5 md:grid-cols-2">
              <article
                id="quotations"
                className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#101729] shadow-sm"
              >
                <h2 className="font-bold text-slate-900 dark:text-white">Quotation intelligence</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  AI will extract prices, quantities, delivery terms and other details to help compare supplier offers.
                </p>
                <p className="mt-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  AI recommendations require human review.
                </p>
                <QuotationWorkspace />
              </article>

              <article
                id="suppliers"
                className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#101729] shadow-sm"
              >
                <h2 className="font-bold text-slate-900 dark:text-white">Supplier management</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Keep supplier records, compare offers and apply business purchasing rules before authorizing a purchase.
                </p>
                <p className="mt-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Supplier eligibility is policy-controlled.
                </p>
                <SupplierWorkspace />
              </article>
            </section>

            {/* Policies Section */}
            <section
              id="policies"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#101729]"
            >
              <h2 className="font-bold text-slate-900 dark:text-white">Policy &amp; Spending Controls</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Configure business spending limits, owner approval thresholds and permitted purchasing categories.
              </p>
              <PolicyWorkspace />
            </section>

            {/* Activity Footer */}
            <footer
              id="activity"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
            >
              <p>ProcureYeti · AI recommends. Owners authorize. Sui enforces.</p>
              <p>Connected network: Sui Testnet</p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
