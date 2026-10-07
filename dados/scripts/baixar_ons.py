"""Baixa do portal de dados abertos do ONS os arquivos mensais de constrained-off
(eólica e fotovoltaica), em Parquet. Licença dos dados: CC-BY, fonte ONS.

Uso:
    python dados/scripts/baixar_ons.py [--destino PASTA] [--inicio AAAA_MM] [--fim AAAA_MM]

Padrão: ../dados-ons/brutos (ao lado do repositório), de 2025_01 até 2026_09.
"""

import argparse
import urllib.error
import urllib.request
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
    p.add_argument("--fim", default="2026_09")
    args = p.parse_args()

    args.destino.mkdir(parents=True, exist_ok=True)
    for am in meses(args.inicio, args.fim):
        for pasta, prefixo in TIPOS:
            nome = f"{prefixo}_{am}.parquet"
            arquivo = args.destino / nome
            if arquivo.exists():
                continue
            try:
                with urllib.request.urlopen(f"{BASE}/{pasta}/{nome}") as resp:
                    arquivo.write_bytes(resp.read())
                print(f"baixado: {nome}")
            except urllib.error.HTTPError as e:
                print(f"não encontrado: {nome} ({e.code})")
    print(f"pronto: {args.destino}")


if __name__ == "__main__":
    main()
