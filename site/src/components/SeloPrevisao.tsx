"use client";

// Mostra o registro, na Solana, do SHA-256 da previsão publicada: prova de que ela existia antes dos dias previstos.
import { useEffect, useState } from "react";
import { useIdioma } from "@/i18n/idioma";
import type { RegistroCadeia } from "@/lib/tipos";

type Resposta = { previsao: { arquivo: string; sha256: string }; registro: RegistroCadeia | null };

export function SeloPrevisao() {
  const { t } = useIdioma();
  const [r, setR] = useState<Resposta | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/previsao")
      .then((x) => (x.ok ? (x.json() as Promise<Resposta>) : null))
      .then((dados) => vivo && setR(dados))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (!r?.registro) return null;
  const quando = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date((r.registro.horario ?? 0) * 1000));
  return (
    <p className="mt-2 text-xs text-muted">
      <span className="font-medium text-ok">✓</span> {t.home.forecastProof(quando)}{" "}
      <a href={r.registro.explorador} target="_blank" rel="noreferrer" className="underline">
        Solana Explorer ↗
      </a>{" "}
      ·{" "}
      <a href={`/${r.previsao.arquivo}`} download className="underline">
        {t.home.forecastFile}
      </a>{" "}
      <span className="font-mono">sha256 {r.previsao.sha256.slice(0, 12)}…</span>
    </p>
  );
}
