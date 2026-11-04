-- =====================================================================
--  Йетя — фото, голосовые, история звонков + исправление загрузки аватарок
--  SQL Editor → New query → вставь ВЕСЬ файл → Run. Можно запускать повторно.
-- =====================================================================

-- ---------- 1. Аватарки: бакет и правила (исправляет «violates row-level security policy») ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true;

drop policy if exists "avatars: read" on storage.objects;
create policy "avatars: read" on storage.objects
  for select to public using (bucket_id = 'avatars');

drop policy if exists "avatars: upload own" on storage.objects;
create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: update own" on storage.objects;
create policy "avatars: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 2. Сообщения: фото, голосовые, звонки ----------
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_meta jsonb;

alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(text) <= 4000 and (
       (kind = 'text'  and char_length(text) >= 1 and media_path is null)
    or (kind in ('image', 'voice') and media_path is not null and media_path like chat_id::text || '/%')
    or (kind = 'call'  and media_path is null)
  )
);

-- ---------- 3. Избранное тоже умеет хранить фото и голосовые ----------
alter table public.saved_messages add column if not exists kind text not null default 'text';
alter table public.saved_messages add column if not exists media_path text;
alter table public.saved_messages add column if not exists media_meta jsonb;

alter table public.saved_messages drop constraint if exists saved_messages_text_check;
alter table public.saved_messages drop constraint if exists saved_messages_content_check;
alter table public.saved_messages add constraint saved_messages_content_check check (
  char_length(text) <= 4000 and (
       (kind = 'text' and char_length(text) >= 1 and media_path is null)
    or (kind in ('image', 'voice') and media_path is not null)
  )
);

-- ---------- 4. Список чатов: подписи для фото / голосовых / звонков ----------
create or replace function public.my_chats()
returns table (
  chat_id uuid, other_id uuid, username text, name text, avatar_url text,
  last_seen timestamptz, last_text text, last_at timestamptz,
  last_is_mine boolean, last_read boolean, unread bigint
)
language sql stable security definer set search_path = public as $$
  select c.id, p.id, p.username, p.name, p.avatar_url, p.last_seen,
         case lm.kind
           when 'voice' then '🎤 Голосовое сообщение'
           when 'image' then '📷 ' || coalesce(nullif(lm.text, ''), 'Фото')
           when 'call'  then case
                               when lm.media_meta->>'status' in ('missed', 'declined', 'busy', 'failed')
                                 then '📞 Пропущенный звонок'
                               when (lm.media_meta->>'video')::boolean then '📹 Видеозвонок'
                               else '📞 Звонок'
                             end
           else lm.text
         end,
         coalesce(lm.created_at, c.created_at),
         lm.sender_id = auth.uid(), lm.read_at is not null,
         (select count(*) from public.messages m
           where m.chat_id = c.id and m.sender_id <> auth.uid() and m.read_at is null)
    from public.chats c
    join public.profiles p
      on p.id = case when c.user1 = auth.uid() then c.user2 else c.user1 end
    left join lateral (
      select m.text, m.kind, m.media_meta, m.created_at, m.sender_id, m.read_at
        from public.messages m
       where m.chat_id = c.id
       order by m.created_at desc
       limit 1
    ) lm on true
   where auth.uid() in (c.user1, c.user2)
   order by coalesce(lm.created_at, c.created_at) desc;
$$;
grant execute on function public.my_chats() to authenticated;

-- ---------- 5. Хранилище фото и голосовых (приватное: видят только участники чата) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 15728640,
        array['image/jpeg','image/png','image/webp','image/gif',
              'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a','audio/wav'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Путь файла: <chat_id>/<файл> — для чата, u/<мой id>/<файл> — для Избранного
create or replace function public.can_access_media(object_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  top text := split_part(object_name, '/', 1);
  sub text := split_part(object_name, '/', 2);
begin
  if auth.uid() is null then return false; end if;
  if top = 'u' then return sub = auth.uid()::text; end if;
  return exists (select 1 from public.chats c where c.id::text = top and auth.uid() in (c.user1, c.user2));
end $$;
grant execute on function public.can_access_media(text) to authenticated;

drop policy if exists "chat-media: read" on storage.objects;
create policy "chat-media: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media' and public.can_access_media(name));

drop policy if exists "chat-media: upload" on storage.objects;
create policy "chat-media: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media' and public.can_access_media(name));

notify pgrst, 'reload schema';

select 'Йетя: фото, голосовые и звонки подключены ✓' as result;
