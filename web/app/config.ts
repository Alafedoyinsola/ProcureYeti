/**
 * ProcureYeti On-Chain Configuration
 */

// Pinned Sui network environment
export const SUI_NETWORK = "testnet" as const;

// Pinned Sui framework Clock shared object ID
export const SUI_CLOCK_OBJECT_ID = "0x6" as const;

// ProcureYeti package ID configured via environment variable with fallback to deployed testnet package ID
export const PROCUREYETI_PACKAGE_ID =
  process.env.NEXT_PUBLIC_PROCUREYETI_PACKAGE_ID ||
  "0xc12fc458dbbead5fcc92254a7a36f7c931eeec15298b82dadef15a2639390e0a";
