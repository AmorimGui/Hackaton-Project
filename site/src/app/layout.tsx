import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { ProvedorIdioma } from "@/i18n/idioma";
import { Cabecalho } from "@/components/Cabecalho";
import { Rodape } from "@/components/Rodape";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Fonte do logotipo "noMos" (geométrica, como a da logo do time)
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400"] }); // traço igual ao da logo (medido)

export const metadata: Metadata = {
  title: "Nomos — Brazil's curtailed-energy atlas",
  description:
    "An open atlas of the wind and solar power Brazil's grid throws away: where, why, what it is worth and when it will happen next, with a public forecast track record and hourly receipts on Solana.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}>
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
