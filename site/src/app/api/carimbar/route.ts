// POST /api/carimbar → emite recibos e carimbos que estiverem faltando para as compras já feitas.
//
// Chamado pela atualização diária, depois que o site é publicado com os dados novos do ONS: as compras
// cujas janelas acabaram de ser publicadas recebem o carimbo sem ninguém precisar abrir a página delas.
// Não duplica nada: o que já foi gravado é encontrado no histórico da plataforma.
import { carimbarPendentes, chaves, conexao } from "@/lib/recibo";

export const maxDuration = 60;

export async function POST() {
  const k = chaves();
  if (!k) return Response.json({ erro: "chaves não configuradas" }, { status: 503 });
  return Response.json(await carimbarPendentes(conexao(), k, 40_000));
}
