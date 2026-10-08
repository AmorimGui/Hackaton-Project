"use client";

import Link from "next/link";
import { useState } from "react";
import { useIdioma } from "@/i18n/idioma";
import type { Atlas, Janela, Usina } from "@/lib/tipos";
import { dataCurta, energia, num, pct, reais } from "@/lib/formato";
import { MapaCarregado } from "./MapaCarregado";
import { BarraChance, Cartao, Numero, SeloTipo } from "./Selos";
import { GraficoHoras, GraficoMensal } from "./Graficos";

export type DadosInicio = Pick<Atlas, "manchete" | "previsao" | "pld" | "padroes" | "dados_ate"> & {
  placar: Atlas["teste"]["placar"];
  usinas: Pick<Usina, "id" | "nome" | "uf" | "tipo" | "local" | "capacidade_mw" | "proximas">[];
};

export function Inicio({ d }: { d: DadosInicio }) {
  const { t } = useIdioma();
  const L = t.locale;
  const [dia, setDia] = useState(d.previsao.dias[d.previsao.dias.length - 1]);
  const doDia = d.previsao.por_dia[dia];
  const compacto = (x: number) => new Intl.NumberFormat(L, { notation: "compact", maximumFractionDigits: 1 }).format(x);

  const linhas = d.usinas.flatMap((u): { u: (typeof d.usinas)[number]; j: Janela | null }[] => {
    const js = u.proximas.filter((j) => j.data === dia);
    return js.length ? js.map((j) => ({ u, j })) : [{ u, j: null }];
  });
  const pontos = d.usinas.map((u) => {
    const js = u.proximas.filter((j) => j.data === dia);
    const melhor = js.reduce<(typeof js)[number] | null>((a, b) => (!a || b.chance_prevista > a.chance_prevista ? b : a), null);
    return {
      id: u.id,
      nome: u.nome,
      tipo: u.tipo,
      lat: u.local.lat,
      lon: u.local.lon,
      capacidade_mw: u.capacidade_mw,
      chance: melhor?.chance_prevista ?? null,
      rotulo: melhor
        ? `${melhor.inicio}–${melhor.fim} · ${pct(melhor.chance_prevista, L)} · ~${energia(melhor.energia_esperada_mwh, L)}`
        : t.home.noWindow,
    };
  });

  return (
    <div className="space-y-12 pt-8">
      {/* Manchete */}
      <section className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-wide text-cut">{t.home.kicker}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {t.home.title(`${num(d.manchete.nordeste_mw_medios / 1000, L, 1)} GW`)}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">{t.home.lead}</p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero valor={`${num(d.manchete.nordeste_mw_medios, L)} MW`} rotulo={t.home.statCut} destaque />
        <Numero valor={`${num(d.manchete.nordeste_gwh_dia, L)} GWh`} rotulo={t.home.statDay} />
        <Numero valor={reais(d.manchete.valor_anual_piso_rs, L, true)} rotulo={t.home.statValue} />
        <Numero valor={`${pct(d.manchete.energia_capturada_ago, L)} / ${pct(d.manchete.energia_capturada_set, L)}`} rotulo={t.home.statCapture} />
      </section>

      {/* Previsão */}
      <section className="space-y-4">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight">{t.home.forecastTitle}</h2>
          <p className="mt-2 text-muted">{t.home.forecastLead(dataCurta(d.dados_ate, L, true))}</p>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t.home.day}>
          {d.previsao.dias.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={x === dia}
              onClick={() => setDia(x)}
              className={`rounded-md border px-2.5 py-1.5 text-sm ${x === dia ? "border-ink bg-ink text-white" : "border-line bg-card text-muted hover:text-ink"}`}
            >
              {dataCurta(x, L)}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="h-[420px] lg:col-span-2 lg:h-auto">
            <MapaCarregado pontos={pontos} />
          </div>
          <Cartao className="overflow-x-auto p-0 lg:col-span-3">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.home.featured}</th>
                  <th className="px-2 py-3 font-medium">{t.common.window}</th>
                  <th className="px-2 py-3 font-medium">{t.common.chance}</th>
                  <th className="px-2 py-3 text-right font-medium">{t.common.expected}</th>
                  <th className="px-4 py-3 text-right font-medium">{t.common.value}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ u, j }, i) => (
                  <tr key={`${u.id}-${i}`} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/plants/${u.id}`} className="font-medium hover:underline">
                        {u.nome.replace(/^Conj\. /, "")}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
                        <SeloTipo tipo={u.tipo} />
                        <span className="whitespace-nowrap">
                          {u.local.municipio}, {u.uf}
                        </span>
                      </div>
                    </td>
                    {j ? (
                      <>
                        <td className="tabular whitespace-nowrap px-2 py-2.5">
                          {j.inicio}–{j.fim}
                        </td>
                        <td className="px-2 py-2.5">
                          <BarraChance valor={j.chance_prevista} />
                        </td>
                        <td className="tabular whitespace-nowrap px-2 py-2.5 text-right">
                          ~{energia(j.energia_esperada_mwh, L)}
                          <div className="text-xs text-muted">
                            {compacto(j.gpu_horas_esperadas)} {t.common.gpuHours}
                          </div>
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-2.5 text-right">{reais(j.valor_referencia_rs ?? 0, L, true)}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="px-2 py-2.5 text-muted">
                        {t.home.noWindow}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        </div>
        {doDia && (
          <p className="text-sm text-muted">
            {t.home.allPlantsLine(num(doDia.janelas, L), num(doDia.usinas, L), energia(doDia.energia_esperada_mwh, L))}
          </p>
        )}
        <p className="text-xs text-muted">{t.home.valueNote(`R$ ${num(d.pld.piso_2026_rs_mwh, L, 2)}`)}</p>
      </section>

      {/* Por que acontece */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">{t.home.whyTitle}</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Cartao className="lg:col-span-2">
            <h3 className="font-medium">{t.home.hourTitle}</h3>
            <div className="mt-3">
              <GraficoHoras eolica={d.padroes.perda_por_hora_pct.eolica} solar={d.padroes.perda_por_hora_pct.solar} />
            </div>
            <p className="mt-2 text-sm text-muted">{t.home.hourNote}</p>
          </Cartao>
          <Cartao>
            <h3 className="font-medium">{t.home.weekTitle}</h3>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-sm text-muted">{t.home.weekday}</dt>
                <dd className="tabular text-3xl font-semibold">{pct(d.padroes.chance_dia_util, L)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">{t.home.weekend}</dt>
                <dd className="tabular text-3xl font-semibold text-cut">{pct(d.padroes.chance_fim_de_semana, L)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted">{t.home.weekNote}</p>
          </Cartao>
        </div>
        <Cartao>
          <h3 className="font-medium">{t.home.monthTitle}</h3>
          <div className="mt-3">
            <GraficoMensal meses={d.padroes.nordeste_mensal_mw} />
          </div>
          <p className="mt-2 text-sm text-muted">{t.home.monthNote}</p>
        </Cartao>
      </section>

      <Link href="/track-record" className="block rounded-xl bg-ink p-6 text-white transition hover:bg-ink/90">
        <div className="text-xl font-semibold">{t.home.trackCta} →</div>
        <div className="mt-1 text-white/75">{t.home.trackCtaLead(num(d.placar.confirmadas, L), num(d.placar.total, L))}</div>
      </Link>
    </div>
  );
}
