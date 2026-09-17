import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthGate } from "@/features/auth/auth-provider";
import { BRAND } from "@/lib/pwa/brand";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "DayFlow",
  description: "목표를 향해, 다시 시작하는 하루.",
  applicationName: "DayFlow",
  // iPhone "홈 화면에 추가": full-screen app with the name DayFlow. "default" keeps dark status bar text on the light
  // DayFlow background (black-translucent would put white text over it).
  appleWebApp: {
    capable: true,
    title: "DayFlow",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // Next emits only mobile-web-app-capable for appleWebApp.capable; older iOS versions read the apple- name.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Content may use the full screen; the bottom navigation and modals keep clear of the Home Indicator with
  // env(safe-area-inset-*) in globals.css.
  viewportFit: "cover",
  themeColor: BRAND.background,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <AuthGate>{children}</AuthGate>
        </Providers>
      </body>
    </html>
  );
}
