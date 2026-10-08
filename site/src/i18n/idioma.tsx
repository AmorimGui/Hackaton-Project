"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { dicionarios, type Dicionario, type Idioma } from "./dicionarios";

type Contexto = { idioma: Idioma; t: Dicionario; trocar: (i: Idioma) => void };

const IdiomaContexto = createContext<Contexto>({ idioma: "en", t: dicionarios.en, trocar: () => {} });

const CHAVE = "vento-cortado-idioma";
const ouvintes = new Set<() => void>();
let memoria: Idioma = "en"; // usado quando o navegador bloqueia o armazenamento

function ler(): Idioma {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return salvo === "pt" || salvo === "en" ? salvo : memoria;
  } catch {
    return memoria;
  }
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  window.addEventListener("storage", avisar); // troca feita em outra aba
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

function trocar(novo: Idioma) {
  memoria = novo;
  try {
    localStorage.setItem(CHAVE, novo);
  } catch {
    // sem armazenamento: a troca vale só nesta visita
  }
  ouvintes.forEach((avisar) => avisar());
}

export function ProvedorIdioma({ children }: { children: ReactNode }) {
  // Inglês é o padrão (jurados e servidor); a escolha do visitante fica salva no navegador.
  const idioma = useSyncExternalStore(assinar, ler, () => "en" as const);

  useEffect(() => {
    document.documentElement.lang = idioma === "pt" ? "pt-BR" : "en";
  }, [idioma]);

  return <IdiomaContexto.Provider value={{ idioma, t: dicionarios[idioma], trocar }}>{children}</IdiomaContexto.Provider>;
}

export const useIdioma = () => useContext(IdiomaContexto);
