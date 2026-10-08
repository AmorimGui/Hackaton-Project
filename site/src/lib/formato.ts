// Formatação de números e datas por idioma. Sem dados: pode ser usado no navegador.

export const num = (x: number, locale: string, casas = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: casas, minimumFractionDigits: casas }).format(x);

export const pct = (x: number, locale: string, casas = 0) =>
  new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: casas, minimumFractionDigits: casas }).format(x);

export const reais = (x: number, locale: string, compacto = false) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: compacto ? 1 : 0,
    notation: compacto ? "compact" : "standard",
  }).format(x);

/** Data ISO (AAAA-MM-DD) sem fuso: evita que o dia "volte um" a oeste de Greenwich. */
export const dataCurta = (iso: string, locale: string, comAno = false) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(comAno ? { year: "numeric" } : {}),
    weekday: comAno ? undefined : "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(a, m - 1, d)));
};

export const energia = (mwh: number, locale: string) =>
  mwh >= 1000 ? `${num(mwh / 1000, locale, 1)} GWh` : `${num(mwh, locale)} MWh`;

export const cor = (tipo: "eolica" | "solar") => (tipo === "eolica" ? "var(--color-wind)" : "var(--color-sun)");
