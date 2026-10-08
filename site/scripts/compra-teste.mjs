// Compra de TESTE pelo terminal, sem Phantom, usando o mesmo código de pagamento do site
// (src/lib/solana.ts). Depois pede o recibo e o carimbo à API do site e mostra o link de verificação.
//
// Uso (na pasta site/):
//   node scripts/compra-teste.mjs CJU_BASAR 2026-09-29            # 0.1 MWh, site publicado
//   node scripts/compra-teste.mjs CJU_BASAR 2026-09-29 0.5 http://localhost:3000
// (o Node avisa que lê o solana.ts como módulo ES; o aviso é inofensivo)
//
// O comprador é uma carteira de teste em ../../carteiras-teste/comprador.json (fora do Git; criada
// na primeira vez). Se faltar SOL ou USDC, ele recebe um pouco da plataforma e da usina, que também
// são carteiras de teste. Só devnet.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { RPC, contaUsdc, criarContaSeFaltar, explorador, montarTransacao, precificar, saldos, simular, transferir, usdc } from "../src/lib/solana.ts";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CHAVES = path.resolve(AQUI, "..", "..", "..", "carteiras-teste");
const [idUsina, data, mwhTexto = "0.1", site = "https://hackaton-project-liart.vercel.app"] = process.argv.slice(2);
if (!idUsina || !data) {
  console.error("uso: node scripts/compra-teste.mjs <ID_USINA> <AAAA-MM-DD> [MWh] [URL do site]");
  process.exit(1);
}

// ---------- Janela e preço (os mesmos dados que o site mostra) ----------

const atlas = JSON.parse(fs.readFileSync(path.join(AQUI, "..", "src", "data", "atlas.json"), "utf8"));
const usina = atlas.usinas.find((u) => u.id === idUsina);
if (!usina) throw new Error(`usina ${idUsina} não está no atlas`);
const janela = [...usina.recentes, ...usina.proximas].find((j) => j.data === data);
if (!janela) throw new Error(`nenhuma janela de ${idUsina} em ${data}`);
const compra = {
  idUsina,
  data,
  inicio: janela.inicio,
  fim: janela.fim,
  mwh: Number(mwhTexto),
  pldRsMwh: Math.round(janela.pld_medio_rs_mwh * 100) / 100, // igual ao modal de compra
  ptax: atlas.cambio.ptax_venda,
};
const { total } = precificar(compra);
console.log(`${usina.nome} · ${data} ${janela.inicio}-${janela.fim} · ${compra.mwh} MWh · ${usdc(total)} USDC (ONS: ${janela.resultado_ons})`);

// ---------- Carteiras de teste ----------

const ler = (papel) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(CHAVES, `${papel}.json`), "utf8"))));
const arquivoComprador = path.join(CHAVES, "comprador.json");
if (!fs.existsSync(arquivoComprador)) fs.writeFileSync(arquivoComprador, JSON.stringify(Array.from(Keypair.generate().secretKey)));
const comprador = ler("comprador");
const conexao = new Connection(RPC, "confirmed");

async function enviar(tx, assinantes, blockhash, lastValidBlockHeight) {
  tx.sign(...assinantes);
  const assinatura = await conexao.sendRawTransaction(tx.serialize());
  const r = await conexao.confirmTransaction({ signature: assinatura, blockhash, lastValidBlockHeight }, "confirmed");
  if (r.value.err) throw new Error(`transação falhou: ${JSON.stringify(r.value.err)}`);
  return assinatura;
}

// Abastece o comprador se faltar SOL (taxas) ou USDC (pagamento)
const saldo = await saldos(conexao, comprador.publicKey);
const faltaSol = saldo.sol < 0.01;
const faltaUsdc = saldo.usdc < total;
if (faltaSol || faltaUsdc) {
  const plataforma = ler("plataforma");
  const doadoraUsdc = ler("usina");
  const tx = new Transaction();
  if (faltaSol) tx.add(SystemProgram.transfer({ fromPubkey: plataforma.publicKey, toPubkey: comprador.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }));
  if (faltaUsdc) {
    tx.add(
      criarContaSeFaltar(plataforma.publicKey, comprador.publicKey),
      transferir(contaUsdc(doadoraUsdc.publicKey), contaUsdc(comprador.publicKey), doadoraUsdc.publicKey, total * BigInt(2)),
    );
  }
  const { blockhash, lastValidBlockHeight } = await conexao.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = plataforma.publicKey;
  const assinantes = faltaUsdc ? [plataforma, doadoraUsdc] : [plataforma];
  await enviar(tx, assinantes, blockhash, lastValidBlockHeight);
  console.log(`comprador abastecido (${faltaSol ? "SOL " : ""}${faltaUsdc ? "USDC" : ""})`);
}

// ---------- Pagamento (mesma transação que a Phantom assinaria) ----------

const { tx, blockhash, lastValidBlockHeight } = await montarTransacao(conexao, comprador.publicKey, compra);
const problema = await simular(conexao, tx);
if (problema) throw new Error(`a simulação falhou: ${problema}`);
const assinatura = await enviar(tx, [comprador], blockhash, lastValidBlockHeight);
console.log(`pagamento: ${explorador(assinatura)}`);

// ---------- Recibo e carimbo (API do site) ----------

const resposta = await fetch(`${site}/api/recibo`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ assinatura }),
}).then((r) => r.json());
if (resposta.erro) console.log(`API: ${resposta.erro}`);
console.log(`recibo:    ${resposta.recibo?.explorador ?? "—"}`);
console.log(`carimbo:   ${resposta.carimbo?.explorador ?? (resposta.aguardando_ons ? "aguardando o ONS" : "—")}`);
if (resposta.veredito) console.log(`veredito:  ${resposta.veredito.resultado} (${resposta.veredito.fonte})`);
console.log(`verificar: ${site}/verify?tx=${assinatura}`);
