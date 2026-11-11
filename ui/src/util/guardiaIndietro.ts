// Il passo indietro della cronologia (`navigate(-1)`, cioe' history.go(-1)) e' asincrono: un doppio clic su «Annulla» o sulla
// freccia ne farebbe due e, se la lista era la prima voce, si uscirebbe dall'app. Dopo il primo passo i clic si ignorano finche'
// la cronologia non si muove davvero (popstate): o si e' usciti, o l'uscita e' stata fermata (useBloccoUscita rimette la voce,
// e anche quello e' un popstate) e si puo' riprovare.
export function creaGuardiaIndietro(finestra: Pick<EventTarget, "addEventListener" | "removeEventListener">) {
  let inCorso = false;
  const libera = () => {
    inCorso = false;
  };
  return {
    // Esegue `passo` se non ce n'e' gia' uno in corso; dice se l'ha eseguito.
    vai(passo: () => void): boolean {
      if (inCorso) return false;
      inCorso = true;
      finestra.addEventListener("popstate", libera, { once: true });
      passo();
      return true;
    },
  };
}
