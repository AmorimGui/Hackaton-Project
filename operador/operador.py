"""Operador de computação de demonstração (Etapa 5): roda o trabalho dentro da janela comprada
e grava a prova na Solana (devnet).

Em ciclo:
  1. lê na Solana as compras de janelas (histórico da carteira do operador, que recebe 25% de cada uma);
  2. confere cada compra no site (/api/recibo, que também garante o recibo da fase 1);
  3. espera a janela começar (horário de Brasília); se ela já passou, roda como "replay";
  4. grava na Solana o início, roda o trabalho (operador/trabalho.py) e grava o fim, com o SHA-256
     da entrada e do resultado, a duração e a energia estimada do computador;
  5. publica o resultado em site/public/execucoes/<compra>.json (commit e push; a Vercel publica).

Os horários dos dois registros na Solana (horário do bloco) mostram se o trabalho rodou dentro da janela.
Demo: roda num notebook, não na usina, então não absorve energia cortada.

Uso (na raiz do repositório, com o ambiente do README e operador/requirements.txt):
    python operador/operador.py             # fica rodando e esperando janelas; Ctrl+C para parar
    python operador/operador.py --uma-vez   # processa o que já pode rodar e sai
Opções: --watts 30 (potência declarada do computador), --sem-git (não publica o resultado), --site URL
"""

import argparse
import base64
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.transaction import Transaction

import trabalho

RAIZ = Path(__file__).resolve().parents[1]
RPC = "https://api.devnet.solana.com"
SITE = "https://nomos-energy.vercel.app"
OPERADOR = Pubkey.from_string("8ufcDYFKXRjNsVa4PCzvwBa55y73NqAFmvMPVoPnx9BZ")  # o mesmo de site/src/lib/solana.ts
MEMO = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
CHAVE = RAIZ.parent / "carteiras-teste" / "operador.json"  # fora do Git
SAIDA = RAIZ / "site" / "public" / "execucoes"
BRT = timezone(timedelta(hours=-3))  # o Brasil não tem horário de verão desde 2019
PREFIXO_COMPRA = "vento-cortado v1 |"
PREFIXO = "vento-cortado execucao v1"


def rpc(metodo: str, *params):
    corpo = json.dumps({"jsonrpc": "2.0", "id": 1, "method": metodo, "params": list(params)}).encode()
    for tentativa in range(5):
        try:
            req = urllib.request.Request(RPC, corpo, {"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.loads(r.read())
            if "error" in resp:
                raise RuntimeError(f"{metodo}: {resp['error']}")
            return resp["result"]
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 * (tentativa + 1))
    raise RuntimeError(f"RPC indisponível ({metodo})")


def gravar_memo(par: Keypair, texto: str) -> str:
    """Envia um memo assinado (e pago) pelo operador e espera a confirmação. Devolve a assinatura."""
    blockhash = Hash.from_string(rpc("getLatestBlockhash", {"commitment": "confirmed"})["value"]["blockhash"])
    instrucao = Instruction(MEMO, texto.encode("utf-8"), [AccountMeta(par.pubkey(), True, False)])
    tx = Transaction([par], Message.new_with_blockhash([instrucao], par.pubkey(), blockhash), blockhash)
    assinatura = rpc("sendTransaction", base64.b64encode(bytes(tx)).decode(), {"encoding": "base64", "preflightCommitment": "confirmed"})
    for _ in range(40):
        estado = rpc("getSignatureStatuses", [assinatura])["value"][0]
        if estado and estado.get("confirmationStatus") in ("confirmed", "finalized"):
            if estado.get("err"):
                raise RuntimeError(f"memo falhou: {estado['err']}")
            return assinatura
        time.sleep(1.5)
    raise RuntimeError("memo não confirmado em 60 s")


def site_json(caminho: str, corpo: dict) -> dict:
    req = urllib.request.Request(f"{SITE}{caminho}", json.dumps(corpo).encode(), {"content-type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")


def horario(dia: str, hhmm: str) -> datetime:
    """"24:00" vira 00:00 do dia seguinte."""
    h, m = map(int, hhmm.split(":"))
    return datetime.combine(date.fromisoformat(dia), datetime.min.time(), BRT) + timedelta(hours=h, minutes=m)


def pendentes() -> list[dict]:
    """Compras no histórico do operador que ainda não têm o registro de fim de execução."""
    lista = rpc("getSignaturesForAddress", str(OPERADOR), {"limit": 1000, "commitment": "confirmed"})
    feitas = {m.group(1) for x in lista if not x.get("err") and x.get("memo")
              for m in [re.search(rf"{PREFIXO} \| compra (\w+) \| fim \|", x["memo"])] if m}
    compras = [x["signature"] for x in reversed(lista) if not x.get("err") and PREFIXO_COMPRA in (x.get("memo") or "")]
    return [{"assinatura": s} for s in compras if s not in feitas]


def executar(par: Keypair, assinatura: str, watts: float, publicar_git: bool) -> None:
    resposta = site_json("/api/recibo", {"assinatura": assinatura})
    compra = resposta.get("compra")
    if not compra:
        print(f"  ignorada {assinatura[:8]}…: {resposta.get('erro', 'compra inválida')}")
        return
    agora = datetime.now(BRT)
    inicio_janela, fim_janela = horario(compra["data"], compra["inicio"]), horario(compra["data"], compra["fim"])
    if agora < inicio_janela:
        return  # ainda não começou: o laço espera
    modo = "ao vivo" if agora < fim_janela else "replay"
    alvo = f"{compra['idUsina']} {compra['data']} {compra['inicio']}-{compra['fim']}"
    print(f"  {modo}: {alvo} ({compra['mwh']} MWh) · compra {assinatura[:8]}…")

    base = f"{PREFIXO} | compra {assinatura}"
    sig_inicio = gravar_memo(par, f"{base} | inicio | {modo} | {trabalho.VERSAO} | {alvo}")
    t0, comeco = time.perf_counter(), datetime.now(BRT)
    resultado, sha_entrada, sha_resultado = trabalho.rodar(
        compra["idUsina"], date.fromisoformat(compra["data"]), RAIZ.parent / "dados-ons" / "brutos", RAIZ.parent / "modelos")
    duracao = time.perf_counter() - t0
    wh = watts * duracao / 3600
    SAIDA.mkdir(parents=True, exist_ok=True)
    arquivo = SAIDA / f"{assinatura}.json"
    arquivo.write_bytes(trabalho.texto_canonico(resultado).encode("utf-8"))
    sig_fim = gravar_memo(par, f"{base} | fim | {modo} | {duracao:.0f} s | ~{wh:.2f} Wh ({watts:g} W declarados) | "
                               f"entrada sha256 {sha_entrada} | resultado sha256 {sha_resultado}")
    principal = resultado["causas"][0] if resultado["causas"] else None
    print(f"    {duracao:.0f} s, ~{wh:.2f} Wh · " + (f"{principal['fracao_energia']:.0%} {principal['pt']}" if principal else "sem corte no período"))
    print(f"    início https://explorer.solana.com/tx/{sig_inicio}?cluster=devnet ({comeco:%H:%M:%S})")
    print(f"    fim    https://explorer.solana.com/tx/{sig_fim}?cluster=devnet")
    if publicar_git:
        publicar(arquivo, assinatura)


def publicar(arquivo: Path, assinatura: str) -> None:
    """Commit e push do resultado: a Vercel publica em /execucoes/<compra>.json."""
    def git(*args: str) -> bool:
        return subprocess.run(["git", "-C", str(RAIZ), *args], capture_output=True, text=True).returncode == 0

    ok = git("pull", "--rebase", "--autostash", "-q") and git("add", str(arquivo)) and \
        git("commit", "-q", "-m", f"Execução do operador: compra {assinatura[:8]}") and git("push", "-q")
    print("    resultado publicado no GitHub" if ok else f"    aviso: não consegui publicar; rode git push depois ({arquivo.name})")


def main() -> None:
    global SITE
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # terminal do Windows
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--uma-vez", action="store_true")
    ap.add_argument("--watts", type=float, default=30.0, help="potência declarada do computador sob carga")
    ap.add_argument("--sem-git", action="store_true")
    ap.add_argument("--site", default=SITE)
    a = ap.parse_args()
    SITE = a.site.rstrip("/")

    par = Keypair.from_bytes(bytes(json.loads(CHAVE.read_text())))
    if par.pubkey() != OPERADOR:
        raise SystemExit(f"{CHAVE} não é a carteira do operador")
    if rpc("getBalance", str(OPERADOR), {"commitment": "confirmed"})["value"] < 2_000_000:
        raise SystemExit(f"o operador está sem SOL para as taxas: envie 0.05 SOL (devnet) para {OPERADOR}")

    print(f"operador {OPERADOR} · {'uma vez' if a.uma_vez else 'esperando janelas (Ctrl+C para parar)'}")
    while True:
        try:
            for p in pendentes():
                executar(par, p["assinatura"], a.watts, not a.sem_git)
        except RuntimeError as e:
            print(f"  erro: {e}; tento de novo no próximo ciclo")
        if a.uma_vez:
            break
        time.sleep(60)


if __name__ == "__main__":
    main()
