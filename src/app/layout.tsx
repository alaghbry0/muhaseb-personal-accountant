import type { Metadata, Viewport } from "next";
import { Tajawal, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// DS-12: خط الواجهة الأساسي — Tajawal
const tajawal = Tajawal({
  weight: ["400", "500", "700", "800"],
  subsets: ["arabic"],
  variable: "--font-tajawal",
  display: "swap",
});

// DS-13: خط الأرقام والمبالغ — IBM Plex Sans Arabic
const plexArabic = IBM_Plex_Sans_Arabic({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "المُحاسِب الشخصي — محاسبة ومخزون",
  description:
    "تطبيق محاسبة ومخزون شخصي عربي — فواتير مبيعات ومشتريات، خزينة، أقساط، موظفون وتقارير.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0F172A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body
        className={`${tajawal.variable} ${plexArabic.variable} antialiased bg-background text-foreground`}
      >
        {children}
        {/* تنبيهات موحدة أعلى الوسط RTL */}
        <Toaster
          position="top-center"
          dir="rtl"
          richColors
          closeButton
          toastOptions={{
            style: { fontFamily: "var(--font-tajawal)", direction: "rtl" },
          }}
        />
      </body>
    </html>
  );
}
