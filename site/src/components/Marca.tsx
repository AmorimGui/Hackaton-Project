// Marca da Nomos: o símbolo (um "M" que também é um "N") e o logotipo "noMos".
// Redesenhado em vetor a partir da logo do time: traço de ponta arredondada, sem preenchimento.

const TRACO = "M8.75 178.25V8.75L168 172q16.5 14 16.5-6V8.75L99 101.3";

/** O símbolo sozinho, na cor do texto (currentColor). */
export function SimboloNomos({ className = "", espessura = 17.5, titulo }: { className?: string; espessura?: number; titulo?: string }) {
  return (
    <svg
      viewBox="-1 -1 195 190"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={espessura}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <path d={TRACO} />
    </svg>
  );
}

/** O logotipo "noMos": as letras na fonte da marca e o símbolo no lugar do "m". */
export function LogotipoNomos({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-marca lowercase leading-none ${className}`} role="img" aria-label="Nomos">
      <span aria-hidden>no</span>
      <SimboloNomos className="mx-[0.05em] inline-block h-[0.56em] w-auto translate-y-[0.03em]" espessura={13} />
      <span aria-hidden>os</span>
    </span>
  );
}
