"use client";

// Janela de compra: escolhe os MWh, conecta a Phantom, paga em USDC (devnet) e mostra a transação.
import { Connection, type PublicKey } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useIdioma } from "@/i18n/idioma";
import { dataCurta, num } from "@/lib/formato";
import {
  DESTINATARIOS,
  MWH_MINIMO,
  RPC,
  explorador,
  montarTransacao,
  phantom,
  precificar,
  saldos,
  simular,
  textoMemo,
  usdc,
  type Compra,
} from "@/lib/solana";
import type { AlvoCompra } from "./BotaoComprar";

type Estado =
  | { fase: "inicio" }
  | { fase: "conectando" }
  | { fase: "assinando" }
  | { fase: "confirmando"; assinatura: string }
  | { fase: "pago"; assinatura: string }
  | { fase: "erro"; mensagem: string; rede?: boolean };

export default function CompraJanela({ idUsina, nomeUsina, janela, cambio, fechar }: AlvoCompra & { fechar: () => void }) {
  const { t } = useIdioma();
  const L = t.locale;
  const b = t.buy;
  const conexao = useMemo(() => new Connection(RPC, "confirmed"), []);
  const [mwh, setMwh] = useState(0.5);
  const [carteira, setCarteira] = useState<PublicKey | null>(() => phantom()?.publicKey ?? null);
  const [saldo, setSaldo] = useState<{ sol: number; usdc: bigint } | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });

  // PLD médio da janela (R$/MWh), calculado pelo atlas.py com o PLD horário da CCEE
  const pldArred = Math.round((janela.pld_medio_rs_mwh ?? 0) * 100) / 100;
  const compra: Compra | null = cambio && pldArred > 0
    ? { idUsina, data: janela.data, inicio: janela.inicio, fim: janela.fim, mwh, pldRsMwh: pldArred, ptax: cambio.ptax_venda }
    : null;
  const preco = compra ? precificar(compra) : null;

  // Fecha com Esc
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fechar]);

  // Saldo da carteira conectada (devnet)
  useEffect(() => {
    if (!carteira) return;
    let vivo = true;
    saldos(conexao, carteira).then((s) => vivo && setSaldo(s)).catch(() => vivo && setSaldo(null));
    return () => {
      vivo = false;
    };
  }, [carteira, conexao, estado.fase]);

  const provedor = typeof window !== "undefined" ? phantom() : null;

  async function conectar() {
    const p = phantom();
    if (!p) return;
    setEstado({ fase: "conectando" });
    try {
      const { publicKey } = await p.connect();
      setCarteira(publicKey);
      setEstado({ fase: "inicio" });
    } catch {
      setEstado({ fase: "inicio" });
    }
  }

  async function pagar() {
    const p = phantom();
    if (!p || !carteira || !compra) return;
    setEstado({ fase: "assinando" });
    let blockhash = "";
    try {
      const montada = await montarTransacao(conexao, carteira, compra);
      blockhash = montada.blockhash;
      const { tx, lastValidBlockHeight } = montada;
      // 1) simula antes de abrir a Phantom: mostra o motivo real se a transação não passaria
      const falha = await simular(conexao, tx);
      if (falha) {
        setEstado({ fase: "erro", mensagem: `${b.simFailed} ${falha}` });
        return;
      }
      // 2) a Phantom assina e envia (o blockhash vale ~1 minuto)
      const { signature } = await p.signAndSendTransaction(tx);
      setEstado({ fase: "confirmando", assinatura: signature });
      const r = await conexao.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      if (r.value.err) throw new Error(JSON.stringify(r.value.err));
      setEstado({ fase: "pago", assinatura: signature });
    } catch (e) {
      const erro = e as { code?: number; message?: string };
      console.error("Vento Cortado: falha no pagamento", e);
      if (erro.code === 4001 || /reject|cancel/i.test(erro.message ?? "")) {
        setEstado({ fase: "erro", mensagem: b.canceled });
        return;
      }
      // 3) se o blockhash venceu enquanto a Phantom estava aberta, diz isso com clareza
      const valido = blockhash ? await conexao.isBlockhashValid(blockhash, { commitment: "confirmed" }).then((r) => r.value, () => true) : true;
      if (!valido) setEstado({ fase: "erro", mensagem: b.expired });
      else setEstado({ fase: "erro", mensagem: `${b.failed} ${erro.message ?? String(e)}`, rede: true });
    }
  }

  const ocupado = estado.fase === "conectando" || estado.fase === "assinando" || estado.fase === "confirmando";
  const semUsdc = !!(saldo && preco && saldo.usdc < preco.total);
  const semSol = !!(saldo && saldo.sol < 0.01);
  const usd = (x: bigint) => num(usdc(x), L, 2);

  // Portal: a janela abre direto no <body>, sem herdar estilos da tabela onde está o botão
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 text-left sm:items-center sm:p-4" onClick={fechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-compra"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-compra" className="text-lg font-semibold">
              {b.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {nomeUsina.replace(/^Conj\. /, "")} · {dataCurta(janela.data, L)} · {janela.inicio}–{janela.fim}
            </p>
          </div>
          <button type="button" onClick={fechar} aria-label={b.close} className="rounded-md px-2 py-1 text-muted hover:bg-line/60 hover:text-ink">
            ✕
          </button>
        </div>

        <p className="mt-3 rounded-lg bg-wait-soft px-3 py-2 text-xs text-wait">{b.devnet}</p>

        {!cambio || !preco ? (
          <p className="mt-4 text-sm text-cut">{b.unavailable}</p>
        ) : estado.fase === "pago" ? (
          <div className="mt-5 space-y-3">
            <p className="text-lg font-semibold text-ok">✓ {b.success}</p>
            <p className="text-sm text-muted">{b.successLead}</p>
            <Divisao partes={preco.partes} usd={usd} />
            <div className="rounded-lg bg-paper p-3 text-xs">
              <div className="font-medium">{b.memo}</div>
              <code className="mt-1 block break-words text-muted">{textoMemo(compra!)}</code>
            </div>
            <a href={explorador(estado.assinatura)} target="_blank" rel="noreferrer" className="block rounded-lg bg-ink px-4 py-2.5 text-center text-sm font-medium text-white">
              {b.explorer} ↗
            </a>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">{b.amount}</span>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="range"
                  min={MWH_MINIMO}
                  max={5}
                  step={0.1}
                  value={mwh}
                  disabled={ocupado}
                  onChange={(e) => setMwh(Math.round(Number(e.target.value) * 10) / 10)}
                  className="w-full accent-[var(--color-ink)]"
                />
                <span className="tabular w-24 shrink-0 whitespace-nowrap text-right font-semibold">{num(mwh, L, 1)} MWh</span>
              </div>
            </label>

            <div className="rounded-lg bg-paper p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">{b.price}</span>
                <span className="tabular text-xl font-semibold">{usd(preco.total)} USDC</span>
              </div>
              <div className="tabular text-right text-xs text-muted">
                R$ {num(preco.valorRs, L, 2)} · {b.atPld(`R$ ${num(pldArred, L, 2)}`)}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted">{b.rate(num(cambio.ptax_venda, L, 4), dataCurta(cambio.data, L, true))}</p>
            </div>

            <div>
              <div className="text-sm font-medium">{b.split}</div>
              <Divisao partes={preco.partes} usd={usd} />
              <p className="mt-1 text-[11px] text-muted">{b.simulated}</p>
            </div>

            {!provedor ? (
              <div className="rounded-lg border border-line p-3 text-sm">
                <p>{b.noPhantom}</p>
                <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="mt-1 inline-block font-medium underline">
                  {b.install} ↗
                </a>
              </div>
            ) : !carteira ? (
              <button
                type="button"
                onClick={conectar}
                disabled={ocupado}
                className="w-full rounded-lg bg-[#ab9ff2] px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-95 disabled:opacity-60"
              >
                {estado.fase === "conectando" ? b.connecting : b.connect}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted">
                  {b.wallet}: <code>{carteira.toBase58().slice(0, 4)}…{carteira.toBase58().slice(-4)}</code>
                  {saldo && <> · {b.balance(num(usdc(saldo.usdc), L, 2), num(saldo.sol, L, 3))}</>}
                </div>
                {semUsdc && <p className="text-xs text-cut">{b.lowUsdc}</p>}
                {semSol && <p className="text-xs text-cut">{b.lowSol}</p>}
                <button
                  type="button"
                  onClick={pagar}
                  disabled={ocupado || semUsdc || semSol}
                  className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/85 disabled:opacity-50"
                >
                  {estado.fase === "assinando" ? b.signing : estado.fase === "confirmando" ? b.confirming : b.pay(usd(preco.total))}
                </button>
                <p className="text-center text-[11px] text-muted">{b.timeHint}</p>
              </div>
            )}

            {estado.fase === "erro" && (
              <div className="rounded-lg bg-cut-soft p-3 text-xs text-cut">
                <p className="break-words">{estado.mensagem}</p>
                {estado.rede && <p className="mt-1">{b.networkHint}</p>}
              </div>
            )}
            {!carteira && provedor && <p className="text-[11px] text-muted">{b.testnetHint}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Divisao({ partes, usd }: { partes: Record<string, bigint>; usd: (x: bigint) => string }) {
  const { t } = useIdioma();
  return (
    <ul className="mt-1 divide-y divide-line rounded-lg border border-line text-sm">
      {DESTINATARIOS.map((d) => (
        <li key={d.papel} className="flex items-center justify-between px-3 py-1.5">
          <span>
            {t.buy.roles[d.papel]} <span className="text-xs text-muted">({d.parte / 100}%)</span>
          </span>
          <span className="tabular">{usd(partes[d.papel])} USDC</span>
        </li>
      ))}
    </ul>
  );
}
