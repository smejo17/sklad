-- Unikátne čísla dokladov pre výdajky/príjemky (na budúce párovanie faktúr)
alter table stock_movements add column if not exists doc_no text;
create index if not exists stock_movements_doc_no_idx on stock_movements(doc_no);

create sequence if not exists vydaj_no_seq;
create sequence if not exists prijem_no_seq;

-- vráti nové číslo dokladu: V2026-00042 (výdaj) / P2026-00042 (príjem)
create or replace function next_doc_no(kind text) returns text
language plpgsql security definer as $$
declare n bigint; y text := to_char(now(),'YYYY');
begin
  if kind = 'vydaj' then
    n := nextval('vydaj_no_seq'); return 'V'||y||'-'||lpad(n::text,5,'0');
  else
    n := nextval('prijem_no_seq'); return 'P'||y||'-'||lpad(n::text,5,'0');
  end if;
end $$;
grant execute on function next_doc_no(text) to anon, authenticated;
