export type CurrencyPolicy = {
  maxRequestAmount: number | null;
  approvalThreshold: number | null;
};

export type ProcurementPolicy = {
  NGN: CurrencyPolicy;
  USD: CurrencyPolicy;
  allowedCategories: string[];
};


export const PROCUREMENT_CATEGORIES = [
  "Technology",
  "Office supplies",
  "Equipment",
  "Raw materials",
  "Services",
  "Other",
];

export const DEFAULT_POLICY: ProcurementPolicy = {
  NGN: { maxRequestAmount: null, approvalThreshold: null },
  USD: { maxRequestAmount: null, approvalThreshold: null },
  allowedCategories: [...PROCUREMENT_CATEGORIES],
};
export type PolicyStatus = "Allowed" | "Requires approval" | "Blocked";

export type PolicyEvaluation = {
  status: PolicyStatus;
  reason: string;
};

export function evaluateProcurementPolicy(
  policy: ProcurementPolicy,
  category: string,
  amount: number,
  currency: "NGN" | "USD" | "SUI"
): PolicyEvaluation {
  if (currency === "SUI") {
    return {
      status: "Requires approval",
      reason:
        "SUI purchases require owner approval and on-chain enforcement by the deployed ProcurementPolicy.",
    };
  }

  if (!policy.allowedCategories.includes(category)) {
    return {
      status: "Blocked",
      reason: `${category} is not an allowed purchasing category.`,
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      status: "Blocked",
      reason: "The request amount must be greater than zero.",
    };
  }

  const currencyPolicy = policy[currency];
  const maximum = currencyPolicy.maxRequestAmount;
  const threshold = currencyPolicy.approvalThreshold;

  if (maximum === null && threshold === null) {
    return {
      status: "Requires approval",
      reason: `${currency} spending limits are not configured. Owner review is required.`,
    };
  }

  if (maximum !== null && amount > maximum) {
    return {
      status: "Blocked",
      reason: `The request exceeds the ${currency} maximum spending limit.`,
    };
  }

  if (threshold !== null && amount > threshold) {
    return {
      status: "Requires approval",
      reason: `The request exceeds the ${currency} owner approval threshold.`,
    };
  }

  return {
    status: "Allowed",
    reason: "The request is within the configured procurement policy.",
  };
}
