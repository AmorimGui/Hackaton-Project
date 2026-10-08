// Tipos dos dados do Atlas (gerados por dados/scripts/atlas.py).

export type Janela = {
  id_ons: string;
  usina: string;
  uf: string;
  tipo: "eolica" | "solar";
  data: string;
  inicio: string;
  fim: string;
  chance_prevista: number;
  energia_esperada_mwh: number;
  gpu_horas_esperadas: number;
  resultado_ons: "confirmado" | "errado" | "aguardando_ons" | "sem_dado";
  fracao_com_corte: number | null;
  energia_cortada_mwh: number | null;
  gpu_horas_equivalentes: number | null;
  razoes_do_corte: Record<string, number>;
  valor_referencia_rs?: number;
};

export type Metricas = {
  precisao: number;
  cobertura: number;
  energia_capturada: number;
  ganho_sobre_taxa_media: number;
  taxa_real_de_corte: number;
  meias_horas_avaliadas: number;
};

export type Usina = {
  id: string;
  nome: string;
  uf: string;
  tipo: "eolica" | "solar";
  agente: string;
  ponto_conexao: string;
  capacidade_mw: number;
  local: { municipio: string; uf: string; lat: number; lon: number; fonte: string };
  perdeu_jan_jul_2026_gwh: number;
  fracao_meias_horas_com_corte: number;
  calor: (number | null)[][];
  teste: { agosto: Metricas; setembro: Metricas };
  placar: { janelas: number; confirmadas: number };
  recentes: Janela[];
  proximas: Janela[];
};

export type Atlas = {
  dados_ate: string;
  previsao: {
    periodo: string;
    dias: string[];
    por_dia: Record<string, { janelas: number; usinas: number; energia_esperada_mwh: number }>;
    usinas_com_janela: number;
    total_janelas: number;
  };
  manchete: {
    nordeste_mw_medios: number;
    nordeste_gwh_dia: number;
    periodo: string;
    brasil_mw_medios: number;
    valor_anual_piso_rs: number;
    valor_pld_real_rs: number | null;
    valor_pld_real_periodo: string | null;
    energia_capturada_ago: number;
    energia_capturada_set: number;
    usinas_avaliadas: number;
  };
  pld: {
    tipo: string;
    descricao: string;
    piso_2026_rs_mwh: number;
    valor_rs_mwh?: number;
    periodo?: string;
    cruzamento: {
      periodo: string;
      energia_cortada_gwh: number;
      fracao_energia_com_pld_no_piso: number;
      pld_medio_ponderado_rs_mwh: number;
      valor_ao_pld_real_rs: number;
      valor_ao_piso_rs: number;
      fracao_horas_no_piso: number;
      piso_por_hora_pct: number[];
    } | null;
  };
  kw_por_gpu: number;
  usinas: Usina[];
  teste: {
    agosto: Record<string, Metricas>;
    setembro: Record<string, Metricas>;
    por_tipo_agosto: Record<string, Metricas>;
    calibracao_agosto: { faixa: string; n: number; prevista: number; observada: number }[];
    parametros: Record<string, unknown>;
    placar: { total: number; confirmadas: number; erradas: number; fracao_confirmadas: number };
  };
  padroes: {
    perda_por_hora_pct: { eolica: number[]; solar: number[] };
    chance_dia_util: number;
    chance_fim_de_semana: number;
    nordeste_mensal_mw: { mes: string; eolica: number; solar: number }[];
  };
  impressoes: string[];
};

export const REPOSITORIO = "https://github.com/AmorimGui/Hackaton-Project";
