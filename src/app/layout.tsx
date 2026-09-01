// Root Layout — fonts, metadata, and global providers
import type { Metadata } from "next";
import { Space_Mono, Cormorant_Garamond, Lora } from "next/font/google";
import Web3Provider from "@/providers/Web3Provider";
import "./globals.css";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-space-mono",
});

const cormorant = Cormorant_Garamond({
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
});

const lora = Lora({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-lora",
});

export const metadata: Metadata = {
  title: "Prowl — AI Crypto Investigation Swarm",
  description: "Coordinated AI agents that trace stolen crypto on Base. Powered by Sibyl Memory.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceMono.variable} ${cormorant.variable} ${lora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
