# Vento Cortado

Mercado de flexibilidade para o excesso de energia renovável do Nordeste brasileiro: previsão aberta das janelas em que o ONS manda cortar usinas eólicas e solares, liquidação em USDC na Solana e recibo verificável em duas fases.

Projeto do time Nomos (Emmanuel Stein e Guilherme Amorim) para o Colosseum Crypto World's Fair 2026.

## Estado

| Etapa | Situação |
| --- | --- |
| 1. Dados reais do ONS e teste retroativo | Concluída (`dados/`) |
| 2. Atlas (site) | A fazer |
| 3. Pagamento na Solana | A fazer |
| 4. Recibo em duas fases | A fazer |
| 5. Trabalho em lote | A fazer |
| 6. Entrega | A fazer |

## Etapa 1 em resumo

Usando só dados públicos do ONS disponíveis uma semana antes, as janelas previstas capturaram **90% da energia cortada em agosto e 95% em setembro de 2026**, em 154 usinas do RN, BA e CE. Detalhes em [`dados/RELATORIO_ETAPA1.md`](dados/RELATORIO_ETAPA1.md).

## Como rodar a parte de dados

Requer Python 3.11 ou mais recente.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    |    Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
python dados/scripts/baixar_ons.py    # ~100 MB em Parquet, salvos em ../dados-ons/brutos
python dados/scripts/etapa1.py        # ~10 segundos; recria dados/saida/
```

## Estrutura

```
dados/
  RELATORIO_ETAPA1.md       método, resultados e pontos de honestidade
  scripts/
    baixar_ons.py           baixa os arquivos mensais de constrained-off do ONS
    etapa1.py               chance de corte por usina/mês/hora e teste retroativo
  saida/                    resultados usados pelo site (Atlas) e pelo pitch
```

## Dados

ONS, dados abertos de restrição de operação por constrained-off de usinas eólicas e fotovoltaicas, licença CC-BY.
