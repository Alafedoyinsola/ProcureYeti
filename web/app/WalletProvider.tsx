"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

type ProviderProps = {
  children: ReactNode;
};

export function WalletProvider({ children }: ProviderProps) {
  const [Provider, setProvider] =
    useState<ComponentType<ProviderProps> | null>(null);

  useEffect(() => {
    let active = true;

    import("./DAppKitClientProvider")
      .then(({ DAppKitClientProvider }) => {
        if (active) {
          setProvider(() => DAppKitClientProvider);
        }
      })
      .catch((error) => {
        console.error("Failed to load Sui wallet provider:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!Provider) {
    return <>{children}</>;
  }

  return <Provider>{children}</Provider>;
}
