-- =====================================================================
-- CAVALLETTE - schema Supabase
-- Incolla tutto in: Supabase > SQL Editor > New query > Run.
-- Si può rieseguire senza danni (usa "if not exists" / "or replace").
-- =====================================================================

-- ---------- RUOLI ----------------------------------------------------
do $$ begin
  create type public.ruolo_app as enum ('admin', 'ufficio', 'logistica', 'amministrazione', 'magazziniere', 'nessuno');
exception when duplicate_object then null; end $$;

create table if not exists public.profili (
  id        uuid primary key references auth.users (id) on delete cascade,
  email     text,
  nome      text,
  ruolo     public.ruolo_app not null default 'nessuno',
  creato_il timestamptz not null default now()
);

-- Ogni nuovo utente (creato da Authentication > Users) riceve un profilo
-- con ruolo "nessuno": non vede nulla finché l'admin non gli assegna un ruolo.
create or replace function public.nuovo_utente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists su_nuovo_utente on auth.users;
create trigger su_nuovo_utente after insert on auth.users
  for each row execute function public.nuovo_utente();

-- Utenti già esistenti prima di eseguire questo script
insert into public.profili (id, email, nome)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create or replace function public.ruolo_corrente() returns public.ruolo_app
language sql stable security definer set search_path = public as $$
  select coalesce((select ruolo from public.profili where id = auth.uid()), 'nessuno'::public.ruolo_app)
$$;

-- ---------- TABELLE --------------------------------------------------
create table if not exists public.vetrerie (
  codice      text primary key,            -- P, F, B, PG, L
  nome        text not null,
  restituibile boolean not null default true,  -- false = nostre (Longato)
  ordine      int not null default 0
);

insert into public.vetrerie (codice, nome, restituibile, ordine) values
  ('P',  'Pescini',     true,  1),
  ('F',  'Feca',        true,  2),
  ('B',  'Bizzotto',    true,  3),
  ('PG', 'Press Glass', true,  4),
  ('L',  'Longato',     false, 5)
on conflict (codice) do nothing;

create table if not exists public.restituzioni (
  id         uuid primary key default gen_random_uuid(),
  vetreria   text not null references public.vetrerie (codice),
  data       date not null default (timezone('Europe/Rome', now()))::date,
  creata_da  uuid default auth.uid(),
  creata_il  timestamptz not null default now()
);

create table if not exists public.cavallette (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null,                 -- chiave normalizzata (es. PE82, 62)
  vetreria        text not null references public.vetrerie (codice),
  etichetta       text,                          -- codice come stampato sul DDT
  contenuto       text,                          -- vetri contenuti (solo mentre è piena di vetri)
  data_arrivo     date,                          -- solo cavallette dei fornitori
  ddt_arrivo      text,
  luogo           text not null default 'piazzale' check (luogo in ('piazzale', 'cliente')),
  stato           text not null default 'vuota'   check (stato in ('piena_vetri', 'piena_serramenti', 'vuota')),
  commessa        text,
  cliente         text,
  indirizzo       text,
  data_uscita     date,                          -- da Smartsheet (colonna data uscita)
  data_consegna   date,                          -- da quando è dal cliente (base dei 10 giorni)
  note            text,
  restituita      boolean not null default false,
  restituita_il   timestamptz,
  restituzione_id uuid references public.restituzioni (id),
  creata_il       timestamptz not null default now(),
  aggiornata_il   timestamptz not null default now()
);

-- Un numero può essere riusato solo dopo che la vecchia cavalletta è stata restituita.
create unique index if not exists cavallette_numero_attive on public.cavallette (numero) where not restituita;
create index if not exists cavallette_restituzione on public.cavallette (restituzione_id);

-- Un "ciclo" = una cavalletta abbinata a una commessa (1 imballata, 2 dal cliente, 3 rientrata).
-- Serve a rendere l'import di Smartsheet ripetibile senza duplicati né passi indietro.
create table if not exists public.cicli (
  id            uuid primary key default gen_random_uuid(),
  cavalletta_id uuid not null references public.cavallette (id) on delete cascade,
  commessa      text not null,
  fase          smallint not null check (fase between 1 and 3),
  cliente       text,
  indirizzo     text,
  data_uscita   date,
  data_consegna date,
  data_rientro  date,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  unique (cavalletta_id, commessa)
);

create table if not exists public.eventi (
  id            bigint generated always as identity primary key,
  cavalletta_id uuid not null references public.cavallette (id) on delete cascade,
  tipo          text not null,
  dettaglio     jsonb not null default '{}'::jsonb,
  utente        uuid default auth.uid(),
  creato_il     timestamptz not null default now()
);
create index if not exists eventi_cavalletta on public.eventi (cavalletta_id, creato_il desc);

create table if not exists public.anomalie (
  id         bigint generated always as identity primary key,
  tipo       text not null,                -- sconosciuta | gia_in_uso
  numero     text not null,
  commessa   text not null default '',
  dettaglio  text,
  creata_il  timestamptz not null default now(),
  risolta    boolean not null default false,
  risolta_il timestamptz,
  risolta_da uuid
);
create unique index if not exists anomalie_aperte on public.anomalie (tipo, numero, commessa) where not risolta;

create table if not exists public.chiusure (
  data        date primary key,
  descrizione text
);

create table if not exists public.impostazioni (
  chiave text primary key,
  valore text not null
);
insert into public.impostazioni (chiave, valore) values ('giorni_alert', '10') on conflict (chiave) do nothing;

-- aggiornata_il automatico
create or replace function public.tocca_aggiornata() returns trigger language plpgsql as $$
begin
  new.aggiornata_il = now();
  return new;
end $$;
drop trigger if exists cavallette_tocca on public.cavallette;
create trigger cavallette_tocca before update on public.cavallette
  for each row execute function public.tocca_aggiornata();

create or replace function public.tocca_aggiornato() returns trigger language plpgsql as $$
begin
  new.aggiornato_il = now();
  return new;
end $$;
drop trigger if exists cicli_tocca on public.cicli;
create trigger cicli_tocca before update on public.cicli
  for each row execute function public.tocca_aggiornato();

-- ---------- SICUREZZA (RLS) -----------------------------------------
alter table public.profili       enable row level security;
alter table public.vetrerie      enable row level security;
alter table public.restituzioni  enable row level security;
alter table public.cavallette    enable row level security;
alter table public.cicli         enable row level security;
alter table public.eventi        enable row level security;
alter table public.anomalie      enable row level security;
alter table public.chiusure      enable row level security;
alter table public.impostazioni  enable row level security;

-- profili
drop policy if exists profili_select on public.profili;
create policy profili_select on public.profili for select to authenticated
  using (id = auth.uid() or public.ruolo_corrente() = 'admin');
drop policy if exists profili_update on public.profili;
create policy profili_update on public.profili for update to authenticated
  using (public.ruolo_corrente() = 'admin') with check (public.ruolo_corrente() = 'admin');

-- vetrerie, chiusure, impostazioni: leggono tutti i ruoli abilitati, scrive l'admin
drop policy if exists vetrerie_select on public.vetrerie;
create policy vetrerie_select on public.vetrerie for select to authenticated
  using (public.ruolo_corrente() <> 'nessuno');
drop policy if exists chiusure_select on public.chiusure;
create policy chiusure_select on public.chiusure for select to authenticated
  using (public.ruolo_corrente() <> 'nessuno');
drop policy if exists chiusure_admin on public.chiusure;
create policy chiusure_admin on public.chiusure for all to authenticated
  using (public.ruolo_corrente() = 'admin') with check (public.ruolo_corrente() = 'admin');
drop policy if exists impostazioni_select on public.impostazioni;
create policy impostazioni_select on public.impostazioni for select to authenticated
  using (public.ruolo_corrente() <> 'nessuno');
drop policy if exists impostazioni_admin on public.impostazioni;
create policy impostazioni_admin on public.impostazioni for all to authenticated
  using (public.ruolo_corrente() = 'admin') with check (public.ruolo_corrente() = 'admin');

-- cavallette
drop policy if exists cavallette_select_staff on public.cavallette;
create policy cavallette_select_staff on public.cavallette for select to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio', 'logistica', 'amministrazione'));
-- il magazziniere vede SOLO le cavallette vuote, in piazzale, restituibili
drop policy if exists cavallette_select_magazziniere on public.cavallette;
create policy cavallette_select_magazziniere on public.cavallette for select to authenticated
  using (
    public.ruolo_corrente() = 'magazziniere'
    and not restituita and stato = 'vuota' and luogo = 'piazzale'
    and exists (select 1 from public.vetrerie v where v.codice = vetreria and v.restituibile)
  );
drop policy if exists cavallette_insert on public.cavallette;
create policy cavallette_insert on public.cavallette for insert to authenticated
  with check (public.ruolo_corrente() in ('admin', 'ufficio'));
drop policy if exists cavallette_update on public.cavallette;
create policy cavallette_update on public.cavallette for update to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio', 'amministrazione'))
  with check (public.ruolo_corrente() in ('admin', 'ufficio', 'amministrazione'));
drop policy if exists cavallette_delete on public.cavallette;
create policy cavallette_delete on public.cavallette for delete to authenticated
  using (public.ruolo_corrente() = 'admin');

-- cicli
drop policy if exists cicli_select on public.cicli;
create policy cicli_select on public.cicli for select to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio', 'logistica', 'amministrazione'));
drop policy if exists cicli_write on public.cicli;
create policy cicli_write on public.cicli for all to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio'))
  with check (public.ruolo_corrente() in ('admin', 'ufficio'));

-- eventi
drop policy if exists eventi_select on public.eventi;
create policy eventi_select on public.eventi for select to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio', 'logistica', 'amministrazione'));
drop policy if exists eventi_insert on public.eventi;
create policy eventi_insert on public.eventi for insert to authenticated
  with check (public.ruolo_corrente() in ('admin', 'ufficio', 'amministrazione'));

-- anomalie
drop policy if exists anomalie_select on public.anomalie;
create policy anomalie_select on public.anomalie for select to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio', 'logistica', 'amministrazione'));
drop policy if exists anomalie_insert on public.anomalie;
create policy anomalie_insert on public.anomalie for insert to authenticated
  with check (public.ruolo_corrente() in ('admin', 'ufficio'));
drop policy if exists anomalie_update on public.anomalie;
create policy anomalie_update on public.anomalie for update to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio', 'logistica', 'amministrazione'))
  with check (public.ruolo_corrente() in ('admin', 'ufficio', 'logistica', 'amministrazione'));

-- restituzioni: lettura per lo staff; la scrittura passa solo dalla funzione qui sotto
drop policy if exists restituzioni_select on public.restituzioni;
create policy restituzioni_select on public.restituzioni for select to authenticated
  using (public.ruolo_corrente() in ('admin', 'ufficio', 'logistica', 'amministrazione'));

-- ---------- RESTITUZIONE ALLA VETRERIA -------------------------------
-- Unico punto in cui il magazziniere può modificare dati. Controlla tutto lato server.
create or replace function public.restituisci_cavallette(p_vetreria text, p_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_ids uuid[];
  v_ok int;
begin
  if public.ruolo_corrente() not in ('admin', 'magazziniere') then
    raise exception 'Non autorizzato';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) as x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Nessuna cavalletta selezionata';
  end if;
  if not exists (select 1 from vetrerie where codice = p_vetreria and restituibile) then
    raise exception 'Vetreria non valida o non restituibile';
  end if;
  select count(*) into v_ok from cavallette
   where id = any (v_ids) and vetreria = p_vetreria and not restituita
     and stato = 'vuota' and luogo = 'piazzale';
  if v_ok <> array_length(v_ids, 1) then
    raise exception 'Alcune cavallette non sono restituibili (non vuote, non in piazzale o di un''altra vetreria)';
  end if;

  insert into restituzioni (vetreria, creata_da) values (p_vetreria, auth.uid()) returning id into v_id;
  update cavallette set restituita = true, restituita_il = now(), restituzione_id = v_id
   where id = any (v_ids);
  insert into eventi (cavalletta_id, tipo, dettaglio, utente)
  select x, 'restituita', jsonb_build_object('vetreria', p_vetreria, 'restituzione_id', v_id), auth.uid()
    from unnest(v_ids) as x;
  -- le segnalazioni "non usata in produzione" si chiudono quando la cavalletta torna alla vetreria
  update anomalie set risolta = true, risolta_il = now()
   where tipo = 'non_usata' and not risolta
     and numero in (select numero from cavallette where id = any (v_ids));
  return v_id;
end $$;

revoke all on function public.restituisci_cavallette(text, uuid[]) from public, anon;
grant execute on function public.restituisci_cavallette(text, uuid[]) to authenticated;

-- ---------- PRIMO ADMIN ----------------------------------------------
-- Dopo aver creato il tuo utente in Authentication > Users, esegui (con la tua email):
--   update public.profili set ruolo = 'admin' where email = 'tua@email.it';
