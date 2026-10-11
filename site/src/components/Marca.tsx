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

/**
 * O logotipo "noMos": as letras na fonte da marca e o símbolo no lugar do "m".
 * Proporções medidas na logo original (em alturas de minúscula, x): o M tem 1,16x de altura, topo alinhado
 * às minúsculas e a "cauda" 0,16x abaixo da linha de base; o traço dele é 2/3 do das letras (Outfit 400 = 0,18x, como na logo); o respiro em
 * volta do M é 0,28x. A Outfit tem x = 0,48em.
 */
export function LogotipoNomos({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-marca font-normal lowercase leading-none ${className}`} role="img" aria-label="Nomos">
      <span aria-hidden>no</span>
      <SimboloNomos className="mx-[0.11em] inline-block h-[0.557em] w-auto translate-y-[0.077em] overflow-visible" espessura={21} />
      <span aria-hidden>os</span>
    </span>
  );
}
