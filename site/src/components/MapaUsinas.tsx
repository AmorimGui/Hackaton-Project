"use client";

// Mapa com Leaflet + OpenStreetMap, controlado diretamente (sem react-leaflet).
//
// Por quê: com Cache Components, o Next.js não desmonta a página ao navegar; ele a esconde
// (React <Activity>) e, na volta, roda os efeitos de novo sobre o MESMO elemento. O react-leaflet
// não suporta isso ("Map container is being reused"). Aqui o mapa é criado no efeito e destruído
// com map.remove() na limpeza, então pode ser recriado quantas vezes for preciso.
import L from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export type PontoMapa = {
  id: string;
  nome: string;
  tipo: "eolica" | "solar";
  lat: number;
  lon: number;
  capacidade_mw: number;
  chance: number | null; // maior chance prevista no dia escolhido (null = sem janela)
  rotulo: string; // texto da dica: janela, chance, energia
};

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MapaUsinas({ pontos, selecionado }: { pontos: PontoMapa[]; selecionado?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // O mapa só é refeito quando muda algo visível (usinas, chances, rótulos ou a usina em destaque)
  const chave = `${selecionado ?? ""}|${pontos.map((p) => `${p.id}:${p.chance}:${p.rotulo}`).join("|")}`;

  useEffect(() => {
    const div = ref.current;
    if (!div) return;
    const mapa = L.map(div, { scrollWheelZoom: false, attributionControl: true, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);

    for (const p of pontos) {
      const cor = p.tipo === "eolica" ? "#0f766e" : "#c2410c";
      const raio = 7 + Math.sqrt(p.capacidade_mw) / 2.2;
      L.circleMarker([p.lat, p.lon], {
        radius: raio,
        color: p.id === selecionado ? "#0f1b2d" : cor,
        weight: p.id === selecionado ? 3 : 2,
        fillColor: cor,
        fillOpacity: p.chance === null ? 0.12 : 0.25 + p.chance * 0.6,
      })
        .bindTooltip(`<strong>${escapar(p.nome)}</strong><br/>${escapar(p.rotulo)}`, { direction: "top", offset: [0, -raio] })
        .on("click", () => router.push(`/plants/${p.id}`))
        .addTo(mapa);
    }

    // Enquadra as usinas; refaz quando a área muda de tamanho (e ignora quando a página está escondida)
    const limites = L.latLngBounds(pontos.map((p) => [p.lat, p.lon] as [number, number]));
    const enquadrar = () => {
      if (!div.offsetWidth || !div.offsetHeight) return;
      mapa.invalidateSize();
      if (pontos.length === 1) mapa.setView(limites.getCenter(), 7);
      else mapa.fitBounds(limites, { padding: [36, 36] });
    };
    const observador = new ResizeObserver(enquadrar);
    observador.observe(div);
    enquadrar();

    return () => {
      observador.disconnect();
      mapa.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- "chave" resume tudo o que o mapa mostra
  }, [chave, router]);

  return <div ref={ref} className="h-full min-h-[380px] w-full rounded-xl" />;
}
