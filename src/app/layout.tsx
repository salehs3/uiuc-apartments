import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "UIUC Apartments",
  description: "Find and review apartments near UIUC — real ratings from verified tenants.",
  openGraph: {
    title: "UIUC Apartments",
    description: "Find and review apartments near UIUC — real ratings from verified tenants.",
    url: "https://illinihousing.vercel.app",
    siteName: "UIUC Apartments",
    images: [
      {
        url: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
}};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );


}


