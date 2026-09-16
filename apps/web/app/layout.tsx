import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthGate } from "@/features/auth/auth-provider";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "DayFlow",
  description: "목표를 향해, 다시 시작하는 하루.",
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
