import type { Metadata } from "next";
import { Suspense } from "react";
import { atlas } from "@/lib/atlas";
import { Verificacao } from "@/components/Verificacao";

export const metadata: Metadata = { title: "Verify a reservation — Nomos" };

export default function Page() {
  const nomes = Object.fromEntries(atlas.usinas.map((u) => [u.id, u.nome]));
  // A página lê ?tx= no navegador; o Suspense é exigido para isso com Cache Components
  return (
    <Suspense fallback={null}>
      <Verificacao nomes={nomes} />
    </Suspense>
  );
}
