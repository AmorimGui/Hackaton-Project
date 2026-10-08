// GET  /api/previsao  → a previsão publicada agora e o registro do seu SHA-256 na Solana (se já existe)
// POST /api/previsao  → grava esse registro, se ainda não existe (chamado pela atualização diária)
//
// O registro prova que o arquivo de janelas previstas já existia naquele momento, antes dos dias previstos.
// Qualquer pessoa pode baixar o arquivo do site e conferir o SHA-256.
import { connection } from "next/server";
import previsao from "@/data/previsao_atual.json";
import { chaves, conexao, emitirPrevisao, registroPrevisao } from "@/lib/recibo";

export const maxDuration = 60;

export async function GET() {
  await connection(); // sempre lê a blockchain na hora
  return Response.json({ previsao, registro: await registroPrevisao(conexao(), previsao) });
}

export async function POST() {
  const c = conexao();
  let registro = await registroPrevisao(c, previsao);
  if (!registro) {
    const k = chaves();
    if (!k) return Response.json({ erro: "chaves não configuradas", previsao, registro }, { status: 503 });
    try {
      registro = await emitirPrevisao(c, k, previsao);
    } catch (e) {
      return Response.json({ erro: `falha ao gravar na blockchain: ${(e as Error).message}`, previsao, registro }, { status: 502 });
    }
  }
  return Response.json({ previsao, registro });
}
