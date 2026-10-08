"use client";

// Comprovação de uma compra: pagamento, recibo (fase 1) e carimbo do ONS (fase 2), lidos da Solana.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useIdioma } from "@/i18n/idioma";
import { dataCurta, num, pct } from "@/lib/formato";
import type { RegistroCadeia, RespostaRecibo, ResultadoTrabalho } from "@/lib/tipos";
import { Cartao } from "./Selos";

const URL_ONS = (arquivo: string) =>
  `https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/restricao_coff_${arquivo.includes("EOLICA") ? "eolica" : "fotovoltaica"}_tm/${arquivo}`;
const VALIDA = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

export function Verificacao({ nomes }: { nomes: Record<string, string> }) {
  const { t } = useIdioma();
  const v = t.verify;
  const L = t.locale;
  const router = useRouter();
  const tx = useSearchParams().get("tx") ?? "";
  const [campo, setCampo] = useState(tx);
  const [resposta, setResposta] = useState<{ tx: string; dados: RespostaRecibo } | null>(null);

  useEffect(() => {
    if (!VALIDA.test(tx)) return;
    let vivo = true;
    fetch("/api/recibo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assinatura: tx }) })
      .then((r) => r.json() as Promise<RespostaRecibo>)
      .then((dados) => vivo && setResposta({ tx, dados }))
      .catch((e) => vivo && setResposta({ tx, dados: { erro: String(e) } }));
    return () => {
      vivo = false;
    };
  }, [tx]);

  const dados = resposta?.tx === tx ? resposta.dados : null;
  const carregando = VALIDA.test(tx) && !dados;
  const quando = (s: number | null) =>
    s ? new Intl.DateTimeFormat(L, { dateStyle: "medium", timeStyle: "short" }).format(new Date(s * 1000)) : "—";
  const curto = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`;

  return (
    <div className="space-y-6 pt-8">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">{v.title}</h1>
        <p className="mt-3 text-muted">{v.lead}</p>
      </header>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/verify?tx=${campo.trim()}`);
        }}
      >
        <input
          value={campo}
          onChange={(e) => setCampo(e.target.value)}
          placeholder={v.placeholder}
          aria-label={v.placeholder}
          className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm"
        />
        <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
          {v.button}
        </button>
      </form>

      {tx && !VALIDA.test(tx) && <p className="text-sm text-cut">{v.invalid}</p>}
      {carregando && <p className="text-sm text-muted">{v.loading}</p>}
      {dados?.erro && (
        <p className="rounded-lg bg-cut-soft p-3 text-sm text-cut">{dados.erro === "sem_sol_plataforma" ? v.noSol : dados.erro}</p>
      )}

      {dados?.compra && (
        <div className="grid gap-4 md:grid-cols-2">
          <Cartao>
            <h2 className="font-semibold">{v.payment}</h2>
            <p className="mt-1 text-sm font-medium text-ok">✓ {t.buy.success}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Linha rotulo={v.plant} valor={(nomes[dados.compra.idUsina] ?? dados.compra.idUsina).replace(/^Conj\. /, "")} />
              <Linha rotulo={v.window} valor={`${dataCurta(dados.compra.data, L)} · ${dados.compra.inicio}–${dados.compra.fim}`} />
              <Linha rotulo={v.energy} valor={`${num(dados.compra.mwh, L, 1)} MWh`} />
              <Linha rotulo={v.paid} valor={`${num(dados.compra.totalUsdc, L, 2)} USDC`} />
              {(["usina", "operador", "plataforma"] as const).map((p) => (
                <Linha key={p} rotulo={`· ${t.buy.roles[p]}`} valor={`${num(dados.compra!.partesUsdc[p], L, 2)} USDC`} discreto />
              ))}
              <Linha rotulo={v.buyer} valor={curto(dados.compra.comprador)} />
              <Linha rotulo={v.when} valor={quando(dados.compra.horario)} />
            </dl>
            <Explorer href={dados.compra.explorador} />
          </Cartao>

          <Cartao>
            <h2 className="font-semibold">{v.receipt}</h2>
            {dados.recibo ? (
              <Fase registro={dados.recibo} lead={v.receiptLead} quando={quando} />
            ) : (
              <p className="mt-2 text-sm text-muted">{dados.chaves_configuradas === false ? v.receiptMissing : v.receiptNotYet}</p>
            )}
          </Cartao>

          <CartaoExecucao exec={dados.execucao ?? null} mwh={dados.compra.mwh} quando={quando} />

          <Cartao>
            <h2 className="font-semibold">{v.stamp}</h2>
            {dados.carimbo && dados.veredito ? (
              <>
                <p className={`mt-1 text-sm font-semibold ${dados.veredito.resultado === "confirmado" ? "text-ok" : "text-cut"}`}>
                  {dados.veredito.resultado === "confirmado" ? `✓ ${v.confirmed}` : `✗ ${v.wrong}`}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>{v.cutShare(pct(dados.veredito.fracao_com_corte, L))}</li>
                  <li>{v.cutEnergy(`${num(dados.veredito.energia_cortada_mwh, L)} MWh`)}</li>
                </ul>
                <div className="mt-3 text-xs">
                  <div className="font-medium">{v.onsFile}</div>
                  <div className="break-all">{dados.veredito.fonte}</div>
                  <div className="mt-1 break-all font-mono text-muted">sha256 {dados.veredito.sha256}</div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {/* Cópia exata guardada pelo atlas.py: o ONS pode republicar o mês e mudar o SHA-256 */}
                    <a href={`/ons/${dados.veredito.sha256}/${dados.veredito.fonte}`} download className="text-wind underline">
                      {v.archived}
                    </a>
                    <a href={URL_ONS(dados.veredito.fonte)} className="text-wind underline">
                      {v.onsCurrent}
                    </a>
                  </div>
                </div>
                <Fase registro={dados.carimbo} lead={v.stampLead} quando={quando} />
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{v.awaitingOns}</p>
            )}
          </Cartao>
        </div>
      )}

      {dados?.compra && (
        <Cartao>
          <h2 className="font-semibold">{v.howTitle}</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {v.how.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
          <p className="mt-3 rounded-lg bg-wait-soft px-3 py-2 text-xs text-wait">{v.disclaimer}</p>
        </Cartao>
      )}
    </div>
  );
}

function CartaoExecucao({
  exec,
  mwh,
  quando,
}: {
  exec: NonNullable<RespostaRecibo["execucao"]> | null;
  mwh: number;
  quando: (s: number | null) => string;
}) {
  const { t } = useIdioma();
  const v = t.verify;
  const L = t.locale;
  const [resultado, setResultado] = useState<{ arquivo: string; r: ResultadoTrabalho } | null>(null);
  const arquivo = exec?.arquivo;

  // O resultado fica num arquivo publicado pelo operador (pode levar um minuto para aparecer depois da execução)
  useEffect(() => {
    if (!arquivo) return;
    let vivo = true;
    fetch(arquivo)
      .then((x) => (x.ok ? (x.json() as Promise<ResultadoTrabalho>) : null))
      .then((r) => vivo && r && setResultado({ arquivo, r }))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [arquivo]);

  if (!exec) {
    return (
      <Cartao>
        <h2 className="font-semibold">{v.execution}</h2>
        <p className="mt-2 text-sm text-muted">{v.awaitingOperator}</p>
      </Cartao>
    );
  }
  const r = resultado && resultado.arquivo === arquivo ? resultado.r : null;
  const pt = L.startsWith("pt");
  return (
    <Cartao>
      <h2 className="font-semibold">{v.execution}</h2>
      {exec.modo === "replay" ? (
        <p className="mt-1 text-sm font-medium text-wait">{v.replayRun}</p>
      ) : (
        <p className={`mt-1 text-sm font-semibold ${exec.dentro_da_janela ? "text-ok" : "text-cut"}`}>
          {exec.dentro_da_janela ? `✓ ${v.inside}` : `✗ ${v.outside}`}
        </p>
      )}
      <p className="mt-1 text-sm text-muted">{v.executionLead}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Linha rotulo={v.started} valor={quando(exec.inicio?.horario ?? null)} />
        <Linha rotulo={v.finished} valor={quando(exec.fim.horario)} />
      </dl>
      <p className="mt-1 text-xs text-muted">
        {v.jobEnergy(num(exec.duracao_s, L), num(exec.energia_wh, L, 2), num(exec.watts, L))} · {num(mwh, L, 1)} MWh
      </p>
      {r && (
        <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
          <div className="font-medium">{v.found}</div>
          <p className="mt-1 text-xs text-muted">{v.foundLead(r.periodo_dos_dados.replace(" a ", " – "))}</p>
          <ul className="mt-2 space-y-1">
            {r.causas.slice(0, 3).map((c) => (
              <li key={c.causa} className="flex justify-between gap-3">
                <span>{pt ? c.pt : c.en}</span>
                <span className="tabular font-semibold">{pct(c.fracao_energia, L)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            {r.modelo} · {v.agreement(pct(r.conferencia_palavras_chave.fracao_meias_horas_iguais, L))}
          </p>
        </div>
      )}
      <div className="mt-3 space-y-0.5 break-all font-mono text-[11px] text-muted">
        <div>in sha256 {exec.entrada_sha256}</div>
        <div>out sha256 {exec.resultado_sha256}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
        {exec.inicio && (
          <a href={exec.inicio.explorador} target="_blank" rel="noreferrer" className="font-medium underline">
            {v.started} ↗
          </a>
        )}
        <a href={exec.fim.explorador} target="_blank" rel="noreferrer" className="font-medium underline">
          {v.finished} ↗
        </a>
        {r && (
          <a href={exec.arquivo} download className="font-medium underline">
            {v.resultFile}
          </a>
        )}
      </div>
    </Cartao>
  );
}

function Linha({ rotulo, valor, discreto = false }: { rotulo: string; valor: string; discreto?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${discreto ? "text-xs text-muted" : ""}`}>
      <dt className="text-muted">{rotulo}</dt>
      <dd className="tabular text-right">{valor}</dd>
    </div>
  );
}

function Fase({ registro, lead, quando }: { registro: RegistroCadeia; lead: string; quando: (s: number | null) => string }) {
  const { t } = useIdioma();
  return (
    <div className="mt-2 text-sm">
      <p className="text-muted">{lead}</p>
      <code className="mt-2 block break-words rounded-lg bg-paper p-2 text-[11px] leading-snug">{registro.memo}</code>
      <p className="mt-2 text-xs text-muted">
        {t.verify.when}: {quando(registro.horario)}
      </p>
      <Explorer href={registro.explorador} />
    </div>
  );
}

function Explorer({ href }: { href: string }) {
  const { t } = useIdioma();
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium underline">
      {t.buy.explorer} ↗
    </a>
  );
}
