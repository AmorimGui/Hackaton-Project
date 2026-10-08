"use client";

// O Leaflet usa o objeto window, então o mapa só é montado no navegador.
import dynamic from "next/dynamic";

export const MapaCarregado = dynamic(() => import("./MapaUsinas"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[380px] w-full animate-pulse rounded-xl bg-line/60" />,
});
