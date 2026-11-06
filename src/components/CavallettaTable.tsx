import { useMemo, useState } from 'react';
import type { Cavalletta } from '../lib/types.ts';
import { confrontaNumeri } from '../lib/keys.ts';
import { formattaData } from '../lib/dates.ts';
import { daRitirare, etichettaLuogo, etichettaStato, giacenza, giorniInCantiere } from '../lib/logica.ts';
import { Badge } from './ui.tsx';
import type { Tono } from './ui.tsx';

type Chiave = 'numero' | 'vetreria' | 'luogo' | 'stato' | 'commessa' | 'cliente' | 'arrivo' | 'giacenza' | 'cantiere';

interface Props {
  righe: Cavalletta[];
  oggi: string;
  chiusure: ReadonlySet<string>;
  soglia: number;
  nomeVetreria: (codice: string) => string;
  onSeleziona: (c: Cavalletta) => void;
}

function tonoStato(c: Cavalletta, allerta: boolean): Tono {
  if (allerta) return 'rosso';
  if (c.stato === 'piena_vetri') return 'blu';
  if (c.stato === 'piena_serramenti') return 'giallo';
  return 'verde';
}

export default function CavallettaTable(props: Props) {
  const { righe, oggi, chiusure, soglia, nomeVetreria, onSeleziona } = props;
  const [ordine, setOrdine] = useState<{ chiave: Chiave; su: boolean }>({ chiave: 'numero', su: true });

  const ordinate = useMemo(() => {
    const valore = (c: Cavalletta, k: Chiave): string | number => {
      switch (k) {
        case 'numero': return c.numero;
        case 'vetreria': return nomeVetreria(c.vetreria);
        case 'luogo': return c.luogo;
        case 'stato': return c.stato;
        case 'commessa': return c.commessa ?? '';
        case 'cliente': return c.cliente ?? '';
        case 'arrivo': return c.data_arrivo ?? '';
        case 'giacenza': return giacenza(c, oggi) ?? -1;
        case 'cantiere': return giorniInCantiere(c, oggi, chiusure) ?? -1;
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
  }, [righe, ordine, oggi, chiusure, nomeVetreria]);

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
            <Th k="luogo">Luogo</Th>
            <Th k="stato">Stato</Th>
            <Th k="commessa">Commessa</Th>
            <Th k="cliente">Cliente</Th>
            <th>Indirizzo</th>
            <Th k="arrivo">Arrivo</Th>
            <Th k="giacenza">Giacenza (gg)</Th>
            <Th k="cantiere">In cantiere (gg lav.)</Th>
          </tr>
        </thead>
        <tbody>
          {ordinate.map((c) => {
            const allerta = daRitirare(c, oggi, chiusure, soglia);
            const gg = giacenza(c, oggi);
            const cant = giorniInCantiere(c, oggi, chiusure);
            return (
              <tr key={c.id} onClick={() => onSeleziona(c)} className="cliccabile">
                <td className="numero">{c.numero}</td>
                <td>{nomeVetreria(c.vetreria)}</td>
                <td>{etichettaLuogo(c)}</td>
                <td>
                  <Badge tono={tonoStato(c, allerta)}>{etichettaStato(c, allerta)}</Badge>
                </td>
                <td>{c.commessa}</td>
                <td>{c.cliente}</td>
                <td>{c.indirizzo}</td>
                <td>{formattaData(c.data_arrivo)}</td>
                <td className="num">{gg ?? ''}</td>
                <td className="num">{cant ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
