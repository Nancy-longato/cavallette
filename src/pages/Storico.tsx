import { useEffect, useMemo, useState } from 'react';
import { caricaProfili, caricaRegistro, caricaRestituzioni } from '../lib/api.ts';
import type { RigaRegistro } from '../lib/api.ts';
import type { Cavalletta, Restituzione } from '../lib/types.ts';
import { addDays, formattaData, oggiRoma } from '../lib/dates.ts';
import { NOMI_EVENTO, descriviEvento } from '../lib/eventi.ts';
import { useDati } from '../lib/dati.tsx';
import CavallettaDialog from '../components/CavallettaDialog.tsx';
import { Messaggio, Titolo } from '../components/ui.tsx';

function Restituzioni() {
  const { nomeVetreria } = useDati();
  const [dati, setDati] = useState<{ restituzione: Restituzione; cavallette: Cavalletta[] }[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [cerca, setCerca] = useState('');
  const [aperta, setAperta] = useState<Cavalletta | null>(null);

  useEffect(() => {
    caricaRestituzioni().then(setDati).catch((e: unknown) => setErrore(e instanceof Error ? e.message : 'Errore di caricamento'));
  }, []);

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!dati) return [];
    if (!q) return dati;
    return dati.filter((d) => nomeVetreria(d.restituzione.vetreria).toLowerCase().includes(q) || d.cavallette.some((c) => c.numero.toLowerCase().includes(q)));
  }, [dati, cerca, nomeVetreria]);

  return (
    <>
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      <div className="toolbar">
        <input className="cerca" placeholder="Cerca vetreria o numero cavalletta…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      </div>
      {dati === null ? (
        <p className="vuoto">Caricamento…</p>
      ) : filtrati.length === 0 ? (
        <p className="vuoto">Nessuna restituzione trovata.</p>
      ) : (
        <ul className="lista-card">
          {filtrati.map(({ restituzione: r, cavallette }) => (
            <li key={r.id} className="card">
              <details>
                <summary>
                  <strong>{formattaData(r.data)}</strong> · {nomeVetreria(r.vetreria)} · {cavallette.length} cavallette
                </summary>
                <div className="chip-lista">
                  {cavallette.map((c) => (
                    <button key={c.id} className="chip" onClick={() => setAperta(c)}>{c.numero}</button>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {aperta && <CavallettaDialog key={aperta.id} cavalletta={aperta} onChiudi={() => setAperta(null)} onModificata={() => setAperta(null)} />}
    </>
  );
}

const ORA = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });

function Registro() {
  const { nomeVetreria, oggi } = useDati();
  const [da, setDa] = useState(addDays(oggi, -30));
  const [a, setA] = useState(oggi);
  const [tipo, setTipo] = useState('');
  const [cerca, setCerca] = useState('');
  const [righe, setRighe] = useState<RigaRegistro[] | null>(null);
  const [nomi, setNomi] = useState<Map<string, string>>(new Map());
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    caricaProfili()
      .then((p) => setNomi(new Map(p.map((x) => [x.id, x.nome || x.email || '']))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!da || !a || da > a) return;
    setRighe(null);
    setErrore(null);
    caricaRegistro(da, a).then(setRighe).catch((e: unknown) => setErrore(e instanceof Error ? e.message : 'Errore di caricamento'));
  }, [da, a]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (righe ?? []).filter((r) => {
      const giorno = oggiRoma(new Date(r.creato_il));
      if (giorno < da || giorno > a) return false;
      if (tipo && r.tipo !== tipo) return false;
      if (!q) return true;
      const testo = [r.cavallette?.numero, NOMI_EVENTO[r.tipo] ?? r.tipo, descriviEvento(r), r.cavallette ? nomeVetreria(r.cavallette.vetreria) : ''].join(' ').toLowerCase();
      return testo.includes(q);
    });
  }, [righe, da, a, tipo, cerca, nomeVetreria]);

  const perGiorno = useMemo(() => {
    const m = new Map<string, RigaRegistro[]>();
    for (const r of filtrate) {
      const g = oggiRoma(new Date(r.creato_il));
      m.set(g, [...(m.get(g) ?? []), r]);
    }
    return [...m.entries()];
  }, [filtrate]);

  function scaricaCsv(): void {
    const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`;
    const righeCsv = [['Data', 'Ora', 'Cavalletta', 'Vetreria', 'Movimento', 'Dettaglio', 'Chi'].map(esc).join(';')];
    for (const r of filtrate) {
      righeCsv.push(
        [
          formattaData(oggiRoma(new Date(r.creato_il))),
          ORA.format(new Date(r.creato_il)),
          r.cavallette?.numero ?? '',
          r.cavallette ? nomeVetreria(r.cavallette.vetreria) : '',
          NOMI_EVENTO[r.tipo] ?? r.tipo,
          descriviEvento(r),
          r.utente ? nomi.get(r.utente) ?? '' : '',
        ].map(esc).join(';'),
      );
    }
    const blob = new Blob(['\ufeff' + righeCsv.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `registro-cavallette_${da}_${a}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <>
      <div className="toolbar">
        <label className="nota">Dal <input type="date" value={da} onChange={(e) => setDa(e.target.value)} /></label>
        <label className="nota">al <input type="date" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Tutti i movimenti</option>
          {Object.entries(NOMI_EVENTO).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input className="cerca" placeholder="Cerca cavalletta, commessa, cliente…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <button className="btn" disabled={filtrate.length === 0} onClick={scaricaCsv}>Scarica CSV</button>
      </div>
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {righe === null && !errore ? (
        <p className="vuoto">Caricamento…</p>
      ) : filtrate.length === 0 ? (
        <p className="vuoto">Nessun movimento in questo periodo.</p>
      ) : (
        <>
          <p className="nota">{filtrate.length} movimenti. Il registro non si modifica: ogni movimento resta archiviato.</p>
          {perGiorno.map(([giorno, lista]) => (
            <section key={giorno} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: '0 0 0.5rem' }}>{formattaData(giorno)} <span className="nota">· {lista.length}</span></h3>
              <div className="scorri">
                <table className="tabella">
                  <tbody>
                    {lista.map((r) => (
                      <tr key={r.id}>
                        <td className="nota" style={{ width: 60 }}>{ORA.format(new Date(r.creato_il))}</td>
                        <td className="numero">{r.cavallette?.numero ?? '?'}</td>
                        <td>{NOMI_EVENTO[r.tipo] ?? r.tipo}</td>
                        <td className="sotto">{descriviEvento(r)}</td>
                        <td className="nota">{r.utente ? nomi.get(r.utente) ?? '' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

export default function Storico() {
  const [vista, setVista] = useState<'registro' | 'restituzioni'>('registro');
  return (
    <>
      <Titolo titolo="Storico" sotto="Il registro di tutti i movimenti delle cavallette, giorno per giorno." />
      <div className="segmenti">
        <button className={`segmento ${vista === 'registro' ? 'attivo' : ''}`} onClick={() => setVista('registro')}>Registro movimenti</button>
        <button className={`segmento ${vista === 'restituzioni' ? 'attivo' : ''}`} onClick={() => setVista('restituzioni')}>Restituzioni</button>
      </div>
      {vista === 'registro' ? <Registro /> : <Restituzioni />}
    </>
  );
}
