"use client";

import dynamic from "next/dynamic";

const ConnectButton = dynamic(
  () =>
    import("@mysten/dapp-kit-react/ui").then(
      (mod) => mod.ConnectButton
    ),
  {
    ssr: false,
    loading: () => (
      <button disabled className="rounded-lg px-4 py-2">
        Loading wallet...
      </button>
    ),
  }
);

export function WalletConnect() {
  return <ConnectButton />;
}
