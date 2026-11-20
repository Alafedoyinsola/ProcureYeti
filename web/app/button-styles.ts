/**
 * Unified ProcureYeti Button Design System
 * 
 * Provides polished, consistent styles adhering to the ProcureYeti purple/indigo
 * brand identity with accessible contrast in light and dark modes, clear focus rings,
 * active micro-interactions, subtle shadows, and distinct visual hierarchies.
 */

export const btnBase =
  "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 outline-none select-none cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none disabled:transform-none";

export const btnSizes = {
  xs: "px-2.5 py-1.5 text-xs gap-1.5",
  sm: "px-3.5 py-2 text-xs gap-1.5",
  md: "px-4 py-2.5 text-sm gap-2",
  lg: "px-5 py-3 text-sm gap-2.5",
};

export const btnVariants = {
  /**
   * Primary Brand Button (ProcureYeti purple/indigo gradient)
   */
  primary:
    "bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/25 hover:from-indigo-500 hover:to-violet-500 hover:shadow-md hover:shadow-indigo-600/30 hover:-translate-y-0.5",

  /**
   * Secondary Neutral Button (Polished card-like surface)
   */
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-slate-600 dark:hover:text-white",

  /**
   * Outline Brand Button (Subtle purple tint with border)
   */
  outline:
    "border border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100/80 hover:border-indigo-300 hover:text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 dark:hover:border-indigo-500/50",

  /**
   * Destructive Button (Clear warning red with soft tint)
   */
  destructive:
    "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 hover:text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50",

  /**
   * Success / Approval Button (Emerald gradient)
   */
  success:
    "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-500 hover:shadow-md hover:shadow-emerald-600/30 hover:-translate-y-0.5 focus-visible:ring-emerald-500",

  /**
   * Warning / Reconciliation Button (Amber gradient)
   */
  warning:
    "bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-sm shadow-amber-600/20 hover:from-amber-500 hover:to-amber-600 hover:shadow-md hover:shadow-amber-600/30 hover:-translate-y-0.5 focus-visible:ring-amber-500",

  /**
   * Ghost / Sub-action link button
   */
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
};

/**
 * Helper to build composite button classes
 */
export function getBtnClass(
  variant: keyof typeof btnVariants = "primary",
  size: keyof typeof btnSizes = "md",
  extraClass: string = ""
): string {
  return `${btnBase} ${btnSizes[size]} ${btnVariants[variant]} ${extraClass}`.trim();
}
