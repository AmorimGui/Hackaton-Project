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
        ao_vivo: atlas.ao_vivo,
        dados_ate: atlas.dados_ate,
        usinas: atlas.usinas.map(({ id, nome, uf, tipo, teste, placar, placar_ao_vivo }) => ({ id, nome, uf, tipo, teste, placar, placar_ao_vivo })),
      }}
    />
  );
}
