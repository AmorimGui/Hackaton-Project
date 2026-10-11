"use client";

import Link from "next/link";
import { useIdioma } from "@/i18n/idioma";
import type { Atlas, Usina } from "@/lib/tipos";
import { dataCurta, num, pct } from "@/lib/formato";
import { Cartao, SeloTipo } from "./Selos";
import { BarraRazoes, GraficoCalibracao, GraficoRazoesMes } from "./Graficos";

const DICIONARIO_ONS =
  "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/restricao_coff_eolica_tm/DicionarioDados_RestricaoContrainedoff_UsiEolicas.pdf";

export type DadosPlacar = {
  teste: Atlas["teste"];
  manchete: Atlas["manchete"];
  impressoes: string[];
  ao_vivo: Atlas["ao_vivo"];
  razoes: Atlas["razoes"];
  dados_ate: string;
  usinas: Pick<Usina, "id" | "nome" | "uf" | "tipo" | "teste" | "placar" | "placar_ao_vivo">[];
};

const ORDEM = ["taxa_media", "regra_fixa_8h_15h", "mesmo_mes_2025", "perfil_8_semanas", "combinado", "continuo_com_atraso"];

/** Os três tipos de corte do ONS, quanto cada um pesa e quanto a previsão captura de cada um. */
function TiposDeCorte({ r }: { r: Atlas["razoes"] }) {
  const { t } = useIdioma();
  const L = t.locale;
  const ne = r.nordeste_2026;
  const tipos = ["ENE", "CNF", "REL"].filter((k) => ne.fracao[k]);
  const fora = tipos.filter((k) => k !== "REL").reduce((s, k) => s + ne.fracao[k], 0);
  const ate = dataCurta(ne.periodo.slice(-10), L, true);
  const cap = (periodo: "teste_ago_set" | "ao_vivo", k: string) => (r.captura[periodo][k] ? pct(r.captura[periodo][k].capturado, L) : "—");
  return (
    <Cartao className="overflow-x-auto">
      <h2 className="text-lg font-semibold">{t.reasons.title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t.reasons.lead(pct(ne.fracao.ENE ?? 0, L), ate)}</p>
      <div className="mt-4 max-w-3xl">
        <BarraRazoes fracao={ne.fracao} />
      </div>
      <table className="mt-5 w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 pr-3 font-medium">{t.reasons.type}</th>
            <th className="px-2 py-2 font-medium">{t.reasons.code}</th>
            <th className="px-2 py-2 text-right font-medium">{t.reasons.share}</th>
            <th className="px-2 py-2 text-right font-medium">{t.reasons.capTest}</th>
            <th className="px-2 py-2 text-right font-medium">{t.reasons.capLive}</th>
            <th className="py-2 pl-2 text-right font-medium">{t.reasons.ess}</th>
          </tr>
        </thead>
        <tbody>
          {tipos.map((k) => (
            <tr key={k} className="border-b border-line/70 last:border-0">
              <td className="py-2 pr-3">{t.reasons.names[k]}</td>
              <td className="px-2 py-2 font-mono text-xs">{k}</td>
              <td className="tabular px-2 py-2 text-right font-semibold">{pct(ne.fracao[k], L)}</td>
              <td className="tabular px-2 py-2 text-right">{cap("teste_ago_set", k)}</td>
              <td className="tabular px-2 py-2 text-right">{cap("ao_vivo", k)}</td>
              <td className={`py-2 pl-2 text-right ${k === "REL" ? "font-semibold text-ok" : "text-muted"}`}>{k === "REL" ? t.reasons.yes : t.reasons.no}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-3xl text-xs text-muted">
        {t.reasons.essNote(pct(fora, L))}{" "}
        <a href={DICIONARIO_ONS} className="underline">
          {t.reasons.dictionary} ↗
        </a>
      </p>
      <h3 className="mt-6 text-sm font-semibold">{t.reasons.byMonth}</h3>
      <div className="mt-2 max-w-3xl">
        <GraficoRazoesMes meses={r.nordeste_por_mes} />
      </div>
      <p className="mt-1 max-w-3xl text-xs text-muted">{t.reasons.monthNote}</p>
    </Cartao>
  );
}

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

      {/* Ao vivo: o mesmo modelo, depois do teste congelado; erros incluídos */}
      <Cartao className="border-l-4 border-l-ok">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.track.liveTitle}</h2>
          <span className="text-xs font-medium uppercase tracking-wide text-ok">● {t.common.live}</span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.track.liveLead(dataCurta(d.dados_ate, L, true))}</p>
        <p className="mt-3 text-2xl font-semibold">
          {t.track.liveScore(num(d.ao_vivo.confirmadas, L), num(d.ao_vivo.total, L), pct(d.ao_vivo.fracao_confirmadas ?? 0, L))}
        </p>
        <p className="mt-1 text-sm">
          {d.ao_vivo.publicadas_antes.total
            ? t.track.liveBefore(num(d.ao_vivo.publicadas_antes.confirmadas, L), num(d.ao_vivo.publicadas_antes.total, L))
            : t.track.liveBeforeNone}
        </p>
        <div className="mt-4 max-w-3xl rounded-lg bg-sun-soft/60 p-3 text-sm">
          <div className="font-semibold">{t.track.liveWhyTitle}</div>
          <p className="mt-1 leading-relaxed">{t.track.liveWhy}</p>
        </div>
        <p className="mt-3 max-w-3xl text-xs text-muted">{t.track.liveNote}</p>
      </Cartao>

      <TiposDeCorte r={d.razoes} />

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
            <thead className="text-xs text-muted">
              <tr>
                <th />
                <th className="py-1 text-right font-medium">{t.track.backtestCol}</th>
                <th className="py-1 pl-4 text-right font-medium">{t.track.liveCol}</th>
              </tr>
            </thead>
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
                  <td className="tabular py-1.5 pl-4 text-right text-muted">
                    {u.placar_ao_vivo.janelas ? `${num(u.placar_ao_vivo.confirmadas, L)}/${num(u.placar_ao_vivo.janelas, L)}` : "—"}
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
