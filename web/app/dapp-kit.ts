import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  SUI_NETWORK,
  SUI_CLOCK_OBJECT_ID,
  PROCUREYETI_PACKAGE_ID,
} from "./config";

export { SUI_NETWORK, SUI_CLOCK_OBJECT_ID, PROCUREYETI_PACKAGE_ID };

const GRPC_URLS = {
  testnet: "https://fullnode.testnet.sui.io:443",
} as const;

export const dAppKit = createDAppKit({
  networks: [SUI_NETWORK],
  defaultNetwork: SUI_NETWORK,
  autoConnect: false,
  createClient: (network) =>
    new SuiGrpcClient({
      network,
      baseUrl: GRPC_URLS[network],
    }),
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
