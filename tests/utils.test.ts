import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaChiave, spezzaCavallette, chiaveDaCodice, trovaNumero, espandiIntervalli, confrontaNumeri } from '../src/lib/keys.ts';
import { pasqua, festivi, isLavorativo, giorniLavorativiTra, aggiungiGiorniLavorativi, addDays, diffDays, oggiRoma, formattaData } from '../src/lib/dates.ts';
import { giorniInCantiere, daRitirare, giacenza } from '../src/lib/logica.ts';
import type { Cavalletta } from '../src/lib/types.ts';

test('normalizzaChiave ignora spazi, trattini e maiuscole', () => {
  assert.equal(normalizzaChiave(' p-136 '), 'P136');
  assert.equal(normalizzaChiave('P 136'), 'P136');
  assert.equal(normalizzaChiave('62'), '62');
});

test('spezzaCavallette divide per virgola, punto e virgola o a capo', () => {
  assert.deepEqual(spezzaCavallette('62;P136'), ['62', 'P136']);
  assert.deepEqual(spezzaCavallette('62, P 136'), ['62', 'P136']);
  assert.deepEqual(spezzaCavallette('62\nP136;;62'), ['62', 'P136']);
  assert.deepEqual(spezzaCavallette('62; p - e82'), ['62', 'P-E82']);
  assert.deepEqual(spezzaCavallette(null), []);
  assert.deepEqual(spezzaCavallette(62), ['62']);
});

test('chiaveDaCodice: prefisso-codice per i fornitori, numero nudo per Longato', () => {
  assert.equal(chiaveDaCodice('E82', 'P'), 'P-E82');
  assert.equal(chiaveDaCodice('P-E82', 'P'), 'P-E82');
  assert.equal(chiaveDaCodice('PE82', 'P'), 'P-E82');
  assert.equal(chiaveDaCodice('136', 'P'), 'P-136');
  assert.equal(chiaveDaCodice('B20', 'B'), 'B-20');
  assert.equal(chiaveDaCodice('B20', 'P'), 'P-B20');
  assert.equal(chiaveDaCodice('G12', 'P'), 'P-G12');
  assert.equal(chiaveDaCodice('12', 'PG'), 'PG-12');
  assert.equal(chiaveDaCodice('62', 'L'), '62');
  assert.equal(chiaveDaCodice('L62', 'L'), '62');
  assert.equal(chiaveDaCodice('', 'P'), '');
});

test('trovaNumero: uguale, oppure senza trattino se la corrispondenza è unica', () => {
  assert.equal(trovaNumero('P-E82', ['P-E82', '62']), 'P-E82');
  assert.equal(trovaNumero('PE82', ['P-E82', '62']), 'P-E82');
  assert.equal(trovaNumero('PG12', ['P-G12', 'PG-12']), null); // ambiguo: serve il trattino
  assert.equal(trovaNumero('PG-12', ['P-G12', 'PG-12']), 'PG-12');
  assert.equal(trovaNumero('99', ['P-E82']), null);
});

test('espandiIntervalli', () => {
  assert.deepEqual(espandiIntervalli('1-3, 7, 9-10'), ['1', '2', '3', '7', '9', '10']);
  assert.deepEqual(espandiIntervalli('5,5, 05'), ['5']);
  assert.throws(() => espandiIntervalli('5-3'));
  assert.throws(() => espandiIntervalli('abc'));
  assert.throws(() => espandiIntervalli('1-5000'));
});

test('ordinamento naturale', () => {
  const v = ['P10', 'P9', '62', '7'].sort(confrontaNumeri);
  assert.deepEqual(v, ['7', '62', 'P9', 'P10']);
});

test('Pasqua e festività', () => {
  assert.equal(pasqua(2024), '2024-03-31');
  assert.equal(pasqua(2025), '2025-04-20');
  assert.equal(pasqua(2026), '2026-04-05');
  assert.ok(festivi(2026).has('2026-04-06'), 'Pasquetta 2026');
  assert.ok(festivi(2026).has('2026-08-15'));
});

test('giorni lavorativi: weekend e festivi esclusi', () => {
  // lun 19/10/2026 -> lun 02/11/2026 = 10 giorni lavorativi (1/11 è domenica)
  assert.equal(giorniLavorativiTra('2026-10-19', '2026-11-02'), 10);
  // venerdì -> lunedì = 1
  assert.equal(giorniLavorativiTra('2026-10-30', '2026-11-02'), 1);
  // stessa data o a ritroso = 0
  assert.equal(giorniLavorativiTra('2026-11-02', '2026-11-02'), 0);
  assert.equal(giorniLavorativiTra('2026-11-05', '2026-11-02'), 0);
  // Pasquetta saltata: ven 03/04 -> mar 07/04 = lun 06 festivo, quindi solo mar 07 = 1
  assert.equal(giorniLavorativiTra('2026-04-03', '2026-04-07'), 1);
  // chiusura aziendale
  assert.equal(giorniLavorativiTra('2026-10-30', '2026-11-03', new Set(['2026-11-02'])), 1);
  assert.equal(isLavorativo('2026-11-04'), true);
  assert.equal(isLavorativo('2026-11-07'), false);
});

test('aggiungiGiorniLavorativi', () => {
  assert.equal(aggiungiGiorniLavorativi('2026-10-19', 10), '2026-11-02');
  assert.equal(aggiungiGiorniLavorativi('2026-10-30', 1), '2026-11-02');
});

test('date: somma, differenza, formato, fuso Roma', () => {
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(diffDays('2026-10-25', '2026-10-26'), 1); // cambio ora legale
  assert.equal(formattaData('2026-11-04'), '04/11/2026');
  // 23:30 UTC del 4/11 sono già le 00:30 del 5/11 a Roma
  assert.equal(oggiRoma(new Date('2026-11-04T23:30:00Z')), '2026-11-05');
  assert.equal(oggiRoma(new Date('2026-11-04T10:00:00Z')), '2026-11-04');
});

function cav(parziale: Partial<Cavalletta>): Cavalletta {
  return {
    id: 'x', numero: 'P1', vetreria: 'P', etichetta: null, contenuto: null, data_arrivo: null, ddt_arrivo: null,
    luogo: 'piazzale', stato: 'vuota', commessa: null, cliente: null, indirizzo: null, data_uscita: null,
    data_consegna: null, note: null, restituita: false, restituita_il: null, restituzione_id: null,
    creata_il: '', aggiornata_il: '', ...parziale,
  };
}

test('da ritirare dopo 10 giorni lavorativi dal cliente', () => {
  const c = cav({ luogo: 'cliente', data_consegna: '2026-10-19', stato: 'piena_serramenti' });
  const vuoto = new Set<string>();
  assert.equal(giorniInCantiere(c, '2026-11-02', vuoto), 10);
  assert.equal(daRitirare(c, '2026-11-02', vuoto, 10), true);
  assert.equal(daRitirare(c, '2026-10-30', vuoto, 10), false);
  assert.equal(daRitirare(cav({ luogo: 'piazzale', data_consegna: '2026-10-01' }), '2026-11-02', vuoto, 10), false);
  assert.equal(daRitirare(cav({ luogo: 'cliente', data_consegna: null }), '2026-11-02', vuoto, 10), false);
});

test('giacenza solo per le cavallette dei fornitori', () => {
  assert.equal(giacenza(cav({ vetreria: 'P', data_arrivo: '2026-10-25' }), '2026-11-04'), 10);
  assert.equal(giacenza(cav({ vetreria: 'L', data_arrivo: '2026-10-25' }), '2026-11-04'), null);
  assert.equal(giacenza(cav({ vetreria: 'P', data_arrivo: null }), '2026-11-04'), null);
});
