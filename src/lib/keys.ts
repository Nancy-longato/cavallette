// Normalizzazione dei numeri cavalletta. Smartsheet e DDT scrivono lo stesso numero
// in modi diversi ("P 136", "p-136", "P136"): qui diventano tutti la stessa chiave.

export function normalizzaChiave(testo: string): string {
  return testo
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Forma "canonica" di un numero scritto a mano o in Smartsheet: maiuscolo, senza spazi, trattino singolo.
 * "p - e82" -> "P-E82", "62" -> "62".
 */
export function chiaveCanonica(testo: string): string {
  return testo
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** "62; P-E82" / "62, P-E82" / "62\nP-E82"  ->  ["62", "P-E82"] (senza doppioni, in ordine) */
export function spezzaCavallette(valore: unknown): string[] {
  if (valore === null || valore === undefined) return [];
  const testo = String(valore);
  const out: string[] = [];
  for (const pezzo of testo.split(/[,;\n\r|]+/)) {
    const k = chiaveCanonica(pezzo);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Chiave di una cavalletta a partire dal codice stampato e dalla vetreria.
 * - fornitori: prefisso della vetreria, trattino, codice  (Pescini "E82" -> "P-E82")
 * - Longato (L): solo il numero, come si scrive in Smartsheet ("62")
 */
export function chiaveDaCodice(codice: string, vetreria: string): string {
  const n = normalizzaChiave(codice);
  if (!n) return '';
  if (vetreria === 'L') return n.replace(/^L(?=\d)/, '');
  if (!vetreria) return n;
  const resto = n.startsWith(vetreria) && n.length > vetreria.length ? n.slice(vetreria.length) : n;
  return `${vetreria}-${resto}`;
}

/**
 * Trova nell'elenco il numero scritto in Smartsheet: prima uguale, poi ignorando i trattini
 * ("PE82" trova "P-E82") purché la corrispondenza sia una sola.
 */
export function trovaNumero(scritto: string, numeri: Iterable<string>): string | null {
  const tutti = [...numeri];
  if (tutti.includes(scritto)) return scritto;
  const n = normalizzaChiave(scritto);
  const simili = tutti.filter((x) => normalizzaChiave(x) === n);
  return simili.length === 1 ? simili[0] : null;
}

/** "1-5, 9, 12-13" -> ["1","2","3","4","5","9","12","13"]. Massimo `limite` numeri. */
export function espandiIntervalli(testo: string, limite = 1000): string[] {
  const out: string[] = [];
  for (const pezzo of testo.split(/[,;\s]+/)) {
    if (!pezzo) continue;
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(pezzo);
    if (m) {
      const da = Number(m[1]);
      const a = Number(m[2]);
      if (a < da) throw new Error(`Intervallo non valido: ${pezzo}`);
      for (let n = da; n <= a; n++) {
        if (!out.includes(String(n))) out.push(String(n));
        if (out.length > limite) throw new Error(`Troppi numeri (massimo ${limite})`);
      }
    } else if (/^\d+$/.test(pezzo)) {
      if (!out.includes(String(Number(pezzo)))) out.push(String(Number(pezzo)));
    } else {
      throw new Error(`Valore non valido: "${pezzo}"`);
    }
    if (out.length > limite) throw new Error(`Troppi numeri (massimo ${limite})`);
  }
  return out;
}

/** Ordinamento "naturale": 2 prima di 10, P9 prima di P10 */
export function confrontaNumeri(a: string, b: string): number {
  return a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' });
}
