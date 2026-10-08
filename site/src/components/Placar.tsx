"use client";

import Link from "next/link";
import { useIdioma } from "@/i18n/idioma";
import type { Atlas, Usina } from "@/lib/tipos";
import { num, pct } from "@/lib/formato";
import { Cartao, SeloTipo } from "./Selos";
import { GraficoCalibracao } from "./Graficos";

export type DadosPlacar = {
  teste: Atlas["teste"];
  manchete: Atlas["manchete"];
  impressoes: string[];
  usinas: Pick<Usina, "id" | "nome" | "uf" | "tipo" | "teste" | "placar">[];
};

const ORDEM = ["taxa_media", "regra_fixa_8h_15h", "mesmo_mes_2025", "perfil_8_semanas", "combinado", "continuo_com_atraso"];

export function Placar({ d }: { d: DadosPlacar }) {
  const { t } = useIdioma();
  const L = t.locale;
  // uma casa decimal: evita que 89,5% vire "90%" aqui e "89%" em outro lugar
  const tripla = (m: { precisao: number; cobertura: number; energia_capturada: number }) =>
    `${pct(m.precisao, L, 1)} · ${pct(m.cobertura, L, 1)} · ${pct(m.energia_capturada, L, 1)}`;

  return (
    <div className="space-y-8 pt-8">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">{t.track.title}</h1>
        <p className="mt-3 text-lg text-muted">{t.track.lead(num(d.manchete.usinas_avaliadas, L))}</p>
        <p className="mt-4 text-2xl font-semibold leading-snug">
          {t.track.headline(pct(d.manchete.energia_capturada_ago, L), pct(d.manchete.energia_capturada_set, L))}
        </p>
        <p className="mt-2 text-muted">{t.home.trackCtaLead(num(d.teste.placar.confirmadas, L), num(d.teste.placar.total, L))}</p>
      </header>

      <Cartao className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-lg font-semibold">{t.track.tableTitle}</h2>
        <p className="px-5 text-sm text-muted">
          {t.plant.precision} · {t.plant.coverage} · {t.plant.energyCaptured}
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2 font-medium">{t.track.model}</th>
              <th className="px-2 py-2 font-medium">{t.plant.months[7]} 2026</th>
              <th className="px-2 py-2 font-medium">{t.plant.months[8]} 2026</th>
              <th className="px-5 py-2 text-right font-medium">{t.track.skill}</th>
            </tr>
          </thead>
          <tbody>
            {ORDEM.map((m) => {
              const prod = m === "continuo_com_atraso";
              const a = d.teste.agosto[m], s = d.teste.setembro[m];
              return (
                <tr key={m} className={`border-b border-line/70 last:border-0 ${prod ? "bg-wind-soft/50 font-semibold" : ""}`}>
                  <td className="px-5 py-2.5">{t.track.models[m]}</td>
                  <td className="tabular whitespace-nowrap px-2 py-2.5">{tripla(a)}</td>
                  <td className="tabular whitespace-nowrap px-2 py-2.5">{tripla(s)}</td>
                  <td className="tabular whitespace-nowrap px-5 py-2.5 text-right">
                    {m === "taxa_media" ? "—" : `${pct(a.ganho_sobre_taxa_media, L)} / ${pct(s.ganho_sobre_taxa_media, L)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <dl className="grid gap-x-6 gap-y-1 border-t border-line px-5 py-4 text-xs text-muted sm:grid-cols-2">
          {t.track.defs.map(([termo, def]) => (
            <div key={termo}>
              <dt className="inline font-semibold text-ink">{termo}:</dt> <dd className="inline">{def}</dd>
            </div>
          ))}
        </dl>
      </Cartao>

      <div className="rounded-xl border-l-4 border-sun bg-sun-soft/60 p-5">
        <h2 className="font-semibold">{t.track.honestTitle}</h2>
        <p className="mt-1 text-sm leading-relaxed">{t.track.honest}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <h2 className="text-lg font-semibold">{t.track.calibTitle}</h2>
          <div className="mt-3 flex justify-center">
            <GraficoCalibracao faixas={d.teste.calibracao_agosto} />
          </div>
          <p className="mt-2 text-sm text-muted">{t.track.calibNote}</p>
        </Cartao>
        <Cartao>
          <h2 className="text-lg font-semibold">{t.track.byType}</h2>
          <dl className="mt-4 space-y-3">
            {Object.entries(d.teste.por_tipo_agosto).map(([tipo, m]) => (
              <div key={tipo} className="flex items-center justify-between gap-3">
                <dt>
                  <SeloTipo tipo={tipo as "eolica" | "solar"} />
                </dt>
                <dd className="tabular text-sm">{tripla(m)}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-6 text-sm font-semibold">{t.home.featured}</h3>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {d.usinas.map((u) => (
                <tr key={u.id} className="border-b border-line/70 last:border-0">
                  <td className="py-1.5">
                    <Link href={`/plants/${u.id}`} className="hover:underline">
                      {u.nome.replace(/^Conj\. /, "")}
                    </Link>{" "}
                    <span className="text-xs text-muted">{u.uf}</span>
                  </td>
                  <td className="tabular py-1.5 text-right text-muted">
                    {num(u.placar.confirmadas, L)}/{num(u.placar.janelas, L)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      </div>

      <Cartao>
        <h2 className="text-lg font-semibold">{t.track.reproTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.track.reproLead}</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-4 text-[11px] leading-relaxed text-white/85">{d.impressoes.join("\n")}</pre>
        <p className="mt-3 text-sm italic">“{t.track.reproQuote}”</p>
        <h3 className="mt-5 text-sm font-semibold">{t.track.params}</h3>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-paper p-3 text-xs">{JSON.stringify(d.teste.parametros, null, 1)}</pre>
      </Cartao>
    </div>
  );
}
