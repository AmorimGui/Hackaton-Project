"use client";

// Mapa com Leaflet + OpenStreetMap. Carregado só no navegador (ver MapaCarregado).
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

/** Reenquadra as usinas sempre que a área do mapa muda de tamanho (layout responsivo). */
function Enquadrar({ limites }: { limites: [number, number][] }) {
  const mapa = useMap();
  useEffect(() => {
    const ajustar = () => {
      mapa.invalidateSize();
      if (limites.length === 1) mapa.setView(limites[0], 7);
      else mapa.fitBounds(limites, { padding: [36, 36] });
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(mapa.getContainer());
    ajustar();
    return () => observador.disconnect();
  }, [mapa, limites]);
  return null;
}

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

export default function MapaUsinas({ pontos, selecionado }: { pontos: PontoMapa[]; selecionado?: string }) {
  const router = useRouter();
  const chave = pontos.map((p) => p.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só muda quando o conjunto de usinas muda
  const limites = useMemo<[number, number][]>(() => pontos.map((p) => [p.lat, p.lon]), [chave]);
  return (
    <MapContainer
      center={limites[0]}
      zoom={6}
      scrollWheelZoom={false}
      className="h-full min-h-[380px] w-full rounded-xl"
      attributionControl
    >
      <Enquadrar limites={limites} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {pontos.map((p) => {
        const cor = p.tipo === "eolica" ? "#0f766e" : "#c2410c";
        const raio = 7 + Math.sqrt(p.capacidade_mw) / 2.2;
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={raio}
            pathOptions={{
              color: p.id === selecionado ? "#0f1b2d" : cor,
              weight: p.id === selecionado ? 3 : 2,
              fillColor: cor,
              fillOpacity: p.chance === null ? 0.12 : 0.25 + p.chance * 0.6,
            }}
            eventHandlers={{ click: () => router.push(`/plants/${p.id}`) }}
          >
            <Tooltip direction="top" offset={[0, -raio]}>
              <strong>{p.nome}</strong>
              <br />
              {p.rotulo}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
