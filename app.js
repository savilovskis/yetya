/* Йетя — веб-клиент мессенджера (GitHub Pages + Supabase) */
(() => {
  "use strict";

  // ---------- Утилиты ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const show = (node, on = true) => node.classList.toggle("hidden", !on);
  const pad = (n) => String(n).padStart(2, "0");
  const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const dayLabel = (d) => {
    const now = new Date();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return "Сегодня";
    if (sameDay(d, y)) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  };
  const listTime = (d) => {
    const now = new Date();
    if (sameDay(d, now)) return timeStr(d);
    if (now - d < 6 * 864e5) return d.toLocaleDateString("ru-RU", { weekday: "short" });
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };
  let toastTimer;
  const toast = (text) => {
    const t = $("#toast");
    t.textContent = text; show(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show(t, false), 3500);
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Аватар: фото или первая буква на цветном фоне
  const COLORS = ["#b5755a", "#7a9e7e", "#6c8ebf", "#c27ba0", "#d4a24c", "#8e7cc3", "#5fa8a8"];
  function avatar(p, size = 48, online = false) {
    const a = el("div", "avatar");
    a.style.width = a.style.height = size + "px";
    a.style.fontSize = Math.round(size * 0.42) + "px";
    const label = (p?.name || p?.username || "?").trim();
    let h = 0; for (const ch of (p?.username || label)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    a.style.background = COLORS[h % COLORS.length];
    if (p?.avatar_url) {
      const img = el("img"); img.alt = ""; img.src = p.avatar_url; img.loading = "lazy";
      img.onerror = () => { img.remove(); a.prepend(document.createTextNode(label[0].toUpperCase())); };
      a.append(img);
    } else {
      a.textContent = label[0].toUpperCase();
    }
    if (online) a.append(el("span", "dot"));
    return a;
  }

  // Текст сообщения с кликабельными ссылками (без innerHTML — безопасно)
  function richText(node, text) {
    const re = /(https?:\/\/[^\s<]+)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.append(document.createTextNode(text.slice(last, m.index)));
      const a = el("a", null, m[1]); a.href = m[1]; a.target = "_blank"; a.rel = "noopener noreferrer";
      node.append(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) node.append(document.createTextNode(text.slice(last)));
  }

  // ---------- Конфигурация ----------
  const cfg = window.YETYA_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT") &&
                     cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");
  if (!window.supabase) {
    show($("#setup"));
    $("#setup p").textContent = "Не удалось загрузить библиотеку Supabase. Проверь интернет (или VPN) и обнови страницу.";
    return;
  }
  if (!configured) { show($("#setup")); return; }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // ---------- Состояние ----------
  const S = {
    me: null,             // мой профиль
    chats: [],            // список чатов
    online: new Set(),    // id пользователей в сети (presence)
    typing: new Map(),    // chat_id -> timeout
    current: null,        // { id, other }
    messages: [],         // сообщения открытого чата
    channels: [],         // глобальные realtime-каналы
    chatChannel: null,    // канал «печатает» открытого чата
    started: false,
  };

  // ---------- Вход / регистрация ----------
  const authMsg = (text, error = false) => { const m = $("#auth-msg"); m.textContent = text || ""; m.classList.toggle("error", error); };
  const ruError = (e) => {
    const s = (e && (e.message || e.error_description || String(e))) || "Ошибка";
    if (/Invalid login credentials/i.test(s)) return "Неверная почта или пароль";
    if (/Email not confirmed/i.test(s)) return "Почта не подтверждена — открой письмо и нажми ссылку";
    if (/already registered|already exists/i.test(s)) return "Эта почта уже зарегистрирована";
    if (/rate limit|too many/i.test(s)) return "Слишком много попыток, подожди немного";
    if (/Failed to fetch|NetworkError|Load failed/i.test(s)) return "Нет связи с сервером. Проверь интернет (или VPN)";
    if (/Password should be/i.test(s)) return "Пароль слишком короткий (нужно от 6 символов)";
    if (/schema cache|does not exist|PGRST20[0-9]|42883|42P01/i.test(s))
      return "База Supabase ещё не настроена: выполни файл supabase/schema.sql в SQL Editor (целиком) и обнови страницу";
    return s;
  };

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    show($("#login-form"), t.dataset.tab === "login");
    show($("#register-form"), t.dataset.tab === "register");
    authMsg("");
  }));

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button");
    btn.disabled = true; authMsg("Входим…");
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false;
    if (error) authMsg(ruError(error), true); else authMsg("");
  });

  $("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button");
    const username = f.username.value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return authMsg("ID: 3–24 символа, латиница, цифры или _", true);
    btn.disabled = true; authMsg("Проверяем ID…");
    const { data: free, error: e1 } = await sb.rpc("username_available", { u: username });
    if (e1) { btn.disabled = false; return authMsg(ruError(e1), true); }
    if (!free) { btn.disabled = false; return authMsg("Этот ID уже занят", true); }
    authMsg("Создаём аккаунт…");
    const { data, error } = await sb.auth.signUp({
      email: f.email.value.trim(),
      password: f.password.value,
      options: { data: { username, name: f.name.value.trim() }, emailRedirectTo: location.origin + location.pathname },
    });
    btn.disabled = false;
    if (error) return authMsg(ruError(error), true);
    if (!data.session) {
      authMsg("Готово! Мы отправили письмо — подтверди почту и войди.");
      document.querySelector('.tab[data-tab="login"]').click();
      $("#login-form").email.value = f.email.value.trim();
      authMsg("Письмо отправлено. Подтверди почту по ссылке и войди.");
    }
  });

  // ---------- Запуск после входа ----------
  async function loadMe(user) {
    for (let i = 0; i < 3; i++) {
      const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (data) return { ...data, email: user.email };
      await new Promise((r) => setTimeout(r, 600));
    }
    throw new Error("Профиль не найден. Проверь, что schema.sql выполнен в Supabase.");
  }

  async function start(session) {
    if (S.started) return;
    S.started = true;
    try {
      S.me = await loadMe(session.user);
    } catch (e) {
      S.started = false;
      show($("#auth")); show($("#app"), false);
      authMsg(ruError(e), true);
      return;
    }
    show($("#auth"), false); show($("#setup"), false); show($("#app"));
    renderMe();
    await loadChats();
    subscribeGlobal();
    heartbeat();
    if (location.hash.startsWith("#@")) openByUsername(location.hash.slice(2));
  }

  function stop() {
    S.started = false;
    S.channels.forEach((c) => sb.removeChannel(c)); S.channels = [];
    if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
    S.me = null; S.chats = []; S.current = null; S.messages = [];
    $("#chat-list").replaceChildren(); $("#messages").replaceChildren();
    show($("#chat-view"), false); show($("#chat-placeholder"));
    document.body.classList.remove("chat-open");
    show($("#app"), false); show($("#auth"));
  }

  sb.auth.onAuthStateChange((event, session) => {
    // Обработчик не должен быть async-ожидающим (рекомендация supabase-js) — запускаем отдельно
    setTimeout(() => {
      if (session && !S.started) start(session);
      if (!session && event === "SIGNED_OUT") stop();
    }, 0);
  });

  (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session) start(data.session); else show($("#auth"));
  })();

  // ---------- «В сети» ----------
  function heartbeat() {
    const ping = () => { if (S.me && document.visibilityState === "visible") sb.rpc("touch").then(() => {}, () => {}); };
    ping();
    setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", () => {
      ping();
      if (document.visibilityState === "visible" && S.current) markRead();
    });
  }
  const isOnline = (p) => S.online.has(p.id) || (p.last_seen && Date.now() - new Date(p.last_seen) < 90_000);
  function statusText(p) {
    if (isOnline(p)) return "в сети";
    if (!p.last_seen) return "был(а) недавно";
    const d = new Date(p.last_seen), now = new Date();
    if (sameDay(d, now)) return "был(а) в " + timeStr(d);
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(d, y)) return "был(а) вчера в " + timeStr(d);
    return "был(а) " + d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }

  // ---------- Realtime ----------
  function setConn(state) {
    const c = $("#conn");
    c.classList.toggle("ok", state === "ok"); c.classList.toggle("bad", state === "bad");
    c.title = state === "ok" ? "Подключено" : state === "bad" ? "Нет соединения" : "Подключение…";
  }

  function subscribeGlobal() {
    const inbox = sb.channel("inbox-" + S.me.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onNewMessage(p.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (p) => onMessageUpdate(p.new))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chats" }, () => loadChatsSoon())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { setConn("ok"); loadChatsSoon(); if (S.current) reloadMessagesQuiet(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConn("bad");
      });

    const presence = sb.channel("online", { config: { presence: { key: S.me.id } } })
      .on("presence", { event: "sync" }, () => {
        S.online = new Set(Object.keys(presence.presenceState()));
        renderChats(); renderPeer();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await presence.track({ at: Date.now() });
      });

    S.channels.push(inbox, presence);
  }

  function onNewMessage(m) {
    if (S.current && m.chat_id === S.current.id) {
      if (!S.messages.some((x) => x.id === m.id)) {
        // свой оптимистичный пузырь заменится ответом insert(); чужие — добавляем
        const pendingIdx = S.messages.findIndex((x) => x.pending && x.sender_id === m.sender_id && x.text === m.text);
        if (pendingIdx >= 0) S.messages[pendingIdx] = m; else S.messages.push(m);
        renderMessages(true);
      }
      if (m.sender_id !== S.me.id) {
        stopTypingIndicator(m.chat_id);
        if (document.visibilityState === "visible") markRead();
      }
    }
    if (m.sender_id !== S.me.id && (document.visibilityState !== "visible" || !S.current || S.current.id !== m.chat_id)) {
      notify(m);
    }
    loadChatsSoon();
  }

  function onMessageUpdate(m) {
    if (S.current && m.chat_id === S.current.id) {
      const i = S.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) { S.messages[i] = { ...S.messages[i], ...m }; renderMessages(false); }
    }
    loadChatsSoon();
  }

  // ---------- Список чатов ----------
  async function loadChats() {
    const { data, error } = await sb.rpc("my_chats");
    if (error) { toast(ruError(error)); return; }
    S.chats = data || [];
    renderChats();
  }
  const loadChatsSoon = debounce(loadChats, 250);

  function renderChats() {
    const list = $("#chat-list");
    list.replaceChildren();
    show($("#empty-list"), S.chats.length === 0 && $("#search").value.trim() === "");
    for (const c of S.chats) {
      const p = { id: c.other_id, username: c.username, name: c.name, avatar_url: c.avatar_url, last_seen: c.last_seen };
      const b = el("button", "item" + (S.current && S.current.id === c.chat_id ? " active" : ""));
      b.type = "button";
      b.append(avatar(p, 52, isOnline(p)));
      const body = el("div", "item-body");
      const top = el("div", "item-top");
      top.append(el("span", "item-name", c.name || c.username), el("span", "item-time", c.last_text != null ? listTime(new Date(c.last_at)) : ""));
      const bottom = el("div", "item-bottom");
      const txt = el("span", "item-text");
      if (S.typing.has(c.chat_id)) {
        txt.append(el("span", "typing", "печатает…"));
      } else if (c.last_text != null) {
        if (c.last_is_mine) txt.append(el("span", "ticks", c.last_read ? "✓✓" : "✓"), document.createTextNode("Вы: "));
        txt.append(document.createTextNode(c.last_text.replace(/\s+/g, " ")));
      } else {
        txt.textContent = "Чат создан";
      }
      bottom.append(txt);
      if (c.unread > 0) bottom.append(el("span", "badge", c.unread > 99 ? "99+" : String(c.unread)));
      body.append(top, bottom);
      b.append(body);
      b.addEventListener("click", () => openChat(c.chat_id, p));
      list.append(b);
    }
    // обновить счётчик в заголовке вкладки
    const unread = S.chats.reduce((s, c) => s + Number(c.unread || 0), 0);
    document.title = unread ? `(${unread}) Йетя` : "Йетя";
  }

  // ---------- Поиск людей ----------
  const runSearch = debounce(async () => {
    const q = $("#search").value.trim().replace(/^@/, "").replace(/[^\p{L}\p{N}_ ]/gu, "");
    const box = $("#search-results");
    if (!q) { show(box, false); show($("#chat-list")); renderChats(); return; }
    const { data, error } = await sb.from("profiles")
      .select("id, username, name, avatar_url, last_seen")
      .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
      .neq("id", S.me.id)
      .limit(20);
    if ($("#search").value.trim().replace(/^@/, "").replace(/[^\p{L}\p{N}_ ]/gu, "") !== q) return; // устаревший ответ
    box.replaceChildren();
    show(box); show($("#chat-list"), false); show($("#empty-list"), false);
    if (error) { box.append(el("div", "empty", ruError(error))); return; }
    box.append(el("div", "section-label", "Люди"));
    if (!data.length) { box.append(el("div", "empty", "Никого не нашли")); return; }
    for (const p of data) {
      const b = el("button", "item"); b.type = "button";
      b.append(avatar(p, 46, isOnline(p)));
      const body = el("div", "item-body");
      const top = el("div", "item-top"); top.append(el("span", "item-name", p.name || p.username));
      const bottom = el("div", "item-bottom"); bottom.append(el("span", "item-text", "@" + p.username));
      body.append(top, bottom); b.append(body);
      b.addEventListener("click", () => startChatWith(p));
      box.append(b);
    }
  }, 250);
  $("#search").addEventListener("input", runSearch);

  async function startChatWith(p) {
    const { data: chatId, error } = await sb.rpc("get_or_create_chat", { other: p.id });
    if (error) return toast(ruError(error));
    $("#search").value = ""; show($("#search-results"), false); show($("#chat-list"));
    await loadChats();
    openChat(chatId, p);
  }

  async function openByUsername(u) {
    const { data } = await sb.from("profiles").select("id, username, name, avatar_url, last_seen").eq("username", u.toLowerCase()).maybeSingle();
    if (data && data.id !== S.me.id) startChatWith(data);
  }

  // ---------- Открытый чат ----------
  async function openChat(chatId, other) {
    const isMobile = matchMedia("(max-width: 760px)").matches;
    if (isMobile && !document.body.classList.contains("chat-open")) history.pushState({ chat: chatId }, "");
    document.body.classList.add("chat-open");

    if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
    S.current = { id: chatId, other };
    S.messages = [];
    show($("#chat-placeholder"), false); show($("#chat-view"));
    renderPeer();
    renderChats();
    $("#messages").replaceChildren(el("div", "empty", "Загрузка…"));

    // канал «печатает…» для этого чата
    S.chatChannel = sb.channel("chat-" + chatId)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user !== S.me.id) startTypingIndicator(chatId);
      })
      .subscribe();

    await reloadMessagesQuiet();
    markRead();
    if (!isMobile) $("#input").focus();
  }

  async function reloadMessagesQuiet() {
    if (!S.current) return;
    const chatId = S.current.id;
    const { data, error } = await sb.from("messages")
      .select("*").eq("chat_id", chatId)
      .order("created_at", { ascending: false }).limit(200);
    if (!S.current || S.current.id !== chatId) return;
    if (error) { $("#messages").replaceChildren(el("div", "empty", ruError(error))); return; }
    const pending = S.messages.filter((m) => m.pending || m.failed);
    S.messages = data.reverse().concat(pending);
    renderMessages(true);
  }

  function closeChat() {
    document.body.classList.remove("chat-open");
    if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
    S.current = null; S.messages = [];
    show($("#chat-view"), false); show($("#chat-placeholder"));
    renderChats();
  }
  $("#back-btn").addEventListener("click", () => {
    if (history.state && history.state.chat) history.back(); else closeChat();
  });
  window.addEventListener("popstate", () => { if (document.body.classList.contains("chat-open")) closeChat(); });

  function renderPeer() {
    if (!S.current) return;
    const p = S.current.other;
    const live = S.chats.find((c) => c.chat_id === S.current.id);
    if (live) Object.assign(p, { name: live.name, username: live.username, avatar_url: live.avatar_url, last_seen: live.last_seen });
    $("#peer-avatar").replaceChildren(avatar(p, 40, false));
    $("#peer-name").textContent = p.name || p.username;
    const st = $("#peer-status");
    if (S.typing.has(S.current.id)) { st.textContent = "печатает…"; st.className = "peer-status typing"; }
    else { st.textContent = statusText(p); st.className = "peer-status" + (isOnline(p) ? " online" : ""); }
  }

  function renderMessages(scrollToEnd) {
    const box = $("#messages");
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    box.replaceChildren();
    if (!S.messages.length) { box.append(el("div", "empty", "Напиши первое сообщение 👋")); return; }
    let prevDay = null;
    for (const m of S.messages) {
      const d = new Date(m.created_at);
      const dk = d.toDateString();
      if (dk !== prevDay) { box.append(el("div", "day", dayLabel(d))); prevDay = dk; }
      const mine = m.sender_id === S.me.id;
      const b = el("div", "bubble" + (mine ? " out" : "") + (m.pending ? " pending" : "") + (m.failed ? " failed" : ""));
      richText(b, m.text);
      const meta = el("span", "meta", m.failed ? "не отправлено" : timeStr(d));
      if (mine && !m.failed) meta.append(el("span", "ticks", m.pending ? "🕓" : m.read_at ? "✓✓" : "✓"));
      b.append(meta);
      if (m.failed) { b.title = "Нажми, чтобы отправить снова"; b.style.cursor = "pointer"; b.onclick = () => retry(m); }
      box.append(b);
    }
    if (scrollToEnd || nearBottom) box.scrollTop = box.scrollHeight;
  }

  async function markRead() {
    if (!S.current) return;
    const c = S.chats.find((x) => x.chat_id === S.current.id);
    const hasUnread = S.messages.some((m) => m.sender_id !== S.me.id && !m.read_at);
    if (!hasUnread && !(c && c.unread > 0)) return;
    const { error } = await sb.rpc("mark_read", { c: S.current.id });
    if (!error) loadChatsSoon();
  }

  // ---------- «Печатает…» ----------
  function startTypingIndicator(chatId) {
    clearTimeout(S.typing.get(chatId));
    S.typing.set(chatId, setTimeout(() => stopTypingIndicator(chatId), 4000));
    renderPeer(); renderChats();
  }
  function stopTypingIndicator(chatId) {
    if (!S.typing.has(chatId)) return;
    clearTimeout(S.typing.get(chatId)); S.typing.delete(chatId);
    renderPeer(); renderChats();
  }
  let lastTypingSent = 0;
  function sendTyping() {
    if (!S.chatChannel || Date.now() - lastTypingSent < 2500) return;
    lastTypingSent = Date.now();
    S.chatChannel.send({ type: "broadcast", event: "typing", payload: { user: S.me.id } });
  }

  // ---------- Отправка ----------
  const input = $("#input");
  const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  input.addEventListener("input", () => { autosize(); if (input.value.trim()) sendTyping(); });
  input.addEventListener("keydown", (e) => {
    const touch = matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !touch && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
  });

  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !S.current) return;
    input.value = ""; autosize();
    send(text);
    if (!matchMedia("(pointer: coarse)").matches) input.focus();
  });

  async function send(text, temp) {
    const chatId = S.current.id;
    temp = temp || { id: "tmp-" + Math.random().toString(36).slice(2), chat_id: chatId, sender_id: S.me.id, text, created_at: new Date().toISOString(), pending: true };
    temp.pending = true; temp.failed = false;
    if (!S.messages.includes(temp)) S.messages.push(temp);
    renderMessages(true);
    const { data, error } = await sb.from("messages").insert({ chat_id: chatId, text }).select().single();
    if (!S.current || S.current.id !== chatId) { loadChatsSoon(); return; }
    const i = S.messages.indexOf(temp);
    if (error) {
      temp.pending = false; temp.failed = true;
      toast(ruError(error));
    } else if (i >= 0) {
      if (S.messages.some((x) => x.id === data.id)) S.messages.splice(i, 1); // уже пришло по realtime
      else S.messages[i] = data;
    }
    renderMessages(true);
    loadChatsSoon();
  }
  function retry(m) { if (S.current && m.chat_id === S.current.id) send(m.text, m); }

  // ---------- Уведомления ----------
  async function notify(m) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const c = S.chats.find((x) => x.chat_id === m.chat_id);
    const title = c ? (c.name || c.username) : "Новое сообщение";
    const opts = { body: m.text.slice(0, 140), icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "chat-" + m.chat_id, renotify: true };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
    } catch (_) { /* ignore */ }
  }

  // ---------- Профиль ----------
  function renderMe() { $("#me-btn").replaceChildren(avatar(S.me, 38)); }

  const dlg = $("#profile-dlg");
  const profileMsg = (t, err = false) => { const m = $("#profile-msg"); m.textContent = t || ""; m.classList.toggle("error", err); };
  $("#me-btn").addEventListener("click", () => {
    const f = $("#profile-form");
    f.name.value = S.me.name || ""; f.username.value = S.me.username;
    $("#profile-avatar").replaceChildren(avatar(S.me, 88));
    $("#profile-email").textContent = S.me.email || "";
    profileMsg("");
    const nb = $("#notify-btn");
    if (!("Notification" in window)) { nb.disabled = true; nb.textContent = "Уведомления недоступны в этом браузере"; }
    else if (Notification.permission === "granted") { nb.disabled = true; nb.textContent = "Уведомления включены"; }
    else if (Notification.permission === "denied") { nb.disabled = true; nb.textContent = "Уведомления запрещены в настройках браузера"; }
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    $("#install-hint").textContent = standalone ? "" :
      ios ? "Совет: в Safari нажми «Поделиться» → «На экран Домой», чтобы Йетя открывалась как приложение."
          : "Совет: в меню браузера выбери «Установить приложение» или «Добавить на главный экран».";
    dlg.showModal();
  });

  $("#notify-btn").addEventListener("click", async () => {
    const r = await Notification.requestPermission();
    const nb = $("#notify-btn");
    nb.disabled = r !== "default";
    nb.textContent = r === "granted" ? "Уведомления включены" : r === "denied" ? "Уведомления запрещены" : "Включить уведомления";
  });

  $("#profile-save").addEventListener("click", async () => {
    const f = $("#profile-form");
    const name = f.name.value.trim(), username = f.username.value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return profileMsg("ID: 3–24 символа, латиница, цифры или _", true);
    if (username !== S.me.username) {
      const { data: free } = await sb.rpc("username_available", { u: username });
      if (!free) return profileMsg("Этот ID уже занят", true);
    }
    const { data, error } = await sb.from("profiles").update({ name: name || null, username }).eq("id", S.me.id).select().single();
    if (error) return profileMsg(ruError(error), true);
    S.me = { ...S.me, ...data }; renderMe();
    profileMsg("Сохранено ✓");
  });

  $("#avatar-input").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    profileMsg("Загружаем фото…");
    try {
      const blob = await shrinkImage(file, 512);
      const path = `${S.me.id}/avatar-${Date.now()}.jpg`;
      const up = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { data, error } = await sb.from("profiles").update({ avatar_url: url }).eq("id", S.me.id).select().single();
      if (error) throw error;
      S.me = { ...S.me, ...data }; renderMe();
      $("#profile-avatar").replaceChildren(avatar(S.me, 88));
      profileMsg("Фото обновлено ✓");
    } catch (err) { profileMsg(ruError(err), true); }
  });

  // уменьшаем фото перед загрузкой, чтобы экономить место в бесплатном тарифе
  function shrinkImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const s = Math.min(img.width, img.height); // квадратная обрезка по центру
        const side = Math.round(Math.min(max, s * k));
        const c = document.createElement("canvas"); c.width = c.height = side;
        c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, side, side);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Не удалось обработать фото"))), "image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error("Это не похоже на картинку"));
      img.src = URL.createObjectURL(file);
    });
  }

  $("#logout-btn").addEventListener("click", async () => {
    dlg.close();
    await sb.auth.signOut();
    stop();
  });

  // ---------- PWA ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    navigator.serviceWorker.addEventListener?.("message", (e) => {
      if (e.data && e.data.openChat && S.me) {
        const c = S.chats.find((x) => x.chat_id === e.data.openChat);
        if (c) openChat(c.chat_id, { id: c.other_id, username: c.username, name: c.name, avatar_url: c.avatar_url, last_seen: c.last_seen });
      }
    });
  }
})();
