// Test sui file reali di esempio (cartella samples/, non inclusa nel repository).
// Se i file non ci sono, i test vengono saltati.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { estraiPagine, parseDdt } from '../src/lib/ddtParser.ts';
import { leggiXlsx } from '../src/lib/xlsxReader.ts';
import { leggiSmartsheet, pianificaImport } from '../src/lib/smartsheet.ts';
import { leggiArriviExcel } from '../src/lib/arrivi.ts';
import type { Vetreria } from '../src/lib/types.ts';

const PDF = new URL('../samples/DDT_1263873.pdf', import.meta.url);
const XLSX = new URL('../samples/Test_Automazioni.xlsx', import.meta.url);

describe('DDT Pescini reale', { skip: !fs.existsSync(PDF) }, () => {
  test('legge vetreria, numero, data, ordini e i 4 cavalletti consegnati', async () => {
    const data = new Uint8Array(fs.readFileSync(PDF));
    const doc = await getDocument({ data, useSystemFonts: true }).promise;
    const pagine = await estraiPagine(doc);
    assert.equal(pagine.length, 6);
    const r = parseDdt(pagine);
    assert.equal(r.vetreria, 'P');
    assert.equal(r.numeroDdt, '3873');
    assert.equal(r.dataDdt, '2026-11-02');
    assert.deepEqual(r.consegnati, ['E82', 'B20', 'D65', 'A97']);
    assert.deepEqual(r.ritirati, []);
    assert.equal(r.ordini.length, 5);
    assert.ok(r.ordini.includes('26323 GURAU MARIANA'));
    assert.ok(r.ordini.includes('26098-3 EDIL IMM. P1'));
    assert.deepEqual(r.avvisi, []);
  });

  test('un PDF senza il riquadro cavalletti dà un avviso, non un errore', () => {
    const r = parseDdt([[{ str: 'Vetraria Pescini s.r.l.', x: 10, y: 700 }]]);
    assert.equal(r.vetreria, 'P');
    assert.deepEqual(r.consegnati, []);
    assert.ok(r.avvisi.length >= 1);
  });
});

describe('Excel Smartsheet reale', { skip: !fs.existsSync(XLSX) }, () => {
  test('legge fogli, intestazioni, booleani "true" e date', async () => {
    const fogli = await leggiXlsx(new Uint8Array(fs.readFileSync(XLSX)));
    assert.deepEqual(fogli.map((f) => f.nome), ['Test Automazioni', 'Comments']);
    const l = leggiSmartsheet(fogli);
    assert.equal(l.foglio, 'Test Automazioni');
    assert.deepEqual(l.colonneMancanti, []);
    assert.equal(l.haDataCons, false);
    assert.equal(l.righe.length, 7);
    assert.equal(l.righe[0].commessa, '26031-P');
    assert.equal(l.righe[2].commessa, '26033', 'i numeri diventano testo senza ".0"');
    assert.equal(l.righe[0].cliente, 'MOCELLIN FRANCA');
    assert.equal(l.righe[0].indirizzo, 'NOALE (VE)');
  });

  test('un import completo sul file reale non va in errore', async () => {
    const fogli = await leggiXlsx(new Uint8Array(fs.readFileSync(XLSX)));
    const l = leggiSmartsheet(fogli);
    const p = pianificaImport(l.righe, { cavallette: [], cicli: [] }, { oggi: '2026-11-04' });
    assert.ok(p.riepilogo.righeConCavallette >= 0);
  });

  test('con una cavalletta aggiunta a mano nel file, la riga viene letta', async () => {
    const fogli = await leggiXlsx(new Uint8Array(fs.readFileSync(XLSX)));
    const f = fogli[0];
    const intest = f.righe[0].map((c) => String(c ?? ''));
    const colCav = intest.indexOf('NUMERO CAVALLETTE');
    const colImb = intest.indexOf('IMBALLO');
    assert.ok(colCav > 0 && colImb > 0);
    f.righe[1][colCav] = '62; P136';
    f.righe[1][colImb] = 'true';
    const l = leggiSmartsheet(fogli);
    assert.equal(l.righe[0].cavallette, '62; P136');
    assert.equal(l.righe[0].imballo, true);
  });
});

test('Excel arrivi generico: trova la colonna cavallette, vetreria e contenuto', () => {
  const vetrerie: Vetreria[] = [
    { codice: 'P', nome: 'Pescini', restituibile: true, ordine: 1 },
    { codice: 'F', nome: 'Feca', restituibile: true, ordine: 2 },
  ];
  const foglio = {
    nome: 'Arrivi',
    righe: [
      ['Arrivi del giorno'],
      ['Vetreria', 'N. cavalletta', 'Contenuto'],
      ['Pescini', 'E82, B20', 'triplo vetro'],
      ['FECA', 'F7', null],
      [null, null, null],
    ],
  };
  const r = leggiArriviExcel([foglio], vetrerie);
  assert.deepEqual(r.righe.map((x) => [x.codice, x.vetreria]), [['E82', 'P'], ['B20', 'P'], ['F7', 'F']]);
  assert.equal(r.righe[0].contenuto, 'triplo vetro');
  assert.deepEqual(leggiArriviExcel([{ nome: 'x', righe: [['a', 'b']] }], vetrerie).righe, []);
});
