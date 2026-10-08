# Vento Cortado

Mercado de flexibilidade para o excesso de energia renovável do Nordeste brasileiro: previsão aberta das janelas em que o ONS manda cortar usinas eólicas e solares, liquidação em USDC na Solana e recibo verificável em duas fases.

Projeto do time Nomos (Emmanuel Stein e Guilherme Amorim) para o Colosseum Crypto World's Fair 2026.

## Estado

| Etapa | Situação |
| --- | --- |
| 1. Dados reais do ONS e teste retroativo | Concluída (`dados/`) |
| 2. Atlas (site) | Concluída (`site/`) |
| 3. Pagamento na Solana | A fazer |
| 4. Recibo em duas fases | A fazer |
| 5. Trabalho em lote | A fazer |
| 6. Entrega | A fazer |

## Etapa 1 em resumo

O Nordeste deixou de gerar **3,4 GW médios** de eólica e solar em jan–ago/2026 (cálculo direto do ONS). Usando só dados públicos disponíveis uma semana antes, as janelas previstas capturaram **90% da energia cortada em agosto e 95% em setembro de 2026**, em 154 usinas do RN, BA e CE. Detalhes em [`dados/RELATORIO_ETAPA1.md`](dados/RELATORIO_ETAPA1.md).

## Atlas (site)

Site bilíngue (inglês e português) com o mapa das usinas, as janelas previstas, o placar público e o método. Veja [`site/README.md`](site/README.md).

```bash
python dados/scripts/atlas.py     # prepara os dados do site
cd site && npm install && npm run dev
```

## Como rodar a parte de dados

Requer Python 3.11 ou mais recente. Na primeira vez, crie o ambiente e instale as bibliotecas:

```bash
python -m venv .venv
```

Depois, chame o Python do ambiente pelo caminho completo. Isso dispensa "ativar" o ambiente, que o PowerShell do Windows costuma bloquear.

**Windows**

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe dados\scripts\baixar_ons.py    # ~100 MB em Parquet, salvos em ..\dados-ons\brutos
.venv\Scripts\python.exe dados\scripts\etapa1.py        # ~10 segundos; recria dados\saida\
```

**Mac/Linux**

```bash
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python dados/scripts/baixar_ons.py
.venv/bin/python dados/scripts/etapa1.py
```

O download pula os meses que já existem; para buscar meses novos, use `--fim AAAA_MM`. Os arquivos de `dados/saida/` só mudam quando os dados do ONS mudam.

**Conferir o resultado:** os arquivos de saída são byte a byte iguais em qualquer sistema. Depois de rodar, compare `dados/saida/impressoes_digitais.txt` com a versão do repositório (`git diff`): se nada mudou, você chegou exatamente aos mesmos números.

No VS Code, escolha o interpretador em **Ctrl+Shift+P → Python: Select Interpreter → .venv** para rodar com o botão ▶.

## Estrutura

```
dados/
  RELATORIO_ETAPA1.md       método, resultados e pontos de honestidade
  scripts/
    baixar_ons.py           baixa os arquivos mensais de constrained-off do ONS
    etapa1.py               chance de corte por usina/mês/hora e teste retroativo
    atlas.py                junta os resultados, a localização e o preço para o site
  config/                   localização aproximada das usinas de destaque
  saida/                    resultados usados pelo site (Atlas) e pelo pitch
site/                       o Atlas (Next.js)
```

## Dados

ONS, dados abertos de restrição de operação por constrained-off de usinas eólicas e fotovoltaicas, licença CC-BY.
