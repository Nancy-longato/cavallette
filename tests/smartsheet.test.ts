import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiSmartsheet, pianificaImport } from '../src/lib/smartsheet.ts';
import type { RigaSmartsheet, StatoImport, Piano } from '../src/lib/smartsheet.ts';
import type { Cavalletta } from '../src/lib/types.ts';

const OGGI = '2026-11-04';

function cav(id: string, numero: string, extra: Partial<Cavalletta> = {}): Cavalletta {
  return {
    id, numero, vetreria: numero.startsWith('P') ? 'P' : 'L', etichetta: null, contenuto: 'DDT 3873', data_arrivo: '2026-11-03',
    ddt_arrivo: '3873', luogo: 'piazzale', stato: 'piena_vetri', commessa: null, cliente: null, indirizzo: null,
    data_uscita: null, data_consegna: null, note: null, restituita: false, restituita_il: null, restituzione_id: null,
    creata_il: '', aggiornata_il: '', ...extra,
  };
}

function riga(extra: Partial<RigaSmartsheet>): RigaSmartsheet {
  return {
    commessa: '26033', cliente: 'MASIERO GIADA', indirizzo: 'Via Verdi 1, SPINEA (VE)', imballo: false,
    cavallette: '', ddtCons: false, ddtRientro: false, dataCons: null, ...extra,
  };
}

/** Applica il piano in memoria come farebbe il database (patch + cicli) */
function applica(stato: StatoImport, piano: Piano): StatoImport {
  const cavallette = stato.cavallette.map((c) => {
    let out = { ...c };
    for (const a of piano.azioni) if (a.cavallettaId === c.id) out = { ...out, ...a.patch };
    return out;
  });
  const cicli = [...stato.cicli];
  for (const nuovo of piano.cicli) {
    const i = cicli.findIndex((c) => c.cavalletta_id === nuovo.cavalletta_id && c.commessa === nuovo.commessa);
    if (i >= 0) cicli[i] = nuovo;
    else cicli.push(nuovo);
  }
  return { cavallette, cicli };
}

const statoIniziale = (): StatoImport => ({ cavallette: [cav('a', 'P136'), cav('b', '62', { stato: 'vuota', contenuto: null })], cicli: [] });

test('IMBALLO: piazzale, piena (serramenti), commessa e cliente abbinati a tutte le cavallette dell\'elenco', () => {
  const p = pianificaImport([riga({ imballo: true, cavallette: '62; P136' })], statoIniziale(), { oggi: OGGI });
  const s = applica(statoIniziale(), p);
  for (const c of s.cavallette) {
    assert.equal(c.luogo, 'piazzale');
    assert.equal(c.stato, 'piena_serramenti');
    assert.equal(c.commessa, '26033');
    assert.equal(c.cliente, 'MASIERO GIADA');
    assert.equal(c.contenuto, null, 'i vetri non ci sono più');
  }
  assert.equal(p.riepilogo.imballate, 2);
  assert.equal(p.cicli.length, 2);
});

test('DDT cons. rientrato: luogo = cliente con indirizzo; la data di consegna è quella di uscita se presente', () => {
  let s = statoIniziale();
  s = applica(s, pianificaImport([riga({ imballo: true, cavallette: '62;P136' })], s, { oggi: '2026-11-02' }));
  const p = pianificaImport([riga({ imballo: true, ddtCons: true, cavallette: '62;P136', dataCons: '2026-11-03' })], s, { oggi: OGGI });
  s = applica(s, p);
  for (const c of s.cavallette) {
    assert.equal(c.luogo, 'cliente');
    assert.equal(c.stato, 'piena_serramenti');
    assert.equal(c.indirizzo, 'Via Verdi 1, SPINEA (VE)');
    assert.equal(c.data_consegna, '2026-11-03');
  }
  assert.equal(p.riepilogo.consegnate, 2);
});

test('senza colonna data uscita, la consegna parte dal giorno dell\'import', () => {
  let s = statoIniziale();
  s = applica(s, pianificaImport([riga({ imballo: true, ddtCons: true, cavallette: 'P136' })], s, { oggi: OGGI }));
  assert.equal(s.cavallette[0].data_consegna, OGGI);
  assert.equal(s.cavallette[0].luogo, 'cliente');
});

test('DDT RIENTRO: piazzale, vuota, commessa/cliente/indirizzo svuotati, resta il fornitore', () => {
  let s = statoIniziale();
  s = applica(s, pianificaImport([riga({ imballo: true, ddtCons: true, cavallette: 'P136' })], s, { oggi: '2026-10-20' }));
  const p = pianificaImport([riga({ imballo: true, ddtCons: true, ddtRientro: true, cavallette: 'P136' })], s, { oggi: OGGI });
  s = applica(s, p);
  const c = s.cavallette[0];
  assert.equal(c.luogo, 'piazzale');
  assert.equal(c.stato, 'vuota');
  assert.equal(c.commessa, null);
  assert.equal(c.cliente, null);
  assert.equal(c.indirizzo, null);
  assert.equal(c.data_consegna, null);
  assert.equal(c.vetreria, 'P');
  assert.equal(p.riepilogo.rientrate, 1);
  assert.equal(s.cicli[0].data_rientro, OGGI);
});

test('rieseguire lo stesso file non cambia nulla (nemmeno dopo il rientro)', () => {
  const righe = [riga({ imballo: true, ddtCons: true, ddtRientro: true, cavallette: 'P136;62' })];
  let s = statoIniziale();
  s = applica(s, pianificaImport(righe, s, { oggi: OGGI }));
  const di_nuovo = pianificaImport(righe, s, { oggi: '2026-11-05' });
  assert.equal(di_nuovo.azioni.length, 0);
  assert.equal(di_nuovo.cicli.length, 0);
  assert.equal(di_nuovo.anomalie.length, 0);
  assert.equal(di_nuovo.riepilogo.giaAggiornate, 2);
  // e la cavalletta, ormai libera, non viene riassegnata alla vecchia commessa
  assert.equal(s.cavallette[0].commessa, null);
});

test('una correzione manuale non viene sovrascritta dal file', () => {
  const righe = [riga({ imballo: true, cavallette: 'P136' })];
  let s = statoIniziale();
  s = applica(s, pianificaImport(righe, s, { oggi: OGGI }));
  s.cavallette[0] = { ...s.cavallette[0], luogo: 'cliente', note: 'portata a mano' };
  const p = pianificaImport(righe, s, { oggi: '2026-11-05' });
  assert.equal(p.azioni.length, 0);
});

test('cavalletta non in anagrafica: segnalazione, nessuna modifica; si risolve dopo il caricamento del DDT', () => {
  const righe = [riga({ imballo: true, cavallette: 'P999;62' })];
  let s = statoIniziale();
  const p = pianificaImport(righe, s, { oggi: OGGI });
  assert.equal(p.anomalie.length, 1);
  assert.equal(p.anomalie[0].tipo, 'sconosciuta');
  assert.equal(p.anomalie[0].numero, 'P999');
  assert.equal(p.azioni.length, 1, 'la 62 viene comunque assegnata');
  s = applica(s, p);
  assert.equal(p.cicli.some((c) => c.commessa === '26033' && c.cavalletta_id === 'b'), true);
  // arriva il DDT con P999
  s.cavallette.push(cav('c', 'P999'));
  const p2 = pianificaImport(righe, s, { oggi: '2026-11-05' });
  assert.equal(p2.anomalie.length, 0);
  assert.equal(p2.azioni.length, 1);
  assert.deepEqual(p2.risolte, [{ numero: 'P999', commessa: '26033' }]);
});

test('la stessa cavalletta su due commesse insieme: segnalazione, la prima resta', () => {
  const righe = [
    riga({ commessa: 'A1', imballo: true, cavallette: 'P136' }),
    riga({ commessa: 'B2', imballo: true, cavallette: 'P136' }),
  ];
  const s = statoIniziale();
  const p = pianificaImport(righe, s, { oggi: OGGI });
  const f = applica(s, p);
  assert.equal(f.cavallette[0].commessa, 'A1');
  assert.equal(p.anomalie.length, 1);
  assert.equal(p.anomalie[0].tipo, 'gia_in_uso');
  assert.match(p.anomalie[0].dettaglio, /A1/);
  // quando A1 rientra, B2 può partire
  const dopo = pianificaImport(
    [riga({ commessa: 'A1', imballo: true, ddtCons: true, ddtRientro: true, cavallette: 'P136' }), righe[1]],
    f,
    { oggi: '2026-11-10' },
  );
  const f2 = applica(f, dopo);
  assert.equal(f2.cavallette[0].commessa, 'B2');
  assert.equal(f2.cavallette[0].stato, 'piena_serramenti');
});

test('riga storica già chiusa (con rientro) su una cavalletta libera non la tocca', () => {
  const righe = [riga({ commessa: 'VECCHIA', imballo: true, ddtCons: true, ddtRientro: true, cavallette: '62' })];
  const s = statoIniziale();
  const p = pianificaImport(righe, s, { oggi: OGGI });
  assert.equal(p.azioni.length, 0);
  assert.equal(p.riepilogo.registrate, 1);
  assert.equal(p.cicli.length, 1);
  const f = applica(s, p);
  assert.equal(f.cavallette[1].stato, 'vuota');
});

test('rientro con data dopo l\'arrivo su una cavalletta mai abbinata: torna vuota in piazzale', () => {
  const righe = [riga({ commessa: '26632', imballo: true, ddtCons: true, ddtRientro: true, cavallette: 'P136', dataCons: '2026-11-04' })];
  const s = statoIniziale();
  const p = pianificaImport(righe, s, { oggi: OGGI });
  assert.equal(p.azioni.length, 1);
  assert.equal(p.riepilogo.rientrate, 1);
  const f = applica(s, p);
  const c = f.cavallette.find((x) => x.numero === 'P136')!;
  assert.equal(c.stato, 'vuota');
  assert.equal(c.luogo, 'piazzale');
  assert.equal(c.commessa, null);
});

test('rientro con data PRIMA dell\'arrivo (giro vecchio): la cavalletta non si tocca', () => {
  const righe = [riga({ commessa: 'VECCHIA', imballo: true, ddtCons: true, ddtRientro: true, cavallette: 'P136', dataCons: '2026-05-04' })];
  const p = pianificaImport(righe, statoIniziale(), { oggi: OGGI });
  assert.equal(p.azioni.length, 0);
  assert.equal(p.riepilogo.registrate, 1);
});

test('filtro "dal": le righe con data uscita precedente vengono ignorate', () => {
  const righe = [
    riga({ commessa: 'VECCHIA', imballo: true, cavallette: '62', dataCons: '2025-06-01' }),
    riga({ commessa: 'NUOVA', imballo: true, cavallette: 'P136', dataCons: '2026-11-02' }),
  ];
  const p = pianificaImport(righe, statoIniziale(), { oggi: OGGI, dal: '2026-10-01' });
  assert.equal(p.riepilogo.escluse, 1);
  assert.equal(p.azioni.length, 1);
  assert.equal(p.azioni[0].numero, 'P136');
});

test('righe senza spunte o senza cavallette non fanno nulla; cavallette già restituite sono ignorate', () => {
  const s = statoIniziale();
  s.cavallette[0] = { ...s.cavallette[0], restituita: true };
  const p = pianificaImport(
    [riga({ cavallette: 'P136' }), riga({ imballo: true, cavallette: '' }), riga({ imballo: true, cavallette: 'P136' })],
    s,
    { oggi: OGGI },
  );
  assert.equal(p.azioni.length, 0);
  assert.equal(p.anomalie.length, 1, 'P136 restituita = non più in anagrafica attiva');
});

test('salto di fase: DDT cons. rientrato già spuntato alla prima lettura', () => {
  const s = statoIniziale();
  const p = pianificaImport([riga({ ddtCons: true, cavallette: 'P136' })], s, { oggi: OGGI });
  const f = applica(s, p);
  assert.equal(f.cavallette[0].luogo, 'cliente');
  assert.equal(f.cicli[0].fase, 2);
});

test('numeri con trattino: "P-E82", "p e82" e "PE82" in Smartsheet trovano la stessa cavalletta', () => {
  for (const scritto of ['P-E82', 'p-e82', 'PE82', 'P E82']) {
    const s: StatoImport = { cavallette: [cav('x', 'P-E82')], cicli: [] };
    const p = pianificaImport([riga({ imballo: true, cavallette: scritto })], s, { oggi: OGGI });
    assert.equal(p.anomalie.length, 0, scritto);
    assert.equal(p.azioni.length, 1, scritto);
    assert.equal(p.azioni[0].numero, 'P-E82');
  }
});

test('«DDT cons. rientrato» con una data: vale come spunta e dà la data di consegna', () => {
  const l = leggiSmartsheet([
    {
      nome: 'Foglio',
      righe: [
        ['COMMESSA', 'CLIENTE', 'IMBALLO', 'NUMERO CAVALLETTE', 'DDT cons. rientrato', 'DDT RIENTRO'],
        ['A1', 'Rossi', 'true', '62', '15/10/26', null],
        ['A2', 'Bianchi', 'true', 'P136', 'true', null],
        ['A3', 'Verdi', 'true', '63', null, null],
      ],
    },
  ]);
  assert.deepEqual(l.colonneMancanti, []);
  assert.equal(l.haDataCons, true);
  assert.deepEqual(l.righe.map((r) => [r.ddtCons, r.dataCons]), [[true, '2026-10-15'], [true, null], [false, null]]);
});
