import { useContext } from "react";
import { Contesto } from "../componenti/contestoSedi";

export function useSedi() {
  const contesto = useContext(Contesto);
  if (!contesto) throw new Error("useSedi va usato dentro <ProviderSedi>");
  return contesto;
}
