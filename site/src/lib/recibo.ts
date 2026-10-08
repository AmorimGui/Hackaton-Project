// Recibo em duas fases (Solana devnet). Só roda no servidor: usa as chaves das carteiras de teste.
//
// Fase 1 (recibo): depois de conferir a compra na blockchain, a usina e o operador assinam um memo
//   que aponta para a transação de pagamento.
// Fase 2 (carimbo): quando o ONS já publicou o dado da janela, a plataforma (oráculo v1, declarado)
//   grava o veredito — confirmado ou errado — com o arquivo oficial do ONS e seu SHA-256.
//
// Os dois registros são pagos pela carteira da plataforma, e o memo de cada um cita a compra.
// Para achá-los, basta ler o histórico da plataforma (o RPC devolve o memo de cada transação).
//
// A plataforma também grava, uma vez por previsão publicada, o SHA-256 do arquivo de janelas previstas:
// prova de que a previsão existia antes de o dia começar.
import "server-only";
import { Connection, Keypair, Transaction, type ParsedInstruction } from "@solana/web3.js";
import veredictos from "@/data/veredictos.json";
import { DESTINATARIOS, RPC, USDC_DEVNET, contaUsdc, explorador, memo, type Papel } from "./solana";

export const conexao = () => new Connection(RPC, "confirmed");

const PREFIXO_COMPRA = "vento-cortado v1 |";
const PREFIXO_RECIBO = "vento-cortado recibo v1";
const PREFIXO_CARIMBO = "vento-cortado carimbo v1";
const PREFIXO_PREVISAO = "vento-cortado previsao v1";

export const assinaturaValida = (s: unknown): s is string => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s);

// ---------- Chaves (variáveis de ambiente; nunca no código) ----------

const NOMES_CHAVE: Record<Papel, string> = { usina: "VC_CHAVE_USINA", operador: "VC_CHAVE_OPERADOR", plataforma: "VC_CHAVE_PLATAFORMA" };

export function chaves(): Record<Papel, Keypair> | null {
  const saida = {} as Record<Papel, Keypair>;
  for (const d of DESTINATARIOS) {
    const bruto = process.env[NOMES_CHAVE[d.papel]];
    if (!bruto) return null;
    const par = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(bruto)));
    if (!par.publicKey.equals(d.carteira)) throw new Error(`${NOMES_CHAVE[d.papel]} não corresponde à carteira da ${d.papel}`);
    saida[d.papel] = par;
  }
  return saida;
}

// ---------- Fase 0: ler e conferir a compra ----------

export type Compra = {
  assinatura: string;
  comprador: string;
  idUsina: string;
  data: string;
  inicio: string;
  fim: string;
  mwh: number;
  pld: number;
  ptax: number;
  totalUsdc: number;
  partesUsdc: Record<Papel, number>;
  horario: number | null;
  memo: string;
};

/** Lê a transação de compra e confere memo, token, destinos e a divisão 70/25/5. Lança erro se algo não bater. */
export async function lerCompra(c: Connection, assinatura: string): Promise<Compra> {
  const tx = await c.getParsedTransaction(assinatura, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx) throw new Error("transação não encontrada na devnet");
  if (tx.meta?.err) throw new Error("a transação de compra falhou na blockchain");

  const instrucoes = tx.transaction.message.instructions as ParsedInstruction[];
  const textoMemo = instrucoes.find((i) => i.program === "spl-memo" && typeof i.parsed === "string" && i.parsed.startsWith(PREFIXO_COMPRA))
    ?.parsed as string | undefined;
  if (!textoMemo) throw new Error("não é uma compra do Vento Cortado (memo ausente)");

  // "vento-cortado v1 | CJU_BASAR | 2026-10-08 07:30-15:30 | 0.5 MWh | PLD 57.31 R$/MWh | PTAX 4.9935 | 70/25/5"
  const m = textoMemo.match(/^vento-cortado v1 \| (\S+) \| (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})-(\d{2}:\d{2}) \| ([\d.]+) MWh \| PLD ([\d.]+) R\$\/MWh \| PTAX ([\d.]+) \|/);
  if (!m) throw new Error("memo de compra em formato inesperado");

  const papelPorConta = new Map(DESTINATARIOS.map((d) => [contaUsdc(d.carteira).toBase58(), d.papel]));
  const partes: Partial<Record<Papel, bigint>> = {};
  for (const i of instrucoes) {
    const info = i.parsed?.info;
    if (i.program !== "spl-token" || i.parsed?.type !== "transferChecked" || info.mint !== USDC_DEVNET.toBase58()) continue;
    const papel = papelPorConta.get(info.destination);
    if (papel) partes[papel] = (partes[papel] ?? BigInt(0)) + BigInt(info.tokenAmount.amount);
  }
  if (DESTINATARIOS.some((d) => partes[d.papel] === undefined)) throw new Error("faltam transferências para usina, operador ou plataforma");
  const total = DESTINATARIOS.reduce((s, d) => s + partes[d.papel]!, BigInt(0));
  const base = BigInt(10000);
  if (partes.usina !== (total * BigInt(7000)) / base || partes.operador !== (total * BigInt(2500)) / base) {
    throw new Error("a divisão não é 70/25/5");
  }

  const usd = (x: bigint) => Number(x) / 1e6;
  return {
    assinatura,
    comprador: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
    idUsina: m[1],
    data: m[2],
    inicio: m[3],
    fim: m[4],
    mwh: Number(m[5]),
    pld: Number(m[6]),
    ptax: Number(m[7]),
    totalUsdc: usd(total),
    partesUsdc: { usina: usd(partes.usina!), operador: usd(partes.operador!), plataforma: usd(partes.plataforma!) },
    horario: tx.blockTime ?? null,
    memo: textoMemo,
  };
}

// ---------- Fases 1 e 2 ----------

export type Registro = { assinatura: string; memo: string; horario: number | null; explorador: string };

type Veredito = { resultado: string; fracao_com_corte: number; energia_cortada_mwh: number; razoes: Record<string, number>; fonte: string };

/** Veredito do ONS para a janela da compra, se o dado já foi publicado (e processado pelo atlas.py). */
export function veredito(c: Compra): (Veredito & { sha256: string }) | null {
  const v = (veredictos.janelas as Record<string, Veredito>)[`${c.idUsina}|${c.data}|${c.inicio}-${c.fim}`];
  if (!v) return null;
  return { ...v, sha256: (veredictos.fontes_ons as Record<string, string>)[v.fonte] ?? "" };
}

/** Procura no histórico da carteira da plataforma o primeiro registro cujo memo contém todos os trechos. */
async function acharNaPlataforma(c: Connection, ...trechos: string[][]): Promise<(Registro | null)[]> {
  const plataforma = DESTINATARIOS.find((d) => d.papel === "plataforma")!.carteira;
  const lista = await c.getSignaturesForAddress(plataforma, { limit: 1000 }, "confirmed");
  return trechos.map((t) => {
    const s = lista.findLast((x) => !x.err && t.every((parte) => x.memo?.includes(parte))); // a lista vem do mais novo ao mais velho
    return s
      ? { assinatura: s.signature, memo: s.memo!.replace(/^\[\d+\]\s*/, ""), horario: s.blockTime ?? null, explorador: explorador(s.signature) }
      : null;
  });
}

/** Procura o recibo e o carimbo já gravados para esta compra (histórico da carteira da plataforma). */
export async function registros(c: Connection, assinaturaCompra: string) {
  const compra = `compra ${assinaturaCompra}`;
  const [recibo, carimbo] = await acharNaPlataforma(c, [PREFIXO_RECIBO, compra], [PREFIXO_CARIMBO, compra]);
  return { recibo, carimbo };
}

async function enviar(c: Connection, tx: Transaction, assinantes: Keypair[]) {
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = assinantes[0].publicKey;
  tx.sign(...assinantes);
  const assinatura = await c.sendRawTransaction(tx.serialize());
  const r = await c.confirmTransaction({ signature: assinatura, blockhash, lastValidBlockHeight }, "confirmed");
  if (r.value.err) throw new Error(`falha ao gravar: ${JSON.stringify(r.value.err)}`);
  return assinatura;
}

/** Fase 1: usina e operador assinam o recibo da compra (a plataforma paga a taxa). */
export async function emitirRecibo(c: Connection, k: Record<Papel, Keypair>, compra: Compra): Promise<Registro> {
  const texto =
    `${PREFIXO_RECIBO} | compra ${compra.assinatura} | ${compra.idUsina} | ${compra.data} ${compra.inicio}-${compra.fim}` +
    ` | ${compra.mwh} MWh | ${compra.totalUsdc} USDC | usina e operador reconhecem a venda` +
    ` | demo: execucao fora da usina, nao absorve energia cortada`;
  const tx = new Transaction().add(memo(texto, k.usina.publicKey, k.operador.publicKey));
  const assinatura = await enviar(c, tx, [k.plataforma, k.usina, k.operador]);
  return { assinatura, memo: texto, horario: Math.floor(Date.now() / 1000), explorador: explorador(assinatura) };
}

/**
 * O veredito como foi carimbado (lido do memo). Vale mais que o veredictos.json atual: se o ONS republicar
 * o mês, o arquivo e o SHA-256 citados no carimbo continuam sendo os que foram usados.
 */
export function vereditoDoCarimbo(memoCarimbo: string): (Veredito & { sha256: string }) | null {
  const m = memoCarimbo.match(/\| (confirmado|errado) \| (\d+)% das meias-horas com corte \| (\d+) MWh cortados \| ONS (\S+) \| sha256 ([0-9a-f]{64})/);
  if (!m) return null;
  return { resultado: m[1], fracao_com_corte: Number(m[2]) / 100, energia_cortada_mwh: Number(m[3]), razoes: {}, fonte: m[4], sha256: m[5] };
}

// ---------- Previsão publicada ----------

export type Previsao = { dados_ate: string; periodo: string; arquivo: string; sha256: string };

/** Registro na Solana do SHA-256 desta previsão, se já foi gravado. */
export async function registroPrevisao(c: Connection, p: Previsao): Promise<Registro | null> {
  return (await acharNaPlataforma(c, [PREFIXO_PREVISAO, `sha256 ${p.sha256}`]))[0];
}

/** Grava o SHA-256 do arquivo da previsão (assinado pela plataforma). */
export async function emitirPrevisao(c: Connection, k: Record<Papel, Keypair>, p: Previsao): Promise<Registro> {
  const texto = `${PREFIXO_PREVISAO} | dados ONS ate ${p.dados_ate} | janelas ${p.periodo} | sha256 ${p.sha256} | ${p.arquivo}`;
  const assinatura = await enviar(c, new Transaction().add(memo(texto, k.plataforma.publicKey)), [k.plataforma]);
  return { assinatura, memo: texto, horario: Math.floor(Date.now() / 1000), explorador: explorador(assinatura) };
}

/** Fase 2: a plataforma (oráculo v1) carimba o veredito do ONS, citando o arquivo oficial e seu SHA-256. */
export async function emitirCarimbo(c: Connection, k: Record<Papel, Keypair>, compra: Compra, v: NonNullable<ReturnType<typeof veredito>>) {
  const texto =
    `${PREFIXO_CARIMBO} | compra ${compra.assinatura} | ${v.resultado}` +
    ` | ${Math.round(v.fracao_com_corte * 100)}% das meias-horas com corte | ${v.energia_cortada_mwh} MWh cortados` +
    ` | ONS ${v.fonte} | sha256 ${v.sha256}`;
  const tx = new Transaction().add(memo(texto, k.plataforma.publicKey));
  const assinatura = await enviar(c, tx, [k.plataforma]);
  return { assinatura, memo: texto, horario: Math.floor(Date.now() / 1000), explorador: explorador(assinatura) } satisfies Registro;
}
