"use client";

import type { ReactNode } from "react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { dAppKit } from "./dapp-kit";

type DAppKitClientProviderProps = {
  children: ReactNode;
};

export function DAppKitClientProvider({
  children,
}: DAppKitClientProviderProps) {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      {children}
    </DAppKitProvider>
  );
}
