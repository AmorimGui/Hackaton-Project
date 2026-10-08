"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdioma } from "@/i18n/idioma";

export function Cabecalho() {
  const { t, idioma, trocar } = useIdioma();
  const rota = usePathname();
  const links = [
    { href: "/", rotulo: t.nav.atlas, ativo: rota === "/" || rota.startsWith("/plants") },
    { href: "/track-record", rotulo: t.nav.track, ativo: rota.startsWith("/track-record") },
    { href: "/method", rotulo: t.nav.method, ativo: rota.startsWith("/method") },
    { href: "/verify", rotulo: t.verify.nav, ativo: rota.startsWith("/verify") },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      {/* No celular, o menu desce para uma segunda linha; a partir de "sm" fica tudo numa linha só */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link href="/" className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-lg font-semibold tracking-tight">Vento Cortado</span>
          <span className="hidden text-sm text-muted md:inline">{t.nav.tagline}</span>
        </Link>
        <nav className="order-last flex w-full items-center gap-1 text-sm sm:order-none sm:ml-auto sm:w-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-2.5 py-1.5 ${l.ativo ? "bg-ink text-white" : "text-muted hover:bg-line/60 hover:text-ink"}`}
            >
              {l.rotulo}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 overflow-hidden rounded-md border border-line text-xs font-medium sm:ml-0" role="group" aria-label="Language">
          {(["en", "pt"] as const).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => trocar(i)}
              aria-pressed={idioma === i}
              className={`px-2 py-1.5 uppercase ${idioma === i ? "bg-ink text-white" : "bg-card text-muted hover:text-ink"}`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
