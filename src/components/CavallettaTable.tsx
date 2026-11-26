import { useMemo, useState } from 'react';
import type { Cavalletta } from '../lib/types.ts';
import { confrontaNumeri } from '../lib/keys.ts';
import { formattaData } from '../lib/dates.ts';
import { etichettaStato, giacenza, giorniNelloStato, pronta, testoDa } from '../lib/logica.ts';
import { Badge } from './ui.tsx';
import type { Tono } from './ui.tsx';

type Chiave = 'numero' | 'vetreria' | 'stato' | 'commessa' | 'cliente' | 'arrivo' | 'giacenza';

interface Props {
  righe: Cavalletta[];
  oggi: string;
  nomeVetreria: (codice: string) => string;
  onSeleziona: (c: Cavalletta) => void;
}

function tonoStato(c: Cavalletta): Tono {
  if (c.stato === 'piena_vetri') return 'blu';
  if (c.stato === 'piena_serramenti') return 'giallo';
  return 'verde';
}

export default function CavallettaTable(props: Props) {
  const { righe, oggi, nomeVetreria, onSeleziona } = props;
  const [ordine, setOrdine] = useState<{ chiave: Chiave; su: boolean }>({ chiave: 'numero', su: true });

  const ordinate = useMemo(() => {
    const valore = (c: Cavalletta, k: Chiave): string | number => {
      switch (k) {
        case 'numero': return c.numero;
        case 'vetreria': return nomeVetreria(c.vetreria);
        case 'stato': return c.stato;
        case 'commessa': return pronta(c) ? c.commessa ?? '' : '';
        case 'cliente': return pronta(c) ? c.cliente ?? '' : '';
        case 'arrivo': return c.data_arrivo ?? '';
        case 'giacenza': return giacenza(c, oggi) ?? -1;
      }
    };
    const copia = [...righe];
    copia.sort((a, b) => {
      const va = valore(a, ordine.chiave);
      const vb = valore(b, ordine.chiave);
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : confrontaNumeri(String(va), String(vb));
      return (ordine.su ? r : -r) || confrontaNumeri(a.numero, b.numero);
    });
    return copia;
  }, [righe, ordine, oggi, nomeVetreria]);

  const Th = (p: { k: Chiave; children: string }) => (
    <th onClick={() => setOrdine((o) => ({ chiave: p.k, su: o.chiave === p.k ? !o.su : true }))} className="ordinabile">
      {p.children}
      {ordine.chiave === p.k ? (ordine.su ? ' ▲' : ' ▼') : ''}
    </th>
  );

  if (!righe.length) return <p className="vuoto">Nessuna cavalletta con questi filtri.</p>;

  return (
    <div className="scorri">
      <table className="tabella">
        <thead>
          <tr>
            <Th k="numero">N.</Th>
            <Th k="vetreria">Vetreria</Th>
            <Th k="stato">Stato</Th>
            <Th k="commessa">Commessa</Th>
            <Th k="cliente">Cliente</Th>
            <th>Indirizzo</th>
            <Th k="arrivo">Arrivo</Th>
            <Th k="giacenza">Giacenza (gg)</Th>
          </tr>
        </thead>
        <tbody>
          {ordinate.map((c) => {
            const gg = giacenza(c, oggi);
            return (
              <tr key={c.id} onClick={() => onSeleziona(c)} className="cliccabile">
                <td className="numero">{c.numero}</td>
                <td>{nomeVetreria(c.vetreria)}</td>
                <td>
                  <Badge tono={tonoStato(c)}>{etichettaStato(c)}</Badge>
                  <span className="fermo">{testoDa(giorniNelloStato(c, oggi))}</span>
                </td>
                <td>{pronta(c) ? c.commessa : ''}</td>
                <td>{pronta(c) ? c.cliente : ''}</td>
                <td>{pronta(c) ? c.indirizzo : ''}</td>
                <td>{formattaData(c.data_arrivo)}</td>
                <td className="num">{gg ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
