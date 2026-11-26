import { useEffect, useMemo, useState } from 'react';
import { useDati } from '../lib/dati.tsx';
import { svuotaCavallette } from '../lib/api.ts';
import { confrontaNumeri } from '../lib/keys.ts';
import { Messaggio } from '../components/ui.tsx';

function chiaveCommessa(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

/** Le cavallette di una commessa sono rientrate in sede e sono state svuotate */
export default function Rientro() {
  const { cavallette, oggi, ricarica } = useDati();
  const [commessa, setCommessa] = useState('');
  const [escluse, setEscluse] = useState<Set<string>>(new Set());
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  const trovate = useMemo(() => {
    const k = chiaveCommessa(commessa);
    if (!k) return [];
    return cavallette
      .filter((c) => !c.restituita && c.stato === 'piena_serramenti' && c.commessa !== null && chiaveCommessa(c.commessa) === k)
      .sort((a, b) => confrontaNumeri(a.numero, b.numero));
  }, [cavallette, commessa]);

  useEffect(() => setEscluse(new Set()), [commessa]);

  const scelte = trovate.filter((c) => !escluse.has(c.id));
  const cliente = trovate.find((c) => c.cliente)?.cliente ?? null;

  function alterna(id: string): void {
    setEscluse((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function salva(): Promise<void> {
    setLavoro(true);
    setErrore(null);
    setEsito(null);
    try {
      await svuotaCavallette(scelte, oggi);
      setEsito(`Fatto: ${scelte.map((c) => c.numero).join(', ')} ora ${scelte.length === 1 ? 'è vuota' : 'sono vuote'}, pronte per un nuovo imballo.`);
      setCommessa('');
      await ricarica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore nel salvataggio');
    } finally {
      setLavoro(false);
    }
  }

  return (
    <div className="imballo">
      <h1>Rientro e svuotamento</h1>
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {esito && <Messaggio tipo="ok">{esito}</Messaggio>}
      <div className="imballo-card">
        <label className="imballo-grande">
          Commessa
          <input value={commessa} onChange={(e) => setCommessa(e.target.value)} placeholder="26031-P" autoFocus />
        </label>

        {commessa.trim() !== '' && trovate.length === 0 && (
          <p className="nota">Nessuna cavalletta piena di serramenti con questa commessa.</p>
        )}

        {trovate.length > 0 && (
          <>
            <p className="nota">{cliente ? `${cliente} · ` : ''}Togli la spunta alle cavallette che non sono ancora rientrate.</p>
            <div className="imballo-chip">
              {trovate.map((c) => (
                <label key={c.id} className="riga-scelta">
                  <input type="checkbox" checked={!escluse.has(c.id)} onChange={() => alterna(c.id)} />
                  <strong>{c.numero}</strong>
                </label>
              ))}
            </div>
          </>
        )}

        <button className="btn btn-primary btn-big" disabled={scelte.length === 0 || lavoro} onClick={() => void salva()}>
          {lavoro ? 'Salvo…' : `Segna vuote${scelte.length ? ` (${scelte.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}
