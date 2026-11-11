import { describe, expect, it } from "vitest";
import { fermaAlPassaggio, fondoZona, postoAvviso, puntatoreMosso, quantoAlzare, sopraIPulsanti, troppeRighe, SELETTORE_DA_AFFIANCARE, SELETTORE_DA_NON_COPRIRE, type Rettangolo } from "./avviso";
import sorgenteMovimenti from "../viste/Movimenti.tsx?raw";
import sorgenteGuscio from "../componenti/Guscio.tsx?raw";
import sorgenteAvviso from "../componenti/Avviso.tsx?raw";

const r = (left: number, top: number, right: number, bottom: number): Rettangolo => ({ left, top, right, bottom });

// 1280×800, Nuovo movimento: l'avviso in basso al centro (fondo a 24 px) finiva sopra «Salva e aggiungine un altro».
describe("l'avviso non copre i pulsanti di azione del modulo", () => {
  const avviso = r(480, 724, 800, 776);
  const pulsanti = r(560, 716, 1100, 772);

  it("senza ostacoli, o con ostacoli che non tocca, resta dov'è", () => {
    expect(quantoAlzare(avviso, [])).toBe(0);
    expect(quantoAlzare(avviso, [r(900, 716, 1100, 772)])).toBe(0); // di fianco
    expect(quantoAlzare(avviso, [r(480, 300, 800, 400)])).toBe(0); // più su
    expect(quantoAlzare(avviso, [r(480, 776, 800, 800)])).toBe(0); // sotto, a filo
  });

  it("se li copre sale quanto basta a stare sopra, con un margine", () => {
    // il fondo dell'avviso (776) deve arrivare 12 px sopra la cima dei pulsanti (716)
    expect(quantoAlzare(avviso, [pulsanti])).toBe(776 - 716 + 12);
    expect(quantoAlzare(avviso, [pulsanti], 0)).toBe(60);
  });

  it("funziona con i rettangoli veri del browser (DOMRect: i lati sono getter, non campi)", () => {
    class Rett {
      constructor(private l: number, private t: number, private r: number, private b: number) {}
      get left() { return this.l; }
      get top() { return this.t; }
      get right() { return this.r; }
      get bottom() { return this.b; }
    }
    expect(quantoAlzare(new Rett(480, 724, 800, 776), [new Rett(560, 716, 1100, 772)])).toBe(72);
  });

  it("con più ostacoli sta sopra a tutti quelli che toccherebbe, anche dopo essere salito", () => {
    const sopra = r(480, 640, 800, 700); // lo toccherebbe solo una volta salito sopra i pulsanti
    expect(quantoAlzare(avviso, [pulsanti, sopra])).toBe(776 - 640 + 12);
    expect(quantoAlzare(avviso, [sopra, pulsanti])).toBe(776 - 640 + 12);
  });

  it("la barra fissa del telefono, se arriva fino all'avviso (iPhone con il margine in basso)", () => {
    const telefono = r(12, 670, 363, 710); // avviso con il fondo a 84 px dal basso (794 di altezza)
    expect(quantoAlzare(telefono, [r(0, 680, 375, 794)])).toBe(710 - 680 + 12);
    expect(quantoAlzare(telefono, [r(0, 713, 375, 794)])).toBe(0); // barra bassa: non si toccano
  });

  it("se sopra non c'è posto resta dov'è (meglio coperto un pulsante che l'avviso fuori dallo schermo)", () => {
    expect(quantoAlzare(r(0, 40, 300, 100), [r(0, 20, 300, 90)])).toBe(0);
  });
});

// 1280×800, Movimenti: l'avviso («Fattura segnata come pagata.») finiva sopra la barra scura dei totali Ricavi / Costi / Saldo.
describe("l'avviso non copre la barra dei totali di Movimenti", () => {
  it("gli ostacoli sono i pulsanti di azione dei moduli e tutto quello che è marcato «da non coprire»", () => {
    expect(SELETTORE_DA_NON_COPRIRE.split(",").map((s) => s.trim())).toEqual(["[data-azioni-modulo]", "[data-non-coprire]"]);
  });

  // A ogni larghezza: sul telefono l'avviso sale sopra la barra crema dei totali e, se serve, si stringe di fianco al «+».
  it("la barra dei totali è marcata «da non coprire», sul computer e sul telefono", () => {
    // il tag di apertura del footer dei totali, con gli attributi in qualunque ordine
    const footer = [...sorgenteMovimenti.matchAll(/<footer\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes('aria-label="Totali del periodo"'));
    expect(footer).toHaveLength(1);
    expect(footer[0]).toMatch(/\sdata-non-coprire(\s|>)/);
  });

  it("sul computer sale sopra la barra (64 px, a 28 px dal fondo), con il margine", () => {
    const avviso = r(520, 724, 840, 776);
    const totali = r(112, 708, 1248, 772);
    expect(quantoAlzare(avviso, [totali])).toBe(776 - 708 + 12);
  });

  // Con lo schermo piccolo la pagina del computer è rimpicciolita (index.css, da 1024 px di larghezza: html { zoom: 0.92 } con la larghezza
  // fino a 1366 px o l'altezza fino a 760 px, 0.84 fino a 1180 px o 680 px, 0.76 con l'altezza fino a 600 px): i rettangoli si misurano in
  // px dello schermo, ma il «bottom» della zona è in px della pagina. Senza tenerne conto l'avviso saliva meno del dovuto e il margine spariva.
  it("con la pagina rimpicciolita l'alzata si converte nei px della pagina", () => {
    expect(fondoZona(24, 0, 0.84)).toBe(24);
    expect(fondoZona(24, 80, 1)).toBe(104);
    // 84 px sullo schermo sono 100 px della pagina a zoom 0.84: non i 24 + 84 = 108 di prima della correzione
    expect(fondoZona(24, 84, 0.84)).toBe(124);
    expect(fondoZona(24, 46, 0.92)).toBe(74);
    expect(fondoZona(24, 76, 0.76)).toBe(124);
    // una pagina ingrandita: l'alzata vale meno px della pagina
    expect(fondoZona(24, 100, 1.25)).toBe(104);
    // uno zoom che non si conosce (browser vecchio) vale 1
    for (const z of [undefined, 0, NaN, -1]) expect(fondoZona(24, 80, z)).toBe(104);
  });

});

// Telefono 390×844, Movimenti: in fondo ci sono la barra di navigazione (62 px), sopra la barra dei totali (fino a 706) e, 16 px più su,
// il «+» tondo a destra (318–374 × 634–690). L'avviso al suo posto (fondo a 84 px) copriva i totali; alzato sopra la barra finiva sul «+».
describe("sul telefono l'avviso non copre né la barra dei totali né il «+»", () => {
  const zona = { left: 12, right: 378 };
  const totali = r(0, 706, 390, 782);
  const piu = r(318, 634, 374, 690);
  const lungo = r(12, 700, 378, 760); // un avviso largo quanto la zona
  const corto = r(100, 700, 290, 760); // «Movimento salvato.», al centro

  it("il «+» è marcato come pulsante da affiancare", () => {
    expect(SELETTORE_DA_AFFIANCARE).toBe("[data-avviso-di-fianco]");
    const piuNelGuscio = [...sorgenteGuscio.matchAll(/<Link\b[^>]*>/gs)].map((m) => m[0]).filter((t) => t.includes('aria-label="Nuovo movimento"'));
    expect(piuNelGuscio).toHaveLength(1);
    expect(piuNelGuscio[0]).toMatch(/\sdata-avviso-di-fianco(\s|>)/);
  });

  it("sale sopra la barra dei totali e si stringe a sinistra del «+»: 12 px sopra la barra, 20 px dal pulsante", () => {
    // il fondo arriva 12 px sopra la barra (694); il lato destro della zona 20 px a sinistra del «+» (298): la X dell'avviso, con la
    // sua area di tocco, non deve stare attaccata al «+»
    expect(postoAvviso(lungo, zona, [totali], [piu])).toEqual({ alzata: 760 - 706 + 12, stretta: 378 - (318 - 20) });
    // il margine verso i pulsanti di fianco è separato da quello sopra le barre
    expect(postoAvviso(lungo, zona, [totali], [piu], { margine: 8, margineLato: 30 })).toEqual({ alzata: 760 - 706 + 8, stretta: 378 - (318 - 30) });
  });

  it("un avviso corto che, salito, non tocca il «+» resta al centro", () => {
    expect(postoAvviso(corto, zona, [totali], [piu])).toEqual({ alzata: 66, stretta: 0 });
  });

  it("senza barra (Riepilogo): non sale, ma se toccherebbe il «+» si stringe", () => {
    const piuBasso = r(318, 706, 374, 762);
    expect(postoAvviso(lungo, zona, [], [piuBasso])).toEqual({ alzata: 0, stretta: 80 });
    expect(postoAvviso(corto, zona, [], [piuBasso])).toEqual({ alzata: 0, stretta: 0 });
  });

  it("il «+» più su dell'avviso non conta", () => {
    expect(postoAvviso(lungo, zona, [], [r(318, 600, 374, 656)])).toEqual({ alzata: 0, stretta: 0 });
  });

  // La soglia si misura sullo spazio che resta al TESTO: la larghezza della zona stretta meno l'ingombro dell'avviso (i due margini
  // interni, la X e lo spazio fra testo e X: 74 px), non sulla zona.
  describe("lo spazio che resta al testo", () => {
    const z = { left: 12, right: 308 };
    const p = r(248, 358, 304, 414);
    const avviso = r(12, 424, 308, 484);
    const barra = r(0, 430, 320, 506);

    it("320 px di larghezza: di fianco al «+» restano 216 px, 142 per il testo: bastano", () => {
      expect(postoAvviso(avviso, z, [barra], [p], { ingombro: 74 })).toEqual({ alzata: 484 - 430 + 12, stretta: 308 - 228 });
    });

    it("se al testo restano meno di 140 px sale sopra anche al pulsante, largo quanto la zona", () => {
      // «+» 10 px più a sinistra: zona di 206 px, 132 per il testo
      const piuASinistra = r(238, 358, 294, 414);
      expect(postoAvviso(avviso, z, [barra], [piuASinistra], { ingombro: 74 })).toEqual({ alzata: 484 - 358 + 12, stretta: 0 });
      // la stessa zona di 206 px basterebbe a un avviso senza ingombro: la soglia non è sulla zona
      expect(postoAvviso(avviso, z, [barra], [piuASinistra], { ingombro: 0 })).toEqual({ alzata: 66, stretta: 308 - 218 });
      // la soglia si può cambiare
      expect(postoAvviso(avviso, z, [barra], [piuASinistra], { ingombro: 74, testoMinimo: 100 })).toEqual({ alzata: 66, stretta: 308 - 218 });
    });

    it("un pulsante largo, o al centro: sale sopra anche a quello", () => {
      expect(postoAvviso(lungo, zona, [totali], [r(150, 634, 374, 690)], { ingombro: 74 })).toEqual({ alzata: 760 - 634 + 12, stretta: 0 });
    });
  });

  // Dopo la stretta il testo va a capo: se diventa più alto di tre righe copre mezzo elenco, e allora l'avviso sale sopra il «+».
  describe("stretto ma troppo alto", () => {
    it("fino a tre righe va bene, da quattro è troppo (con la tolleranza di mezza riga)", () => {
      expect(troppeRighe(22.5, 22.5)).toBe(false);
      expect(troppeRighe(67.5, 22.5)).toBe(false);
      expect(troppeRighe(68, 22.5)).toBe(false); // arrotondamenti
      expect(troppeRighe(90, 22.5)).toBe(true);
      expect(troppeRighe(157.5, 22.5)).toBe(true);
      expect(troppeRighe(90, 22.5, 4)).toBe(false);
      // misure che non si conoscono: non si cambia niente
      for (const riga of [0, NaN, -1]) expect(troppeRighe(200, riga)).toBe(false);
    });

    it("sopra i pulsanti: largo quanto la zona, 12 px sopra il più alto fra barre e pulsanti toccati", () => {
      expect(sopraIPulsanti(lungo, [totali], [piu])).toEqual({ alzata: 760 - 634 + 12, stretta: 0 });
      expect(sopraIPulsanti(lungo, [totali], [piu], 8)).toEqual({ alzata: 760 - 634 + 8, stretta: 0 });
    });

    it("se sopra i pulsanti non c'è posto dice di no (null): l'avviso resta stretto di fianco", () => {
      // un avviso alto 150 px in uno schermo basso: sopra il «+» (cima a 100) uscirebbe dallo schermo
      expect(sopraIPulsanti(r(12, 150, 378, 300), [r(0, 250, 390, 330)], [r(318, 100, 374, 156)])).toBeNull();
    });
  });

  // Ripiego: di fianco non c'è posto e sopra i pulsanti nemmeno. L'avviso resta comunque sopra le barre (prima tornava al posto di
  // partenza, sui totali).
  it("se non c'è posto né di fianco né sopra i pulsanti resta sopra le barre", () => {
    const avviso = r(12, 150, 378, 210);
    const barra = r(0, 200, 390, 260);
    const largo = r(100, 80, 374, 190);
    // sopra la barra: fondo a 188, cima a 128; sopra anche al pulsante la cima andrebbe a 8... c'è posto
    expect(postoAvviso(avviso, zona, [barra], [largo])).toEqual({ alzata: 210 - 80 + 12, stretta: 0 });
    // con il pulsante più in alto non c'è più posto: resta sopra la barra
    const piuSu = r(100, 40, 374, 190);
    expect(postoAvviso(avviso, zona, [barra], [piuSu])).toEqual({ alzata: 210 - 200 + 12, stretta: 0 });
  });

  it("senza pulsanti di fianco è come quantoAlzare (computer, moduli)", () => {
    const avviso = r(480, 724, 800, 776);
    const pulsanti = r(560, 716, 1100, 772);
    expect(postoAvviso(avviso, { left: 12, right: 1268 }, [pulsanti], [])).toEqual({ alzata: quantoAlzare(avviso, [pulsanti]), stretta: 0 });
    expect(postoAvviso(avviso, { left: 12, right: 1268 }, [], [])).toEqual({ alzata: 0, stretta: 0 });
  });

  // La tastiera virtuale nasconde il «+» con un attributo su <html> (index.css, html[data-tastiera]): nessun nodo cambia, quindi il
  // posto va ricalcolato anche quando cambia quell'attributo o l'area visibile.
  it("il posto si ricalcola anche quando la tastiera nasconde il «+»", () => {
    expect(sorgenteAvviso).toMatch(/observe\(document\.documentElement, \{ attributes: true, attributeFilter: \["data-tastiera", "style"\] \}\)/);
    expect(sorgenteAvviso).toMatch(/visualViewport\?\.addEventListener\("resize", presto\)/);
    expect(sorgenteAvviso).toMatch(/visualViewport\?\.removeEventListener\("resize", presto\)/);
  });

  it("la stretta, come l'alzata, si converte nei px della pagina rimpicciolita", () => {
    expect(fondoZona(12, 72, 1)).toBe(84);
    expect(fondoZona(12, 76, 0.76)).toBe(112);
  });
});

describe("l'avviso comparso sotto il puntatore non resta bloccato", () => {
  // La regola non guarda dove sono l'avviso e il puntatore (l'avviso si sposta subito dopo la comparsa, e la posizione ricordata del
  // mouse può essere vecchia): conta solo se il mouse si è mosso dopo la comparsa.
  it("un «ingresso» senza che il mouse si sia mosso dopo la comparsa non ferma il tempo", () => {
    expect(fermaAlPassaggio(false, false, "entra")).toEqual({ fermo: false });
    // e uscire (l'avviso si sposta via da sotto il mouse) non fa ripartire niente
    expect(fermaAlPassaggio(false, false, "esce")).toEqual({ fermo: false });
  });

  it("il mouse che entra muovendosi lo ferma, e uscendo il tempo riparte", () => {
    expect(fermaAlPassaggio(false, true, "entra")).toEqual({ ferma: true, fermo: true });
    expect(fermaAlPassaggio(true, true, "esce")).toEqual({ riprendi: true, fermo: false });
  });

  it("comparso sotto il mouse fermo: il primo movimento dentro l'avviso lo ferma", () => {
    expect(fermaAlPassaggio(false, false, "entra")).toEqual({ fermo: false });
    expect(fermaAlPassaggio(false, true, "muove")).toEqual({ ferma: true, fermo: true });
  });

  it("un «movimento» senza che il mouse si sia mosso davvero (l'avviso gli è scivolato sotto) non lo ferma", () => {
    expect(fermaAlPassaggio(false, false, "muove")).toEqual({ fermo: false });
  });

  it("già fermo: altri movimenti o ingressi non fermano di nuovo", () => {
    expect(fermaAlPassaggio(true, true, "muove")).toEqual({ fermo: true });
    expect(fermaAlPassaggio(true, true, "entra")).toEqual({ fermo: true });
  });

  it("il mouse si è mosso solo se la posizione è cambiata (o se prima non si sapeva dov'era)", () => {
    expect(puntatoreMosso(null, { x: 10, y: 20 })).toBe(true);
    expect(puntatoreMosso({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(false); // evento sintetico del browser: stessa posizione
    expect(puntatoreMosso({ x: 10, y: 20 }, { x: 11, y: 20 })).toBe(true);
    expect(puntatoreMosso({ x: 10, y: 20 }, { x: 10, y: 19 })).toBe(true);
  });
});

// Il «+» stava a un'altezza fissa («barra di navigazione + 78 px») scelta per una barra dei totali di 60 px: con la riga del conteggio
// la barra è alta 86 px e il «+» ne copriva 11. Ora sale di quanto è alta la barra fissa della vista (--h-barra-basso, useBarreFisse).
describe("il «+» del telefono sta sopra la barra fissa della vista", () => {
  const piu = [...sorgenteGuscio.matchAll(/<Link\b[^>]*>/gs)].map((m) => m[0]).filter((t) => t.includes('aria-label="Nuovo movimento"'))[0] ?? "";

  it("la sua distanza dal fondo conta l'altezza misurata delle barre fisse, non un numero per vista", () => {
    expect(piu).toContain("bottom-[calc(var(--d-nav)+var(--h-barra-basso)+20px+env(safe-area-inset-bottom))]");
    expect(piu).not.toContain("78px");
    expect(piu).not.toContain("pathname ===");
  });

  it("l'avviso si rimette a posto anche quando cambia solo la variabile (lo stile di <html>) e il «+» si sposta", () => {
    expect(sorgenteAvviso).toMatch(/attributeFilter: \["data-tastiera", "style"\]/);
  });
});
