import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth.tsx';
import { DatiProvider, useDati } from './lib/dati.tsx';
import { Link, useRotta, vai } from './lib/router.tsx';
import { configurato } from './lib/supabase.ts';
import { daRitirare } from './lib/logica.ts';
import type { Ruolo } from './lib/types.ts';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
import DaRitirare from './pages/DaRitirare.tsx';
import Segnalazioni from './pages/Segnalazioni.tsx';
import Arrivi from './pages/Arrivi.tsx';
import ImportSmartsheet from './pages/ImportSmartsheet.tsx';
import Restituzione from './pages/Restituzione.tsx';
import Storico from './pages/Storico.tsx';
import Utenti from './pages/Utenti.tsx';
import Impostazioni from './pages/Impostazioni.tsx';
import { LOGO, Messaggio } from './components/ui.tsx';

interface Rotta {
  path: string;
  titolo: string;
  ruoli: Ruolo[];
  el: () => ReactNode;
}

const STAFF: Ruolo[] = ['admin', 'ufficio', 'logistica', 'amministrazione'];
const ROTTE: Rotta[] = [
  { path: '/', titolo: 'Cruscotto', ruoli: STAFF, el: () => <Dashboard /> },
  { path: '/da-ritirare', titolo: 'Da ritirare', ruoli: STAFF, el: () => <DaRitirare /> },
  { path: '/segnalazioni', titolo: 'Segnalazioni', ruoli: STAFF, el: () => <Segnalazioni /> },
  { path: '/arrivi', titolo: 'Arrivo vetri', ruoli: ['admin', 'ufficio'], el: () => <Arrivi /> },
  { path: '/smartsheet', titolo: 'Da Smartsheet', ruoli: ['admin', 'ufficio'], el: () => <ImportSmartsheet /> },
  { path: '/restituzione', titolo: 'Restituzione', ruoli: ['admin', 'magazziniere'], el: () => <Restituzione /> },
  { path: '/storico', titolo: 'Storico', ruoli: STAFF, el: () => <Storico /> },
  { path: '/utenti', titolo: 'Utenti', ruoli: ['admin'], el: () => <Utenti /> },
  { path: '/impostazioni', titolo: 'Impostazioni', ruoli: ['admin'], el: () => <Impostazioni /> },
];

function Guscio() {
  const { profilo, esci } = useAuth();
  const { cavallette, oggi, chiusure, soglia, anomalieAperte } = useDati();
  const rotta = useRotta();
  const ruolo = profilo?.ruolo ?? 'nessuno';
  const permesse = ROTTE.filter((r) => r.ruoli.includes(ruolo));
  const corrente = permesse.find((r) => r.path === rotta);

  const nDaRitirare = useMemo(
    () => (ruolo === 'magazziniere' ? 0 : cavallette.filter((c) => daRitirare(c, oggi, chiusure, soglia)).length),
    [cavallette, oggi, chiusure, soglia, ruolo],
  );

  useEffect(() => {
    if (!corrente && permesse.length) vai(permesse[0].path);
  }, [corrente, permesse]);

  if (!permesse.length) {
    return (
      <div className="login">
        <div className="card">
          <h1>Account non ancora abilitato</h1>
          <p>Hai effettuato l'accesso come {profilo?.email}, ma non ti è ancora stato assegnato un ruolo. Chiedi all'amministratore di abilitarti.</p>
          <button className="btn" onClick={() => void esci()}>Esci</button>
        </div>
      </div>
    );
  }

  const conta = (path: string): number => (path === '/da-ritirare' ? nDaRitirare : path === '/segnalazioni' ? anomalieAperte : 0);

  return (
    <div className="guscio">
      <header className="testa">
        <div className="marchio">
          <img src={LOGO} alt="Longato" width={42} height={42} />
          <span>Cavallette</span>
        </div>
        <nav className="nav">
          {permesse.map((r) => (
            <Link key={r.path} to={r.path} className={`voce ${corrente?.path === r.path ? 'attiva' : ''}`}>
              {r.titolo}
              {conta(r.path) > 0 && <span className="conteggio">{conta(r.path)}</span>}
            </Link>
          ))}
        </nav>
        <div className="utente">
          <span className="sotto">{profilo?.email}</span>
          <button className="btn" onClick={() => void esci()}>Esci</button>
        </div>
      </header>
      <main className="contenuto">{corrente?.el()}</main>
    </div>
  );
}

function Radice() {
  const { session, caricamento } = useAuth();
  if (caricamento) return <p className="vuoto">Caricamento…</p>;
  if (!session) return <Login />;
  return (
    <DatiProvider>
      <Guscio />
    </DatiProvider>
  );
}

export default function App() {
  if (!configurato) {
    return (
      <div className="login">
        <div className="card">
          <h1>Configurazione mancante</h1>
          <Messaggio tipo="errore">
            Mancano VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Vedi il README, sezione «Collegare Supabase».
          </Messaggio>
        </div>
      </div>
    );
  }
  return (
    <AuthProvider>
      <Radice />
    </AuthProvider>
  );
}
