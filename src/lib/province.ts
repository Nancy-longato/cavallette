// Le 107 province italiane: sigla -> nome. Serve a unire "VE" e "Venezia" nello stesso gruppo.

const ELENCO =
  'AG Agrigento|AL Alessandria|AN Ancona|AO Aosta|AP Ascoli Piceno|AQ L\'Aquila|AR Arezzo|AT Asti|AV Avellino|BA Bari|BG Bergamo|BI Biella|BL Belluno|BN Benevento|BO Bologna|BR Brindisi|BS Brescia|BT Barletta-Andria-Trani|BZ Bolzano|' +
  'CA Cagliari|CB Campobasso|CE Caserta|CH Chieti|CL Caltanissetta|CN Cuneo|CO Como|CR Cremona|CS Cosenza|CT Catania|CZ Catanzaro|EN Enna|FC Forlì-Cesena|FE Ferrara|FG Foggia|FI Firenze|FM Fermo|FR Frosinone|GE Genova|GO Gorizia|GR Grosseto|' +
  'IM Imperia|IS Isernia|KR Crotone|LC Lecco|LE Lecce|LI Livorno|LO Lodi|LT Latina|LU Lucca|MB Monza e Brianza|MC Macerata|ME Messina|MI Milano|MN Mantova|MO Modena|MS Massa-Carrara|MT Matera|NA Napoli|NO Novara|NU Nuoro|OR Oristano|' +
  'PA Palermo|PC Piacenza|PD Padova|PE Pescara|PG Perugia|PI Pisa|PN Pordenone|PO Prato|PR Parma|PT Pistoia|PU Pesaro e Urbino|PV Pavia|PZ Potenza|RA Ravenna|RC Reggio Calabria|RE Reggio Emilia|RG Ragusa|RI Rieti|RM Roma|RN Rimini|RO Rovigo|' +
  'SA Salerno|SI Siena|SO Sondrio|SP La Spezia|SR Siracusa|SS Sassari|SU Sud Sardegna|SV Savona|TA Taranto|TE Teramo|TN Trento|TO Torino|TP Trapani|TR Terni|TS Trieste|TV Treviso|UD Udine|VA Varese|VB Verbano-Cusio-Ossola|VC Vercelli|VE Venezia|VI Vicenza|VR Verona|VT Viterbo|VV Vibo Valentia';

/** forma di confronto: maiuscolo, senza accenni né segni ("Forlì-Cesena" -> "FORLI CESENA") */
function chiave(t: string): string {
  return t.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
}

const PER_SIGLA = new Map<string, string>();
const PER_NOME = new Map<string, string>();
for (const voce of ELENCO.split('|')) {
  const sigla = voce.slice(0, 2);
  const nome = voce.slice(3);
  PER_SIGLA.set(sigla, nome);
  PER_NOME.set(chiave(nome), nome);
}
// scritture alternative frequenti
const ALIAS: Record<string, string> = {
  BOZEN: 'BZ', 'VALLE D AOSTA': 'AO', AOSTE: 'AO', FORLI: 'FC', CESENA: 'FC', 'MASSA': 'MS', CARRARA: 'MS', 'PESARO URBINO': 'PU', 'PESARO': 'PU',
  MONZA: 'MB', 'MONZA BRIANZA': 'MB', AQUILA: 'AQ', 'L AQUILA': 'AQ', VERBANIA: 'VB', ASCOLI: 'AP', BARLETTA: 'BT', SPEZIA: 'SP', 'REGGIO C': 'RC', 'REGGIO E': 'RE',
};
for (const [alias, sigla] of Object.entries(ALIAS)) PER_NOME.set(chiave(alias), PER_SIGLA.get(sigla)!);

/** Nome ufficiale della provincia da una sigla o da un nome scritto in modo libero; null se non è riconosciuta */
export function nomeProvincia(testo: string): string | null {
  const t = testo.trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return PER_SIGLA.get(t.toUpperCase()) ?? null;
  return PER_NOME.get(chiave(t)) ?? null;
}
