"use client";

import { useIdioma } from "@/i18n/idioma";
import { REPOSITORIO } from "@/lib/tipos";
import { Cartao } from "./Selos";

export function Metodo() {
  const { t } = useIdioma();
  const m = t.method;
  const blocos = [
    { titulo: m.realTitle, itens: m.real, cor: "border-ok" },
    { titulo: m.estTitle, itens: m.est, cor: "border-sun" },
    { titulo: m.simTitle, itens: m.sim, cor: "border-wait" },
  ];

  return (
    <div className="space-y-8 pt-8">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">{m.title}</h1>
        <p className="mt-3 text-lg text-muted">{m.lead}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {blocos.map((b) => (
          <Cartao key={b.titulo} className={`border-t-4 ${b.cor}`}>
            <h2 className="text-lg font-semibold">{b.titulo}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              {b.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Cartao>
        ))}
      </div>

      <Cartao>
        <h2 className="text-lg font-semibold">{m.defTitle}</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {m.defs.map(([termo, def]) => (
            <div key={termo}>
              <dt className="font-semibold">{termo}</dt>
              <dd className="text-muted">{def}</dd>
            </div>
          ))}
        </dl>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <h2 className="text-lg font-semibold">{m.dataTitle}</h2>
          <p className="mt-1 text-sm text-muted">{m.dataLead}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(m.files).map(([arquivo, desc]) => (
              <li key={arquivo}>
                <a href={`/data/${arquivo}`} download className="font-mono text-xs text-wind underline">
                  {arquivo}
                </a>
                <div className="text-muted">{desc}</div>
              </li>
            ))}
          </ul>
          <a href={REPOSITORIO} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-medium underline">
            {m.codeLink} →
          </a>
        </Cartao>
        <Cartao>
          <h2 className="text-lg font-semibold">{m.limitsTitle}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {m.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Cartao>
      </div>
    </div>
  );
}
