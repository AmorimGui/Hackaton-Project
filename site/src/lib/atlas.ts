// Dados do Atlas: gerados por dados/scripts/atlas.py a partir da Etapa 1 (não edite atlas.json à mão).
// Use só em componentes de servidor, para o arquivo não ir inteiro para o navegador.
import "server-only";
import bruto from "@/data/atlas.json";
import type { Atlas } from "./tipos";

export const atlas = bruto as unknown as Atlas;
