// Pagamento de janelas na Solana DEVNET (rede de teste): USDC de teste, carteiras de teste.
//
// Uma única transação, assinada pelo comprador na Phantom, contém:
//   1–3. para usina, operador e plataforma: cria a conta de USDC do destinatário se faltar
//        (CreateIdempotent) e transfere a parte dele (TransferChecked);
//   4.   um memo com o que foi comprado.
// Ou tudo acontece, ou nada acontece: a plataforma nunca segura o dinheiro de ninguém.
// As instruções são montadas à mão (são simples) para não depender da biblioteca spl-token.

import { Buffer } from "buffer";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";

export const REDE = "devnet";
export const RPC = "https://api.devnet.solana.com";
export const explorador = (assinatura: string) => `https://explorer.solana.com/tx/${assinatura}?cluster=devnet`;

/** USDC de teste da Circle na devnet (6 casas decimais), conferido na própria rede. */
export const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const USDC_DECIMAIS = 6;

const PROGRAMA_TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const PROGRAMA_CONTA_ASSOCIADA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const PROGRAMA_MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Carteiras de teste (geradas por scripts/gerar-carteiras.mjs; chaves secretas fora do repositório). */
export const DESTINATARIOS = [
  { papel: "usina", carteira: new PublicKey("5ygfGZrNKr5PmGn7o47bGDy7gjrqt3V17W1sxeWSBEg5"), parte: 7000 },
  { papel: "operador", carteira: new PublicKey("8ufcDYFKXRjNsVa4PCzvwBa55y73NqAFmvMPVoPnx9BZ"), parte: 2500 },
  { papel: "plataforma", carteira: new PublicKey("DqqMCkoiH1x3mAoYknCZQYn4aEGhyWP4ySqXaPAmNztN"), parte: 500 },
] as const;
export type Papel = (typeof DESTINATARIOS)[number]["papel"];

export const MWH_MINIMO = 0.1;

/** Endereço da conta de USDC de uma carteira (conta associada). */
export const contaUsdc = (dono: PublicKey) =>
  PublicKey.findProgramAddressSync([dono.toBuffer(), PROGRAMA_TOKEN.toBuffer(), USDC_DEVNET.toBuffer()], PROGRAMA_CONTA_ASSOCIADA)[0];

export function criarContaSeFaltar(pagador: PublicKey, dono: PublicKey) {
  return new TransactionInstruction({
    programId: PROGRAMA_CONTA_ASSOCIADA,
    keys: [
      { pubkey: pagador, isSigner: true, isWritable: true },
      { pubkey: contaUsdc(dono), isSigner: false, isWritable: true },
      { pubkey: dono, isSigner: false, isWritable: false },
      { pubkey: USDC_DEVNET, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: PROGRAMA_TOKEN, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // 1 = CreateIdempotent: não falha se a conta já existir
  });
}

export function transferir(origem: PublicKey, destino: PublicKey, dono: PublicKey, microUsdc: bigint) {
  const dados = Buffer.alloc(10);
  dados.writeUInt8(12, 0); // 12 = TransferChecked (confere o token e as casas decimais)
  dados.writeBigUInt64LE(microUsdc, 1);
  dados.writeUInt8(USDC_DECIMAIS, 9);
  return new TransactionInstruction({
    programId: PROGRAMA_TOKEN,
    keys: [
      { pubkey: origem, isSigner: false, isWritable: true },
      { pubkey: USDC_DEVNET, isSigner: false, isWritable: false },
      { pubkey: destino, isSigner: false, isWritable: true },
      { pubkey: dono, isSigner: true, isWritable: false },
    ],
    data: dados,
  });
}

/** Memo gravado na transação. O programa de memo exige que todas as contas listadas assinem. */
export const memo = (texto: string, ...signatarios: PublicKey[]) =>
  new TransactionInstruction({
    programId: PROGRAMA_MEMO,
    keys: signatarios.map((pubkey) => ({ pubkey, isSigner: true, isWritable: false })),
    data: Buffer.from(texto, "utf8"),
  });

// ---------- Preço ----------

export type Compra = {
  idUsina: string;
  data: string;
  inicio: string;
  fim: string;
  mwh: number;
  pldRsMwh: number;
  ptax: number;
};

/** Preço em micro-USDC (1 USDC = 1.000.000) e a parte de cada destinatário; a plataforma fica com o arredondamento. */
export function precificar(c: Compra) {
  const valorRs = c.mwh * c.pldRsMwh;
  const total = BigInt(Math.round((valorRs / c.ptax) * 1e6));
  const base = BigInt(10000);
  const [usina, operador] = DESTINATARIOS.slice(0, 2).map((d) => (total * BigInt(d.parte)) / base);
  const partes: Record<Papel, bigint> = { usina, operador, plataforma: total - usina - operador };
  return { valorRs, total, partes };
}

const DIVISAO = DESTINATARIOS.map((d) => d.parte / 100).join("/"); // "70/25/5"

export const textoMemo = (c: Compra) =>
  `vento-cortado v1 | ${c.idUsina} | ${c.data} ${c.inicio}-${c.fim} | ${c.mwh} MWh | PLD ${c.pldRsMwh} R$/MWh | PTAX ${c.ptax} | ${DIVISAO}`;

/** Monta a transação de compra (o comprador paga as taxas e assina na Phantom). */
export async function montarTransacao(conexao: Connection, comprador: PublicKey, c: Compra) {
  const { partes } = precificar(c);
  const origem = contaUsdc(comprador);
  const tx = new Transaction();
  for (const d of DESTINATARIOS) {
    tx.add(criarContaSeFaltar(comprador, d.carteira), transferir(origem, contaUsdc(d.carteira), comprador, partes[d.papel]));
  }
  tx.add(memo(textoMemo(c), comprador));
  const { blockhash, lastValidBlockHeight } = await conexao.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = comprador;
  return { tx, blockhash, lastValidBlockHeight };
}

/**
 * Simula a transação na devnet antes de pedir a assinatura. Devolve null se ela passaria,
 * ou um resumo do motivo da falha (as últimas linhas do log do programa).
 */
export async function simular(conexao: Connection, tx: Transaction): Promise<string | null> {
  const r = await conexao.simulateTransaction(new VersionedTransaction(tx.compileMessage()), {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
  });
  if (!r.value.err) return null;
  const logs = (r.value.logs ?? []).filter((l) => /error|failed|insufficient/i.test(l)).slice(-2);
  return `${JSON.stringify(r.value.err)}${logs.length ? ` — ${logs.join(" | ")}` : ""}`;
}

/** Saldos do comprador na devnet: SOL (para taxas) e USDC (para pagar). */
export async function saldos(conexao: Connection, dono: PublicKey) {
  const [lamports, usdc] = await Promise.all([
    conexao.getBalance(dono, "confirmed"),
    conexao.getTokenAccountBalance(contaUsdc(dono), "confirmed").then(
      (r) => BigInt(r.value.amount),
      () => BigInt(0), // conta de USDC ainda não existe
    ),
  ]);
  return { sol: lamports / 1e9, usdc };
}

// ---------- Phantom (provedor injetado no navegador) ----------

export type ProvedorPhantom = {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
};

export function phantom(): ProvedorPhantom | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { phantom?: { solana?: ProvedorPhantom } }).phantom?.solana;
  return p?.isPhantom ? p : null;
}

export const usdc = (micro: bigint) => Number(micro) / 1e6;
