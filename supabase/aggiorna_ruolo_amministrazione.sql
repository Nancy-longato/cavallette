-- SOLO se hai già eseguito schema.sql prima di questa modifica.
-- 1) Esegui QUESTA riga da sola (da sola, in una query a parte):
alter type public.ruolo_app add value if not exists 'amministrazione';
-- 2) Poi esegui di nuovo, per intero, schema.sql (aggiorna le regole di accesso).
