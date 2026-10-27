import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorker } from "@/components/shell/service-worker";
import "./globals.css";

// Self-hosted at build time by next/font (no runtime call to Google).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Quest Meals", template: "%s · Quest Meals" },
  description: "Meal-prep plans with macros set by our nutritionist. Addis Ababa.",
  applicationName: "Quest Meals",
  appleWebApp: { capable: true, title: "Quest Meals", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icons/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#11301A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Toaster richColors position="top-center" />
        <ServiceWorker />
      </body>
    </html>
  );
}
