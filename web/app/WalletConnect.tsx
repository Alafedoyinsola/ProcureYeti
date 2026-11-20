"use client";

import dynamic from "next/dynamic";
import { getBtnClass } from "./button-styles";

const ConnectButton = dynamic(
  () =>
    import("@mysten/dapp-kit-react/ui").then(
      (mod) => mod.ConnectButton
    ),
  {
    ssr: false,
    loading: () => (
      <button disabled className={getBtnClass("secondary", "sm", "h-10 px-4 text-xs")}>
        Loading wallet...
      </button>
    ),
  }
);

export function WalletConnect() {
  return <ConnectButton />;
}
