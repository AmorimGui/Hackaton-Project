import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { ProvedorIdioma } from "@/i18n/idioma";
import { Cabecalho } from "@/components/Cabecalho";
import { Rodape } from "@/components/Rodape";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vento Cortado — Brazil's curtailed-energy atlas",
  description:
    "Open forecasts of when Brazil's Northeast wind and solar plants will be curtailed, built from official ONS data, with a public track record.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ProvedorIdioma>
          <Cabecalho />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
          <Rodape />
        </ProvedorIdioma>
      </body>
    </html>
  );
}
