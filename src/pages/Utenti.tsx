import { useEffect, useState } from 'react';
import { cambiaRuolo, caricaProfili } from '../lib/api.ts';
import type { Profilo, Ruolo } from '../lib/types.ts';
import { useAuth } from '../lib/auth.tsx';
import { Messaggio, Titolo } from '../components/ui.tsx';

const RUOLI: { valore: Ruolo; nome: string; descrizione: string }[] = [
  { valore: 'admin', nome: 'Amministratore', descrizione: 'Vede e modifica tutto, gestisce utenti e impostazioni' },
  { valore: 'ufficio', nome: 'Ufficio (Nicole)', descrizione: 'Carica arrivi e import Smartsheet, vede tutto' },
  { valore: 'amministrazione', nome: 'Amministrazione', descrizione: 'Vede tutto, può correggere a mano le cavallette' },
  { valore: 'logistica', nome: 'Logistica / Peso', descrizione: 'Vede tutto, riceve le segnalazioni, non modifica' },
  { valore: 'magazziniere', nome: 'Magazziniere', descrizione: 'Solo la schermata di restituzione' },
  { valore: 'nessuno', nome: 'Nessun accesso', descrizione: 'Account creato ma non ancora abilitato' },
];

export default function Utenti() {
  const { profilo: io } = useAuth();
  const [lista, setLista] = useState<Profilo[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica(): Promise<void> {
    try {
      setLista(await caricaProfili());
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    }
  }
  useEffect(() => {
    void carica();
  }, []);

  async function cambia(p: Profilo, ruolo: Ruolo): Promise<void> {
    if (p.id === io?.id && ruolo !== 'admin' && !window.confirm('Stai togliendo a te stesso il ruolo di amministratore. Continuare?')) return;
    try {
      await cambiaRuolo(p.id, ruolo);
      await carica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    }
  }

  return (
    <>
      <Titolo titolo="Utenti e accessi" />
      <Messaggio tipo="info">
        Per aggiungere una persona: Supabase → Authentication → Users → Add user (email e password). Poi compare qui e le assegni il ruolo.
      </Messaggio>
      {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
      {lista === null ? (
        <p className="vuoto">Caricamento…</p>
      ) : (
        <div className="scorri">
          <table className="tabella">
            <thead><tr><th>Email</th><th>Ruolo</th></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{p.email}{p.id === io?.id ? ' (tu)' : ''}</td>
                  <td>
                    <select value={p.ruolo} onChange={(e) => void cambia(p, e.target.value as Ruolo)}>
                      {RUOLI.map((r) => <option key={r.valore} value={r.valore}>{r.nome}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Cosa può fare ogni ruolo</h2>
      <ul className="lista-semplice">
        {RUOLI.map((r) => <li key={r.valore}><strong>{r.nome}</strong>: {r.descrizione}</li>)}
      </ul>
    </>
  );
}
