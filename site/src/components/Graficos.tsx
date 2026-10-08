"use client";

// Gráficos simples em SVG, sem biblioteca: cores pelas variáveis do tema.
import { useIdioma } from "@/i18n/idioma";
import { num, pct } from "@/lib/formato";

const EIXO = "var(--color-muted)";
const GRADE = "var(--color-line)";

/** Perda por hora do dia (% da energia cortada), eólica e solar lado a lado. */
export function GraficoHoras({ eolica, solar }: { eolica: number[]; solar: number[] }) {
  const { t } = useIdioma();
  const W = 720, H = 220, esq = 34, base = 190, topo = 14;
  const max = Math.ceil(Math.max(...eolica, ...solar) / 5) * 5;
  const y = (v: number) => base - (v / max) * (base - topo);
  const passo = (W - esq - 8) / 24;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.home.hourTitle}>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={esq} x2={W - 8} y1={y(v)} y2={y(v)} stroke={GRADE} />
            <text x={esq - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={EIXO}>
              {v}%
            </text>
          </g>
        ))}
        {eolica.map((v, h) => {
          const x = esq + h * passo;
          return (
            <g key={h}>
              <rect x={x + passo * 0.1} y={y(v)} width={passo * 0.38} height={base - y(v)} fill="var(--color-wind)" rx="1.5">
                <title>{`${h}h — ${t.common.wind}: ${num(v, t.locale, 1)}%`}</title>
              </rect>
              <rect x={x + passo * 0.52} y={y(solar[h])} width={passo * 0.38} height={base - y(solar[h])} fill="var(--color-sun)" rx="1.5">
                <title>{`${h}h — ${t.common.solar}: ${num(solar[h], t.locale, 1)}%`}</title>
              </rect>
              {h % 3 === 0 && (
                <text x={x + passo / 2} y={base + 16} textAnchor="middle" fontSize="11" fill={EIXO}>
                  {h}h
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Legenda />
    </figure>
  );
}

/** Fração das horas com o PLD do Nordeste no piso, por hora do dia; destaca o pico do corte (8h–14h). */
export function GraficoPiso({ pct: valores }: { pct: number[] }) {
  const { t } = useIdioma();
  const W = 720, H = 200, esq = 40, base = 170, topo = 12;
  const y = (v: number) => base - (v / 100) * (base - topo);
  const passo = (W - esq - 8) / 24;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.home.floorTitle}>
      <rect x={esq + 8 * passo} y={topo} width={7 * passo} height={base - topo} fill="var(--color-cut-soft)" opacity="0.6" />
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={esq} x2={W - 8} y1={y(v)} y2={y(v)} stroke={GRADE} />
          <text x={esq - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={EIXO}>
            {v}%
          </text>
        </g>
      ))}
      {valores.map((v, h) => (
        <g key={h}>
          <rect x={esq + h * passo + passo * 0.15} y={y(v)} width={passo * 0.7} height={base - y(v)} fill="var(--color-ink)" rx="1.5">
            <title>{`${h}h: ${num(v, t.locale)}%`}</title>
          </rect>
          {h % 3 === 0 && (
            <text x={esq + h * passo + passo / 2} y={base + 16} textAnchor="middle" fontSize="11" fill={EIXO}>
              {h}h
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Potência média cortada no Nordeste por mês (eólica + solar empilhadas). */
export function GraficoMensal({ meses }: { meses: { mes: string; eolica: number; solar: number }[] }) {
  const { t } = useIdioma();
  const W = 720, H = 230, esq = 44, base = 196, topo = 14;
  const max = Math.ceil(Math.max(...meses.map((m) => m.eolica + m.solar)) / 1000) * 1000;
  const y = (v: number) => base - (v / max) * (base - topo);
  const passo = (W - esq - 8) / meses.length;
  const nomes = t.plant.months;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.home.monthTitle}>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={esq} x2={W - 8} y1={y(v)} y2={y(v)} stroke={GRADE} />
            <text x={esq - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={EIXO}>
              {num(v, t.locale)}
            </text>
          </g>
        ))}
        {meses.map((m, i) => {
          const x = esq + i * passo + passo * 0.15;
          const w = passo * 0.7;
          const mes = Number(m.mes.slice(5, 7));
          return (
            <g key={m.mes}>
              <title>{`${nomes[mes - 1]}/${m.mes.slice(2, 4)}: ${num(m.eolica + m.solar, t.locale)} ${t.common.mwAvg}`}</title>
              <rect x={x} y={y(m.eolica)} width={w} height={base - y(m.eolica)} fill="var(--color-wind)" rx="1.5" />
              <rect x={x} y={y(m.eolica + m.solar)} width={w} height={y(m.eolica) - y(m.eolica + m.solar)} fill="var(--color-sun)" rx="1.5" />
              {(mes === 1 || mes === 7) && (
                <text x={x + w / 2} y={base + 16} textAnchor="middle" fontSize="11" fill={EIXO}>
                  {`${nomes[mes - 1]}/${m.mes.slice(2, 4)}`}
                </text>
              )}
            </g>
          );
        })}
        <text x={esq} y={topo - 2} fontSize="11" fill={EIXO}>
          {t.common.mwAvg}
        </text>
      </svg>
      <Legenda />
    </figure>
  );
}

function Legenda() {
  const { t } = useIdioma();
  return (
    <figcaption className="mt-1 flex gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-wind" /> {t.common.wind}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sun" /> {t.common.solar}
      </span>
    </figcaption>
  );
}

/** Mapa de calor: chance de corte por mês (linhas) e hora (colunas). */
export function MapaCalor({ calor }: { calor: (number | null)[][] }) {
  const { t } = useIdioma();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-[10px]">
        <thead>
          <tr>
            <th className="w-9 text-left font-normal text-muted">{t.plant.month}</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="font-normal text-muted">
                {h % 3 === 0 ? h : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calor.map((linha, m) => (
            <tr key={m}>
              <td className="pr-1 text-muted">{t.plant.months[m]}</td>
              {linha.map((v, h) => (
                <td
                  key={h}
                  title={v === null ? "—" : `${t.plant.months[m]} ${h}h: ${pct(v, t.locale)}`}
                  className="h-5 min-w-4 rounded-[3px]"
                  style={{ background: v === null ? "var(--color-line)" : `color-mix(in oklab, var(--color-cut) ${Math.round(v * 100)}%, white)` }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        0%
        <div className="h-2 w-32 rounded" style={{ background: "linear-gradient(to right, white, var(--color-cut))" }} />
        100%
      </div>
    </div>
  );
}

/** Calibração: chance prevista x frequência observada, por faixa. */
export function GraficoCalibracao({ faixas }: { faixas: { faixa: string; prevista: number; observada: number; n: number }[] }) {
  const { t } = useIdioma();
  const L = 260, m = 34;
  const p = (v: number) => m + v * (L - m - 8);
  const q = (v: number) => L - m - v * (L - m - 8) + 8;
  return (
    <svg viewBox={`0 0 ${L} ${L}`} className="w-full max-w-xs" role="img" aria-label={t.track.calibTitle}>
      <line x1={p(0)} y1={q(0)} x2={p(1)} y2={q(1)} stroke={GRADE} strokeDasharray="4 4" />
      <line x1={p(0)} y1={q(0)} x2={p(1)} y2={q(0)} stroke={EIXO} />
      <line x1={p(0)} y1={q(0)} x2={p(0)} y2={q(1)} stroke={EIXO} />
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <text x={p(v)} y={q(0) + 14} textAnchor="middle" fontSize="10" fill={EIXO}>
            {v * 100}%
          </text>
          <text x={p(0) - 5} y={q(v) + 3} textAnchor="end" fontSize="10" fill={EIXO}>
            {v * 100}%
          </text>
        </g>
      ))}
      <polyline points={faixas.map((f) => `${p(f.prevista)},${q(f.observada)}`).join(" ")} fill="none" stroke="var(--color-cut)" strokeWidth="2" />
      {faixas.map((f) => (
        <circle key={f.faixa} cx={p(f.prevista)} cy={q(f.observada)} r="3.5" fill="var(--color-cut)">
          <title>{`${f.faixa}: ${t.track.predicted} ${pct(f.prevista, t.locale)}, ${t.track.observed} ${pct(f.observada, t.locale)} (n=${num(f.n, t.locale)})`}</title>
        </circle>
      ))}
      <text x={p(0.5)} y={L - 2} textAnchor="middle" fontSize="10" fill={EIXO}>
        {t.track.predicted}
      </text>
      <text x={10} y={q(0.5)} textAnchor="middle" fontSize="10" fill={EIXO} transform={`rotate(-90 10 ${q(0.5)})`}>
        {t.track.observed}
      </text>
    </svg>
  );
}
