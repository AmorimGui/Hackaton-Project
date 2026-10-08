"use client";

// Botão leve: a biblioteca da Solana só é baixada quando alguém clica em "Comprar".
import dynamic from "next/dynamic";
import { useLayoutEffect, useState } from "react";
import { useIdioma } from "@/i18n/idioma";
import type { Cambio, Janela } from "@/lib/tipos";

const CompraJanela = dynamic(() => import("./CompraJanela"), { ssr: false });

export type AlvoCompra = { idUsina: string; nomeUsina: string; janela: Janela; cambio: Cambio | null };

export function BotaoComprar(props: AlvoCompra) {
  const { t } = useIdioma();
  const [aberto, setAberto] = useState(false);
  // Ao sair da página (que o Next.js só esconde), fecha a janela para ela não reaparecer aberta na volta
  useLayoutEffect(() => () => setAberto(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-white hover:bg-ink/85"
      >
        {t.buy.button}
      </button>
      {aberto && <CompraJanela {...props} fechar={() => setAberto(false)} />}
    </>
  );
}
