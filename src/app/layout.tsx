import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MiniPlayerProvider } from "@/components/player/MiniPlayerProvider";
import { SearchHotkey } from "@/components/SearchHotkey";
import { ThemeScript } from "@/components/ThemeScript";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Helix Library",
    template: "%s · Helix Library",
  },
  description:
    "Personal library catalog for files, knowledge, and this machine. Localhost only.",
  icons: {
    icon: [
      { url: "/helix-mark.png", type: "image/png", sizes: "128x128" },
      { url: "/helix-mark.webp", type: "image/webp", sizes: "128x128" },
    ],
    apple: [{ url: "/helix-mark.png", sizes: "128x128", type: "image/png" }],
    shortcut: "/helix-mark.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090c" },
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-dvh flex-col antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-[var(--radius-sm)] focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--accent-fg)] focus:shadow-[var(--shadow-lift)]"
        >
          Skip to content
        </a>
        <MiniPlayerProvider>
          <Header />
          <SearchHotkey />
          <main
            id="main-content"
            tabIndex={-1}
            className="shell-x flex-1 py-4 outline-none sm:py-6 lg:py-7"
          >
            {children}
          </main>
          <Footer />
        </MiniPlayerProvider>
      </body>
    </html>
  );
}
