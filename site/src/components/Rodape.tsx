"use client";

import { useIdioma } from "@/i18n/idioma";
import { REPOSITORIO } from "@/lib/tipos";

export function Rodape() {
  const { t } = useIdioma();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
        <p>{t.footer.data}</p>
        <p>
          {t.footer.team}{" "}
          <a href={REPOSITORIO} className="underline hover:text-ink" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
