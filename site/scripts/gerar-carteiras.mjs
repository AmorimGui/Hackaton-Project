// Gera as carteiras de TESTE (devnet) da usina, do operador e da plataforma.
//
// As chaves secretas ficam FORA do repositório, em ../../carteiras-teste/ (ao lado de dados-ons).
// Só os endereços públicos vão para o código (src/lib/solana.ts).
// Nunca use estas carteiras na mainnet.
//
// Uso (na pasta site/): node scripts/gerar-carteiras.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.resolve(AQUI, "..", "..", "..", "carteiras-teste");
fs.mkdirSync(DESTINO, { recursive: true });

for (const papel of ["usina", "operador", "plataforma"]) {
  const arquivo = path.join(DESTINO, `${papel}.json`);
  let par;
  if (fs.existsSync(arquivo)) {
    par = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(arquivo, "utf8"))));
  } else {
    par = Keypair.generate();
    fs.writeFileSync(arquivo, JSON.stringify(Array.from(par.secretKey)));
  }
  console.log(`${papel.padEnd(10)} ${par.publicKey.toBase58()}`);
}
console.log(`\nchaves secretas em: ${DESTINO} (fora do Git)`);
