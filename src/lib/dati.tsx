import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { caricaAnomalie, caricaCavallette, caricaImpostazioni, caricaVetrerie } from './api.ts';
import { useAuth } from './auth.tsx';
import { oggiRoma } from './dates.ts';
import type { Cavalletta, Vetreria } from './types.ts';

interface Dati {
  caricamento: boolean;
  errore: string | null;
  vetrerie: Vetreria[];
  cavallette: Cavalletta[];
  soglia: number;
  chiusure: Set<string>;
  anomalieAperte: number;
  oggi: string;
  nomeVetreria: (codice: string) => string;
  ricarica: () => Promise<void>;
}

const Ctx = createContext<Dati | null>(null);

export function DatiProvider(props: { children: ReactNode }) {
  const { profilo } = useAuth();
  const ruolo = profilo?.ruolo ?? 'nessuno';
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [vetrerie, setVetrerie] = useState<Vetreria[]>([]);
  const [cavallette, setCavallette] = useState<Cavalletta[]>([]);
  const [soglia, setSoglia] = useState(10);
  const [chiusure, setChiusure] = useState<Set<string>>(new Set());
  const [anomalieAperte, setAnomalieAperte] = useState(0);
  const [oggi, setOggi] = useState(oggiRoma());

  const ricarica = useCallback(async () => {
    if (ruolo === 'nessuno') {
      setCaricamento(false);
      return;
    }
    try {
      const staff = ruolo !== 'magazziniere';
      const [v, c, imp, an] = await Promise.all([
        caricaVetrerie(),
        caricaCavallette(),
        caricaImpostazioni(),
        staff ? caricaAnomalie() : Promise.resolve([]),
      ]);
      setVetrerie(v);
      setCavallette(c);
      setSoglia(imp.soglia);
      setChiusure(new Set(imp.chiusure));
      setAnomalieAperte(an.filter((a) => !a.risolta).length);
      setOggi(oggiRoma());
      setErrore(null);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di caricamento');
    } finally {
      setCaricamento(false);
    }
  }, [ruolo]);

  useEffect(() => {
    void ricarica();
    // aggiorna da solo ogni 5 minuti (e quando si torna sulla scheda)
    const t = window.setInterval(() => void ricarica(), 5 * 60_000);
    const f = (): void => {
      if (document.visibilityState === 'visible') void ricarica();
    };
    document.addEventListener('visibilitychange', f);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', f);
    };
  }, [ricarica]);

  const valore = useMemo<Dati>(
    () => ({
      caricamento,
      errore,
      vetrerie,
      cavallette,
      soglia,
      chiusure,
      anomalieAperte,
      oggi,
      nomeVetreria: (codice) => vetrerie.find((v) => v.codice === codice)?.nome ?? codice,
      ricarica,
    }),
    [caricamento, errore, vetrerie, cavallette, soglia, chiusure, anomalieAperte, oggi, ricarica],
  );
  return <Ctx.Provider value={valore}>{props.children}</Ctx.Provider>;
}

export function useDati(): Dati {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDati fuori da DatiProvider');
  return v;
}
