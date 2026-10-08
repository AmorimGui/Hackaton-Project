import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { atlas } from "@/lib/atlas";
import { PaginaUsina } from "@/components/PaginaUsina";

// Uma página estática por usina de destaque, gerada na compilação.
export function generateStaticParams() {
  return atlas.usinas.map((u) => ({ id: u.id }));
}

export async function generateMetadata({ params }: PageProps<"/plants/[id]">): Promise<Metadata> {
  const { id } = await params;
  const u = atlas.usinas.find((x) => x.id === id);
  return { title: u ? `${u.nome.replace(/^Conj\. /, "")} — Vento Cortado` : "Vento Cortado" };
}

export default async function Page({ params }: PageProps<"/plants/[id]">) {
  const { id } = await params;
  const u = atlas.usinas.find((x) => x.id === id);
  if (!u) notFound();
  return <PaginaUsina u={u} cambio={atlas.cambio} dadosAte={atlas.dados_ate} />;
}
