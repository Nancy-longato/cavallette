import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { salvaNuoveCavallette, segnaNonUsate } from '../lib/api.ts';
import { leggiArriviExcel } from '../lib/arrivi.ts';
import { parseDdt } from '../lib/ddtParser.ts';
import { leggiPdf } from '../lib/pdfText.ts';
import { leggiXlsx } from '../lib/xlsxReader.ts';
import { chiaveDaCodice, confrontaNumeri, espandiIntervalli } from '../lib/keys.ts';
import { oggiRoma } from '../lib/dates.ts';
import { LONGATO } from '../lib/types.ts';
import { useDati } from '../lib/dati.tsx';
import type { Cavalletta } from '../lib/types.ts';
import { Messaggio, Titolo } from '../components/ui.tsx';

interface RigaBozza {
  id: number;
  codice: string;
  vetreria: string;
  contenuto: string;
}

interface Bozza {
  sorgente: string;
  numeroDdt: string;
  dataArrivo: string;
  contenuto: string;
  righe: RigaBozza[];
  avvisi: string[];
  note: string[];
}

let contatore = 0;

export default function Arrivi() {
  const { vetrerie, cavallette, nomeVetreria, ricarica } = useDati();
  const fornitori = vetrerie.filter((v) => v.codice !== LONGATO);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [lettura, setLettura] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  const esistenti = useMemo(() => new Set(cavallette.map((c) => c.numero)), [cavallette]);

  async function scegliFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrore(null);
    setEsito(null);
    setLettura(true);
    try {
      const dati = await file.arrayBuffer();
      const nome = file.name.toLowerCase();
      if (nome.endsWith('.pdf')) {
        const r = parseDdt(await leggiPdf(dati));
        const prefisso = r.numeroDdt ? `DDT ${r.numeroDdt} · ` : '';
        const contenuto = r.ordini.length ? `${prefisso}ordini: ${r.ordini.join('; ')}` : '';
        setBozza({
          sorgente: file.name,
          numeroDdt: r.numeroDdt ?? '',
          dataArrivo: r.dataDdt ?? oggiRoma(),
          contenuto,
          righe: r.consegnati.map((codice) => ({ id: ++contatore, codice, vetreria: r.vetreria ?? '', contenuto: '' })),
          avvisi: r.avvisi,
          note: [],
        });
      } else if (nome.endsWith('.xlsx')) {
        const r = leggiArriviExcel(await leggiXlsx(dati), vetrerie);
        setBozza({
          sorgente: file.name,
          numeroDdt: '',
          dataArrivo: oggiRoma(),
          contenuto: '',
          righe: r.righe.map((x) => ({ id: ++contatore, codice: x.codice, vetreria: x.vetreria ?? '', contenuto: x.contenuto })),
          avvisi: r.avvisi,
          note: [],
        });
      } else {
        throw new Error('Formato non supportato: carica un PDF (DDT) oppure un file Excel (.xlsx).');
      }
    } catch (err) {
      setBozza(null);
      setErrore(err instanceof Error ? err.message : 'Impossibile leggere il file');
    } finally {
      setLettura(false);
    }
  }

  const controlli = useMemo(() => {
    if (!bozza) return [];
    const viste = new Map<string, number>();
    return bozza.righe.map((r) => {
      const chiave = chiaveDaCodice(r.codice, r.vetreria);
      let problema: string | null = null;
      if (!r.codice.trim()) problema = 'Codice mancante';
      else if (!r.vetreria) problema = 'Scegli la vetreria';
      else if (!chiave) problema = 'Codice non valido';
      else if (esistenti.has(chiave)) problema = 'Già presente in anagrafica';
      else if (viste.has(chiave)) problema = 'Doppione nella lista';
      if (chiave) viste.set(chiave, (viste.get(chiave) ?? 0) + 1);
      return { chiave, problema };
    });
  }, [bozza, esistenti]);

  const pronto = bozza !== null && bozza.righe.length > 0 && controlli.every((c) => c.problema === null);

  function aggiorna(id: number, patch: Partial<RigaBozza>): void {
    setBozza((b) => (b ? { ...b, righe: b.righe.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : b));
  }

  async function salva(): Promise<void> {
    if (!bozza || !pronto) return;
    setSalvataggio(true);
    setErrore(null);
    try {
      const n = await salvaNuoveCavallette(
        bozza.righe.map((r, i) => ({
          numero: controlli[i].chiave,
          vetreria: r.vetreria,
          etichetta: r.codice.trim().toUpperCase(),
          contenuto: (r.contenuto || bozza.contenuto || '').trim() || null,
          data_arrivo: bozza.dataArrivo || null,
          ddt_arrivo: bozza.numeroDdt.trim() || null,
          stato: 'piena_vetri',
        })),
        'arrivata',
      );
      setEsito(`${n} cavallette caricate: ${controlli.map((c) => c.chiave).join(', ')}. Sono in piazzale, piene di vetri.`);
      setBozza(null);
      await ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore durante il salvataggio');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <>
      <Titolo titolo="Arrivo vetri" sotto="Carica il DDT del fornitore (PDF) o un file Excel, oppure inserisci le cavallette a mano: entrano in piazzale, piene di vetri. La data di arrivo è quella del DDT." />
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}

      <div className="card">
        <label className="file">
          <span className="btn btn-primary btn-big">{lettura ? 'Lettura in corso…' : 'Scegli DDT (PDF) o Excel'}</span>
          <input type="file" accept=".pdf,.xlsx" onChange={(e) => void scegliFile(e)} disabled={lettura} hidden />
        </label>
        <button
          className="btn btn-big"
          disabled={lettura}
          onClick={() => {
            setErrore(null);
            setEsito(null);
            setBozza({ sorgente: 'Inserimento manuale', numeroDdt: '', dataArrivo: oggiRoma(), contenuto: '', righe: [{ id: ++contatore, codice: '', vetreria: '', contenuto: '' }], avvisi: [], note: [] });
          }}
        >
          Inserisci a mano
        </button>
      </div>

      {bozza && (
        <div className="card">
          <h2>Controlla prima di salvare</h2>
          <p className="sotto">File: {bozza.sorgente}</p>
          {bozza.avvisi.map((a) => <Messaggio key={a} tipo="avviso">{a}</Messaggio>)}
          {bozza.note.map((a) => <Messaggio key={a} tipo="info">{a}</Messaggio>)}

          <div className="form griglia">
            <label>N. DDT<input value={bozza.numeroDdt} onChange={(e) => setBozza({ ...bozza, numeroDdt: e.target.value })} /></label>
            <label>Data arrivo in sede<input type="date" value={bozza.dataArrivo} onChange={(e) => setBozza({ ...bozza, dataArrivo: e.target.value })} /></label>
            <label>Vetreria (per tutte)
              <select value="" onChange={(e) => e.target.value && setBozza({ ...bozza, righe: bozza.righe.map((r) => ({ ...r, vetreria: e.target.value })) })}>
                <option value="">— imposta su tutte —</option>
                {fornitori.map((v) => <option key={v.codice} value={v.codice}>{v.nome}</option>)}
              </select>
            </label>
          </div>
          <label className="form">Contenuto (vale per tutte le cavallette)
            <textarea rows={2} value={bozza.contenuto} onChange={(e) => setBozza({ ...bozza, contenuto: e.target.value })} />
          </label>

          <div className="scorri">
            <table className="tabella">
              <thead><tr><th>Codice sul DDT</th><th>Vetreria</th><th>Diventa</th><th>Esito</th><th /></tr></thead>
              <tbody>
                {bozza.righe.map((r, i) => (
                  <tr key={r.id}>
                    <td><input value={r.codice} onChange={(e) => aggiorna(r.id, { codice: e.target.value })} /></td>
                    <td>
                      <select value={r.vetreria} onChange={(e) => aggiorna(r.id, { vetreria: e.target.value })}>
                        <option value="">—</option>
                        {fornitori.map((v) => <option key={v.codice} value={v.codice}>{v.nome}</option>)}
                      </select>
                    </td>
                    <td className="numero">{controlli[i]?.chiave}</td>
                    <td className={controlli[i]?.problema ? 'errore-testo' : 'ok-testo'}>{controlli[i]?.problema ?? 'OK'}</td>
                    <td><button className="btn" onClick={() => setBozza({ ...bozza, righe: bozza.righe.filter((x) => x.id !== r.id) })}>Togli</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="riga-bottoni">
            <button className="btn" onClick={() => setBozza({ ...bozza, righe: [...bozza.righe, { id: ++contatore, codice: '', vetreria: bozza.righe[0]?.vetreria ?? '', contenuto: '' }] })}>+ Aggiungi cavalletta</button>
            <button className="btn btn-primary" disabled={!pronto || salvataggio} onClick={() => void salva()}>
              {salvataggio ? 'Salvataggio…' : `Salva ${bozza.righe.length} cavallette`}
            </button>
            <button className="btn" onClick={() => setBozza(null)}>Annulla</button>
          </div>
          {!pronto && bozza.righe.length > 0 && <p className="nota">Correggi le righe segnalate per poter salvare.</p>}
          <p className="nota">Il numero che diventa la cavalletta è «prefisso vetreria + codice» (es. Pescini E82 → P-E82). È quello da scrivere in Smartsheet nella colonna N° CAVALLETTE.</p>
        </div>
      )}

      <NonUsate cavallette={cavallette} nomeVetreria={nomeVetreria} ricarica={ricarica} />
      <Interne esistenti={esistenti} nomeVetreria={nomeVetreria} ricarica={ricarica} />
    </>
  );
}

function Interne(props: { esistenti: Set<string>; nomeVetreria: (c: string) => string; ricarica: () => Promise<void> }) {
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  const calcolo = useMemo(() => {
    if (!testo.trim()) return { nuove: [] as string[], gia: 0, errore: null as string | null };
    try {
      const tutte = espandiIntervalli(testo);
      return { nuove: tutte.filter((n) => !props.esistenti.has(n)), gia: tutte.filter((n) => props.esistenti.has(n)).length, errore: null };
    } catch (e) {
      return { nuove: [], gia: 0, errore: e instanceof Error ? e.message : 'Valore non valido' };
    }
  }, [testo, props.esistenti]);

  async function aggiungi(): Promise<void> {
    setOccupato(true);
    setErrore(null);
    setEsito(null);
    try {
      const n = await salvaNuoveCavallette(
        calcolo.nuove.map((numero) => ({ numero, vetreria: LONGATO, etichetta: null, contenuto: null, data_arrivo: null, ddt_arrivo: null, stato: 'vuota' as const })),
        'interna',
      );
      setEsito(`${n} cavallette interne aggiunte (vuote, in piazzale).`);
      setTesto('');
      await props.ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    } finally {
      setOccupato(false);
    }
  }

  return (
    <div className="card">
      <h2>Cavallette nostre ({props.nomeVetreria(LONGATO)})</h2>
      <p className="sotto">Aggiungi le cavallette interne con il loro numero. Partono vuote, in piazzale, e non vanno mai restituite.</p>
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}
      <div className="toolbar">
        <input className="cerca" placeholder="Numeri, es. 1-120, 130, 135-140" value={testo} onChange={(e) => setTesto(e.target.value)} />
        <button className="btn btn-primary" disabled={occupato || calcolo.nuove.length === 0} onClick={() => void aggiungi()}>
          Aggiungi {calcolo.nuove.length || ''}
        </button>
      </div>
      {calcolo.errore && <p className="errore-testo">{calcolo.errore}</p>}
      {!calcolo.errore && testo.trim() && <p className="nota">{calcolo.nuove.length} nuove{calcolo.gia ? `, ${calcolo.gia} già presenti (saltate)` : ''}.</p>}
    </div>
  );
}

/** Cavallette arrivate con i vetri che non verranno usate in produzione: si segnano vuote e la logistica viene avvisata */
function NonUsate(props: { cavallette: Cavalletta[]; nomeVetreria: (c: string) => string; ricarica: () => Promise<void> }) {
  const [cerca, setCerca] = useState('');
  const [spuntate, setSpuntate] = useState<Set<string>>(new Set());
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  const candidate = useMemo(
    () =>
      props.cavallette
        .filter((c) => !c.restituita && c.vetreria !== LONGATO && c.stato === 'piena_vetri' && c.luogo === 'piazzale')
        .sort((a, b) => confrontaNumeri(a.numero, b.numero)),
    [props.cavallette],
  );
  const visibili = candidate.filter((c) => !cerca.trim() || c.numero.toLowerCase().includes(cerca.trim().toLowerCase()) || (c.contenuto ?? '').toLowerCase().includes(cerca.trim().toLowerCase()));

  function alterna(id: string): void {
    setSpuntate((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function segna(): Promise<void> {
    const scelte = candidate.filter((c) => spuntate.has(c.id));
    if (!scelte.length) return;
    if (!window.confirm(`Segnare ${scelte.length} cavallette come vuote, non usate in produzione? La logistica riceverà una segnalazione.`)) return;
    setOccupato(true);
    setErrore(null);
    setEsito(null);
    try {
      const n = await segnaNonUsate(scelte, props.nomeVetreria);
      setEsito(`${n} cavallette segnate vuote. La logistica le vede in Segnalazioni e il magazziniere può restituirle.`);
      setSpuntate(new Set());
      await props.ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
      await props.ricarica();
    } finally {
      setOccupato(false);
    }
  }

  return (
    <div className="card">
      <h2>Non usate in produzione</h2>
      <p className="sotto">Cavallette arrivate con i vetri e scaricate senza essere usate per i serramenti. Spunta quelle da segnare come vuote: diventano restituibili e la logistica riceve una segnalazione.</p>
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}
      {candidate.length === 0 ? (
        <p className="nota">Nessuna cavalletta piena di vetri in piazzale.</p>
      ) : (
        <>
          <div className="toolbar">
            <input className="cerca" placeholder="Cerca numero o contenuto" value={cerca} onChange={(e) => setCerca(e.target.value)} />
            <button className="btn" onClick={() => setSpuntate(new Set(visibili.map((c) => c.id)))}>Seleziona le {visibili.length} visibili</button>
            <button className="btn" onClick={() => setSpuntate(new Set())}>Nessuna</button>
          </div>
          <div className="scorri">
            <table className="tabella">
              <thead><tr><th /><th>Cavalletta</th><th>Vetreria</th><th>Arrivata il</th><th>Contenuto</th></tr></thead>
              <tbody>
                {visibili.map((c) => (
                  <tr key={c.id} className="cliccabile" onClick={() => alterna(c.id)}>
                    <td><input type="checkbox" checked={spuntate.has(c.id)} onChange={() => alterna(c.id)} onClick={(e) => e.stopPropagation()} aria-label={`Seleziona ${c.numero}`} /></td>
                    <td className="numero">{c.numero}</td>
                    <td>{props.nomeVetreria(c.vetreria)}</td>
                    <td>{c.data_arrivo ? c.data_arrivo.split('-').reverse().join('/') : ''}</td>
                    <td>{c.contenuto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="riga-bottoni">
            <button className="btn btn-primary" disabled={spuntate.size === 0 || occupato} onClick={() => void segna()}>
              {occupato ? 'Salvataggio…' : `Segna ${spuntate.size || ''} vuote e avvisa la logistica`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
