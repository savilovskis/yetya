-- =====================================================================
--  Йетя — «Избранное» (сохранённые сообщения и заметки для себя)
--  Если база уже настроена schema.sql: SQL Editor → New query → вставь этот файл → Run.
--  Скрипт можно запускать повторно.
-- =====================================================================

create table if not exists public.saved_messages (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  text         text not null check (char_length(text) between 1 and 4000),
  from_user    uuid references public.profiles(id) on delete set null,  -- если переслано из чата
  from_name    text check (char_length(from_name) <= 80),
  original_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists saved_messages_user_time_idx on public.saved_messages (user_id, created_at);

alter table public.saved_messages enable row level security;

drop policy if exists "saved: read own" on public.saved_messages;
create policy "saved: read own" on public.saved_messages
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "saved: add own" on public.saved_messages;
create policy "saved: add own" on public.saved_messages
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "saved: delete own" on public.saved_messages;
create policy "saved: delete own" on public.saved_messages
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.saved_messages to authenticated;

-- синхронизация избранного между устройствами
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'saved_messages') then
    alter publication supabase_realtime add table public.saved_messages;
  end if;
end $$;

notify pgrst, 'reload schema';

select 'Йетя: избранное подключено ✓' as result;
