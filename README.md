# Cavallette – Serramenti Longato

Applicazione web per seguire le cavallette (vetrerie + nostre) dal piazzale al cantiere e ritorno.
Legge l'Excel scaricato da Smartsheet e gestisce da sola ciò che Smartsheet non può fare.

- Frontend: React + TypeScript + Vite (sito statico, su GitHub Pages o Netlify)
- Dati e accessi: Supabase (Postgres + login + regole per ruolo)

## 1. Supabase (10 minuti)

1. Crea un progetto su supabase.com.
2. **SQL Editor** → incolla tutto `supabase/schema.sql` → *Run*. Si può rilanciare senza danni.
3. **Authentication → Users → Add user**: crea un utente (email + password) per ognuno: tu, Nicole, logistica, peso, magazziniere.
   (Authentication → Providers → Email: disattiva «Confirm email» se non vuoi mail di conferma; disattiva anche le iscrizioni libere.)
4. Rendi te stesso admin, nello SQL Editor:
   ```sql
   update public.profili set ruolo = 'admin' where email = 'tua@email.it';
   ```
   Gli altri ruoli li assegni poi dall'app, schermata **Utenti**.
5. **Project Settings → API**: copia *Project URL* e la chiave *anon public*.

## 2. Provarla sul tuo computer (serve Node 22+)

```
cp .env.example .env      # incolla URL e chiave anon
npm install
npm test
npm run dev
```

## 3. Pubblicarla con GitHub

1. Crea un repository, carica questa cartella (`samples/` e `.env` sono già esclusi da `.gitignore`).
2. Settings → Secrets and variables → Actions → aggiungi `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Settings → Pages → Source: **GitHub Actions**. Ad ogni push su `main` il sito si ricostruisce e si pubblica.

La chiave anon è pubblica per progettazione: la sicurezza sta nelle regole del database, non nel nasconderla.
Non mettere mai la chiave `service_role` nell'app.

## 4. Ruoli

| Ruolo | Cosa vede / fa |
|---|---|
| admin (tu) | tutto, correzioni a mano, utenti, impostazioni |
| ufficio (Nicole) | tutto in lettura, carica DDT/Excel, import Smartsheet |
| amministrazione | tutto in lettura, può correggere a mano le cavallette |
| logistica / peso | tutto in lettura, schermata «Da ritirare» con il segnale |
| magazziniere | solo «Restituzione»: vede solo cavallette vuote in piazzale, nessun dato cliente |
| nessuno | utente appena creato, non vede nulla finché non gli dai un ruolo |

## 5. Come si usa

- **Arrivo vetri** (Nicole): carica il PDF del DDT (o un Excel con i codici) → controlla l'anteprima → Salva. Le cavallette entrano in piazzale, piene di vetri.
  Si può anche inserire a mano (pulsante «Inserisci a mano»). La data di arrivo è quella del DDT.
  Regola dei codici: prefisso della vetreria, trattino, codice stampato (E82 su Pescini → `P-E82`). In Smartsheet va bene anche `PE82` o `p e82`. Le nostre (Longato) sono numeri semplici, aggiungibili a intervalli (`1-50`).
- **Da Smartsheet**: esporta la tabella in Excel e caricala. Si vede un'anteprima, poi si conferma. Si può ripetere tutte le volte che serve: niente doppioni, le correzioni a mano non vengono sovrascritte.
  - NUMERO CAVALLETTE + IMBALLO → piazzale, piena di serramenti, con commessa/cliente/indirizzo
  - DDT cons. rientrato → dal cliente
  - DDT RIENTRO → piazzale, vuota, commessa/cliente/indirizzo cancellati
  - Cavalletta non in anagrafica → **Segnalazione**
  - Colonne lette per nome: COMMESSA, CLIENTE, INDIRIZZO CANTIERE / PAESE / PROVINCIA, IMBALLO, NUMERO CAVALLETTE, DDT cons. rientrato, DDT RIENTRO e, se la aggiungi, **DATA USCITA**. Con DATA USCITA i 10 giorni partono dalla data vera, altrimenti dal giorno dell'import.
  - Al primo import usa il filtro «dal» per saltare lo storico vecchio.
- **Da ritirare**: dopo 10 giorni *lavorativi* (esclusi sabati, domeniche, festivi italiani e chiusure aziendali) dalla consegna. Soglia e chiusure si cambiano in **Impostazioni**. Il magazziniere non la vede.
- **Restituzione** (magazziniere): sceglie la vetreria, spunta le cavallette, Invia. Spariscono dal cruscotto e restano nello **Storico** (data + elenco).
- Le cavallette Longato non si restituiscono mai, ma restano sempre visibili nel cruscotto. «Giacenza» = giorni dall'arrivo per quelle dei fornitori.

## 6. Cose da sapere

- L'aggiornamento automatico giornaliero da Smartsheet non c'è ancora: servirebbe un token API di Smartsheet e una Edge Function pianificata di Supabase (fase 2). Il token va messo solo nei segreti di Supabase, mai in chat o nel codice.
- Una cavalletta è unica per (numero, commessa): una seconda commessa sulla stessa cavalletta ancora occupata genera una segnalazione.
- Se avevi già eseguito `schema.sql` prima del ruolo amministrazione, esegui prima `supabase/aggiorna_ruolo_amministrazione.sql` (riga 1, da sola) e poi di nuovo `schema.sql`.
- I cavalletti «Ritirati» sul DDT vengono ignorati.
- Se una cavalletta risulta rientrata senza prima «consegnata», si sistema con una correzione a mano (admin).
