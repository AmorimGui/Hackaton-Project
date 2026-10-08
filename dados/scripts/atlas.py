"""Etapa 2 do Vento Cortado: prepara os dados do Atlas (site).

Junta as saídas da Etapa 1, a localização das usinas de destaque e o preço da
energia (PLD) num único arquivo que o site lê: site/src/data/atlas.json.
Também copia os dados abertos para download em site/public/data/.

Uso:
    python dados/scripts/atlas.py [--pld ARQUIVO_CSV ...]

Preço da energia: lê o PLD horário da CCEE (dados abertos, dataset pld_horario)
salvo em dados/ccee/pld_horario_*.csv e usa o submercado Nordeste hora a hora.
A CCEE bloqueia download automático, então o CSV é baixado pelo navegador e guardado
no repositório (dados abertos da CCEE); a atualização diária usa a versão do repositório.
Sem o arquivo, usa o piso regulatório de 2026 (R$ 57,31/MWh), declarado como premissa.
Com o PLD e os dados brutos do ONS, também calcula quanto vale a energia cortada.
"""

import argparse
import csv
import hashlib
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
SITE_ARQUIVO_ONS = RAIZ / "site" / "public" / "ons"  # cópias exatas dos arquivos do ONS citados nos carimbos
SITE_PREVISOES = RAIZ / "site" / "public" / "previsoes"  # cada previsão publicada, como saiu (nunca reescrita)

PLD_PISO_2026 = 57.31  # R$/MWh, limite mínimo do PLD em 2026 (ANEEL)
KW_POR_GPU = 0.85
DIAS_RECENTES = 14  # janelas de ago–set mostradas por usina no site


def ler_json(nome: str):
    return json.loads((SAIDA_ETAPA1 / nome).read_text(encoding="utf-8"))


def arred(x: float, casas: int = 0) -> float:
    f = 10 ** casas
    return math.floor(x * f + 0.5) / f


def carregar_pld(arquivos: list[Path]) -> tuple[dict[str, float], dict]:
    """Retorna {"AAAA-MM-DD HH": R$/MWh} do submercado Nordeste e a descrição da fonte.

    Lê o CSV de PLD horário dos dados abertos da CCEE (dataset pld_horario), com as colunas
    MES_REFERENCIA (AAAAMM); SUBMERCADO; PERIODO_COMERCIALIZACAO; DIA; HORA; PLD_HORA.
    """
    if not arquivos:
        return {}, {"tipo": "premissa", "valor_rs_mwh": PLD_PISO_2026,
                    "descricao": "piso regulatório do PLD em 2026; o PLD horário oficial da CCEE substitui esta premissa quando disponível"}
    precos: dict[str, float] = {}
    for arquivo in arquivos:
        with arquivo.open(encoding="utf-8-sig") as f:
            for linha in csv.DictReader(f, delimiter=";"):
                if linha["SUBMERCADO"].strip().upper() != "NORDESTE":
                    continue
                mes = linha["MES_REFERENCIA"].strip()
                data = f"{mes[:4]}-{mes[4:6]}-{int(linha['DIA']):02d}"
                precos[f"{data} {int(linha['HORA']):02d}"] = float(linha["PLD_HORA"].replace(",", "."))
    horas = sorted(precos)
    return precos, {"tipo": "ccee_pld_horario", "arquivos": [a.name for a in arquivos],
                    "periodo": f"{horas[0][:10]} a {horas[-1][:10]}",
                    "descricao": "PLD horário oficial do submercado Nordeste (CCEE, dados abertos)"}


def buscar_ptax() -> dict | None:
    """Cotação de venda do dólar (PTAX) mais recente, da API pública do Banco Central (Olinda).

    Usada para converter o preço das janelas (R$) em USDC. Sem internet, reaproveita a do atlas.json anterior.
    """
    import urllib.request
    from datetime import date, timedelta

    hoje = date.today()
    url = ("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
           "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?"
           f"@dataInicial='{(hoje - timedelta(days=15)):%m-%d-%Y}'&@dataFinalCotacao='{hoje:%m-%d-%Y}'"
           "&$top=100&$format=json&$select=cotacaoVenda,dataHoraCotacao")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            cotacoes = json.loads(r.read().decode("utf-8"))["value"]
        ultima = cotacoes[-1]
        return {"ptax_venda": ultima["cotacaoVenda"], "data": ultima["dataHoraCotacao"][:10],
                "fonte": "Banco Central do Brasil, PTAX (API Olinda)"}
    except Exception as erro:  # sem rede: mantém a última cotação conhecida
        anterior = SITE_DADOS / "atlas.json"
        if anterior.exists():
            cambio = json.loads(anterior.read_text(encoding="utf-8")).get("cambio")
            if cambio:
                print(f"aviso: PTAX indisponível ({erro}); usando a de {cambio['data']}")
                return cambio
        print(f"aviso: PTAX indisponível ({erro}); compras desativadas no site")
        return None


def pld_x_corte(precos: dict[str, float]) -> dict | None:
    """Cruza o PLD horário do Nordeste com a energia cortada (GNRa) de todas as usinas do subsistema NE.

    Usa os arquivos brutos do ONS (../dados-ons/brutos). Retorna None se não houver PLD ou dados.
    """
    brutos = RAIZ.parent / "dados-ons" / "brutos"
    if not precos or not brutos.exists():
        return None
    import pandas as pd  # só necessário aqui

    meses = sorted({h[:7] for h in precos})
    partes = []
    for am in meses:
        for tipo in ("EOLICA", "FOTOVOLTAICA"):
            arq = brutos / f"RESTRICAO_COFF_{tipo}_{am.replace('-', '_')}.parquet"
            if arq.exists():
                d = pd.read_parquet(arq, columns=["id_subsistema", "din_instante", "val_geracaonaorealizadaapurada"])
                partes.append(d[d["id_subsistema"] == "NE"])
    if not partes:
        return None
    o = pd.concat(partes)
    o["mwh"] = o["val_geracaonaorealizadaapurada"].fillna(0) * 0.5
    o["hora"] = o["din_instante"].dt.strftime("%Y-%m-%d %H")
    por_hora = o.groupby("hora")["mwh"].sum()
    pld = por_hora.index.map(precos.get)
    ok = pld.notna()
    mwh, pld = por_hora[ok].to_numpy(), pld[ok].to_numpy(dtype=float)
    no_piso = pld <= PLD_PISO_2026 + 1e-9
    todas = sorted(precos)
    piso_por_hora = [arred(100 * sum(precos[h] <= PLD_PISO_2026 + 1e-9 for h in todas if h.endswith(f" {x:02d}"))
                           / max(1, sum(h.endswith(f" {x:02d}") for h in todas))) for x in range(24)]
    return {
        "periodo": f"{por_hora[ok].index[0][:10]} a {por_hora[ok].index[-1][:10]}",
        "energia_cortada_gwh": arred(mwh.sum() / 1000),
        "fracao_energia_com_pld_no_piso": arred(mwh[no_piso].sum() / mwh.sum(), 3),
        "pld_medio_ponderado_rs_mwh": arred((mwh * pld).sum() / mwh.sum(), 2),
        "valor_ao_pld_real_rs": arred((mwh * pld).sum(), -6),
        "valor_ao_piso_rs": arred(mwh.sum() * PLD_PISO_2026, -6),
        "fracao_horas_no_piso": arred(sum(p <= PLD_PISO_2026 + 1e-9 for p in precos.values()) / len(precos), 3),
        "piso_por_hora_pct": piso_por_hora,
    }


def pld_conhecido(janela: dict, precos: dict[str, float]) -> bool:
    """True se a CCEE já publicou o PLD de todas as horas da janela (senão, o valor usa o piso como estimativa)."""
    ini, fim = int(janela["inicio"][:2]), int(janela["fim"][:2]) + (janela["fim"][3:] == "30")
    return all(f"{janela['data']} {h:02d}" in precos for h in range(ini, max(ini + 1, fim)))


def valor_janela(janela: dict, mw_por_meia_hora: float | None, precos: dict[str, float]) -> float:
    """Valor de referência (R$) da energia esperada na janela, ao PLD de cada hora.
    Hora sem PLD publicado (a CCEE publica um dia antes) entra pelo piso, como estimativa."""
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
    ap.add_argument("--pld", type=Path, nargs="*", default=None, help="CSVs de PLD horário da CCEE (padrão: dados/ccee/*.csv)")
    args = ap.parse_args()
    arquivos_pld = args.pld if args.pld is not None else sorted((RAIZ / "dados" / "ccee").glob("pld_horario_*.csv"))
    precos, fonte_pld = carregar_pld(arquivos_pld)
    cruzamento = pld_x_corte(precos)

    usinas = ler_json("usinas.json")
    resumo = ler_json("resumo.json")
    teste = ler_json("teste_retroativo.json")
    historico = ler_json("janelas_previstas_ago_set_2026.json")
    ao_vivo = ler_json("janelas_ao_vivo.json")
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
        return {**j, "valor_referencia_rs": arred(valor), "pld_estimado": not pld_conhecido(j, precos),
                "pld_medio_rs_mwh": arred(valor / j["energia_esperada_mwh"], 2) if j["energia_esperada_mwh"] else None}

    # Janelas previstas (próximos dias): todas as usinas para contagem, detalhe das de destaque
    prox_destaque = [enriquecer(j) for j in proximas["janelas"] if j["id_ons"] in ids]
    por_dia = defaultdict(lambda: {"janelas": 0, "usinas": set(), "energia_esperada_mwh": 0})
    for j in proximas["janelas"]:
        d = por_dia[j["data"]]
        d["janelas"] += 1
        d["usinas"].add(j["id_ons"])
        d["energia_esperada_mwh"] += j["energia_esperada_mwh"]
    dias = sorted(por_dia)

    # Histórico ago–set (placar congelado) e ao vivo (outubro em diante): as janelas mais recentes de cada
    # usina de destaque já com o veredito do ONS
    hist_destaque = [j for j in historico["janelas"] if j["id_ons"] in ids]
    vivo_destaque = [j for j in ao_vivo["janelas"] if j["id_ons"] in ids and j["resultado_ons"] in ("confirmado", "errado")]
    com_veredito = hist_destaque + vivo_destaque
    datas_hist = sorted({j["data"] for j in com_veredito})
    recentes = set(datas_hist[-DIAS_RECENTES:])

    t_ago, t_set = teste["testes"]["agosto_2026"], teste["testes"]["setembro_2026"]
    modelos = ["taxa_media", "regra_fixa_8h_15h", "mesmo_mes_2025", "perfil_8_semanas", "combinado", "continuo_com_atraso"]

    def metr(x: dict) -> dict:
        return {k: x[k] for k in ("precisao", "cobertura", "energia_capturada", "ganho_sobre_taxa_media", "taxa_real_de_corte", "meias_horas_avaliadas")}

    plantas = []
    for u in destaque:
        hist_u = [j for j in hist_destaque if j["id_ons"] == u["id"]]
        conf = sum(j["resultado_ons"] == "confirmado" for j in hist_u)
        vivo_u = [j for j in vivo_destaque if j["id_ons"] == u["id"]]
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
            "placar_ao_vivo": {"janelas": len(vivo_u), "confirmadas": sum(j["resultado_ons"] == "confirmado" for j in vivo_u)},
            # janelas com veredito e preço: podem ser compradas em "replay" (o veredito do ONS já existe)
            "recentes": [enriquecer(j) for j in hist_u + vivo_u if j["data"] in recentes],
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
            # valor da energia cortada no Nordeste ao PLD real de cada hora (None sem o arquivo da CCEE)
            "valor_pld_real_rs": cruzamento["valor_ao_pld_real_rs"] if cruzamento else None,
            "valor_pld_real_periodo": cruzamento["periodo"] if cruzamento else None,
            "energia_capturada_ago": t_ago["geral"]["continuo_com_atraso"]["energia_capturada"],
            "energia_capturada_set": t_set["geral"]["continuo_com_atraso"]["energia_capturada"],
            "usinas_avaliadas": t_ago["usinas_avaliadas"],
        },
        "pld": {**fonte_pld, "piso_2026_rs_mwh": PLD_PISO_2026, "cruzamento": cruzamento},
        "kw_por_gpu": KW_POR_GPU,
        "cambio": buscar_ptax(),
        "usinas": plantas,
        "teste": {
            "agosto": {m: metr(t_ago["geral"][m]) for m in modelos},
            "setembro": {m: metr(t_set["geral"][m]) for m in modelos},
            "por_tipo_agosto": {tp: metr(v["continuo_com_atraso"]) for tp, v in t_ago["por_tipo"].items()},
            "calibracao_agosto": t_ago["geral"]["continuo_com_atraso"]["calibracao"],
            "parametros": teste["parametros"],
            "placar": resumo["janelas"],
        },
        # Acompanhamento ao vivo (outubro em diante), separado do teste retroativo congelado
        "ao_vivo": {**resumo["janelas_ao_vivo"], "publicada_antes_desde": ao_vivo["publicada_antes_desde"]},
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

    # Vereditos do ONS por janela (usinas de destaque), para o carimbo da fase 2 do recibo.
    # Cada veredito aponta para o arquivo oficial do ONS e sua impressão digital (SHA-256),
    # para qualquer pessoa baixar o mesmo arquivo e refazer a conta.
    # O ONS às vezes republica um mês com mudanças editoriais (em 08/10/2026 renomeou usinas nos
    # arquivos de setembro), o que muda o SHA-256. Por isso o site guarda uma cópia exata de cada
    # versão carimbada em public/ons/<sha256>/<arquivo>; versões antigas nunca são apagadas.
    brutos = RAIZ.parent / "dados-ons" / "brutos"
    fontes: dict[str, str] = {}

    def fonte_ons(j: dict) -> str:
        nome = f"RESTRICAO_COFF_{'EOLICA' if j['tipo'] == 'eolica' else 'FOTOVOLTAICA'}_{j['data'][:4]}_{j['data'][5:7]}.parquet"
        if nome not in fontes and (brutos / nome).exists():
            fontes[nome] = hashlib.sha256((brutos / nome).read_bytes()).hexdigest()
            copia = SITE_ARQUIVO_ONS / fontes[nome] / nome
            if not copia.exists():
                copia.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(brutos / nome, copia)
        return nome

    veredictos = {}
    for j in list(historico["janelas"]) + list(ao_vivo["janelas"]) + list(proximas["janelas"]):
        if j["id_ons"] not in ids or j["resultado_ons"] not in ("confirmado", "errado"):
            continue
        veredictos[f"{j['id_ons']}|{j['data']}|{j['inicio']}-{j['fim']}"] = {
            "resultado": j["resultado_ons"], "fracao_com_corte": j["fracao_com_corte"],
            "energia_cortada_mwh": j["energia_cortada_mwh"], "razoes": j["razoes_do_corte"], "fonte": fonte_ons(j),
        }
    (SITE_DADOS / "veredictos.json").write_bytes((json.dumps({
        "regra": historico["regra_resultado"],
        "fontes_ons": fontes,
        "url_fontes": "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/restricao_coff_{eolica|fotovoltaica}_tm/<arquivo>",
        "janelas": veredictos,
    }, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
    (SITE_DADOS / "atlas.json").write_bytes((json.dumps(atlas, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))

    # Dados abertos para download no site
    SITE_PUBLICO.mkdir(parents=True, exist_ok=True)
    for nome in ("chance_corte_por_usina_mes_hora.csv", "corte_por_estado_mes.csv", "janelas_previstas_ago_set_2026.json",
                 "janelas_ao_vivo.json", "janelas_previstas_proximos_dias.json", "teste_retroativo.json", "usinas.json",
                 "impressoes_digitais.txt"):
        shutil.copyfile(SAIDA_ETAPA1 / nome, SITE_PUBLICO / nome)

    # Cada previsão fica guardada como foi publicada (a primeira versão de cada "dados_ate" vale).
    # O site carimba o SHA-256 dela na Solana, o que prova que a previsão existia antes do dia.
    SITE_PREVISOES.mkdir(parents=True, exist_ok=True)
    guardada = SITE_PREVISOES / f"previsao_{proximas['dados_ate']}.json"
    if not guardada.exists():
        shutil.copyfile(SAIDA_ETAPA1 / "janelas_previstas_proximos_dias.json", guardada)
    (SITE_DADOS / "previsao_atual.json").write_bytes((json.dumps({
        "dados_ate": proximas["dados_ate"], "periodo": proximas["periodo"], "arquivo": f"previsoes/{guardada.name}",
        "sha256": hashlib.sha256(guardada.read_bytes()).hexdigest(),
    }, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))

    print(f"atlas.json: {len(plantas)} usinas de destaque, {len(prox_destaque)} janelas previstas, "
          f"{len(dias)} dias ({dias[0]} a {dias[-1]}), PLD: {fonte_pld['tipo']}")


if __name__ == "__main__":
    main()
