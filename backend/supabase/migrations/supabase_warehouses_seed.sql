-- Sklady s KRÁTKYM názvom + adresou (aby sa nemusel vypisovať celý text).
-- Idempotentné: pridá len sklady, ktoré ešte neexistujú (podľa názvu).
-- Ak už máš sklady pod dlhými názvami, premenuj ich v appke:
--   Administrácia → Rozmiestnenie skladu → pole „Názov (krátky)" a „Adresa".

INSERT INTO warehouses (name, address, color)
SELECT v.name, v.address, v.color
FROM (VALUES
  ('Rostovská',  'Rostovská 260/2b, Praha',      '#3b6fd4'),
  ('Čestmírova', 'Čestmírova — Michal Strecha',  '#2e9e5b'),
  ('Poděbrady',  'sklad Tovární, Poděbrady',     '#e08a1e')
) AS v(name, address, color)
WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.name = v.name);
