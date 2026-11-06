import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../lib/auth.tsx';
import { Messaggio } from '../components/ui.tsx';

export default function Login() {
  const { accedi } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function invia(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErrore(null);
    setOccupato(true);
    try {
      await accedi(email, password);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore di accesso');
    } finally {
      setOccupato(false);
    }
  }

  return (
    <div className="login">
      <form className="card form" onSubmit={(e) => void invia(e)}>
        <h1>Cavallette</h1>
        <p className="sotto">Serramenti Longato · gestione cavallette</p>
        {errore && <Messaggio tipo="errore">{errore}</Messaggio>}
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn btn-primary btn-big" disabled={occupato}>{occupato ? 'Accesso…' : 'Accedi'}</button>
      </form>
    </div>
  );
}
