import type { Metadata } from "next";
import { atlas } from "@/lib/atlas";
import { Placar } from "@/components/Placar";

export const metadata: Metadata = { title: "Track record — Vento Cortado" };

export default function Page() {
  return (
    <Placar
      d={{
        teste: atlas.teste,
        manchete: atlas.manchete,
        impressoes: atlas.impressoes,
        usinas: atlas.usinas.map(({ id, nome, uf, tipo, teste, placar }) => ({ id, nome, uf, tipo, teste, placar })),
      }}
    />
  );
}
