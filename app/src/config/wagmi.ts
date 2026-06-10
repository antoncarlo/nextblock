"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia, sepolia, arcTestnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "NextBlock",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "nextblock-dev",
  chains: [baseSepolia, sepolia, arcTestnet],
  ssr: true,
});
