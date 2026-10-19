import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorker } from "@/components/shell/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Quest Meals", template: "%s · Quest Meals" },
  description: "Meal-prep plans with macros set by our nutritionist. Addis Ababa.",
  applicationName: "Quest Meals",
  appleWebApp: { capable: true, title: "Quest Meals", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster richColors position="top-center" />
        <ServiceWorker />
      </body>
    </html>
  );
}
