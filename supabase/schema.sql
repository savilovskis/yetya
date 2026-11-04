-- =====================================================================
--  Йетя — схема базы для Supabase
--  Как применить: Supabase → SQL Editor → New query → вставить ВЕСЬ файл → Run.
--  Скрипт можно запускать повторно: он ничего не ломает.
--  Аватарки настраиваются отдельно — файл storage.sql (запусти его ПОСЛЕ этого).
-- =====================================================================

-- ---------- 1. Профили пользователей ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  name        text check (char_length(name) <= 60),
  avatar_url  text,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read for signed in" on public.profiles;
create policy "profiles: read for signed in" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Профиль создаётся автоматически при регистрации
-- (username и name берутся из данных, которые клиент передал в signUp).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if uname !~ '^[a-z0-9_]{3,24}$' or exists (select 1 from public.profiles where username = uname) then
    uname := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username, name)
  values (new.id, uname, nullif(new.raw_user_meta_data->>'name', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Проверка, свободен ли ID (доступна и до входа)
create or replace function public.username_available(u text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- «Я в сети» — обновляет last_seen
create or replace function public.touch()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;
grant execute on function public.touch() to authenticated;

-- ---------- 2. Чаты (личные диалоги) ----------
create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  user1       uuid not null references public.profiles(id) on delete cascade,
  user2       uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (user1 < user2),
  unique (user1, user2)
);

alter table public.chats enable row level security;

drop policy if exists "chats: members read" on public.chats;
create policy "chats: members read" on public.chats
  for select to authenticated using (auth.uid() in (user1, user2));

create or replace function public.is_chat_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chats where id = c and auth.uid() in (user1, user2));
$$;

-- Найти или создать диалог с пользователем
create or replace function public.get_or_create_chat(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid; cid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other is null or other = me then raise exception 'bad user'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'user not found'; end if;
  a := least(me, other); b := greatest(me, other);
  insert into public.chats (user1, user2) values (a, b)
    on conflict (user1, user2) do nothing;
  select id into cid from public.chats where user1 = a and user2 = b;
  return cid;
end $$;
grant execute on function public.get_or_create_chat(uuid) to authenticated;

-- ---------- 3. Сообщения ----------
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  chat_id     uuid not null references public.chats(id) on delete cascade,
  sender_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 4000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists messages_chat_time_idx on public.messages (chat_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "messages: members read" on public.messages;
create policy "messages: members read" on public.messages
  for select to authenticated using (public.is_chat_member(chat_id));

drop policy if exists "messages: members send" on public.messages;
create policy "messages: members send" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id));

-- Отметить входящие сообщения прочитанными
create or replace function public.mark_read(c uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_chat_member(c) then return 0; end if;
  update public.messages set read_at = now()
   where chat_id = c and sender_id <> auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_read(uuid) to authenticated;

-- Список моих чатов: собеседник, последнее сообщение, непрочитанные
create or replace function public.my_chats()
returns table (
  chat_id uuid, other_id uuid, username text, name text, avatar_url text,
  last_seen timestamptz, last_text text, last_at timestamptz,
  last_is_mine boolean, last_read boolean, unread bigint
)
language sql stable security definer set search_path = public as $$
  select c.id, p.id, p.username, p.name, p.avatar_url, p.last_seen,
         lm.text, coalesce(lm.created_at, c.created_at),
         lm.sender_id = auth.uid(), lm.read_at is not null,
         (select count(*) from public.messages m
           where m.chat_id = c.id and m.sender_id <> auth.uid() and m.read_at is null)
    from public.chats c
    join public.profiles p
      on p.id = case when c.user1 = auth.uid() then c.user2 else c.user1 end
    left join lateral (
      select m.text, m.created_at, m.sender_id, m.read_at
        from public.messages m
       where m.chat_id = c.id
       order by m.created_at desc
       limit 1
    ) lm on true
   where auth.uid() in (c.user1, c.user2)
   order by coalesce(lm.created_at, c.created_at) desc;
$$;
grant execute on function public.my_chats() to authenticated;

-- ---------- Права доступа для API (на новых проектах таблицы не открываются сами) ----------
grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.chats to authenticated;
grant select, insert on public.messages to authenticated;

-- ---------- 4. Realtime: мгновенная доставка ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chats') then
    alter publication supabase_realtime add table public.chats;
  end if;
end $$;

-- ---------- Обновить кэш API, чтобы функции стали видны сразу ----------
notify pgrst, 'reload schema';

select 'Йетя: схема установлена ✓' as result;
