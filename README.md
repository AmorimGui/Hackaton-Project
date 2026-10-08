# Vento Cortado

Mercado de flexibilidade para o excesso de energia renovável do Nordeste brasileiro: previsão aberta das janelas em que o ONS manda cortar usinas eólicas e solares, liquidação em USDC na Solana e recibo verificável em duas fases.

Projeto do time Nomos (Emmanuel Stein e Guilherme Amorim) para o Colosseum Crypto World's Fair 2026.

**Site:** [hackaton-project-liart.vercel.app](https://hackaton-project-liart.vercel.app) — publicado na Vercel; cada `git push` na `main` atualiza o site.

## Estado

| Etapa | Situação |
| --- | --- |
| 1. Dados reais do ONS e teste retroativo | Concluída (`dados/`) |
| 2. Atlas (site) | Concluída (`site/`) |
| 3. Pagamento na Solana (devnet) | Concluída (`site/src/lib/solana.ts`) |
| 4. Recibo em duas fases e verificação pública | Concluída (`site/src/lib/recibo.ts`, página `/verify`) |
| 5. Trabalho em lote | A fazer |
| 6. Entrega | A fazer |

## Etapa 1 em resumo

O Nordeste deixou de gerar **3,4 GW médios** de eólica e solar em jan–ago/2026 (cálculo direto do ONS). Usando só dados públicos disponíveis uma semana antes, as janelas previstas capturaram **90% da energia cortada em agosto e 95% em setembro de 2026**, em 154 usinas do RN, BA e CE. Detalhes em [`dados/RELATORIO_ETAPA1.md`](dados/RELATORIO_ETAPA1.md).

## Pagamento na Solana (Etapa 3)

Cada janela prevista tem um botão **Comprar**: o comprador escolhe os MWh, o preço sai do PLD da janela convertido em USDC pela PTAX do Banco Central, e **uma única transação** assinada na Phantom paga usina (70%), operador (25%) e plataforma (5%) e grava um memo com o que foi comprado. A plataforma nunca segura o dinheiro. Roda na **devnet** com USDC de teste; usina e operador são carteiras de teste.

**Primeira compra (08/10/2026):** 0,5 MWh da Serra do Assuruá por 5,73846 USDC — [ver no Solana Explorer](https://explorer.solana.com/tx/5bRw4an8rY7hpYxVnoo217MN85dGUfycp5t6Q6mGQkFDubDdbLE2MABiYVGecacT9SkLoTL1ijtTrj9NjULy5Bg9?cluster=devnet).

## Recibo em duas fases (Etapa 4)

Depois do pagamento, o site grava dois registros na Solana, cada um citando a transação da compra:

1. **Recibo (fase 1):** a usina e o operador assinam um memo reconhecendo a venda (a plataforma paga a taxa).
2. **Carimbo do ONS (fase 2):** quando o ONS publica o dado da janela (cerca de uma semana depois), a plataforma, como oráculo declarado (v1), grava o veredito, *confirmado* ou *errado*, com o arquivo oficial do ONS e seu SHA-256.

A página [`/verify`](https://hackaton-project-liart.vercel.app/verify) lê tudo direto da blockchain e ensina a conferir sem confiar no site. O site guarda uma cópia exata de cada arquivo do ONS citado num carimbo (`site/public/ons/<sha256>/`), porque o ONS às vezes republica um mês: em 08/10/2026 ele renomeou usinas nos arquivos de setembro. Os números não mudaram, mas o SHA-256 mudou.

**Ciclo completo (replay de 29/09/2026, janela confirmada pelo ONS):** [pagamento, recibo e carimbo](https://hackaton-project-liart.vercel.app/verify?tx=5pxHxeJt42bGkPxLN1pK78m8znCgBLgZMRNSqjuZVjM6SLu4EVSB6QqNkPrK5r71sPCNa8PYwxnaf14afkmuRcuN).

Para testar sem Phantom, `node scripts/compra-teste.mjs CJU_BASAR 2026-09-29` (na pasta `site/`) faz a mesma compra com uma carteira de teste e pede o recibo ao site.

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
