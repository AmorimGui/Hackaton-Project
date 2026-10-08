"""Etapa 2 do Vento Cortado: prepara os dados do Atlas (site).

Junta as saídas da Etapa 1, a localização das usinas de destaque e o preço da
energia (PLD) num único arquivo que o site lê: site/src/data/atlas.json.
Também copia os dados abertos para download em site/public/data/.

Uso:
    python dados/scripts/atlas.py [--pld ARQUIVO_CSV]

Preço da energia: se houver um CSV de PLD horário da CCEE (dados abertos,
dataset pld_horario), usa o PLD do submercado Nordeste hora a hora. Sem ele,
usa o piso regulatório de 2026 (R$ 57,31/MWh), declarado como premissa: é o
valor em que o PLD do Nordeste costuma ficar nas horas de corte.
"""

import argparse
import csv
import json
import math
import shutil
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA_ETAPA1 = RAIZ / "dados" / "saida"
CONFIG = RAIZ / "dados" / "config"
SITE_DADOS = RAIZ / "site" / "src" / "data"
SITE_PUBLICO = RAIZ / "site" / "public" / "data"

PLD_PISO_2026 = 57.31  # R$/MWh, limite mínimo do PLD em 2026 (ANEEL)
KW_POR_GPU = 0.85
DIAS_RECENTES = 14  # janelas de ago–set mostradas por usina no site


def ler_json(nome: str):
    return json.loads((SAIDA_ETAPA1 / nome).read_text(encoding="utf-8"))


def arred(x: float, casas: int = 0) -> float:
    f = 10 ** casas
    return math.floor(x * f + 0.5) / f


def carregar_pld(arquivo: Path | None) -> tuple[dict[str, float], dict]:
    """Retorna {"AAAA-MM-DD HH": R$/MWh} do Nordeste e a descrição da fonte.

    Aceita o CSV de PLD horário da CCEE (colunas com submercado, data, hora e valor).
    """
    if arquivo is None or not arquivo.exists():
        return {}, {"tipo": "premissa", "valor_rs_mwh": PLD_PISO_2026,
                    "descricao": "piso regulatório do PLD em 2026; o PLD horário oficial da CCEE substitui esta premissa quando disponível"}
    precos: dict[str, float] = {}
    with arquivo.open(encoding="utf-8-sig") as f:
        amostra = f.read(4096)
        f.seek(0)
        leitor = csv.DictReader(f, dialect=csv.Sniffer().sniff(amostra, delimiters=";,"))
        cols = {c.lower(): c for c in leitor.fieldnames or []}
        c_sub = next(cols[c] for c in cols if "submercado" in c)
        c_data = next(cols[c] for c in cols if "dia" in c or "data" in c or "din" in c)
        c_hora = next(cols[c] for c in cols if "hora" in c)
        c_valor = next(cols[c] for c in cols if "pld" in c or "valor" in c)
        for linha in leitor:
            if "NORDESTE" not in linha[c_sub].upper() and linha[c_sub].strip().upper() != "NE":
                continue
            data = linha[c_data].strip()[:10]
            if "/" in data:  # dd/mm/aaaa
                d, m, a = data.split("/")
                data = f"{a}-{m}-{d}"
            hora = int(float(linha[c_hora]))
            precos[f"{data} {hora:02d}"] = float(linha[c_valor].replace(",", "."))
    return precos, {"tipo": "ccee_pld_horario", "arquivo": arquivo.name,
                    "descricao": "PLD horário oficial do submercado Nordeste (CCEE, dados abertos)"}


def valor_janela(janela: dict, mw_por_meia_hora: float | None, precos: dict[str, float]) -> float:
    """Valor de referência (R$) da energia esperada na janela, ao PLD de cada hora."""
    energia = janela["energia_esperada_mwh"]
    if not precos:
        return energia * PLD_PISO_2026
    ini = int(janela["inicio"][:2]) * 2 + (janela["inicio"][3:] == "30")
    fim = int(janela["fim"][:2]) * 2 + (janela["fim"][3:] == "30")
    n = max(1, fim - ini)
    total = 0.0
    for s in range(ini, fim):
        preco = precos.get(f"{janela['data']} {s // 2:02d}", PLD_PISO_2026)
        total += energia / n * preco
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pld", type=Path, default=None, help="CSV de PLD horário da CCEE (opcional)")
    args = ap.parse_args()
    if args.pld is None:
        candidatos = sorted((RAIZ.parent / "dados-ccee").glob("*.csv"))
        args.pld = candidatos[-1] if candidatos else None
    precos, fonte_pld = carregar_pld(args.pld)

    usinas = ler_json("usinas.json")
    resumo = ler_json("resumo.json")
    teste = ler_json("teste_retroativo.json")
    historico = ler_json("janelas_previstas_ago_set_2026.json")
    proximas = ler_json("janelas_previstas_proximos_dias.json")
    local = json.loads((CONFIG / "localizacao_usinas.json").read_text(encoding="utf-8"))["usinas"]

    destaque = [u for u in usinas if u["destaque"]]
    ids = {u["id"] for u in destaque}

    # Mapa de calor: chance de corte por mês (1–12) e hora (0–23), por usina de destaque
    calor: dict[str, list[list[float | None]]] = {i: [[None] * 24 for _ in range(12)] for i in ids}
    with (SAIDA_ETAPA1 / "chance_corte_por_usina_mes_hora.csv").open(encoding="utf-8") as f:
        for linha in csv.DictReader(f, delimiter=";"):
            if linha["id_ons"] in ids:
                calor[linha["id_ons"]][int(linha["mes"]) - 1][int(linha["hora"])] = float(linha["chance_corte"])

    def enriquecer(j: dict) -> dict:
        valor = valor_janela(j, None, precos)
        return {**j, "valor_referencia_rs": arred(valor), "pld_medio_rs_mwh": arred(valor / j["energia_esperada_mwh"], 2) if j["energia_esperada_mwh"] else None}

    # Janelas previstas (próximos dias): todas as usinas para contagem, detalhe das de destaque
    prox_destaque = [enriquecer(j) for j in proximas["janelas"] if j["id_ons"] in ids]
    por_dia = defaultdict(lambda: {"janelas": 0, "usinas": set(), "energia_esperada_mwh": 0})
    for j in proximas["janelas"]:
        d = por_dia[j["data"]]
        d["janelas"] += 1
        d["usinas"].add(j["id_ons"])
        d["energia_esperada_mwh"] += j["energia_esperada_mwh"]
    dias = sorted(por_dia)

    # Histórico ago–set: placar e as janelas mais recentes de cada usina de destaque
    hist_destaque = [j for j in historico["janelas"] if j["id_ons"] in ids]
    datas_hist = sorted({j["data"] for j in hist_destaque})
    recentes = set(datas_hist[-DIAS_RECENTES:])

    t_ago, t_set = teste["testes"]["agosto_2026"], teste["testes"]["setembro_2026"]
    modelos = ["taxa_media", "regra_fixa_8h_15h", "mesmo_mes_2025", "perfil_8_semanas", "combinado", "continuo_com_atraso"]

    def metr(x: dict) -> dict:
        return {k: x[k] for k in ("precisao", "cobertura", "energia_capturada", "ganho_sobre_taxa_media", "taxa_real_de_corte", "meias_horas_avaliadas")}

    plantas = []
    for u in destaque:
        hist_u = [j for j in hist_destaque if j["id_ons"] == u["id"]]
        conf = sum(j["resultado_ons"] == "confirmado" for j in hist_u)
        plantas.append({
            "id": u["id"], "nome": u["nome"], "uf": u["uf"], "tipo": u["tipo"], "agente": u["agente"],
            "ponto_conexao": u["ponto_conexao"], "capacidade_mw": u["disp_max_mw"],
            "local": local[u["id"]],
            "perdeu_jan_jul_2026_gwh": u["jan_jul_2026"]["energia_perdida_gwh"],
            "fracao_meias_horas_com_corte": u["jan_jul_2026"]["fracao_meias_horas_com_corte"],
            "calor": calor[u["id"]],
            "teste": {"agosto": metr(t_ago["usinas_destaque"][u["id"]]["continuo_com_atraso"]),
                      "setembro": metr(t_set["usinas_destaque"][u["id"]]["continuo_com_atraso"])},
            "placar": {"janelas": len(hist_u), "confirmadas": conf},
            "recentes": [j for j in hist_u if j["data"] in recentes],
            "proximas": [j for j in prox_destaque if j["id_ons"] == u["id"]],
        })

    oficial = resumo["corte_oficial_ons"]
    ne = oficial["nordeste_jan_ago_2026"]
    # Corte mensal do Nordeste (todas as usinas, ONS) para o gráfico de tendência
    mensal = defaultdict(lambda: {"eolica": 0.0, "solar": 0.0})
    with (SAIDA_ETAPA1 / "corte_por_estado_mes.csv").open(encoding="utf-8") as f:
        for linha in csv.DictReader(f, delimiter=";"):
            if linha["subsistema"] == "NE":
                mensal[linha["ano_mes"]][linha["tipo"]] += int(linha["mw_medios"])

    atlas = {
        "dados_ate": proximas["dados_ate"],
        "previsao": {
            "periodo": proximas["periodo"], "dias": dias,
            "por_dia": {d: {"janelas": v["janelas"], "usinas": len(v["usinas"]), "energia_esperada_mwh": v["energia_esperada_mwh"]} for d, v in por_dia.items()},
            "usinas_com_janela": resumo["janelas_proximos_dias"]["usinas_com_janela"],
            "total_janelas": resumo["janelas_proximos_dias"]["total"],
        },
        "manchete": {
            "nordeste_mw_medios": ne["mw_medios"], "nordeste_gwh_dia": ne["gwh_por_dia"], "periodo": ne["periodo"],
            "brasil_mw_medios": oficial["brasil_jan_ago_2026"]["mw_medios"],
            # valor anual da energia cortada no Nordeste, mesmo ao preço mínimo do mercado
            "valor_anual_piso_rs": arred(ne["mw_medios"] * 8760 * PLD_PISO_2026, -6),
            "energia_capturada_ago": t_ago["geral"]["continuo_com_atraso"]["energia_capturada"],
            "energia_capturada_set": t_set["geral"]["continuo_com_atraso"]["energia_capturada"],
            "usinas_avaliadas": t_ago["usinas_avaliadas"],
        },
        "pld": {**fonte_pld, "piso_2026_rs_mwh": PLD_PISO_2026},
        "kw_por_gpu": KW_POR_GPU,
        "usinas": plantas,
        "teste": {
            "agosto": {m: metr(t_ago["geral"][m]) for m in modelos},
            "setembro": {m: metr(t_set["geral"][m]) for m in modelos},
            "por_tipo_agosto": {tp: metr(v["continuo_com_atraso"]) for tp, v in t_ago["por_tipo"].items()},
            "calibracao_agosto": t_ago["geral"]["continuo_com_atraso"]["calibracao"],
            "parametros": teste["parametros"],
            "placar": resumo["janelas"],
        },
        "padroes": {
            "perda_por_hora_pct": resumo["perda_por_hora_pct"],
            "chance_dia_util": resumo["chance_corte_dia_util"],
            "chance_fim_de_semana": resumo["chance_corte_fim_de_semana_feriado"],
            "nordeste_mensal_mw": [{"mes": m, **v} for m, v in sorted(mensal.items())],
        },
        "oficial": oficial,
        "impressoes": (SAIDA_ETAPA1 / "impressoes_digitais.txt").read_text(encoding="utf-8").strip().splitlines(),
    }

    SITE_DADOS.mkdir(parents=True, exist_ok=True)
    (SITE_DADOS / "atlas.json").write_bytes((json.dumps(atlas, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))

    # Dados abertos para download no site
    SITE_PUBLICO.mkdir(parents=True, exist_ok=True)
    for nome in ("chance_corte_por_usina_mes_hora.csv", "corte_por_estado_mes.csv", "janelas_previstas_ago_set_2026.json",
                 "janelas_previstas_proximos_dias.json", "teste_retroativo.json", "usinas.json", "impressoes_digitais.txt"):
        shutil.copyfile(SAIDA_ETAPA1 / nome, SITE_PUBLICO / nome)

    print(f"atlas.json: {len(plantas)} usinas de destaque, {len(prox_destaque)} janelas previstas, "
          f"{len(dias)} dias ({dias[0]} a {dias[-1]}), PLD: {fonte_pld['tipo']}")


if __name__ == "__main__":
    main()
