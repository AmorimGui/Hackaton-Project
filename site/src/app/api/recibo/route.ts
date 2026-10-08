// POST /api/recibo  { "assinatura": "<transação de compra>" }
//
// Confere a compra na blockchain, emite o que faltar (recibo da fase 1 e, se o ONS já publicou
// o dado da janela, o carimbo da fase 2) e devolve tudo. Pode ser chamado de novo sem duplicar nada.
import { assinaturaValida, chaves, conexao, emitirCarimbo, emitirRecibo, lerCompra, registros, veredito } from "@/lib/recibo";
import { explorador } from "@/lib/solana";

export const maxDuration = 60;

export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const assinatura = corpo?.assinatura;
  if (!assinaturaValida(assinatura)) return Response.json({ erro: "assinatura inválida" }, { status: 400 });

  const c = conexao();
  let compra;
  try {
    compra = await lerCompra(c, assinatura);
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 422 });
  }

  const v = veredito(compra);
  let { recibo, carimbo } = await registros(c, assinatura);
  const k = chaves();
  try {
    if (k && !recibo) recibo = await emitirRecibo(c, k, compra);
    if (k && recibo && !carimbo && v) carimbo = await emitirCarimbo(c, k, compra, v);
  } catch (e) {
    const msg = (e as Error).message;
    const semSol = /no record of a prior credit|insufficient/i.test(msg);
    return Response.json(
      {
        erro: semSol ? "sem_sol_plataforma" : `falha ao gravar na blockchain: ${msg}`,
        compra: { ...compra, explorador: explorador(assinatura) },
        recibo,
        carimbo,
        veredito: v,
        aguardando_ons: !v,
        chaves_configuradas: !!k,
      },
      { status: 502 },
    );
  }

  return Response.json({
    compra: { ...compra, explorador: explorador(assinatura) },
    recibo,
    carimbo,
    veredito: v,
    aguardando_ons: !v,
    chaves_configuradas: !!k,
  });
}
