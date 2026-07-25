import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FooterGate } from "@/components/FooterGate";
import { ThemeProvider } from "@/components/theme-provider";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { ProductTour } from "@/components/ProductTour";
import { SkinProvider } from "@/components/SkinProvider";
import { SkinPreviewBanner } from "@/components/SkinPreviewBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DWCode",
  description: "LeetCode for DataWeave. Practice DataWeave coding questions, challenges, transformations, arrays, objects, functions, MuleSoft interview preparation and more.",
  keywords: [
    "dwcode",
    "dwlcode",
    "dataweave coding platform",
    "dataweave practice questions",
    "dataweave leetcode",
    "mulesoft coding challenges",
    "dataweave playground",
    "dataweave interview questions"
  ]
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <SkinProvider>
              <Navbar />
              <SkinPreviewBanner />
              <MaintenanceBanner />
              <ProductTour />
              <main className="flex-1 flex flex-col">{children}</main>
              <FooterGate>
                <Footer />
              </FooterGate>
            </SkinProvider>
          </ThemeProvider>
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
