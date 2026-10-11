"""Etapa 1 do Vento Cortado: chance de corte por hora e mês + teste retroativo.

Lê os arquivos mensais de constrained-off do ONS (eólica e fotovoltaica),
mantém as usinas do RN, BA e CE, calcula a chance de corte e testa a previsão
em meses que o modelo não viu (agosto e setembro de 2026). De outubro em diante,
acompanha ao vivo as janelas previstas e o veredito do ONS, até o último dia publicado.

Uso:
    python dados/scripts/etapa1.py [--brutos PASTA]

Lê arquivos .parquet (preferência) ou .csv do ONS. Saídas em dados/saida/.
"""

import argparse
import calendar
import hashlib
import json
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "dados" / "saida"

# ---------- Parâmetros (todos declarados antes de olhar o resultado do teste) ----------
UFS = ["RN", "BA", "CE"]
LIMIAR_CORTE_MW = 1.0  # meia hora conta como corte se a GNRa do ONS for >= 1 MW médio
LIMIAR_JANELA = 0.5  # a janela é oferecida quando a chance prevista é >= 50%
DIAS_PERFIL = 56  # o perfil recente usa as últimas 8 semanas
# Atraso de publicação assumido pelo modelo. Foi fixado antes do teste, quando supúnhamos uma semana;
# o ONS publica com cerca de um dia, então a previsão usa dados mais velhos do que poderia (conservadora).
ATRASO_PUBLICACAO_DIAS = 7
SUAVIZACAO = 2  # peso da taxa média da usina quando há poucas observações
MIN_MEIAS_HORAS_JANELA = 2  # janela mínima de 1 hora
KW_POR_GPU = 0.85  # H100 com refrigeração (suposição do escopo)
COTAS = [  # usinas de destaque: as que mais perderam energia em jan–jul/2026
    ("BA", "eolica", 2), ("RN", "eolica", 2), ("CE", "eolica", 1),
    ("BA", "solar", 1), ("RN", "solar", 1), ("CE", "solar", 1),
]
TESTES = [
    {"nome": "agosto_2026", "ini": "2026-08-01", "fim": "2026-09-01", "mesmo_mes_ano_anterior": "2025-08"},
    {"nome": "setembro_2026", "ini": "2026-09-01", "fim": "2026-10-01", "mesmo_mes_ano_anterior": "2025-09"},
]
# Feriados nacionais (e Carnaval/Corpus Christi, quando a carga também cai)
FERIADOS = {
    "2025-01-01", "2025-03-03", "2025-03-04", "2025-04-18", "2025-04-21", "2025-05-01", "2025-06-19",
    "2025-09-07", "2025-10-12", "2025-11-02", "2025-11-15", "2025-11-20", "2025-12-25",
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04",
    "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
}
INICIO_AO_VIVO = "2026-10-01"  # depois do teste retroativo: acompanhamento contínuo
# Primeiro dia cuja previsão foi publicada antes de o dia começar (commit fb86b88, 07/10/2026 23:19)
PUBLICADA_ANTES_DESDE = "2026-10-08"
RAZOES = {"ENE": 1, "CNF": 2, "REL": 3, "PAR": 4}
NOME_RAZAO = {v: k for k, v in RAZOES.items()}

# ---------- Eixo do tempo: meias-horas desde 01/01/2025 (horário de Brasília, sem fuso) ----------
# O eixo vai até o último dia completo publicado pelo ONS; definir_eixo() o ajusta depois da leitura.
BASE = date(2025, 1, 1)
N_DIAS = N_SLOTS = 0
DIAS: list[date] = []
TIPO_DIA = MES_DO_DIA = np.zeros(0, dtype=np.int8)


def tipo_do_dia(d: int) -> int:
    """0 = dia útil; 1 = fim de semana ou feriado. Vale também para dias futuros."""
    dia = BASE + timedelta(days=d)
    return 1 if dia.weekday() >= 5 or dia.isoformat() in FERIADOS else 0


def definir_eixo(ultimo: date) -> None:
    global N_DIAS, N_SLOTS, DIAS, TIPO_DIA, MES_DO_DIA
    N_DIAS = (ultimo - BASE).days + 1
    N_SLOTS = N_DIAS * 48
    DIAS = [BASE + timedelta(days=d) for d in range(N_DIAS)]
    TIPO_DIA = np.array([tipo_do_dia(d) for d in range(N_DIAS)], dtype=np.int8)
    MES_DO_DIA = np.array([d.month for d in DIAS], dtype=np.int8)


def dia_de(iso: str) -> int:
    return (date.fromisoformat(iso) - BASE).days


def iso_do_dia(d: int) -> str:
    return (BASE + timedelta(days=d)).isoformat()


def hhmm(s: int) -> str:
    return f"{s // 2:02d}:{'30' if s % 2 else '00'}"


def inteiro(x: float) -> int:
    """Arredonda meio para cima (o round() do Python arredonda meio para o par)."""
    return math.floor(x + 0.5)


def r3(x: float) -> float:
    return math.floor(x * 1000 + 0.5) / 1000


# ---------- Leitura ----------
COLUNAS = ["id_subsistema", "id_estado", "nom_usina", "id_ons", "din_instante", "val_disponibilidade",
           "cod_razaorestricao", "nom_pontoconexao", "nom_agenteoperador", "val_geracaonaorealizadaapurada"]


def ler_arquivo(arq: Path) -> pd.DataFrame:
    if arq.suffix == ".parquet":
        df = pd.read_parquet(arq, columns=COLUNAS)
    else:
        df = pd.read_csv(arq, sep=";", usecols=COLUNAS, encoding="utf-8-sig", dtype=str)
        df["din_instante"] = pd.to_datetime(df["din_instante"])
        for c in ("val_disponibilidade", "val_geracaonaorealizadaapurada"):
            df[c] = pd.to_numeric(df[c])
    return df


def ler_usinas(brutos: Path) -> tuple[list[dict], np.ndarray, np.ndarray, pd.DataFrame]:
    """Retorna o catálogo de usinas do RN/BA/CE, as matrizes [usina, meia-hora] de GNRa e razão do corte,
    e a energia perdida por subsistema, estado, tipo e mês (todas as usinas do país)."""
    arquivos: dict[str, Path] = {}
    for arq in sorted(brutos.glob("RESTRICAO_COFF_*_20??_??.*")):
        if arq.suffix == ".parquet" or (arq.suffix == ".csv" and arq.stem not in arquivos):
            arquivos[arq.stem] = arq  # Parquet tem preferência sobre CSV
    if not arquivos:
        raise SystemExit(f"nenhum arquivo do ONS em {brutos}")

    meta: dict[str, dict] = {}
    partes, regiao = [], []
    for stem in sorted(arquivos):  # ordem cronológica dentro de cada tipo
        arq = arquivos[stem]
        tipo = "eolica" if "EOLICA" in stem else "solar"
        df = ler_arquivo(arq)
        tot = df.groupby(["id_subsistema", "id_estado", "cod_razaorestricao"], dropna=False)["val_geracaonaorealizadaapurada"].sum().reset_index()
        tot["tipo"], tot["ano_mes"] = tipo, stem[-7:].replace("_", "-")
        regiao.append(tot)
        df = df[df["id_estado"].isin(UFS)]
        # o arquivo mais recente prevalece: nome e agente operador podem mudar ao longo do tempo
        for row in df.drop_duplicates("id_ons", keep="last")[["id_ons", "nom_usina", "id_estado", "nom_agenteoperador", "nom_pontoconexao"]].itertuples():
            meta[row.id_ons] = {"id": row.id_ons, "nome": row.nom_usina, "uf": row.id_estado, "tipo": tipo,
                                "agente": row.nom_agenteoperador, "ponto_conexao": row.nom_pontoconexao}
        partes.append(df[["id_ons", "din_instante", "val_disponibilidade", "cod_razaorestricao", "val_geracaonaorealizadaapurada"]])
        print(f"lido {arq.name}", flush=True)

    dados = pd.concat(partes, ignore_index=True)
    instante = dados["din_instante"]
    # último dia completo (o ONS publica o mês corrente dia a dia; um dia pela metade fica de fora)
    fim = instante.max()
    definir_eixo(fim.date() if (fim.hour, fim.minute) == (23, 30) else fim.date() - timedelta(days=1))
    slot = ((instante - pd.Timestamp(BASE)).dt.total_seconds() // 1800).astype(np.int64).to_numpy()
    ok = (slot >= 0) & (slot < N_SLOTS)
    dados, slot = dados[ok], slot[ok]

    usinas = list(meta.values())
    indice = {u["id"]: i for i, u in enumerate(usinas)}
    linha = dados["id_ons"].map(indice).to_numpy()
    gnra = np.full((len(usinas), N_SLOTS), np.nan, dtype=np.float32)
    gnra[linha, slot] = dados["val_geracaonaorealizadaapurada"].fillna(0).to_numpy(dtype=np.float32)  # vazio = sem limitação
    razao = np.zeros((len(usinas), N_SLOTS), dtype=np.uint8)
    razao[linha, slot] = dados["cod_razaorestricao"].map(RAZOES).fillna(0).to_numpy(dtype=np.uint8)
    disp = dados.groupby("id_ons")["val_disponibilidade"].max().fillna(0)
    for u in usinas:
        u["disp_max_mw"] = max(0.0, float(disp.get(u["id"], 0)))
    return usinas, gnra, razao, pd.concat(regiao, ignore_index=True)


# ---------- Perfil: chance de corte por meia hora do dia e tipo de dia ----------
def perfil(g: np.ndarray, dia_ini: int, dia_fim: int) -> dict | None:
    """Usa os dias [dia_ini, dia_fim) da série g (uma usina). Retorna None se não houver dado."""
    a, b = max(0, dia_ini), min(dia_fim, N_DIAS)
    if a >= b:
        return None
    bloco = g[a * 48:b * 48].reshape(-1, 48).astype(np.float64)
    valido = ~np.isnan(bloco)
    corte = valido & (bloco >= LIMIAR_CORTE_MW)
    td = TIPO_DIA[a:b]
    n_total, k_total = valido.sum(), corte.sum()
    if not n_total:
        return None
    media = k_total / n_total
    perda = np.where(valido, bloco, 0.0)
    p, mw = [], []
    for tipo in (0, 1):
        sel = td == tipo
        n = valido[sel].sum(axis=0)
        k = corte[sel].sum(axis=0)
        p.append((k + SUAVIZACAO * media) / (n + SUAVIZACAO))
        # perda média esperada (MW médios) por meia hora; usa todos os dias se faltar o tipo de dia
        mw.append(perda[sel].sum(axis=0) / n if n.all() else perda.sum(axis=0) / valido.sum(axis=0).clip(1))
    return {"p": p, "media": media, "mw": mw}


def constante(valor: float) -> dict:
    return {"p": [np.full(48, valor), np.full(48, valor)], "media": valor}


REGRA_FIXA = {"p": [np.where((np.arange(48) >= 16) & (np.arange(48) < 30), 1.0, 0.0)] * 2, "media": 14 / 48}


def misturar(a: dict | None, b: dict | None) -> dict | None:
    if a is None:
        return b
    if b is None:
        return a
    return {"p": [(a["p"][t] + b["p"][t]) / 2 for t in (0, 1)], "media": (a["media"] + b["media"]) / 2}


# ---------- Avaliação ----------
class Placar:
    def __init__(self) -> None:
        self.n = self.vp = self.fp = self.fn = self.vn = 0
        self.brier = self.energia_total = self.energia_capturada = 0.0
        self.calib_n = np.zeros(10)
        self.calib_p = np.zeros(10)
        self.calib_y = np.zeros(10)

    def pontuar(self, p: np.ndarray, g: np.ndarray) -> None:
        """p e g: vetores das meias-horas com dado."""
        y = g >= LIMIAR_CORTE_MW
        prev = p >= LIMIAR_JANELA
        self.n += len(p)
        self.brier += float(((p - y) ** 2).sum())
        self.vp += int((prev & y).sum())
        self.fp += int((prev & ~y).sum())
        self.fn += int((~prev & y).sum())
        self.vn += int((~prev & ~y).sum())
        self.energia_total += float(g.sum()) * 0.5
        self.energia_capturada += float(g[prev].sum()) * 0.5
        faixa = np.minimum(9, np.floor(p * 10)).astype(int)
        np.add.at(self.calib_n, faixa, 1)
        np.add.at(self.calib_p, faixa, p)
        np.add.at(self.calib_y, faixa, y.astype(np.float64))

    def resumir(self, brier_base: float | None) -> dict:
        brier = self.brier / self.n
        return {
            "meias_horas_avaliadas": self.n,
            "taxa_real_de_corte": r3((self.vp + self.fn) / self.n),
            "precisao": r3(self.vp / (self.vp + self.fp or 1)),  # das meias-horas oferecidas, quantas tiveram corte
            "cobertura": r3(self.vp / (self.vp + self.fn or 1)),  # dos cortes reais, quantos estavam numa janela
            "energia_capturada": r3(self.energia_capturada / (self.energia_total or 1)),
            "acerto_geral": r3((self.vp + self.vn) / self.n),
            "brier": r3(brier),
            "ganho_sobre_taxa_media": r3(1 - brier / brier_base) if brier_base else None,  # Brier skill score
            "calibracao": [
                {"faixa": f"{i * 10}-{i * 10 + 10}%", "n": int(self.calib_n[i]),
                 "prevista": r3(self.calib_p[i] / self.calib_n[i]), "observada": r3(self.calib_y[i] / self.calib_n[i])}
                for i in range(10) if self.calib_n[i]
            ],
        }


def intervalo_do_mes(am: str) -> tuple[int, int]:
    ano, mes = map(int, am.split("-"))
    ini = date(ano, mes, 1)
    fim = date(ano + 1, 1, 1) if mes == 12 else date(ano, mes + 1, 1)
    return (ini - BASE).days, (fim - BASE).days


def modelos(g: np.ndarray, teste: dict) -> dict:
    """Todos usam só dados que existiriam antes do dia previsto."""
    ini = dia_de(teste["ini"])
    fixo = perfil(g, ini - DIAS_PERFIL, ini)  # dados até o fim do mês anterior
    ano_anterior = perfil(g, *intervalo_do_mes(teste["mesmo_mes_ano_anterior"]))
    return {
        "taxa_media": lambda d: constante(fixo["media"]) if fixo else None,  # referência: sem olhar a hora
        "regra_fixa_8h_15h": lambda d: REGRA_FIXA,  # referência ingênua
        "perfil_8_semanas": lambda d: fixo,  # "prevendo com dados até o mês anterior"
        "mesmo_mes_2025": lambda d: ano_anterior if ano_anterior else fixo,
        "combinado": lambda d: misturar(fixo, ano_anterior),
        # Versão de produção: todo dia, perfil das 8 semanas mais recentes já publicadas pelo ONS
        "continuo_com_atraso": lambda d: perfil(g, d - ATRASO_PUBLICACAO_DIAS - DIAS_PERFIL, d - ATRASO_PUBLICACAO_DIAS),
    }


def janelas_do_dia(g: np.ndarray, rz: np.ndarray, prof: dict, d: int) -> list[dict]:
    """Janelas contínuas com chance >= limiar em um dia, e o que o ONS registrou depois.

    Para dias ainda sem dado publicado (futuros), o resultado fica "aguardando_ons".
    """
    td = tipo_do_dia(d)
    p, mw = prof["p"][td], prof["mw"][td]
    tem_dado = d < N_DIAS
    out, s = [], 0
    while s < 48:
        if p[s] < LIMIAR_JANELA:
            s += 1
            continue
        e = s
        while e < 48 and p[e] >= LIMIAR_JANELA:
            e += 1
        if e - s >= MIN_MEIAS_HORAS_JANELA:
            esperada = float(mw[s:e].sum()) * 0.5  # MWh que o perfil espera perder na janela
            janela = {
                "data": iso_do_dia(d), "inicio": hhmm(s), "fim": hhmm(e),
                "chance_prevista": math.floor(float(p[s:e].mean()) * 100 + 0.5) / 100,
                "energia_esperada_mwh": inteiro(esperada),
                "gpu_horas_esperadas": inteiro(esperada * 1000 / KW_POR_GPU),  # estimativa, não medição
            }
            if not tem_dado:
                janela.update({"resultado_ons": "aguardando_ons", "fracao_com_corte": None,
                               "energia_cortada_mwh": None, "gpu_horas_equivalentes": None, "razoes_do_corte": {}})
            else:
                com_corte = obs = 0
                mwh = 0.0
                razoes: dict[str, int] = {}
                for x in range(s, e):
                    v = g[d * 48 + x]
                    if np.isnan(v):
                        continue
                    obs += 1
                    mwh += float(v) * 0.5
                    if v >= LIMIAR_CORTE_MW:
                        com_corte += 1
                        nome = NOME_RAZAO.get(int(rz[d * 48 + x]), "?")
                        razoes[nome] = razoes.get(nome, 0) + 1
                frac = com_corte / obs if obs else None
                janela.update({
                    "resultado_ons": "sem_dado" if frac is None else "confirmado" if frac >= 0.5 else "errado",
                    "fracao_com_corte": None if frac is None else math.floor(frac * 100 + 0.5) / 100,
                    "energia_cortada_mwh": inteiro(mwh),
                    "gpu_horas_equivalentes": inteiro(mwh * 1000 / KW_POR_GPU),  # estimativa, não medição
                    "razoes_do_corte": razoes,
                })
            out.append(janela)
        s = e
    return out


IMPRESSOES: dict[str, str] = {}


def gravar(nome: str, texto: str) -> None:
    """Grava em UTF-8 com fim de linha LF, para o arquivo ser idêntico em Windows, Mac e Linux,
    e guarda o SHA-256 para quem quiser conferir que chegou ao mesmo resultado."""
    dados = (texto if texto.endswith("\n") else texto + "\n").encode("utf-8")
    (SAIDA / nome).write_bytes(dados)
    IMPRESSOES[nome] = hashlib.sha256(dados).hexdigest()


def gravar_json(nome: str, obj) -> None:
    gravar(nome, json.dumps(obj, ensure_ascii=False, indent=2))


# ---------- Execução ----------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--brutos", type=Path, default=RAIZ.parent / "dados-ons" / "brutos")
    args = ap.parse_args()

    usinas, gnra, razao, regiao = ler_usinas(args.brutos)
    ultimo_dia = int(np.nonzero(~np.isnan(gnra).all(axis=0))[0].max()) // 48  # último dia com dado publicado
    SAIDA.mkdir(parents=True, exist_ok=True)
    jan26, ago26 = dia_de("2026-01-01"), dia_de("2026-08-01")

    # Estatísticas jan–jul/2026 por usina (base da seleção, sem olhar agosto/setembro)
    trecho = gnra[:, jan26 * 48:ago26 * 48].astype(np.float64)
    valido = ~np.isnan(trecho)
    for i, u in enumerate(usinas):
        obs = valido[i].sum()
        mwh = np.nansum(trecho[i]) * 0.5
        cortes = (trecho[i][valido[i]] >= LIMIAR_CORTE_MW).sum()
        u["jan_jul_2026"] = {"energia_perdida_gwh": math.floor(mwh / 100 + 0.5) / 10,
                             "fracao_meias_horas_com_corte": r3(cortes / obs) if obs else None}
    selecionadas = []
    for uf, tipo, n in COTAS:
        candidatas = sorted((u for u in usinas if u["uf"] == uf and u["tipo"] == tipo),
                            key=lambda u: -u["jan_jul_2026"]["energia_perdida_gwh"])
        selecionadas += [u["id"] for u in candidatas[:n]]
    idx = {u["id"]: i for i, u in enumerate(usinas)}

    # 1) Tabela aberta: chance de corte por usina, mês e hora (todo o histórico baixado)
    linhas = ["id_ons;usina;uf;tipo;mes;hora;meias_horas_observadas;chance_corte;perda_media_mw"]
    mes_hora = ((MES_DO_DIA.astype(int) - 1)[:, None] * 24 + np.arange(48)[None, :] // 2).ravel()
    for i, u in enumerate(usinas):
        v = gnra[i].astype(np.float64)
        ok = ~np.isnan(v)
        n = np.bincount(mes_hora[ok], minlength=288)
        k = np.bincount(mes_hora[ok], weights=(v[ok] >= LIMIAR_CORTE_MW), minlength=288)
        s = np.bincount(mes_hora[ok], weights=v[ok], minlength=288)
        for c in np.nonzero(n)[0]:
            linhas.append(f"{u['id']};{u['nome']};{u['uf']};{u['tipo']};{c // 24 + 1};{c % 24};{int(n[c])};{k[c] / n[c]:.3f};{s[c] / n[c]:.1f}")
    gravar("chance_corte_por_usina_mes_hora.csv", "\n".join(linhas))

    # 2) Teste retroativo
    resultado = {
        # data do último dado lido (e não a hora da execução, para o arquivo só mudar quando os dados mudam)
        "dados_ate": iso_do_dia(ultimo_dia),
        "fonte": f"ONS, dados abertos de constrained-off de usinas eólicas e fotovoltaicas (CC-BY), 2025-01-01 a {iso_do_dia(ultimo_dia)}",
        "parametros": {"UFS": UFS, "LIMIAR_CORTE_MW": LIMIAR_CORTE_MW, "LIMIAR_JANELA": LIMIAR_JANELA, "DIAS_PERFIL": DIAS_PERFIL,
                       "ATRASO_PUBLICACAO_DIAS": ATRASO_PUBLICACAO_DIAS, "SUAVIZACAO": SUAVIZACAO, "MIN_MEIAS_HORAS_JANELA": MIN_MEIAS_HORAS_JANELA},
        "usinas_avaliadas": 0,
        "testes": {},
    }
    for teste in TESTES:
        ini, fim = dia_de(teste["ini"]), dia_de(teste["fim"])
        geral: dict[str, Placar] = {}
        por_tipo: dict[str, dict[str, Placar]] = {}
        por_usina: dict[str, dict[str, Placar]] = {}
        avaliadas = 0
        for i, u in enumerate(usinas):
            g = gnra[i]
            if perfil(g, ini - DIAS_PERFIL, ini) is None:  # só usinas com 8 semanas de histórico
                continue
            avaliadas += 1
            for nome, fn in modelos(g, teste).items():
                placares = [geral.setdefault(nome, Placar()), por_tipo.setdefault(u["tipo"], {}).setdefault(nome, Placar())]
                if u["id"] in selecionadas:
                    placares.append(por_usina.setdefault(u["id"], {}).setdefault(nome, Placar()))
                ps, gs = [], []
                for d in range(ini, fim):
                    prof = fn(d)
                    if prof is None:
                        continue
                    v = g[d * 48:(d + 1) * 48].astype(np.float64)
                    ok = ~np.isnan(v)
                    ps.append(prof["p"][TIPO_DIA[d]][ok])
                    gs.append(v[ok])
                if ps:
                    p, v = np.concatenate(ps), np.concatenate(gs)
                    for pl in placares:
                        pl.pontuar(p, v)

        def com_base(pl: dict[str, Placar]) -> dict:
            base = pl["taxa_media"].brier / pl["taxa_media"].n
            return {nome: x.resumir(base) for nome, x in pl.items()}

        resultado["testes"][teste["nome"]] = {
            "periodo": f"{teste['ini']} a {iso_do_dia(fim - 1)}",
            "usinas_avaliadas": avaliadas,
            "geral": com_base(geral),
            "por_tipo": {k: com_base(v) for k, v in por_tipo.items()},
            "usinas_destaque": {k: com_base(v) for k, v in por_usina.items()},
        }
        resultado["usinas_avaliadas"] = max(resultado["usinas_avaliadas"], avaliadas)
    gravar_json("teste_retroativo.json", resultado)

    # 3) Janelas que teriam sido oferecidas em agosto e setembro (modelo de produção) e o veredito do ONS
    regra = "confirmado quando o ONS registrou corte (GNRa >= 1 MW) em pelo menos metade das meias-horas da janela"
    vivo26 = dia_de(INICIO_AO_VIVO)

    def janelas_entre(ini: int, fim: int) -> list[dict]:
        out = []
        for uid in selecionadas:
            i = idx[uid]
            u = usinas[i]
            for d in range(ini, fim):
                prof = perfil(gnra[i], d - ATRASO_PUBLICACAO_DIAS - DIAS_PERFIL, d - ATRASO_PUBLICACAO_DIAS)
                if prof is None:
                    continue
                for j in janelas_do_dia(gnra[i], razao[i], prof, d):
                    out.append({"id_ons": u["id"], "usina": u["nome"], "uf": u["uf"], "tipo": u["tipo"], **j})
        return out

    janelas = janelas_entre(ago26, vivo26)
    gravar_json("janelas_previstas_ago_set_2026.json", {
        "modelo": "continuo_com_atraso", "limiar": LIMIAR_JANELA, "regra_resultado": regra, "janelas": janelas,
    })

    # 3a) Ao vivo: de outubro em diante, as janelas do modelo de produção e o veredito do ONS
    # (dias já publicados). O teste de agosto e setembro continua congelado.
    vivas = [{**j, "publicada_antes": j["data"] >= PUBLICADA_ANTES_DESDE} for j in janelas_entre(vivo26, ultimo_dia + 1)]
    gravar_json("janelas_ao_vivo.json", {
        "modelo": "continuo_com_atraso", "limiar": LIMIAR_JANELA, "regra_resultado": regra,
        "inicio": INICIO_AO_VIVO, "dados_ate": iso_do_dia(ultimo_dia), "publicada_antes_desde": PUBLICADA_ANTES_DESDE,
        "nota": "fora da amostra: cada dia é previsto só com dados até 7 dias antes. As previsões de 01 a 07/10 foram "
                "publicadas em 07/10; a partir de 08/10, antes de o dia começar (histórico no GitHub)",
        "janelas": vivas,
    })

    # 3b) Próximos dias: previsão real, feita só com dados já publicados. Com o atraso de 7 dias,
    # dá para prever até 8 dias depois do último dado (e o veredito do ONS chega depois).
    proximas = []
    for i, u in enumerate(usinas):
        for d in range(ultimo_dia + 1, ultimo_dia + ATRASO_PUBLICACAO_DIAS + 2):
            prof = perfil(gnra[i], d - ATRASO_PUBLICACAO_DIAS - DIAS_PERFIL, d - ATRASO_PUBLICACAO_DIAS)
            if prof is None:
                continue
            for j in janelas_do_dia(gnra[i], razao[i], prof, d):
                proximas.append({"id_ons": u["id"], "usina": u["nome"], "uf": u["uf"], "tipo": u["tipo"],
                                 "destaque": u["id"] in selecionadas, **j})
    gravar_json("janelas_previstas_proximos_dias.json", {
        "modelo": "continuo_com_atraso", "limiar": LIMIAR_JANELA,
        "dados_ate": iso_do_dia(ultimo_dia),
        "periodo": f"{iso_do_dia(ultimo_dia + 1)} a {iso_do_dia(ultimo_dia + ATRASO_PUBLICACAO_DIAS + 1)}",
        "nota": "previsões reais: usam só dados publicados pelo ONS até 'dados_ate'; o veredito sai quando o ONS publicar o mês",
        "janelas": proximas,
    })

    # 3c) Energia perdida por subsistema, estado, tipo e mês, com todas as usinas do país (GNRa do ONS)
    reg = regiao.groupby(["id_subsistema", "id_estado", "tipo", "ano_mes"], as_index=False)["val_geracaonaorealizadaapurada"].sum()
    linhas = ["subsistema;uf;tipo;ano_mes;energia_perdida_gwh;mw_medios"]
    ultimo = BASE + timedelta(days=ultimo_dia)

    def horas_do_mes(am: str) -> int:
        """Horas do mês com dado publicado (o mês corrente vai só até o último dia)."""
        if am == f"{ultimo:%Y-%m}":
            return ultimo.day * 24
        return calendar.monthrange(int(am[:4]), int(am[5:]))[1] * 24

    for r in reg.sort_values(["ano_mes", "id_subsistema", "id_estado", "tipo"]).itertuples():
        horas = horas_do_mes(r.ano_mes)
        mwh = r.val_geracaonaorealizadaapurada * 0.5
        linhas.append(f"{r.id_subsistema};{r.id_estado};{r.tipo};{r.ano_mes};{mwh / 1000:.1f};{inteiro(mwh / horas)}")
    gravar("corte_por_estado_mes.csv", "\n".join(linhas))

    # 3d) Corte por razão (códigos do ONS): ENE energética, CNF confiabilidade, REL indisponibilidade externa,
    # PAR parecer de acesso. Só os cortes REL entram no cálculo do ressarcimento (ESS) que o ONS envia à CCEE.
    rz = regiao.assign(razao=regiao["cod_razaorestricao"].fillna("sem"))
    rz = rz.groupby(["id_subsistema", "id_estado", "tipo", "ano_mes", "razao"], as_index=False)["val_geracaonaorealizadaapurada"].sum()
    linhas = ["subsistema;uf;tipo;ano_mes;razao;energia_perdida_gwh"]
    for r in rz[rz["val_geracaonaorealizadaapurada"] > 0].sort_values(["ano_mes", "id_subsistema", "id_estado", "tipo", "razao"]).itertuples():
        linhas.append(f"{r.id_subsistema};{r.id_estado};{r.tipo};{r.ano_mes};{r.razao};{r.val_geracaonaorealizadaapurada * 0.5 / 1000:.2f}")
    gravar("corte_por_razao_mes.csv", "\n".join(linhas))

    def fracoes(valores: dict) -> dict:
        soma = sum(valores.values()) or 1
        return {k: r3(v / soma) for k, v in sorted(valores.items(), key=lambda x: -x[1]) if v > 0}

    ne26 = rz[(rz["id_subsistema"] == "NE") & (rz["ano_mes"] >= "2026-01")]
    mwh_razao = (ne26.groupby("razao")["val_geracaonaorealizadaapurada"].sum() * 0.5).to_dict()
    razoes = {
        "nordeste_2026": {"periodo": f"2026-01-01 a {iso_do_dia(ultimo_dia)}", "fracao": fracoes(mwh_razao),
                          "twh": {k: math.floor(v / 1e4 + 0.5) / 100 for k, v in mwh_razao.items() if v > 0}},
        "nordeste_por_mes": {am: fracoes(g.groupby("razao")["val_geracaonaorealizadaapurada"].sum().to_dict())
                             for am, g in ne26.groupby("ano_mes")},
    }

    def captura_por_razao(ini: int, fim: int) -> dict:
        """Energia cortada por razão e quanto dela caiu dentro das janelas do modelo de produção (todas as usinas)."""
        total: dict[str, float] = {}
        dentro: dict[str, float] = {}
        for i in range(len(usinas)):
            g = gnra[i]
            if perfil(g, ini - DIAS_PERFIL, ini) is None:
                continue
            for d in range(ini, fim):
                prof = perfil(g, d - ATRASO_PUBLICACAO_DIAS - DIAS_PERFIL, d - ATRASO_PUBLICACAO_DIAS)
                if prof is None:
                    continue
                p = prof["p"][TIPO_DIA[d]]
                v = g[d * 48:(d + 1) * 48].astype(np.float64)
                for x in np.nonzero(~np.isnan(v) & (v >= LIMIAR_CORTE_MW))[0]:
                    k = NOME_RAZAO.get(int(razao[i][d * 48 + x]), "sem")
                    total[k] = total.get(k, 0.0) + v[x] * 0.5
                    if p[x] >= LIMIAR_JANELA:
                        dentro[k] = dentro.get(k, 0.0) + v[x] * 0.5
        soma = sum(total.values()) or 1
        return {k: {"fracao_do_corte": r3(total[k] / soma), "capturado": r3(dentro.get(k, 0.0) / total[k])}
                for k in sorted(total, key=lambda x: -total[x])}

    razoes["captura"] = {"teste_ago_set": captura_por_razao(ago26, vivo26), "ao_vivo": captura_por_razao(vivo26, ultimo_dia + 1)}
    # por usina de destaque, 2026 até o último dado
    razoes["por_usina_2026"] = {}
    for uid in selecionadas:
        i = idx[uid]
        v = np.nan_to_num(gnra[i, jan26 * 48:(ultimo_dia + 1) * 48].astype(np.float64))
        r = razao[i, jan26 * 48:(ultimo_dia + 1) * 48]
        por = {NOME_RAZAO.get(int(k), "sem"): float(v[r == k].sum()) * 0.5 for k in np.unique(r[v > 0])}
        razoes["por_usina_2026"][uid] = {"gwh": math.floor(sum(por.values()) / 100 + 0.5) / 10, "fracao": fracoes(por)}

    def mw_medios(filtro: pd.Series, ini: str, fim: str) -> dict:
        """Energia perdida e potência média entre os meses ini e fim (inclusive)."""
        sel = reg[filtro & (reg["ano_mes"] >= ini) & (reg["ano_mes"] <= fim)]
        mwh = sel["val_geracaonaorealizadaapurada"].sum() * 0.5
        horas = (date.fromisoformat(f"{fim}-01").replace(day=calendar.monthrange(int(fim[:4]), int(fim[5:]))[1])
                 - date.fromisoformat(f"{ini}-01")).days * 24 + 24
        return {"periodo": f"{ini} a {fim}", "energia_perdida_gwh": inteiro(mwh / 1000), "mw_medios": inteiro(mwh / horas),
                "gwh_por_dia": math.floor(mwh / horas * 24 / 1000 * 10 + 0.5) / 10}

    ne = reg["id_subsistema"] == "NE"
    brasil = reg["id_subsistema"].notna()

    # 4) Catálogo de usinas do RN, BA e CE
    catalogo = sorted(usinas, key=lambda u: -u["jan_jul_2026"]["energia_perdida_gwh"])
    gravar_json("usinas.json", [{**u, "disp_max_mw": inteiro(u["disp_max_mw"]), "destaque": u["id"] in selecionadas} for u in catalogo])

    # 5) Resumos para o relatório
    resumo = {"selecionadas": [{"id": uid, "nome": usinas[idx[uid]]["nome"], "uf": usinas[idx[uid]]["uf"], "tipo": usinas[idx[uid]]["tipo"],
                                "agente": usinas[idx[uid]]["agente"], "disp_max_mw": inteiro(usinas[idx[uid]]["disp_max_mw"]),
                                **usinas[idx[uid]]["jan_jul_2026"]} for uid in selecionadas]}
    tipos = np.array([u["tipo"] for u in usinas])
    corte = trecho >= LIMIAR_CORTE_MW
    td_trecho = np.repeat(TIPO_DIA[jan26:ago26], 48)
    for nome, tdv in (("chance_corte_dia_util", 0), ("chance_corte_fim_de_semana_feriado", 1)):
        sel = valido & (td_trecho == tdv)[None, :]
        resumo[nome] = r3(corte[sel].sum() / sel.sum())
    hora = np.tile(np.arange(48) // 2, ago26 - jan26)
    resumo["perda_por_hora_pct"] = {}
    for tipo in ("eolica", "solar"):
        v = np.nan_to_num(trecho[tipos == tipo]) * 0.5
        por_hora = np.bincount(np.broadcast_to(hora, v.shape).ravel(), weights=v.ravel(), minlength=24)
        resumo["perda_por_hora_pct"][tipo] = [math.floor(x / por_hora.sum() * 1000 + 0.5) / 10 for x in por_hora]
    resumo["por_mes"] = {}
    ano_mes = np.array([d.isoformat()[:7] for d in DIAS])
    for am in dict.fromkeys(ano_mes):
        dias = np.nonzero(ano_mes == am)[0]
        bloco = gnra[:, dias[0] * 48:(dias[-1] + 1) * 48].astype(np.float64)
        horas = len(dias) * 24  # o mês corrente pode estar parcial
        resumo["por_mes"][am] = {}
        for tipo in ("eolica", "solar"):
            b = bloco[tipos == tipo]
            ok = ~np.isnan(b)
            mwh = np.nansum(b) * 0.5
            resumo["por_mes"][am][tipo] = {"energia_perdida_gwh": math.floor(mwh / 100 + 0.5) / 10, "mw_medios": inteiro(mwh / horas),
                                           "chance_corte": r3((b[ok] >= LIMIAR_CORTE_MW).sum() / ok.sum())}
    conf = sum(j["resultado_ons"] == "confirmado" for j in janelas)
    resumo["janelas"] = {"total": len(janelas), "confirmadas": conf, "erradas": sum(j["resultado_ons"] == "errado" for j in janelas),
                         "fracao_confirmadas": r3(conf / (len(janelas) or 1))}

    def placar_vivo(lista: list[dict]) -> dict:
        com_veredito = [j for j in lista if j["resultado_ons"] in ("confirmado", "errado")]
        c = sum(j["resultado_ons"] == "confirmado" for j in com_veredito)
        return {"total": len(com_veredito), "confirmadas": c, "erradas": len(com_veredito) - c,
                "fracao_confirmadas": r3(c / len(com_veredito)) if com_veredito else None}

    resumo["janelas_ao_vivo"] = {"periodo": f"{INICIO_AO_VIVO} a {iso_do_dia(ultimo_dia)}", **placar_vivo(vivas),
                                 "publicadas_antes": placar_vivo([j for j in vivas if j["publicada_antes"]])}
    resumo["corte_oficial_ons"] = {
        "nota": "soma da GNRa de todas as usinas eólicas e solares do ONS, sem filtro de estado",
        "nordeste_jan_ago_2026": mw_medios(ne, "2026-01", "2026-08"),
        "nordeste_jan_set_2026": mw_medios(ne, "2026-01", "2026-09"),
        "brasil_jan_ago_2026": mw_medios(brasil, "2026-01", "2026-08"),
        "brasil_jan_set_2026": mw_medios(brasil, "2026-01", "2026-09"),
        "nordeste_2025": mw_medios(ne, "2025-01", "2025-12"),
        "brasil_2025": mw_medios(brasil, "2025-01", "2025-12"),
    }
    resumo["janelas_proximos_dias"] = {"periodo": f"{iso_do_dia(ultimo_dia + 1)} a {iso_do_dia(ultimo_dia + ATRASO_PUBLICACAO_DIAS + 1)}",
                                      "total": len(proximas), "usinas_com_janela": len({j["id_ons"] for j in proximas})}
    resumo["razoes"] = razoes
    gravar_json("resumo.json", resumo)

    # Impressões digitais: quem rodar o mesmo código com os mesmos dados do ONS deve obter os mesmos SHA-256
    gravar("impressoes_digitais.txt", "\n".join(f"{h}  {n}" for n, h in sorted(IMPRESSOES.items())))

    # Resumo no terminal
    print(f"\nusinas: {len(usinas)} | destaque: {', '.join(selecionadas)}")
    for nome, t in resultado["testes"].items():
        print(f"\n{nome} ({t['usinas_avaliadas']} usinas)   precisão  cobertura  energia  ganho")
        for m, x in t["geral"].items():
            print(f"  {m:<22} {x['precisao']:>7.1%} {x['cobertura']:>9.1%} {x['energia_capturada']:>8.1%} {x['ganho_sobre_taxa_media']:>6.1%}")
    print(f"\njanelas ago–set: {resumo['janelas']}")
    print(f"corte no Nordeste por razão ({razoes['nordeste_2026']['periodo']}): {razoes['nordeste_2026']['fracao']}")
    for nome_p, c in razoes["captura"].items():
        print(f"captura por razão, {nome_p}: " + ", ".join(f"{k} {x['capturado']:.1%} ({x['fracao_do_corte']:.0%} do corte)" for k, x in c.items()))
    print(f"janelas ao vivo {resumo['janelas_ao_vivo']['periodo']}: {resumo['janelas_ao_vivo']['confirmadas']} de "
          f"{resumo['janelas_ao_vivo']['total']} confirmadas")
    print(f"janelas previstas {resumo['janelas_proximos_dias']['periodo']}: {len(proximas)}")
    for k, v in resumo["corte_oficial_ons"].items():
        if isinstance(v, dict):
            print(f"corte {k}: {v['mw_medios']} MW médios ({v['gwh_por_dia']} GWh/dia)")
    print("\nimpressões digitais (SHA-256) em dados/saida/impressoes_digitais.txt")


if __name__ == "__main__":
    main()
