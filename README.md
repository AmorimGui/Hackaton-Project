<p align="center"><img src="site/public/brand/nomos-logotipo.png" alt="Nomos" width="240"></p>

# Nomos

**An open atlas of the wind and solar power that Brazil's grid operator throws away, with a public forecast track record and hourly on-chain receipts on Solana.**

Built by Emmanuel Stein and Guilherme Amorim, university students in Brazil, for the Colosseum Crypto World's Fair 2026.

**Live app:** [hackaton-project-liart.vercel.app](https://hackaton-project-liart.vercel.app) (English by default, PT button in the header). No login or install is needed to explore it.

## The problem

In 2026, the Northeast of Brazil curtailed **3.4 GW of wind and solar power on average** (82 GWh of clean energy a day, January–August), because the grid could not absorb it. The national grid operator (ONS) orders plants to cut output and publishes what happened, half-hour by half-hour, about a day later.

- From January 1 to October 9, the curtailed energy was worth **R$ 2.6 billion** at the actual hourly spot price (PLD). Two thirds of it was cut while the price was already at its legal floor.
- **66%** of it was an *energy surplus* (ONS reason `ENE`), the predictable part. The rest was electrical: grid reliability limits (`CNF`, 24%) and lines or equipment out (`REL`, 10%).
- According to the ONS data dictionary, only `REL` cuts enter the calculation of compensation to plants (ESS). The other 90% of the curtailed energy does not.

## What Nomos does

**Today (the product): an open atlas and a neutral reference for contracts.** Loads that want to sit next to wind and solar plants, such as miners, data centers and other flexible compute, sign long contracts (around 2 years), and curtailment works as a discount in them. To price it, they need to know how much each plant loses, of which kind, at which hours, and how predictable it is. Plants have that history and paid intelligence; the other side has less. The atlas gives it for free, per plant:

- curtailed energy, the reason mix and a month × hour heat map;
- a daily forecast of curtailment windows for the next 8 days, with a reference value at the hourly PLD;
- a public track record: a frozen backtest plus a live scoreboard that shows every miss.

**The vision: an hourly certificate that a load used energy that would otherwise be lost.** Each window can be reserved for a compute job. The reservation leaves a chain of public records on Solana:

1. **Forecast.** Every day, after the ONS publishes, the SHA-256 of the forecast file is recorded on-chain. This proves the forecast existed before the day.
2. **Reservation and payment.** One transaction in Phantom pays the plant (70%), the compute operator (25%) and the platform (5%) in USDC. The platform never holds the money.
3. **Receipt (phase 1).** The plant and the operator co-sign a memo that acknowledges the reservation.
4. **Execution.** The operator waits for the window, runs a small AI job, and records its start and end on-chain. The block times show that it ran inside the window.
5. **ONS stamp (phase 2).** The next day, the verdict (confirmed or wrong) is recorded with the official ONS file and its SHA-256.

Hour-by-hour clean-energy claims are where large buyers are heading: Google's 24/7 carbon-free goal and EnergyTag's granular certificates. EU rules for renewable hydrogen already count grid power used during renewable curtailment as renewable (Delegated Regulation 2023/1184, Art. 4(3)). **Who would pay for this certificate in Brazil has not been validated yet**; it is the next thing we will test.

## Try it in two minutes

1. **[Track record](https://hackaton-project-liart.vercel.app/track-record):** the backtest, the live scoreboard and the three kinds of curtailment.
2. **[A plant page](https://hackaton-project-liart.vercel.app/plants/CJU_BASAR):** why it is curtailed, the forecast windows and the history with the ONS verdict.
3. **[A complete live cycle](https://hackaton-project-liart.vercel.app/verify?tx=5MHPTtL3KopV1hAZd2cd4cNZUB79FvdiVo2RZnJFNRTjkshaZC7atmyibwsokAKNYv4boUNx2G85Kxnuc4ofWhBv):**
    - the forecast was published on Oct 7;
    - the window was reserved at 4 pm on Oct 8;
    - the AI job ran inside the window at 6:30 pm;
    - the ONS confirmed the curtailment on Oct 9 (82% of the half-hours, 427 MWh).

   Every record links to Solana Explorer.
4. **Optional: reserve a window yourself.**
    - Switch Phantom to Testnet mode on Solana Devnet.
    - Get test SOL ([faucet.solana.com](https://faucet.solana.com)) and test USDC ([faucet.circle.com](https://faucet.circle.com)).
    - Click **Reserve** on any forecast window, or **Replay** on a past one to see the whole cycle at once.

## Results

| | Value |
| --- | --- |
| Curtailed energy inside our windows (backtest, 154 plants) | 90% in Aug 2026, 95% in Sep 2026 |
| Precision / coverage of the production model | 89.5% / 82.4% (Aug), 84.8% / 90.2% (Sep) |
| Error reduction vs. the plant's average rate (Brier skill) | 54% (Aug), 56% (Sep) |
| Windows confirmed by the ONS, 8 featured plants | 564 of 614 (Aug–Sep) |
| Live since Oct 1 | 60 of 89 confirmed (Oct 1–9); 20 of 20 for forecasts published before the day |
| Captured by reason, backtest | energy surplus 95%, reliability 89%, line or equipment out 81% |

The forecast parameters were fixed before the test. Early October was weaker: in two Rio Grande do Norte plants, the night-time reliability cuts stopped abruptly on Sep 28–29, and a model that only learns from past patterns kept offering those windows. This is exactly the kind of change an operator told us to expect from electrical curtailment.

Everything is reproducible. The pipeline writes byte-identical outputs on any machine, and their SHA-256 fingerprints are published. Our daily GitHub Actions run on Linux regenerates the same files the team produces on Windows.

## What is real and what is simulated

| Part | Status |
| --- | --- |
| ONS curtailment data (with the reason for every cut), CCEE hourly PLD, Central Bank PTAX rate | Real, open data, updated daily |
| Forecast, backtest, live scoreboard | Real |
| Reservation, payment split, receipt, execution records, ONS stamp | Real on Solana devnet, with test USDC |
| AI job | Real but small: a multilingual embedding model on a laptop CPU, which runs in seconds |
| Plant and compute operator | Simulated (test wallets); we have no partner plant or operator yet |
| Absorbing curtailed energy | Does not happen in the demo: the laptop is not at the plant |
| Phase 2 oracle | Centralized and declared (the platform); a production version could let anyone challenge a stamp with the ONS file |
| Selling electricity | We do not sell electricity: the energy never leaves the plant, the job travels over the internet |

## How it is built

| Component | Technology | Where |
| --- | --- | --- |
| Data pipeline | Python 3.12, pandas, NumPy, PyArrow | [`dados/scripts/`](dados/scripts) |
| Site and API | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Leaflet with OpenStreetMap, hosted on Vercel | [`site/`](site) |
| Payments and records | `@solana/web3.js`, Phantom. Instructions are built by hand: SPL Token `TransferChecked`, Associated Token Account `CreateIdempotent` and Memo v2. No custom program. Devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. | [`site/src/lib/solana.ts`](site/src/lib/solana.ts), [`site/src/lib/recibo.ts`](site/src/lib/recibo.ts) |
| Compute operator | Python, fastembed (`paraphrase-multilingual-MiniLM-L12-v2`, ONNX on CPU), solders | [`operador/`](operador) |
| Daily automation | GitHub Actions: download the ONS data, recompute, deploy, then record the forecast hash and pending stamps on Solana | [`.github/workflows/atualizacao-diaria.yml`](.github/workflows/atualizacao-diaria.yml) |

The test wallets are the plant `5ygfGZrNKr5PmGn7o47bGDy7gjrqt3V17W1sxeWSBEg5`, the operator `8ufcDYFKXRjNsVa4PCzvwBa55y73NqAFmvMPVoPnx9BZ` and the platform `DqqMCkoiH1x3mAoYknCZQYn4aEGhyWP4ySqXaPAmNztN`. Every receipt, stamp, execution record and forecast hash can be found in their histories on Solana Explorer (devnet). Secret keys never touch the repository; the server reads them from environment variables.

## Run it yourself

The data pipeline needs Python 3.11 or later.

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt     # Windows: .venv\Scripts\python.exe
.venv/bin/python dados/scripts/baixar_ons.py            # ~100 MB of ONS Parquet files, saved to ../dados-ons/brutos
.venv/bin/python dados/scripts/etapa1.py                # forecast, backtest, live windows (~1 min)
.venv/bin/python dados/scripts/atlas.py                 # site data
```

Compare `dados/saida/impressoes_digitais.txt` with the repository version (`git diff`): if nothing changed, you reached exactly the same numbers.

```bash
cd site && npm install && npm run dev                   # http://localhost:3000
```

Reserving windows locally needs the three test-wallet keys in `site/.env.local` (`VC_CHAVE_USINA`, `VC_CHAVE_OPERADOR`, `VC_CHAVE_PLATAFORMA`). Generate your own with `node site/scripts/gerar-carteiras.mjs`.

The compute operator runs like this:

```bash
.venv/bin/python -m pip install -r operador/requirements.txt
.venv/bin/python operador/operador.py                   # waits for reserved windows; Ctrl+C to stop
.venv/bin/python operador/trabalho.py CJU_BASAR 2026-09-29   # only the AI job, to check its SHA-256
```

## Repository layout

```
dados/scripts/      ONS download, forecast and backtest (etapa1.py), site data (atlas.py)
dados/saida/        open outputs with SHA-256 fingerprints
dados/ccee/         CCEE hourly PLD (open data, downloaded by hand: CCEE blocks bots)
operador/           demo compute operator: AI job + on-chain start/end records
site/               Next.js atlas, API routes for receipts, stamps and forecast hashes
site/public/ons/    exact copies of every ONS file cited in a stamp (the ONS sometimes republishes a month)
.github/workflows/  daily update
```

Code comments and internal names are in Portuguese; the app and this README are in English. The project's working name was *Vento Cortado* ("curtailed wind"), which is why the on-chain records keep the protocol prefix `vento-cortado v1`. A Portuguese README for the team is in [README.pt-BR.md](README.pt-BR.md).

## Built during the hackathon

All code in this repository was written between October 7 and October 12, 2026, during the Colosseum Crypto World's Fair (September 14 – October 12). No pre-existing code was used besides open-source libraries.

## Data and licenses

- Curtailment data: [ONS open data](https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/restricao_coff_eolica_tm/DicionarioDados_RestricaoContrainedoff_UsiEolicas.pdf) (restrição de operação por constrained-off of wind and solar plants), CC-BY.
- Hourly PLD: [CCEE open data](https://dadosabertos.ccee.org.br).
- PTAX exchange rate: Central Bank of Brazil (Olinda API).
- Map tiles: © OpenStreetMap contributors.
