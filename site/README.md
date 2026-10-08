# Atlas (site do Vento Cortado)

Site em Next.js 16 + TypeScript + Tailwind, em inglês (padrão) e português.

| Página | O que mostra |
| --- | --- |
| `/` | Manchete com o corte oficial do Nordeste, mapa das usinas de destaque, janelas previstas por dia e os padrões do corte |
| `/plants/[id]` | Detalhe de cada usina: janelas previstas, mapa de calor mês × hora, histórico com o veredito do ONS e teste retroativo |
| `/track-record` | Placar público: comparação de modelos, calibração e impressões digitais (SHA-256) |
| `/method` | O que é real, estimado e simulado; definições; dados abertos para baixar; limitações |

## Dados

O site não calcula nada: lê `src/data/atlas.json` e serve os arquivos de `public/data/`, ambos gerados por:

```bash
python dados/scripts/atlas.py
```

(rodar na raiz do repositório, depois de `dados/scripts/etapa1.py`). Não edite `atlas.json` à mão.

Os textos das duas línguas ficam em `src/i18n/dicionarios.ts`.

## Rodar

```bash
npm install
npm run dev      # desenvolvimento, em http://localhost:3000
npm run build    # compilação de produção
npm run start    # serve a compilação
```

Mapa: Leaflet com OpenStreetMap (sem chave de API). Localização das usinas: `dados/config/localizacao_usinas.json` (aproximada, por município).
