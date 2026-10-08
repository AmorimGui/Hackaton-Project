"""Trabalho de demonstração do operador de computação (Etapa 5): por que esta usina é cortada?

Um modelo pequeno de IA (embeddings multilíngues em ONNX, roda na CPU, sem GPU) classifica os motivos
que o ONS registrou para cada corte da usina comprada nas 8 semanas usadas pela previsão da janela,
e soma a energia cortada por causa, em linguagem simples.

Classificação "few-shot": cada texto do ONS recebe a causa do exemplo rotulado mais parecido.
Uma regra de palavras-chave serve de conferência independente (a concordância vai no resultado).

Reprodutível: a entrada sai dos arquivos abertos do ONS e o resultado não guarda horários nem
pontuações do modelo, então quem rodar de novo com os mesmos arquivos chega ao mesmo SHA-256.

Uso (na raiz do repositório):
    python operador/trabalho.py ID_USINA AAAA-MM-DD [--brutos PASTA] [--modelos PASTA]
"""

import argparse
import hashlib
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
MODELO = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
VERSAO = "causas-ons v1"
LIMIAR_CORTE_MW = 1.0
ATRASO_DIAS, DIAS_PERFIL = 7, 56  # o mesmo período que a previsão da janela usou (dados/scripts/etapa1.py)

CAUSAS = {
    "frequencia": {"en": "Energy surplus: system frequency control", "pt": "Sobra de energia: controle de frequência do sistema"},
    "exportacao": {"en": "Export limit between regions (Northeast → Southeast/North)", "pt": "Limite de exportação entre regiões (Nordeste → Sudeste/Norte)"},
    "linha": {"en": "Transmission line limit", "pt": "Limite de linha de transmissão"},
    "transformador": {"en": "Transformer or substation loading", "pt": "Carregamento de transformador ou subestação"},
    "contingencia": {"en": "Equipment outage or protection scheme", "pt": "Perda de equipamento ou esquema de proteção"},
    "sem_descricao": {"en": "No description from the ONS", "pt": "Sem descrição do ONS"},
}

# Exemplos rotulados à mão, tirados dos próprios textos do ONS
EXEMPLOS = {
    "frequencia": ["Controle de frequência do SIN."],
    "exportacao": [
        "Controle do fluxo: FNESE # Fluxo Nordeste/Sudeste - Conforme SGI 67.632-25",
        "Controle do fluxo: FNS_FNESE # Somatório de FNS+FNESE",
        "Controle do fluxo: FNEN # Fluxo Nordeste/Norte - Conforme SGI 53.936-26",
    ],
    "linha": [
        "Controle de inequação: LIMITAÇÃO DA TRANSMISSÃO NA LT 500 KV AÇU III / JAGUARUANA II – C1(V7) - IO-ON.NE.5NE",
        "Controle de inequação: CONTROLE DE CARREGAMENTO DA LT 230 KV IRECÊ / MORRO DO CHAPÉU II – C1(S5)",
        "Controle do fluxo: FPOTPPA # LT 500kV Poções III/Padre Paraíso - Conforme SGI 752-26",
    ],
    "transformador": [
        "Controle de inequação: CONTROLE DE CARREGAMENTO DA TRANSFORMAÇÃO 500/345 KV DA SE RIO NOVO DO SUL - IO-ON.SE.5RJ",
        "Controle de carregamento do TR 345/ 138 kV da SE Campos 2, conforme SGI 61.162-25",
        "Controle de inequação: CONTROLE DE CARREGAMENTO DO TRANSFORMADOR 230 / 69 KV – 50 MVA – T1 DA SE BOM JESUS DA LAPA",
    ],
    "contingencia": [
        "Controle de inequação: Perda da LT 345 kV Campos / Rio Novo do Sul C1 (2.2) - SGI 61.162-25",
        "Atuação do SEP 5.255.02 - Esquema de corte de geração na SE Açu III - Perda de LT",
        "SIPER Nº 81/2026",
    ],
}


def regra(texto: str) -> str:
    """Conferência por palavras-chave (independente do modelo)."""
    u = texto.upper()
    if "FREQU" in u:
        return "frequencia"
    if "FLUXO" in u or "FNESE" in u or "FNS" in u or "FNEN" in u:
        return "exportacao"
    if "SEP " in u or "SIPER" in u or u.startswith("PERDA") or "ATUAÇÃO" in u or "INEQUAÇÃO: PERDA" in u:
        return "contingencia"
    if "TRANSFORMA" in u or " TR " in u:
        return "transformador"
    return "linha"


def ler_entrada(brutos: Path, id_usina: str, dia: date) -> tuple[pd.DataFrame, str, str]:
    """Meias-horas com corte da usina no período da previsão: [dia - 63, dia - 7)."""
    ini, fim = dia - timedelta(days=ATRASO_DIAS + DIAS_PERFIL), dia - timedelta(days=ATRASO_DIAS)
    meses = sorted({f"{d:%Y_%m}" for d in (ini + timedelta(days=i) for i in range((fim - ini).days))})
    partes = []
    for am in meses:
        for tipo in ("EOLICA", "FOTOVOLTAICA"):
            arq = brutos / f"RESTRICAO_COFF_{tipo}_{am}.parquet"
            if arq.exists():
                d = pd.read_parquet(arq, columns=["id_ons", "din_instante", "val_geracaonaorealizadaapurada", "cod_razaorestricao", "dsc_restricao"])
                partes.append(d[d["id_ons"] == id_usina])
    if not partes:
        raise SystemExit(f"sem dados do ONS para {id_usina} em {meses} (rode dados/scripts/baixar_ons.py)")
    d = pd.concat(partes)
    d = d[(d["din_instante"] >= pd.Timestamp(ini)) & (d["din_instante"] < pd.Timestamp(fim))]
    d = d[d["val_geracaonaorealizadaapurada"].fillna(0) >= LIMIAR_CORTE_MW].sort_values("din_instante")
    return d, ini.isoformat(), (fim - timedelta(days=1)).isoformat()


def classificar(textos: list[str], modelos: Path) -> list[str]:
    from fastembed import TextEmbedding  # só aqui: o resto do script não precisa do modelo

    m = TextEmbedding(MODELO, cache_dir=str(modelos))
    rotulos = [c for c, v in EXEMPLOS.items() for _ in v]
    ex = np.array(list(m.embed([x for v in EXEMPLOS.values() for x in v])))
    tx = np.array(list(m.embed(textos, batch_size=32)))
    ex /= np.linalg.norm(ex, axis=1, keepdims=True)
    tx /= np.linalg.norm(tx, axis=1, keepdims=True)
    return [rotulos[i] for i in (tx @ ex.T).argmax(axis=1)]


def rodar(id_usina: str, dia: date, brutos: Path, modelos: Path) -> tuple[dict, str, str]:
    """Roda o trabalho. Devolve (resultado, sha256 da entrada, sha256 do resultado)."""
    d, ini, fim = ler_entrada(brutos, id_usina, dia)
    # Entrada canônica: as meias-horas usadas, em CSV (qualquer pessoa reconstrói dos arquivos do ONS)
    linhas = ["din_instante;gnra_mw;cod_razao;dsc_restricao"] + [
        f"{r.din_instante:%Y-%m-%d %H:%M};{r.val_geracaonaorealizadaapurada:.3f};{r.cod_razaorestricao or ''};{(r.dsc_restricao or '').strip()}"
        for r in d.itertuples()
    ]
    sha_entrada = hashlib.sha256(("\n".join(linhas) + "\n").encode("utf-8")).hexdigest()

    textos = sorted({t.strip() for t in d["dsc_restricao"].dropna()})
    causa_de = dict(zip(textos, classificar(textos, modelos))) if textos else {}
    d = d.assign(causa=[causa_de.get((t or "").strip(), "sem_descricao") for t in d["dsc_restricao"]],
                 mwh=d["val_geracaonaorealizadaapurada"] * 0.5)
    total = float(d["mwh"].sum())
    causas = []
    for causa, g in sorted(d.groupby("causa"), key=lambda x: -x[1]["mwh"].sum()):
        exemplo = g["dsc_restricao"].dropna().str.strip().value_counts()
        causas.append({
            "causa": causa, **CAUSAS[causa],
            "energia_mwh": round(float(g["mwh"].sum())),
            "fracao_energia": round(float(g["mwh"].sum()) / total, 3) if total else 0,
            "meias_horas": int(len(g)),
            "texto_mais_comum": exemplo.index[0] if len(exemplo) else None,
        })
    concorda = [causa_de[t] == regra(t) for t in textos]
    peso = d["dsc_restricao"].dropna().str.strip().value_counts()
    resultado = {
        "trabalho": VERSAO,
        "usina": id_usina,
        "janela": dia.isoformat(),
        "periodo_dos_dados": f"{ini} a {fim}",
        "modelo": f"{MODELO} (ONNX, CPU)",
        "metodo": "few-shot: cada texto do ONS recebe a causa do exemplo rotulado mais parecido",
        "meias_horas_com_corte": int(len(d)),
        "energia_cortada_mwh": round(total),
        "causas": causas,
        "textos_classificados": [{"texto": t, "causa": causa_de[t], "meias_horas": int(peso.get(t, 0))} for t in textos],
        "conferencia_palavras_chave": {
            "textos_iguais": f"{sum(concorda)} de {len(textos)}",
            "fracao_meias_horas_iguais": round(sum(int(peso.get(t, 0)) for t, ok in zip(textos, concorda) if ok) / (int(peso.sum()) or 1), 3),
        },
        "entrada_sha256": sha_entrada,
    }
    sha_resultado = hashlib.sha256(texto_canonico(resultado).encode("utf-8")).hexdigest()
    return resultado, sha_entrada, sha_resultado


def texto_canonico(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # terminal do Windows
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("usina")
    ap.add_argument("data", type=date.fromisoformat)
    ap.add_argument("--brutos", type=Path, default=RAIZ.parent / "dados-ons" / "brutos")
    ap.add_argument("--modelos", type=Path, default=RAIZ.parent / "modelos")
    a = ap.parse_args()
    resultado, sha_entrada, sha_resultado = rodar(a.usina, a.data, a.brutos, a.modelos)
    for c in resultado["causas"]:
        print(f"{c['fracao_energia']:>6.1%}  {c['energia_mwh']:>7} MWh  {c['pt']}")
    print(f"conferência por palavras-chave: {resultado['conferencia_palavras_chave']}")
    print(f"entrada sha256 {sha_entrada}\nresultado sha256 {sha_resultado}")


if __name__ == "__main__":
    main()
