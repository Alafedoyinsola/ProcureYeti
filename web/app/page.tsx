import { WalletConnect } from "./WalletConnect";
import { ThemeToggle } from "./ThemeToggle";
import { ProcurementWorkspace } from "./ProcurementWorkspace";
import { SupplierWorkspace } from "./SupplierWorkspace";
import { QuotationWorkspace } from "./QuotationWorkspace";
import { ApprovalWorkspace } from "./ApprovalWorkspace";
import { PolicyWorkspace } from "./PolicyWorkspace";

const navigation = [
  { label: "Overview", href: "#overview", icon: "?" },
  { label: "Procurement", href: "#procurement", icon: "?" },
  { label: "Quotations", href: "#quotations", icon: "?" },
  { label: "Suppliers", href: "#suppliers", icon: "?" },
  { label: "Approvals", href: "#approvals", icon: "?" },
  { label: "Policies", href: "#policies", icon: "?" },
  { label: "Blockchain activity", href: "#activity", icon: "?" },
];

const metrics = [
  { label: "Total procurement", value: "0", detail: "No purchases recorded", icon: "?" },
  { label: "Pending approvals", value: "0", detail: "Nothing awaiting review", icon: "?" },
  { label: "Suppliers compared", value: "0", detail: "No quotations analysed", icon: "?" },
  { label: "Policy violations", value: "0", detail: "No violations recorded", icon: "?" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-900 dark:bg-[#0b1020] dark:text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-5 py-7 dark:border-slate-800 dark:bg-[#101729] lg:flex lg:flex-col">
          <a href="#overview" className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-600/20">
              Y
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">ProcureYeti</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Intelligent procurement</p>
            </div>
          </a>

          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </p>

          <nav className="space-y-1">
            {navigation.map((item, index) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  index === 0
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <span className="w-5 text-center text-base">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              Purchasing, under control.
            </p>
            <p className="mt-2 text-xs leading-5 text-indigo-800/75 dark:text-indigo-200/70">
              AI recommends. Owners authorize. Sui enforces.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-indigo-700 dark:bg-slate-900 dark:text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Sui Testnet
            </div>
          </div>
        </aside>

        <main id="overview" className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#101729]/90 sm:px-8">
            <div>
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">Y</div>
                <span className="font-bold">ProcureYeti</span>
              </div>
              <p className="hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:block">
                WORKSPACE / OVERVIEW
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                Procurement overview
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 sm:inline-flex">
                Testnet environment
              </span>
              <ThemeToggle />
              <WalletConnect />
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-8 p-5 sm:p-8">
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
                  <a href="#procurement" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-50">
                    Explore procurement <span aria-hidden="true">?</span>
                  </a>
                  <span className="text-xs text-indigo-100">AI-assisted. Owner-controlled.</span>
                </div>
              </div>
            </section>

            <section aria-label="Procurement metrics">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Workspace summary</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your procurement activity at a glance</p>
                </div>
                <span className="text-xs text-slate-400">Current workspace</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-[#101729]">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{metric.label}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-lg text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">{metric.icon}</span>
                    </div>
                    <p className="mt-5 text-3xl font-bold tracking-tight">{metric.value}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metric.detail}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <article id="procurement" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#101729] xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold">Recent procurement</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Purchase requests and quotation reviews</p>
                  </div>

                </div>
                <ProcurementWorkspace />
              </article>

              <article id="approvals" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#101729]">
                <h2 className="font-bold">Approval centre</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Owner authorization queue</p>
                <ApprovalWorkspace />
                <div className="mt-5 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Approval authority</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-300">Business owner</span>
                </div>
              </article>
            </section>

            <section className="grid gap-5 md:grid-cols-2">
              <article id="quotations" className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#101729]">
                <h2 className="font-bold">Quotation intelligence</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  AI will extract prices, quantities, delivery terms and other details to help compare supplier offers.
                </p>
                <p className="mt-4 text-xs font-semibold text-indigo-600 dark:text-indigo-300">AI recommendations require human review.</p>
                <QuotationWorkspace />
              </article>
              <article id="suppliers" className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#101729]">
                <h2 className="font-bold">Supplier management</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Keep supplier records, compare offers and apply business purchasing rules before authorizing a purchase.
                </p>
                <p className="mt-4 text-xs font-semibold text-indigo-600 dark:text-indigo-300">Supplier eligibility is policy-controlled.</p>
                <SupplierWorkspace />
              </article>
            </section>

            <section id="policies" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#101729]">
              <h2 className="font-bold">Policy &amp; Spending Controls</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Configure business spending limits, owner approval thresholds and permitted purchasing categories.
              </p>
              <PolicyWorkspace />
            </section>

            <footer id="activity" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <p>ProcureYeti · AI recommends. Owners authorize. Sui enforces.</p>
              <p>Connected network: Sui Testnet</p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
