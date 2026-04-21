import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { BetaIdentitySwitcher } from "@/components/demo/beta-identity-switcher";
import { DemoPanel } from "@/components/demo/demo-panel";
import {
  DEMO_EMAIL_P1,
  DEMO_EMAIL_P2,
  DEMO_USERS,
  ensureBetaSeed,
  ensureDemoSeed,
  getDemoActiveEmail,
  isBetaMode,
  isDemoMode,
  readDemoState,
  type DemoMatchState,
} from "@/lib/demo";
import type { DemoScenario } from "@/lib/demo-fixtures";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IPL Draft",
  description: "A private 2-player IPL draft game.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IPL Draft",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let demoProps: {
    activeEmail: string;
    otherEmail: string;
    otherName: string;
    matchState: DemoMatchState;
    scenario: DemoScenario;
  } | null = null;
  let betaProps: {
    activeName: string;
    otherEmail: string;
    otherName: string;
  } | null = null;

  if (isDemoMode()) {
    // Bootstrap the demo users + match on every render so a fresh DB or
    // a reset is recovered transparently.
    await ensureDemoSeed().catch((err) => {
      console.error("[demo seed on layout] failed", err);
    });
    const activeEmail = await getDemoActiveEmail();
    const other =
      DEMO_USERS.find((u) => u.email !== activeEmail) ?? DEMO_USERS[1];
    const state = await readDemoState().catch(() => null);
    demoProps = {
      activeEmail,
      otherEmail:
        activeEmail === DEMO_EMAIL_P1 ? DEMO_EMAIL_P2 : DEMO_EMAIL_P1,
      otherName: other.display_name,
      matchState: state?.match_state ?? "not-started",
      scenario: state?.scenario ?? "normal",
    };
  } else if (isBetaMode()) {
    // Beta mode: only bootstrap the two fake users so the cookie picker has
    // something to resolve to. Everything else (fixtures, squads, scoring)
    // goes through the real CricAPI path.
    await ensureBetaSeed().catch((err) => {
      console.error("[beta seed on layout] failed", err);
    });
    const activeEmail = await getDemoActiveEmail();
    const active = DEMO_USERS.find((u) => u.email === activeEmail) ?? DEMO_USERS[0];
    const other = DEMO_USERS.find((u) => u.email !== activeEmail) ?? DEMO_USERS[1];
    betaProps = {
      activeName: active.display_name,
      otherEmail:
        activeEmail === DEMO_EMAIL_P1 ? DEMO_EMAIL_P2 : DEMO_EMAIL_P1,
      otherName: other.display_name,
    };
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        {demoProps ? <DemoPanel {...demoProps} /> : null}
        {betaProps ? <BetaIdentitySwitcher {...betaProps} /> : null}
      </body>
    </html>
  );
}
