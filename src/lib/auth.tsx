import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import type { Profilo } from './types.ts';

interface AuthCtx {
  session: Session | null;
  profilo: Profilo | null;
  caricamento: boolean;
  accedi: (email: string, password: string) => Promise<void>;
  esci: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider(props: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setCaricamento(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSession(s);
      if (!s) {
        setProfilo(null);
        setCaricamento(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let annullato = false;
    setCaricamento(true);
    supabase
      .from('profili')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (annullato) return;
        setProfilo((data as Profilo | null) ?? null);
        setCaricamento(false);
      });
    return () => {
      annullato = true;
    };
  }, [userId]);

  const valore: AuthCtx = {
    session,
    profilo,
    caricamento,
    accedi: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error('Email o password non corretti.');
    },
    esci: async () => {
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={valore}>{props.children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuori da AuthProvider');
  return v;
}
