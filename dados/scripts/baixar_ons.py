"""Baixa do portal de dados abertos do ONS os arquivos mensais de constrained-off
(eólica e fotovoltaica), em Parquet. Licença dos dados: CC-BY, fonte ONS.

Uso:
    python dados/scripts/baixar_ons.py [--destino PASTA] [--inicio AAAA_MM] [--fim AAAA_MM] [--recentes N]

Padrão: ../dados-ons/brutos (ao lado do repositório), de 2025_01 até o mês atual.

O ONS publica o mês corrente dia a dia (com cerca de um dia de atraso) e às vezes republica
meses anteriores. Por isso os N meses mais recentes (padrão: 2) são sempre conferidos de novo;
os mais antigos só são baixados se faltarem.
"""

import argparse
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
BASE = "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset"
TIPOS = [
    ("restricao_coff_eolica_tm", "RESTRICAO_COFF_EOLICA"),
    ("restricao_coff_fotovoltaica_tm", "RESTRICAO_COFF_FOTOVOLTAICA"),
]


def meses(inicio: str, fim: str) -> list[str]:
    ano, mes = map(int, inicio.split("_"))
    ano_fim, mes_fim = map(int, fim.split("_"))
    lista = []
    while (ano, mes) <= (ano_fim, mes_fim):
        lista.append(f"{ano}_{mes:02d}")
        mes += 1
        if mes > 12:
            ano, mes = ano + 1, 1
    return lista


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--destino", type=Path, default=RAIZ.parent / "dados-ons" / "brutos")
    p.add_argument("--inicio", default="2025_01")
    p.add_argument("--fim", default=f"{date.today():%Y_%m}")
    p.add_argument("--recentes", type=int, default=2, help="quantos meses do fim conferir de novo")
    args = p.parse_args()

    args.destino.mkdir(parents=True, exist_ok=True)
    lista = meses(args.inicio, args.fim)
    for am in lista:
        conferir = am in lista[-args.recentes:]
        for pasta, prefixo in TIPOS:
            nome = f"{prefixo}_{am}.parquet"
            arquivo = args.destino / nome
            if arquivo.exists() and not conferir:
                continue
            try:
                with urllib.request.urlopen(f"{BASE}/{pasta}/{nome}") as resp:
                    novo = resp.read()
            except urllib.error.HTTPError as e:
                print(f"não encontrado: {nome} ({e.code})")
                continue
            if arquivo.exists() and arquivo.read_bytes() == novo:
                continue
            print(f"{'atualizado' if arquivo.exists() else 'baixado'}: {nome}")
            arquivo.write_bytes(novo)
    print(f"pronto: {args.destino}")


if __name__ == "__main__":
    main()
