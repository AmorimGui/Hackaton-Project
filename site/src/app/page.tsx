import { atlas } from "@/lib/atlas";
import { Inicio, type DadosInicio } from "@/components/Inicio";

export default function Page() {
  // Só o necessário vai para o navegador; o resto do atlas.json fica no servidor.
  const dados: DadosInicio = {
    manchete: atlas.manchete,
    previsao: atlas.previsao,
    pld: atlas.pld,
    padroes: atlas.padroes,
    dados_ate: atlas.dados_ate,
    cambio: atlas.cambio,
    placar: atlas.teste.placar,
    ao_vivo: atlas.ao_vivo,
    razoes_nordeste: atlas.razoes.nordeste_2026.fracao,
    usinas: atlas.usinas.map(({ id, nome, uf, tipo, local, capacidade_mw, proximas }) => ({ id, nome, uf, tipo, local, capacidade_mw, proximas })),
  };
  return <Inicio d={dados} />;
}
