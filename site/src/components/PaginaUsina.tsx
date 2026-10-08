"use client";

import Link from "next/link";
import { useIdioma } from "@/i18n/idioma";
import type { Cambio, Usina } from "@/lib/tipos";
import { BotaoComprar } from "./BotaoComprar";
import { dataCurta, energia, num, pct, reais } from "@/lib/formato";
import { MapaCarregado } from "./MapaCarregado";
import { BarraChance, Cartao, Numero, SeloResultado, SeloTipo } from "./Selos";
import { MapaCalor } from "./Graficos";

const INICIO_AO_VIVO = "2026-10-01"; // depois do teste de agosto e setembro

export function PaginaUsina({ u, cambio, dadosAte }: { u: Usina; cambio: Cambio | null; dadosAte: string }) {
  const { t } = useIdioma();
  const L = t.locale;
  const ponto = {
    id: u.id,
    nome: u.nome,
    tipo: u.tipo,
    lat: u.local.lat,
    lon: u.local.lon,
    capacidade_mw: u.capacidade_mw,
    chance: null,
    rotulo: `${u.local.municipio}, ${u.uf}`,
  };

  return (
    <div className="space-y-8 pt-8">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← {t.common.back}
      </Link>

      <header className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="flex items-center gap-2">
            <SeloTipo tipo={u.tipo} />
            <span className="text-sm text-muted">{u.id}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{u.nome.replace(/^Conj\. /, "")}</h1>
          <p className="mt-1 text-muted">
            {u.local.municipio}, {u.uf} · {t.common.approxLocation}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">{t.common.operator}</dt>
            <dd>{u.agente}</dd>
            <dt className="text-muted">{t.common.capacity}</dt>
            <dd className="tabular">{num(u.capacidade_mw, L)} MW</dd>
            <dt className="text-muted">{t.plant.connection}</dt>
            <dd>{u.ponto_conexao}</dd>
          </dl>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Numero valor={`${num(u.perdeu_jan_jul_2026_gwh, L)} GWh`} rotulo={t.plant.lostJanJul} destaque />
            <Numero valor={pct(u.fracao_meias_horas_com_corte, L)} rotulo={t.plant.cutShare} />
          </div>
        </div>
        <div className="h-72 lg:col-span-2 lg:h-auto">
          <MapaCarregado pontos={[ponto]} selecionado={u.id} />
        </div>
      </header>

      <Cartao className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-lg font-semibold">{t.plant.nextTitle}</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2 font-medium">{t.common.data}</th>
              <th className="px-2 py-2 font-medium">{t.common.window}</th>
              <th className="px-2 py-2 font-medium">{t.common.chance}</th>
              <th className="px-2 py-2 text-right font-medium">{t.common.expected}</th>
              <th className="px-2 py-2 text-right font-medium">{t.common.value}</th>
              <th className="px-2 py-2 text-right font-medium">ONS</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {u.proximas.map((j) => (
              <tr key={`${j.data}-${j.inicio}`} className="border-b border-line/70 last:border-0">
                <td className="whitespace-nowrap px-5 py-2">{dataCurta(j.data, L)}</td>
                <td className="tabular whitespace-nowrap px-2 py-2">
                  {j.inicio}–{j.fim}
                </td>
                <td className="px-2 py-2">
                  <BarraChance valor={j.chance_prevista} />
                </td>
                <td className="tabular whitespace-nowrap px-2 py-2 text-right">~{energia(j.energia_esperada_mwh, L)}</td>
                <td className="tabular whitespace-nowrap px-2 py-2 text-right">
                  {reais(j.valor_referencia_rs ?? 0, L, true)}
                  {j.pld_estimado && (
                    <span title={t.common.pldEstTitle} className="ml-1 cursor-help text-[10px] text-muted underline decoration-dotted">
                      {t.common.pldEst}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <SeloResultado resultado={j.resultado_ons} />
                </td>
                <td className="px-5 py-2 text-right">
                  <BotaoComprar idUsina={u.id} nomeUsina={u.nome} janela={j} cambio={cambio} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>

      <Cartao>
        <h2 className="text-lg font-semibold">{t.plant.heatTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.plant.heatNote(dataCurta(dadosAte, L, true))}</p>
        <div className="mt-4">
          <MapaCalor calor={u.calor} />
        </div>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao className="overflow-x-auto p-0 lg:col-span-2">
          <div className="px-5 pt-5">
            <h2 className="text-lg font-semibold">{t.plant.recentTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.plant.recentNote}</p>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">{t.common.data}</th>
                <th className="px-2 py-2 font-medium">{t.common.window}</th>
                <th className="px-2 py-2 font-medium">{t.common.chance}</th>
                <th className="px-2 py-2 text-right font-medium">{t.plant.lost}</th>
                <th className="px-2 py-2 font-medium">{t.plant.reasons}</th>
                <th className="px-2 py-2 text-right font-medium">ONS</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...u.recentes].reverse().map((j) => (
                <tr key={`${j.data}-${j.inicio}`} className="border-b border-line/70 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2">
                    {dataCurta(j.data, L)}
                    {j.data >= INICIO_AO_VIVO && <span className="ml-1.5 text-[10px] font-medium uppercase text-ok">{t.common.live}</span>}
                  </td>
                  <td className="tabular whitespace-nowrap px-2 py-2">
                    {j.inicio}–{j.fim}
                  </td>
                  <td className="tabular px-2 py-2">{pct(j.chance_prevista, L)}</td>
                  <td className="tabular whitespace-nowrap px-2 py-2 text-right">{energia(j.energia_cortada_mwh ?? 0, L)}</td>
                  <td className="px-2 py-2 text-xs text-muted">{Object.keys(j.razoes_do_corte).join(", ") || "—"}</td>
                  <td className="px-2 py-2 text-right">
                    <SeloResultado resultado={j.resultado_ons} />
                  </td>
                  <td className="px-5 py-2 text-right">
                    <BotaoComprar idUsina={u.id} nomeUsina={u.nome} janela={j} cambio={cambio} replay />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
        <Cartao>
          <h2 className="text-lg font-semibold">{t.plant.backtestTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.plant.scoreboard(num(u.placar.confirmadas, L), num(u.placar.janelas, L))}</p>
          {u.placar_ao_vivo.janelas > 0 && (
            <p className="text-sm font-medium text-ok">
              {t.plant.scoreboardLive(num(u.placar_ao_vivo.confirmadas, L), num(u.placar_ao_vivo.janelas, L))}
            </p>
          )}
          {(["agosto", "setembro"] as const).map((mes) => (
            <div key={mes} className="mt-4">
              <div className="text-xs uppercase tracking-wide text-muted">{mes === "agosto" ? t.plant.months[7] : t.plant.months[8]} 2026</div>
              <dl className="mt-1 grid grid-cols-3 gap-2 text-center">
                {[
                  [t.plant.precision, u.teste[mes].precisao],
                  [t.plant.coverage, u.teste[mes].cobertura],
                  [t.plant.energyCaptured, u.teste[mes].energia_capturada],
                ].map(([rotulo, v]) => (
                  <div key={rotulo as string} className="rounded-lg bg-paper p-2">
                    <dd className="tabular text-lg font-semibold">{pct(v as number, L)}</dd>
                    <dt className="text-[11px] leading-tight text-muted">{rotulo}</dt>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Cartao>
      </div>
    </div>
  );
}
