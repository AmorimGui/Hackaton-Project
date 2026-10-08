"use client";

import { useIdioma } from "@/i18n/idioma";
import type { Janela } from "@/lib/tipos";

export function SeloTipo({ tipo }: { tipo: "eolica" | "solar" }) {
  const { t } = useIdioma();
  const estilo = tipo === "eolica" ? "bg-wind-soft text-wind" : "bg-sun-soft text-sun";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${estilo}`}>{tipo === "eolica" ? t.common.wind : t.common.solar}</span>;
}

export function SeloResultado({ resultado }: { resultado: Janela["resultado_ons"] }) {
  const { t } = useIdioma();
  const mapa = {
    confirmado: ["bg-ok-soft text-ok", t.common.confirmed],
    errado: ["bg-cut-soft text-cut", t.common.wrong],
    aguardando_ons: ["bg-wait-soft text-wait", t.common.pending],
    sem_dado: ["bg-line text-muted", t.common.noData],
  } as const;
  const [estilo, rotulo] = mapa[resultado];
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${estilo}`}>{rotulo}</span>;
}

export function BarraChance({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-line sm:w-16" aria-hidden>
        <div className="h-full rounded-full bg-cut" style={{ width: `${Math.round(valor * 100)}%` }} />
      </div>
      <span className="tabular text-sm">{Math.round(valor * 100)}%</span>
    </div>
  );
}

export function Cartao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card p-5 ${className}`}>{children}</section>;
}

export function Numero({ valor, rotulo, destaque = false }: { valor: string; rotulo: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className={`tabular text-2xl font-semibold tracking-tight sm:text-3xl ${destaque ? "text-cut" : ""}`}>{valor}</div>
      <div className="mt-1 text-sm leading-snug text-muted">{rotulo}</div>
    </div>
  );
}
