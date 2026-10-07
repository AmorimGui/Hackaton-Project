# Etapa 1 – Dados reais e teste retroativo

Vento Cortado · 07/10/2026 · dados do ONS de jan/2025 a set/2026

## Resultado em uma frase

Prevendo só com dados que já estariam publicados, o modelo acertou **89% das meias-horas que ofereceu em agosto e 85% em setembro de 2026**, e suas janelas cobriram **90% e 95% da energia que o ONS mandou cortar** nas 154 usinas avaliadas do RN, BA e CE.

## O que foi feito

1. Baixados do portal de dados abertos do ONS (licença CC-BY) os arquivos mensais de constrained-off de usinas **eólicas e fotovoltaicas**, de jan/2025 a set/2026: 42 arquivos Parquet, cerca de 100 MB.
2. Mantidas as usinas do **RN, BA e CE**: 166 conjuntos (126 eólicos, 40 solares). O ONS publica por "conjunto de usinas"; há também um dataset por usina individual.
3. Calculada a **chance de corte por usina, mês e hora** com todo o histórico.
4. Feito o **teste retroativo** em agosto e setembro de 2026, meses que o modelo não viu.
5. Geradas as **janelas que teriam sido oferecidas** em ago–set para 8 usinas de destaque, com o veredito do ONS (confirmado ou errado), prontas para o Atlas e para o recibo em duas fases.

## O que os dados do ONS contêm

- Um registro a cada **30 minutos** por conjunto de usinas, sem lacunas (48 por dia).
- Colunas principais: estado, usina, data/hora, geração verificada, geração limitada, geração de referência, motivo e origem da restrição, minutos de restrição e **GNRa** (geração não realizada apurada), a energia frustrada calculada pelo próprio ONS. Valores em MW médios; energia em MWh = MW médios × 0,5.
- Motivos de corte (dicionário oficial): **ENE** razão energética (sobra energia no sistema), **CNF** requisitos de confiabilidade, **REL** indisponibilidade externa (limite da rede elétrica), **PAR** restrição do parecer de acesso. Origem: **SIS** sistêmica ou **LOC** local.
- **Atraso de publicação de cerca de uma semana**: em 06/10 o arquivo de setembro já estava completo até 30/09 23h30. Os arquivos são revisados depois (julho foi atualizado em setembro), então o primeiro dado pode ser preliminar.
- O campo `dsc_restricao` (texto livre) às vezes tem **quebras de linha dentro do texto**. Quem ler o CSV linha a linha corta esses registros; por isso o projeto lê o Parquet (ou o CSV com pandas).

**Definição usada:** uma meia hora conta como corte quando a GNRa do ONS é de pelo menos 1 MW médio.

## O tamanho do problema (RN, BA e CE)

- Jan–jul/2026: **12.277 GWh perdidos**, cerca de **2.410 MW médios** só nesses três estados.
- O corte cresce no segundo semestre: a eólica perdeu 4.228 MW médios em ago/2026 e 3.699 em set/2026, contra 617 em fev/2026. Em 2025, o pico foi em outubro (5.408 MW médios).
- **Horário:** 61% da perda eólica acontece entre 8h e 14h59, com pico entre 9h e 11h. Na solar, 83% acontece entre 8h e 13h59. A eólica é cortada justamente quando a solar está gerando.
- **Dia da semana:** a chance de corte é 30% em dias úteis e **38% em fins de semana e feriados**, quando a carga cai. Isso confirma que boa parte do corte é por sobra de energia, e não só por limite de linha.

## Teste retroativo

Cada modelo previu a chance de corte de cada meia hora de agosto e de setembro de 2026, para cada usina, usando só dados anteriores. Uma janela é oferecida quando a chance prevista é de 50% ou mais.

| Modelo | O que usa | Agosto: precisão / cobertura / energia | Setembro: precisão / cobertura / energia | Ganho sobre a taxa média (ago / set) |
| --- | --- | --- | --- | --- |
| Taxa média da usina | Só a taxa geral, sem hora | 89% / 39% / 46% | 78% / 50% / 52% | referência |
| Regra fixa 8h–15h | Toda usina cortada das 8h às 15h | 86% / 53% / 59% | 87% / 55% / 59% | −26% / −24% |
| Mesmo mês de 2025 | Perfil do mesmo mês do ano anterior | 78% / 78% / 80% | 77% / 88% / 88% | 33% / 37% |
| Perfil das 8 semanas | Dados até o fim do mês anterior | 90% / 78% / 87% | 85% / 89% / 94% | 49% / 55% |
| Combinado | Média dos dois anteriores | 86% / 82% / 88% | 82% / 92% / 94% | 48% / 52% |
| **Contínuo com atraso** | **Atualizado todo dia com dados de 7+ dias atrás** | **89% / 82% / 90%** | **85% / 90% / 95%** | **54% / 56%** |

- **Precisão:** das meias-horas oferecidas, quantas tiveram corte.
- **Cobertura:** dos cortes reais, quantos estavam numa janela oferecida.
- **Energia:** fração da energia cortada que caiu dentro das janelas.
- **Ganho:** redução do erro de probabilidade (Brier skill score) em relação à taxa média da usina.

O **modelo contínuo com atraso** é o de produção: no dia D ele só usa dados publicados até D−8. É o recomendado para o produto.

**Por tipo de usina (contínuo, agosto):** eólica 90% de precisão e 83% de cobertura; solar 88% e 81%.

### Usinas de destaque

Selecionadas antes do teste, pela energia perdida em jan–jul/2026, com cota por estado e tipo.

| Usina | UF | Tipo | Agente | Perdeu jan–jul/2026 | Agosto: precisão / cobertura | Janelas confirmadas (ago–set) |
| --- | --- | --- | --- | --- | --- | --- |
| Conj. Serra do Assuruá (CJU_BASAR) | BA | Eólica | ENGIE | 337 GWh | 92% / 87% | 59 de 61 |
| Conj. Novo Horizonte (CJU_BANHZ) | BA | Eólica | COTESA | 255 GWh | 90% / 87% | 57 de 61 |
| Conj. Rio do Vento (CJU_RNRDV) | RN | Eólica | CVER | 281 GWh | 85% / 92% | 111 de 124 |
| Conj. Rio do Vento Expansão (CJU_RNRVE) | RN | Eólica | CVER | 268 GWh | 86% / 91% | 114 de 124 |
| Conj. Itarema V (CJU_CEITC) | CE | Eólica | SIMM | 83 GWh | 85% / 83% | 56 de 61 |
| Conj. Sol do Sertão (CJU_BASSD) | BA | Solar | COTESA | 240 GWh | 92% / 89% | 55 de 61 |
| Conj. Assu Sol (CJU_RNASO) | RN | Solar | ENGIE | 191 GWh | 92% / 82% | 61 de 61 |
| Conj. Mauriti (CJU_CEMTD) | CE | Solar | IQONY | 76 GWh | 83% / 83% | 51 de 61 |

No total, **564 das 614 janelas (92%) foram confirmadas pelo ONS**. Uma janela é "confirmada" quando houve corte em pelo menos metade das suas meias-horas.

## Pontos de honestidade

1. **A precisão sozinha engana.** Em ago–set, essas usinas foram cortadas em cerca de 47% das meias-horas. Até a taxa média, que ignora a hora, tem 89% de precisão em agosto. O que prova o valor do modelo é manter a precisão e **dobrar a cobertura** (82% contra 39%), com ganho de 54% sobre a taxa média. É essa comparação que deve ir para o pitch.
2. **O modelo é conservador nesta época do ano.** Quando ele prevê entre 50% e 60%, o corte real acontece em 76% das vezes, porque o corte sobe de julho para outubro e o perfil olha para trás. Corrigir com a tendência sazonal é uma melhoria simples, que não foi feita para manter o teste limpo.
3. **Só usa padrões do passado.** Não usa previsão do tempo, de carga nem de transmissão.
4. **Os dados de ago–set podem ser revisados** pelo ONS.
5. **Conjunto não é usina.** O recibo por usina individual exigiria o dataset de detalhamento.
6. **A equivalência em horas de GPU é ilustrativa** (0,85 kW por H100, suposição do escopo).
7. **Os parâmetros foram fixados antes de rodar o teste** (limiar de 1 MW, janela a partir de 50%, 8 semanas, 7 dias de atraso, cotas da seleção) e não foram ajustados depois.

## O que isso muda no projeto

- **A previsão é viável e defensável** com dados abertos e um método simples. Frase para o pitch: *"Using only public ONS data available a week earlier, our windows captured 90% of the curtailed energy in August and 95% in September 2026, across 154 plants."*
- **O gargalo do negócio é a demanda, não a energia.** Uma única janela da Serra do Assuruá em 01/08 desperdiçou 3.294 MWh; um container de 10 MW consome cerca de 100 MWh numa janela de 10 horas, ou 3% disso.
- **A maioria dos cortes é sistêmica (ENE/SIS).** Uma carga em qualquer lugar da rede ajuda a absorver o excesso, dentro dos limites de transmissão entre regiões. O texto seguro do recibo continua sendo: *"executado durante uma janela de corte registrada pelo ONS na usina X"*.
- **O recibo em duas fases funciona com uma semana de atraso.** O arquivo de janelas já traz o veredito do ONS para a demo.

## Arquivos gerados (`dados/saida/`)

| Arquivo | Conteúdo | Uso |
| --- | --- | --- |
| `chance_corte_por_usina_mes_hora.csv` | Chance de corte e perda média por usina, mês e hora, para as 166 usinas | Índice aberto (bem público) e gráficos do Atlas |
| `teste_retroativo.json` | Métricas por modelo, por tipo e por usina de destaque, com calibração | Página pública do teste e pitch |
| `janelas_previstas_ago_set_2026.json` | 614 janelas oferecidas e o veredito do ONS | Lista de janelas do Atlas e demo do recibo |
| `usinas.json` | Catálogo das 166 usinas com estado, agente, ponto de conexão e perdas | Mapa e filtros do Atlas |
| `resumo.json` | Totais por mês, perda por hora e efeito do fim de semana | Textos e gráficos |

Para rodar de novo, veja o `README.md` na raiz do repositório.

## O que falta para a Etapa 2 (Atlas)

- **Localização das usinas:** os arquivos do ONS não trazem coordenadas. Para a demo, basta posicionar as 8 de destaque à mão pelo município; depois, cruzar o CEG das usinas individuais com o cadastro da Aneel (SIGA).
- **Valor em reais:** depende do preço da energia (o escopo supõe R$ 200/MWh, a validar).
