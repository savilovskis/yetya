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
  const svg = (markup) => { const t = document.createElement("template"); t.innerHTML = markup.trim(); return t.content.firstChild; };
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
    toastTimer = setTimeout(() => show(t, false), 2600);
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const isMobile = () => matchMedia("(max-width: 760px)").matches;
  const isTouch = () => matchMedia("(pointer: coarse)").matches;
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const ICON = {
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 011 1v17l-7-4.5L5 21V4a1 1 0 011-1z" fill="currentColor"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 011 1v17l-7-4.5L5 21V4a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    retry: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 3.5h3.2l1.6 4.3-2.2 1.4a11.5 11.5 0 006.2 6.2l1.4-2.2 4.3 1.6V18a2.5 2.5 0 01-2.5 2.5A16.5 16.5 0 012.5 6 2.5 2.5 0 015 3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    video: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 10.5l5-3v9l-5-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  };

  // Аватар: фото или первая буква на цветном фоне
  const COLORS = ["#b5755a", "#7a9e7e", "#6c8ebf", "#c27ba0", "#d4a24c", "#8e7cc3", "#5fa8a8"];
  function avatar(p, size = 48, online = false) {
    const a = el("div", "avatar");
    a.style.width = a.style.height = size + "px";
    a.style.fontSize = Math.round(size * 0.42) + "px";
    const label = (p?.name || p?.username || "?").trim() || "?";
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
  function savedAvatar(size = 48) {
    const a = el("div", "avatar saved");
    a.style.width = a.style.height = size + "px";
    a.append(svg(ICON.bookmark));
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

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const t = el("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.append(t); t.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
      t.remove(); return ok;
    }
  }

  // ---------- Высота экрана с учётом клавиатуры (iOS Safari) ----------
  function fitViewport() {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-h", h + "px");
    if (vv && vv.offsetTop) window.scrollTo(0, 0);
  }
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", () => {
      const box = $("#messages");
      const atBottom = box && box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      fitViewport();
      if (atBottom) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    });
    visualViewport.addEventListener("scroll", fitViewport);
  }
  fitViewport();

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
    me: null,
    chats: [],
    saved: { last: null, count: 0, missing: false },
    online: new Set(),
    typing: new Map(),
    current: null,        // { kind: "chat", id, other } | { kind: "saved" }
    messages: [],
    channels: [],
    chatChannel: null,
    started: false,
  };
  const inSaved = () => S.current && S.current.kind === "saved";

  // ---------- Ошибки по-русски ----------
  const ruError = (e) => {
    const s = (e && (e.message || e.error_description || String(e))) || "Ошибка";
    if (/Invalid login credentials/i.test(s)) return "Неверная почта или пароль";
    if (/Email not confirmed/i.test(s)) return "Почта не подтверждена — открой письмо и нажми ссылку";
    if (/already registered|already exists/i.test(s)) return "Эта почта уже зарегистрирована";
    if (/rate limit|too many/i.test(s)) return "Слишком много попыток, подожди немного";
    if (/Failed to fetch|NetworkError|Load failed/i.test(s)) return "Нет связи с сервером. Проверь интернет (или VPN)";
    if (/Password should be/i.test(s)) return "Пароль слишком короткий (нужно от 6 символов)";
    if (/saved_messages/i.test(s)) return "Избранное ещё не подключено: выполни supabase/002_saved.sql в SQL Editor";
    if (/schema cache|does not exist|PGRST20[0-9]|42883|42P01/i.test(s))
      return "База Supabase ещё не настроена: выполни файл supabase/schema.sql в SQL Editor (целиком) и обнови страницу";
    return s;
  };
  const isMissingTable = (e) => e && (/saved_messages|schema cache|does not exist/i.test(e.message || "") || ["42P01", "PGRST205"].includes(e.code));

  // ---------- Вход / регистрация ----------
  const authMsg = (text, error = false) => { const m = $("#auth-msg"); m.textContent = text || ""; m.classList.toggle("error", error); };

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
    const email = f.email.value.trim();
    const { data, error } = await sb.auth.signUp({
      email, password: f.password.value,
      options: { data: { username, name: f.name.value.trim() }, emailRedirectTo: location.origin + location.pathname },
    });
    btn.disabled = false;
    if (error) return authMsg(ruError(error), true);
    if (!data.session) {
      document.querySelector('.tab[data-tab="login"]').click();
      $("#login-form").email.value = email;
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
    renderChats();
    await Promise.all([loadChats(), loadSavedMeta()]);
    subscribeGlobal();
    heartbeat();
    if (location.hash.startsWith("#@")) openByUsername(location.hash.slice(2));
  }

  function stop() {
    if (C) hangup();
    S.started = false;
    S.channels.forEach((c) => sb.removeChannel(c)); S.channels = [];
    if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
    S.me = null; S.chats = []; S.current = null; S.messages = [];
    S.saved = { last: null, count: 0, missing: false };
    $("#chat-list").replaceChildren(); $("#messages").replaceChildren();
    show($("#chat-view"), false); show($("#chat-placeholder"));
    document.body.classList.remove("chat-open");
    show($("#app"), false); show($("#auth"));
  }

  sb.auth.onAuthStateChange((event, session) => {
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
  let heartbeatStarted = false;
  function heartbeat() {
    if (heartbeatStarted) return;
    heartbeatStarted = true;
    const ping = () => { if (S.me && document.visibilityState === "visible") sb.rpc("touch").then(() => {}, () => {}); };
    ping();
    setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", () => {
      ping();
      if (document.visibilityState === "visible" && S.current && !inSaved()) markRead();
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
    S.channels.push(inbox);

    if (!S.saved.missing) {
      const saved = sb.channel("saved-" + S.me.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "saved_messages", filter: "user_id=eq." + S.me.id }, (p) => onSavedInsert(p.new))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "saved_messages" }, (p) => onSavedDelete(p.old))
        .subscribe();
      S.channels.push(saved);
    }

    subscribeCalls();

    const presence = sb.channel("online", { config: { presence: { key: S.me.id } } })
      .on("presence", { event: "sync" }, () => {
        S.online = new Set(Object.keys(presence.presenceState()));
        renderChats(); renderPeer();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await presence.track({ at: Date.now() });
      });
    S.channels.push(presence);
  }

  function onNewMessage(m) {
    const here = S.current && S.current.kind === "chat" && m.chat_id === S.current.id;
    if (here) {
      if (!S.messages.some((x) => x.id === m.id)) {
        const pendingIdx = S.messages.findIndex((x) => x.pending && x.sender_id === m.sender_id && x.text === m.text && (x.media_path || null) === (m.media_path || null));
        if (pendingIdx >= 0) S.messages[pendingIdx] = m; else S.messages.push(m);
        renderMessages(m.sender_id === S.me.id);
      }
      if (m.sender_id !== S.me.id) {
        stopTypingIndicator(m.chat_id);
        if (document.visibilityState === "visible") markRead();
      }
    }
    if (m.sender_id !== S.me.id && (document.visibilityState !== "visible" || !here)) notify(m);
    loadChatsSoon();
  }

  function onMessageUpdate(m) {
    if (S.current && S.current.kind === "chat" && m.chat_id === S.current.id) {
      const i = S.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) { S.messages[i] = { ...S.messages[i], ...m }; renderMessages(false); }
    }
    loadChatsSoon();
  }

  function onSavedInsert(m) {
    if (inSaved() && !S.messages.some((x) => x.id === m.id)) {
      const pendingIdx = S.messages.findIndex((x) => x.pending && x.text === m.text && (x.media_path || null) === (m.media_path || null));
      if (pendingIdx >= 0) S.messages[pendingIdx] = m; else S.messages.push(m);
      renderMessages(true);
    }
    loadSavedMetaSoon();
  }
  function onSavedDelete(old) {
    if (!old || old.id == null) return;
    if (inSaved()) {
      const i = S.messages.findIndex((x) => x.id === old.id);
      if (i >= 0) { S.messages.splice(i, 1); renderMessages(false); }
    }
    loadSavedMetaSoon();
  }

  // ---------- Список чатов ----------
  async function loadChats() {
    const { data, error } = await sb.rpc("my_chats");
    if (error) { toast(ruError(error)); return; }
    S.chats = data || [];
    renderChats();
  }
  const loadChatsSoon = debounce(loadChats, 250);

  async function loadSavedMeta() {
    const { data, error, count } = await sb.from("saved_messages")
      .select("id, text, created_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(1);
    if (error) { S.saved.missing = isMissingTable(error); renderChats(); return; }
    S.saved = { last: data[0] || null, count: count || 0, missing: false };
    renderChats(); if (inSaved()) renderPeer();
  }
  const loadSavedMetaSoon = debounce(loadSavedMeta, 250);

  function savedRow() {
    const b = el("button", "item" + (inSaved() ? " active" : ""));
    b.type = "button";
    b.append(savedAvatar(54));
    const body = el("div", "item-body");
    const top = el("div", "item-top");
    const name = el("span", "item-name", "Избранное");
    name.append(svg(ICON.pin).cloneNode(true)); name.lastChild.classList.add("pin");
    top.append(name, el("span", "item-time", S.saved.last ? listTime(new Date(S.saved.last.created_at)) : ""));
    const bottom = el("div", "item-bottom");
    bottom.append(el("span", "item-text",
      S.saved.missing ? "Нужно выполнить 002_saved.sql" :
      S.saved.last ? S.saved.last.text.replace(/\s+/g, " ") : "Сохраняй сюда сообщения и заметки"));
    body.append(top, bottom);
    b.append(body);
    b.addEventListener("click", openSaved);
    return b;
  }

  function renderChats() {
    const list = $("#chat-list");
    list.replaceChildren(savedRow());
    for (const c of S.chats) {
      const p = { id: c.other_id, username: c.username, name: c.name, avatar_url: c.avatar_url, last_seen: c.last_seen };
      const b = el("button", "item" + (S.current && S.current.id === c.chat_id ? " active" : ""));
      b.type = "button";
      b.append(avatar(p, 54, isOnline(p)));
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
    if (!S.chats.length) list.append(el("div", "list-empty", "Пока нет переписок. Найди друга по ID через поиск сверху."));

    const unread = S.chats.reduce((s, c) => s + Number(c.unread || 0), 0);
    document.title = unread ? `(${unread}) Йетя` : "Йетя";
    const otherUnread = S.chats.reduce((s, c) => s + (S.current && S.current.id === c.chat_id ? 0 : Number(c.unread || 0)), 0);
    const bb = $("#back-badge");
    bb.textContent = otherUnread > 99 ? "99+" : String(otherUnread);
    show(bb, otherUnread > 0);
  }

  // ---------- Поиск людей ----------
  const cleanQuery = () => $("#search").value.trim().replace(/^@/, "").replace(/[^\p{L}\p{N}_ ]/gu, "");
  const runSearch = debounce(async () => {
    const q = cleanQuery();
    const box = $("#search-results");
    if (!q) { show(box, false); show($("#chat-list")); return; }
    const { data, error } = await sb.from("profiles")
      .select("id, username, name, avatar_url, last_seen")
      .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
      .neq("id", S.me.id)
      .limit(20);
    if (cleanQuery() !== q) return;
    box.replaceChildren();
    show(box); show($("#chat-list"), false);
    if (error) { box.append(el("div", "list-empty", ruError(error))); return; }
    box.append(el("div", "section-label", "Люди"));
    if (!data.length) { box.append(el("div", "list-empty", "Никого не нашли")); return; }
    for (const p of data) {
      const b = el("button", "item"); b.type = "button";
      b.append(avatar(p, 50, isOnline(p)));
      const body = el("div", "item-body");
      const top = el("div", "item-top"); top.append(el("span", "item-name", p.name || p.username));
      const bottom = el("div", "item-bottom"); bottom.append(el("span", "item-text", "@" + p.username));
      body.append(top, bottom); b.append(body);
      b.addEventListener("click", () => startChatWith(p));
      box.append(b);
    }
  }, 250);
  $("#search").addEventListener("input", runSearch);
  $("#compose-btn").addEventListener("click", () => { $("#search").focus(); toast("Введи ID или имя друга"); });

  async function startChatWith(p) {
    const { data: chatId, error } = await sb.rpc("get_or_create_chat", { other: p.id });
    if (error) return toast(ruError(error));
    $("#search").value = ""; $("#search").blur(); show($("#search-results"), false); show($("#chat-list"));
    await loadChats();
    openChat(chatId, p);
  }

  async function openByUsername(u) {
    const { data } = await sb.from("profiles").select("id, username, name, avatar_url, last_seen").eq("username", u.toLowerCase()).maybeSingle();
    if (data && data.id !== S.me.id) startChatWith(data);
  }

  // ---------- Открытие / закрытие экрана переписки ----------
  function enterChatScreen() {
    if (REC.rec) stopRecording(false);
    if (isMobile() && !document.body.classList.contains("chat-open")) history.pushState({ chat: true }, "");
    document.body.classList.add("chat-open");
    if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
    S.messages = [];
    show($("#chat-placeholder"), false); show($("#chat-view"));
    $("#input").value = ""; autosize(); updateSendBtn();
  }

  async function openChat(chatId, other) {
    enterChatScreen();
    S.current = { kind: "chat", id: chatId, other };
    document.body.classList.remove("in-saved");
    $("#input").placeholder = "Сообщение";
    renderPeer(); renderChats();
    $("#messages").replaceChildren(el("div", "empty", "Загрузка…"));

    S.chatChannel = sb.channel("chat-" + chatId)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user !== S.me.id) startTypingIndicator(chatId);
      })
      .subscribe();

    await reloadMessagesQuiet();
    markRead();
    if (!isTouch()) $("#input").focus();
  }

  async function openSaved() {
    enterChatScreen();
    S.current = { kind: "saved" };
    document.body.classList.add("in-saved");
    $("#input").placeholder = "Заметка для себя";
    renderPeer(); renderChats();
    if (S.saved.missing) { await loadSavedMeta(); }
    if (S.saved.missing) {
      const hint = el("div", "chat-hint");
      hint.append(savedAvatar(72), el("p", null, "Избранное ещё не подключено к базе."),
        el("p", null, "Supabase → SQL Editor → вставь файл supabase/002_saved.sql → Run, затем обнови страницу."));
      $("#messages").replaceChildren(hint);
      return;
    }
    $("#messages").replaceChildren(el("div", "empty", "Загрузка…"));
    await reloadMessagesQuiet();
    if (!isTouch()) $("#input").focus();
  }

  async function reloadMessagesQuiet() {
    if (!S.current) return;
    const cur = S.current;
    const q = cur.kind === "saved"
      ? sb.from("saved_messages").select("*")
      : sb.from("messages").select("*").eq("chat_id", cur.id);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(300);
    if (S.current !== cur) return;
    if (error) {
      if (cur.kind === "saved" && isMissingTable(error)) { S.saved.missing = true; return openSaved(); }
      $("#messages").replaceChildren(el("div", "empty", ruError(error))); return;
    }
    const pending = S.messages.filter((m) => m.pending || m.failed);
    S.messages = data.reverse().concat(pending);
    renderMessages(true);
  }

  function closeChat() {
    if (REC.rec) stopRecording(false);
    document.body.classList.remove("chat-open");
    if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
    $("#input").blur();
    const wasMobile = isMobile();
    const reset = () => {
      if (document.body.classList.contains("chat-open")) return;
      S.current = null; S.messages = [];
      show($("#chat-view"), false); show($("#chat-placeholder"));
      renderChats();
    };
    if (wasMobile) setTimeout(reset, 300); else reset();
  }
  const goBack = () => { if (history.state && history.state.chat) history.back(); else closeChat(); };
  $("#back-btn").addEventListener("click", goBack);
  window.addEventListener("popstate", (e) => {
    const st = e.state || {};
    const sheetEl = $("#sheet");
    if (!sheetEl.classList.contains("hidden")) { show(sheetEl, false); if (st.chat) return; }
    if (!st.chat && document.body.classList.contains("chat-open")) closeChat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#sheet").classList.contains("hidden")) return closeSheet();
    if (e.key === "Escape" && S.current && !$("#profile-dlg").open) goBack();
  });

  // Свайп от левого края — назад (в установленном приложении и на Android; в Safari это делает сам браузер)
  (() => {
    const pane = $("#chat");
    let x0 = 0, y0 = 0, dx = 0, t0 = 0, tracking = false, decided = false;
    pane.addEventListener("touchstart", (e) => {
      if (!isMobile() || !document.body.classList.contains("chat-open")) return;
      if (isIOS && !isStandalone()) return;
      const t = e.touches[0];
      if (t.clientX > 28) return;
      x0 = t.clientX; y0 = t.clientY; dx = 0; t0 = Date.now(); tracking = true; decided = false;
    }, { passive: true });
    pane.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      dx = Math.max(0, t.clientX - x0);
      if (!decided) {
        if (Math.abs(t.clientY - y0) > 12 && Math.abs(t.clientY - y0) > dx) { tracking = false; return; }
        if (dx > 8) { decided = true; document.body.classList.add("dragging"); }
        else return;
      }
      const w = pane.clientWidth;
      pane.style.transform = `translateX(${dx}px)`;
      $("#sidebar").style.transform = `translateX(${-28 + (dx / w) * 28}%)`;
    }, { passive: true });
    const end = () => {
      if (!tracking) return;
      tracking = false;
      document.body.classList.remove("dragging");
      pane.style.transform = ""; $("#sidebar").style.transform = "";
      const fast = dx > 40 && Date.now() - t0 < 250;
      if (decided && (dx > pane.clientWidth * 0.33 || fast)) goBack();
    };
    pane.addEventListener("touchend", end);
    pane.addEventListener("touchcancel", end);
  })();

  // ---------- Шапка переписки ----------
  function renderPeer() {
    if (!S.current) return;
    const st = $("#peer-status");
    if (inSaved()) {
      $("#peer-avatar").replaceChildren(savedAvatar(40));
      $("#peer-name").textContent = "Избранное";
      st.className = "peer-status";
      st.textContent = S.saved.count ? `${S.saved.count} ${plural(S.saved.count, "запись", "записи", "записей")}` : "заметки для себя";
      return;
    }
    const p = S.current.other;
    const live = S.chats.find((c) => c.chat_id === S.current.id);
    if (live) Object.assign(p, { name: live.name, username: live.username, avatar_url: live.avatar_url, last_seen: live.last_seen });
    $("#peer-avatar").replaceChildren(avatar(p, 40, false));
    $("#peer-name").textContent = p.name || p.username;
    if (S.typing.has(S.current.id)) { st.textContent = "печатает…"; st.className = "peer-status typing"; }
    else { st.textContent = statusText(p); st.className = "peer-status" + (isOnline(p) ? " online" : ""); }
  }
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };

  // ---------- Сообщения ----------
  const box = $("#messages");
  const mineOf = (m) => inSaved() || m.sender_id === S.me.id;
  const senderKey = (m) => (inSaved() ? (m.from_name || "me") : m.sender_id);

  function renderMessages(scrollToEnd) {
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    box.replaceChildren();
    if (!S.messages.length) {
      const hint = el("div", "chat-hint");
      if (inSaved()) {
        hint.append(savedAvatar(72));
        const p = el("p"); p.append(el("b", null, "Избранное"));
        hint.append(p,
          el("p", null, "Пиши сюда заметки, ссылки и списки — их видишь только ты, на всех устройствах."),
          el("p", null, isTouch() ? "Чтобы сохранить сообщение из чата, зажми его и выбери «В избранное»."
                                  : "Чтобы сохранить сообщение из чата, нажми на него правой кнопкой мыши → «В избранное»."));
      } else {
        hint.append(el("p", null, "Напиши первое сообщение 👋"));
      }
      box.append(hint);
      return;
    }
    let prevDay = null;
    S.messages.forEach((m, i) => {
      const d = new Date(m.created_at);
      const dk = d.toDateString();
      if (dk !== prevDay) { box.append(el("div", "day", dayLabel(d))); prevDay = dk; }
      const mine = mineOf(m);
      const prev = S.messages[i - 1], next = S.messages[i + 1];
      const nextSame = next && senderKey(next) === senderKey(m) && sameDay(new Date(next.created_at), d) && new Date(next.created_at) - d < 5 * 60e3;
      const prevSame = prev && senderKey(prev) === senderKey(m) && sameDay(new Date(prev.created_at), d);

      const b = el("div", "bubble" + (mine ? " out" : "") + (!nextSame ? (mine ? " tail-out" : " tail-in") : "") +
                         (!prevSame && i > 0 ? " gap" : "") + (m.pending ? " pending" : "") + (m.failed ? " failed" : ""));
      b.dataset.idx = i;
      if (inSaved() && m.from_name) b.append(el("span", "fwd", "↪ " + m.from_name));
      const kind = m.kind || "text";
      if (kind === "image") {
        b.classList.add("media");
        if (!m.text) b.classList.add("no-caption");
        b.append(photoNode(m));
        if (m.text) { const c = el("span", "caption"); richText(c, m.text); b.append(c); }
      } else if (kind === "voice") {
        b.append(voiceNode(m, mine));
      } else if (kind === "call") {
        b.append(callNode(m, mine));
      } else {
        richText(b, m.text);
      }
      const meta = el("span", "meta", m.failed ? "не отправлено" : m.progress != null && m.pending ? m.progress + "%" : timeStr(m.original_at ? new Date(m.original_at) : d));
      if (mine && !inSaved() && !m.failed && kind !== "call") meta.append(el("span", "ticks", m.pending ? "🕓" : m.read_at ? "✓✓" : "✓"));
      b.append(meta);
      box.append(b);
    });
    if (scrollToEnd || nearBottom) box.scrollTop = box.scrollHeight;
    updateDownBtn();
    hydrateMedia();
  }

  function updateDownBtn() {
    show($("#down-btn"), box.scrollHeight - box.scrollTop - box.clientHeight > 400);
  }
  box.addEventListener("scroll", updateDownBtn, { passive: true });
  $("#down-btn").addEventListener("click", () => box.scrollTo({ top: box.scrollHeight, behavior: "smooth" }));

  async function markRead() {
    if (!S.current || inSaved()) return;
    const c = S.chats.find((x) => x.chat_id === S.current.id);
    const hasUnread = S.messages.some((m) => m.sender_id !== S.me.id && !m.read_at);
    if (!hasUnread && !(c && c.unread > 0)) return;
    const { error } = await sb.rpc("mark_read", { c: S.current.id });
    if (!error) loadChatsSoon();
  }

  // ---------- Меню сообщения: долгое нажатие / правый клик ----------
  let press = null;
  box.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".bubble");
    if (!b || e.pointerType === "mouse" || e.target.closest("a")) return;
    press = { b, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      b.classList.remove("pressed");
      if (navigator.vibrate) navigator.vibrate(12);
      openSheet(Number(b.dataset.idx));
      press = null;
    }, 420) };
    b.classList.add("pressed");
  });
  const cancelPress = () => { if (press) { clearTimeout(press.timer); press.b.classList.remove("pressed"); press = null; } };
  box.addEventListener("pointermove", (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); });
  box.addEventListener("pointerup", cancelPress);
  box.addEventListener("pointercancel", cancelPress);
  box.addEventListener("scroll", cancelPress, { passive: true });
  box.addEventListener("contextmenu", (e) => {
    const b = e.target.closest(".bubble");
    if (!b) return;
    e.preventDefault();
    if (!isTouch()) openSheet(Number(b.dataset.idx));
  });

  const sheet = $("#sheet");
  let sheetOpenedAt = 0; // после долгого нажатия палец отпускается над шторкой — этот «клик» игнорируем
  function openSheet(idx) {
    sheetOpenedAt = Date.now();
    const m = S.messages[idx];
    if (!m) return;
    $("#sheet-preview").textContent = m.text || (m.kind === "voice" ? "🎤 Голосовое сообщение" : m.kind === "image" ? "📷 Фото" : m.kind === "call" ? "📞 Звонок" : "");
    const actions = $("#sheet-actions");
    actions.replaceChildren();
    const add = (icon, label, fn, cls) => {
      const btn = el("button", cls || ""); btn.type = "button";
      btn.append(svg(icon), document.createTextNode(label));
      btn.addEventListener("click", () => { if (Date.now() - sheetOpenedAt < 450) return; closeSheet(); fn(); });
      actions.append(btn);
    };
    if (m.text) add(ICON.copy, "Копировать", async () => toast((await copyText(m.text)) ? "Скопировано" : "Не удалось скопировать"));
    if (m.kind === "call" && !inSaved()) add(ICON.retry, "Перезвонить", () => startCall(!!(m.media_meta && m.media_meta.video)));
    if (m.failed) add(ICON.retry, "Отправить снова", () => retry(m));
    if (!m.pending && !m.failed && m.kind !== "call") {
      if (inSaved()) add(ICON.trash, "Удалить из избранного", () => removeSaved(m), "danger");
      else add(ICON.star, "В избранное", () => saveToFavorites(m));
    }
    show(sheet);
    if (isMobile()) history.pushState({ chat: true, sheet: true }, "");
  }
  function closeSheet() {
    if (sheet.classList.contains("hidden")) return;
    show(sheet, false);
    if (history.state && history.state.sheet) history.back();
  }
  const closeSheetSafe = () => { if (Date.now() - sheetOpenedAt >= 450) closeSheet(); };
  sheet.querySelector(".sheet-backdrop").addEventListener("click", closeSheetSafe);
  sheet.querySelector(".sheet-cancel").addEventListener("click", closeSheetSafe);

  // ---------- Избранное ----------
  async function saveToFavorites(m) {
    if (S.saved.missing) return toast("Сначала выполни supabase/002_saved.sql в Supabase");
    const fromMe = m.sender_id === S.me.id;
    const other = S.current && S.current.other;
    const fromName = fromMe ? (S.me.name || S.me.username) : (other && (other.name || other.username)) || null;
    const row = { text: m.text || "", from_user: m.sender_id, from_name: fromName, original_at: m.created_at };
    if (m.kind && m.kind !== "text") Object.assign(row, { kind: m.kind, media_path: m.media_path, media_meta: m.media_meta });
    const { error } = await sb.from("saved_messages").insert(row);
    if (error) {
      if (isMissingTable(error)) { S.saved.missing = true; renderChats(); }
      return toast(ruError(error));
    }
    toast("Сохранено в Избранное ★");
    loadSavedMetaSoon();
  }

  async function removeSaved(m) {
    const i = S.messages.indexOf(m);
    if (i >= 0) { S.messages.splice(i, 1); renderMessages(false); }
    const { error } = await sb.from("saved_messages").delete().eq("id", m.id);
    if (error) { toast(ruError(error)); reloadMessagesQuiet(); return; }
    loadSavedMetaSoon();
  }

  // =====================================================================
  //  Фото и голосовые
  // =====================================================================
  const BUCKET = "chat-media";
  const urlCache = new Map(); // path -> { url, exp }
  const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function cachedUrl(path) { const c = urlCache.get(path); return c && c.exp > Date.now() ? c.url : null; }

  // подписанные ссылки на приватные файлы — пачкой для всего видимого чата
  let hydrating = false;
  async function hydrateMedia() {
    const nodes = [...box.querySelectorAll("[data-path]")];
    const need = [...new Set(nodes.map((n) => n.dataset.path).filter((p) => !cachedUrl(p)))];
    if (need.length && !hydrating) {
      hydrating = true;
      try {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, 3600);
        if (!error && data) for (const r of data) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, exp: Date.now() + 50 * 60e3 });
      } finally { hydrating = false; }
    }
    for (const n of box.querySelectorAll("img[data-path]")) {
      const u = cachedUrl(n.dataset.path);
      if (u && n.getAttribute("src") !== u) { n.onload = () => n.classList.add("ready"); n.src = u; }
    }
  }

  function photoNode(m) {
    const meta = m.media_meta || {};
    const wrap = el("div", "photo");
    if (meta.w && meta.h) wrap.style.aspectRatio = `${meta.w} / ${meta.h}`; else wrap.style.aspectRatio = "4 / 3";
    const img = el("img"); img.alt = "Фото"; img.decoding = "async";
    if (m.localUrl) { img.src = m.localUrl; img.classList.add("ready"); }
    else if (m.media_path) img.dataset.path = m.media_path;
    wrap.append(img);
    wrap.addEventListener("click", (e) => { e.stopPropagation(); openViewer(m); });
    return wrap;
  }

  function openViewer(m) {
    const url = m.localUrl || cachedUrl(m.media_path);
    if (!url) return toast("Фото ещё загружается…");
    $("#viewer-img").src = url;
    $("#viewer-open").href = url;
    show($("#viewer"));
    if (isMobile()) history.pushState({ chat: true, viewer: true }, "");
  }
  function closeViewer() {
    if ($("#viewer").classList.contains("hidden")) return;
    show($("#viewer"), false);
    if (history.state && history.state.viewer) history.back();
  }
  $("#viewer-close").addEventListener("click", closeViewer);
  $("#viewer-img").addEventListener("click", closeViewer);
  window.addEventListener("popstate", (e) => { if (!(e.state && e.state.viewer)) show($("#viewer"), false); });

  // ---- голосовые: плеер с «волной» ----
  const player = new Audio();
  player.preload = "auto";
  let playingPath = null;
  function bars(path, n = 30) {
    let h = 2166136261; const out = [];
    for (const ch of path || "x") h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    for (let i = 0; i < n; i++) { h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0; out.push(0.25 + ((h >>> 8) % 1000) / 1333); }
    return out;
  }
  function voiceNode(m, mine) {
    const dur = (m.media_meta && m.media_meta.duration) || 0;
    const key = m.media_path || m.localUrl;
    const v = el("div", "voice"); v.dataset.voice = key;
    const btn = el("button", "vplay"); btn.type = "button";
    btn.append(svg(playingPath === key && !player.paused ? PAUSE : PLAY));
    const wave = el("div", "vwave");
    bars(key).forEach((h) => { const i = el("i"); i.style.height = Math.round(h * 100) + "%"; wave.append(i); });
    const t = el("span", "vtime", fmtDur(dur));
    v.append(btn, wave, t);
    btn.addEventListener("click", (e) => { e.stopPropagation(); togglePlay(m); });
    wave.addEventListener("click", (e) => {
      e.stopPropagation();
      if (playingPath !== key) return togglePlay(m);
      const r = wave.getBoundingClientRect();
      const d = isFinite(player.duration) ? player.duration : dur;
      player.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d;
    });
    if (playingPath === key) paintVoice();
    return v;
  }
  const PLAY = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';

  async function togglePlay(m) {
    const key = m.media_path || m.localUrl;
    if (playingPath === key) { player.paused ? player.play().catch(() => {}) : player.pause(); return; }
    let url = m.localUrl || cachedUrl(m.media_path);
    if (!url && m.media_path) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(m.media_path, 3600);
      if (error) return toast(ruError(error));
      url = data.signedUrl; urlCache.set(m.media_path, { url, exp: Date.now() + 50 * 60e3 });
    }
    playingPath = key;
    player.dataset.dur = (m.media_meta && m.media_meta.duration) || 0;
    player.src = url;
    player.play().catch(() => toast("Не удалось воспроизвести — формат не поддерживается этим браузером"));
    paintVoice();
  }
  function paintVoice() {
    for (const v of box.querySelectorAll("[data-voice]")) {
      const active = v.dataset.voice === playingPath;
      const btn = v.querySelector(".vplay");
      const want = active && !player.paused ? "pause" : "play";
      if (btn.dataset.state !== want) { btn.dataset.state = want; btn.replaceChildren(svg(want === "pause" ? PAUSE : PLAY)); }
      const d = isFinite(player.duration) && player.duration > 0 ? player.duration : Number(player.dataset.dur) || 0;
      const frac = active && d ? player.currentTime / d : 0;
      const is = v.querySelectorAll(".vwave i");
      is.forEach((i, k) => i.classList.toggle("on", active && k / is.length < frac));
      if (active) v.querySelector(".vtime").textContent = fmtDur(player.paused && !player.currentTime ? d : player.currentTime);
    }
  }
  player.addEventListener("timeupdate", paintVoice);
  player.addEventListener("play", paintVoice);
  player.addEventListener("pause", paintVoice);
  player.addEventListener("ended", () => { player.currentTime = 0; paintVoice(); playingPath = null; paintVoice(); });

  // ---- запись о звонке в чате ----
  function callNode(m, mine) {
    const meta = m.media_meta || {};
    const missed = ["missed", "declined", "busy", "failed"].includes(meta.status);
    const wrap = el("div", "callrec" + (missed ? " missed" : ""));
    const ic = el("span", "cic"); ic.append(svg(meta.video ? ICON.video : ICON.phone)); wrap.append(ic);
    const txt = el("div");
    const title = missed ? (mine ? (meta.status === "declined" ? "Звонок отклонён" : meta.status === "busy" ? "Занято" : meta.status === "failed" ? "Не удалось соединиться" : "Нет ответа") : "Пропущенный звонок")
                         : (mine ? "Исходящий" : "Входящий") + (meta.video ? " видеозвонок" : " звонок");
    txt.append(el("b", null, title), el("small", null, missed ? "Нажми, чтобы перезвонить" : fmtDur(meta.duration)));
    wrap.append(txt);
    wrap.addEventListener("click", (e) => { e.stopPropagation(); startCall(!!meta.video); });
    return wrap;
  }

  // ---- отправка файлов ----
  async function sendMedia(kind, blob, meta, caption = "") {
    const cur = S.current;
    if (!cur) return;
    if (cur.kind === "saved" && S.saved.missing) return toast("Сначала выполни supabase/002_saved.sql в Supabase");
    const type = (blob.type || "").split(";")[0] || (kind === "image" ? "image/jpeg" : "audio/webm");
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
                  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac" }[type] || "bin";
    const path = (cur.kind === "saved" ? `u/${S.me.id}` : cur.id) + `/${uid()}.${ext}`;
    const localUrl = URL.createObjectURL(blob);
    const temp = { id: "tmp-" + uid(), chat_id: cur.id, sender_id: S.me.id, text: caption, kind, media_path: path,
                   media_meta: meta, created_at: new Date().toISOString(), pending: true, progress: 0, localUrl };
    S.messages.push(temp);
    renderMessages(true);
    urlCache.set(path, { url: localUrl, exp: Date.now() + 864e5 });

    const fail = (e) => { temp.pending = false; temp.failed = true; temp.retry = () => { S.messages.splice(S.messages.indexOf(temp), 1); sendMedia(kind, blob, meta, caption); }; renderMessages(false); toast(ruError(e)); };
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: "31536000" });
    if (up.error) return fail(up.error);
    temp.progress = 100;
    const row = { text: caption, kind, media_path: path, media_meta: meta };
    const req = cur.kind === "saved"
      ? sb.from("saved_messages").insert(row).select().single()
      : sb.from("messages").insert({ ...row, chat_id: cur.id }).select().single();
    const { data, error } = await req;
    if (cur.kind === "saved") loadSavedMetaSoon(); else loadChatsSoon();
    if (error) return fail(error);
    if (S.current !== cur) return;
    const i = S.messages.indexOf(temp);
    if (i >= 0) {
      if (S.messages.some((x) => x.id === data.id)) S.messages.splice(i, 1);
      else S.messages[i] = { ...data, localUrl };
    }
    renderMessages(false);
  }

  // фото: сжимаем до 1600px, чтобы экономить место и трафик
  function compressImage(file, max = 1600) {
    return new Promise((resolve, reject) => {
      if (file.type === "image/gif" && file.size < 5e6) {
        const img = new Image();
        img.onload = () => { resolve({ blob: file, w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(img.src); };
        img.onerror = () => reject(new Error("Не удалось открыть картинку"));
        img.src = URL.createObjectURL(file);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error("Не удалось обработать фото"))), "image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error("Этот формат фото не поддерживается (попробуй JPG или PNG)"));
      img.src = URL.createObjectURL(file);
    });
  }

  $("#attach-btn").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", async (e) => {
    const files = [...e.target.files].slice(0, 10); e.target.value = "";
    if (!files.length || !S.current) return;
    const caption = input.value.trim();
    input.value = ""; autosize(); updateSendBtn();
    for (let k = 0; k < files.length; k++) {
      try {
        const { blob, w, h } = await compressImage(files[k]);
        await sendMedia("image", blob, { w, h, size: blob.size }, k === 0 ? caption : "");
      } catch (err) { toast(ruError(err)); }
    }
  });
  // вставка картинки из буфера (Ctrl+V) на компьютере
  $("#input").addEventListener("paste", async (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
    if (!f) return;
    e.preventDefault();
    try { const { blob, w, h } = await compressImage(f); sendMedia("image", blob, { w, h, size: blob.size }); }
    catch (err) { toast(ruError(err)); }
  });

  // ---- запись голосовых ----
  const REC = { rec: null, stream: null, chunks: [], t0: 0, timer: null, raf: 0, ctx: null, cancelled: false };
  function pickMime() {
    const list = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus", "audio/aac"];
    return list.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
  }
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Запись голоса не поддерживается этим браузером");
    if (REC.rec) return;
    try {
      REC.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      return toast(e.name === "NotAllowedError" ? "Нет доступа к микрофону — разреши его в настройках браузера" : "Микрофон недоступен");
    }
    const mime = pickMime();
    REC.rec = new MediaRecorder(REC.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    REC.chunks = []; REC.cancelled = false;
    REC.rec.ondataavailable = (e) => { if (e.data && e.data.size) REC.chunks.push(e.data); };
    REC.rec.onstop = onRecStop;
    REC.rec.start(250);
    REC.t0 = Date.now();
    show($("#composer"), false); show($("#recorder"));
    $("#rec-time").textContent = "0:00";
    REC.timer = setInterval(() => {
      const s = (Date.now() - REC.t0) / 1000;
      $("#rec-time").textContent = fmtDur(s);
      if (s >= 300) stopRecording(true); // не больше 5 минут
    }, 250);
    drawLevel();
    if (navigator.vibrate) navigator.vibrate(10);
  }
  function drawLevel() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      REC.ctx = new AC();
      const src = REC.ctx.createMediaStreamSource(REC.stream);
      const an = REC.ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const cv = $("#rec-level"), g = cv.getContext("2d");
      const hist = [];
      const color = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#b5755a";
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        hist.push(Math.min(1, peak / 64)); if (hist.length > 60) hist.shift();
        g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = color;
        const bw = cv.width / 60;
        hist.forEach((v, i) => { const h = Math.max(3, v * cv.height); g.fillRect(i * bw + 1, (cv.height - h) / 2, bw - 2, h); });
        REC.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (_) { /* индикатор необязателен */ }
  }
  function stopRecording(send) {
    if (!REC.rec) return;
    REC.cancelled = !send;
    REC.duration = (Date.now() - REC.t0) / 1000;
    if (REC.rec.state !== "inactive") REC.rec.stop(); else onRecStop();
  }
  function onRecStop() {
    clearInterval(REC.timer); cancelAnimationFrame(REC.raf);
    try { REC.ctx && REC.ctx.close(); } catch (_) {}
    REC.stream && REC.stream.getTracks().forEach((t) => t.stop());
    const type = (REC.rec && REC.rec.mimeType) || pickMime() || "audio/webm";
    const blob = new Blob(REC.chunks, { type: type.split(";")[0] });
    const dur = REC.duration || 0;
    const cancelled = REC.cancelled;
    REC.rec = null; REC.stream = null; REC.chunks = []; REC.ctx = null;
    show($("#recorder"), false); show($("#composer"));
    if (cancelled) return;
    if (dur < 0.7 || blob.size < 1000) return toast("Слишком коротко — держи запись хотя бы секунду");
    sendMedia("voice", blob, { duration: Math.round(dur * 10) / 10, mime: blob.type });
  }
  $("#mic-btn").addEventListener("click", startRecording);
  $("#rec-cancel").addEventListener("click", () => stopRecording(false));
  $("#rec-send").addEventListener("click", () => stopRecording(true));
  // если ушли из чата во время записи — запись отменяется
  const _leave = () => { if (REC.rec) stopRecording(false); };
  window.addEventListener("pagehide", _leave);

  // =====================================================================
  //  Звонки (WebRTC). Сигналы (offer/answer/ICE) идут через Supabase Realtime,
  //  а сам звук и видео — напрямую между устройствами.
  // =====================================================================
  const ICE_SERVERS = (cfg.ICE_SERVERS && cfg.ICE_SERVERS.length) ? cfg.ICE_SERVERS : [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const CI = {
    hang: '<svg viewBox="0 0 24 24"><path d="M3 14.5c5-5 13-5 18 0l-1.8 2.6-3.7-1.2-.5-2.6a10 10 0 00-6 0l-.5 2.6-3.7 1.2z" fill="currentColor"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 3.5h3.2l1.6 4.3-2.2 1.4a11.5 11.5 0 006.2 6.2l1.4-2.2 4.3 1.6V18a2.5 2.5 0 01-2.5 2.5A16.5 16.5 0 012.5 6 2.5 2.5 0 015 3.5z" fill="currentColor"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    micOff: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M4 4l16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="currentColor"/><path d="M15.5 10.5l5-3v9l-5-3z" fill="currentColor"/></svg>',
    camOff: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 10.5l5-3v9l-5-3zM3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    flip: '<svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 0114-3l2 2M20 15a8 8 0 01-14 3l-2-2M20 4v4h-4M4 20v-4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let C = null;              // текущий звонок
  let myCallCh = null;       // мой канал: сюда приходят сигналы для меня
  const peerChans = new Map();

  function subscribeCalls() {
    myCallCh = sb.channel("call-" + S.me.id, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload).catch((e) => console.warn(e)))
      .subscribe();
    S.channels.push(myCallCh);
  }
  function peerChannel(peerId) {
    const have = peerChans.get(peerId);
    if (have) return have.ready;
    const ch = sb.channel("call-" + peerId, { config: { broadcast: { self: false } } });
    const ready = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Нет связи с сервером")), 10000);
      ch.subscribe((st) => {
        if (st === "SUBSCRIBED") { clearTimeout(t); resolve(ch); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") { clearTimeout(t); reject(new Error("Нет связи с сервером")); }
      });
    });
    peerChans.set(peerId, { ch, ready });
    ready.catch(() => dropPeerChannel(peerId));
    return ready;
  }
  function dropPeerChannel(peerId) {
    const p = peerChans.get(peerId);
    if (p) { peerChans.delete(peerId); sb.removeChannel(p.ch); }
  }
  async function signal(peerId, payload) {
    const ch = await peerChannel(peerId);
    return ch.send({ type: "broadcast", event: "signal", payload: { ...payload, from: S.me.id, to: peerId } });
  }
  // сообщить моим другим устройствам (например, «ответил на телефоне»)
  function signalMyDevices(payload) {
    if (myCallCh) myCallCh.send({ type: "broadcast", event: "signal", payload: { ...payload, from: S.me.id, to: S.me.id, mine: true } });
  }

  const newCall = (o) => ({ ...o, pc: null, local: null, remote: new MediaStream(), pendingIce: [], connectedAt: 0, muted: false, camOff: false, facing: "user" });

  async function getMedia(video, facing = "user") {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  }

  function createPC() {
    const c = C;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    c.pc = pc;
    c.local.getTracks().forEach((t) => pc.addTrack(t, c.local));
    if (c.video && !c.local.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });
    pc.onicecandidate = (e) => { if (e.candidate && C === c) signal(c.peer.id, { type: "ice", callId: c.callId, candidate: e.candidate.toJSON() }).catch(() => {}); };
    pc.ontrack = (e) => {
      if (C !== c) return;
      if (!c.remote.getTracks().includes(e.track)) c.remote.addTrack(e.track);
      e.track.onunmute = attachRemote;
      attachRemote();
    };
    pc.onconnectionstatechange = () => {
      if (C !== c) return;
      const st = pc.connectionState;
      if (st === "connected") {
        clearTimeout(c.dcTimer);
        if (!c.connectedAt) {
          c.connectedAt = Date.now();
          clearTimeout(c.timeout); clearInterval(c.resend); stopTone();
          $("#call-avatar .avatar")?.classList.remove("ringing");
          c.tick = setInterval(() => { if (C === c) setCallStatus(fmtDur((Date.now() - c.connectedAt) / 1000)); }, 1000);
          setCallStatus("0:00");
          renderCallActions();
        }
      } else if (st === "disconnected") {
        setCallStatus("Связь прервалась, переподключаемся…");
        clearTimeout(c.dcTimer);
        c.dcTimer = setTimeout(() => { if (C === c && pc.connectionState !== "connected") hangup(); }, 12000);
      } else if (st === "failed") {
        signal(c.peer.id, { type: "end", callId: c.callId }).catch(() => {});
        endCall(c.connectedAt ? "ended" : "failed", c.connectedAt ? "Связь потеряна" : "Не удалось соединиться. Возможно, нужен TURN-сервер — см. README");
      }
    };
  }
  async function flushIce() {
    const c = C;
    if (!c || !c.pc || !c.pc.remoteDescription) return;
    const list = c.pendingIce.splice(0);
    for (const cand of list) { try { await c.pc.addIceCandidate(cand); } catch (_) {} }
  }

  // ---- исходящий ----
  async function startCall(video) {
    if (C) return toast("Уже идёт звонок");
    if (!S.current || S.current.kind !== "chat") return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) return toast("Звонки не поддерживаются этим браузером");
    const c = C = newCall({ role: "caller", peer: { ...S.current.other }, chatId: S.current.id, video: !!video, callId: uid() });
    showCallUI(video ? "Видеовызов…" : "Вызов…");
    try { c.local = await getMedia(video); }
    catch (e) {
      return endCall(null, e.name === "NotAllowedError" ? "Нет доступа к микрофону" + (video ? " или камере" : "") + " — разреши в настройках браузера" : "Микрофон" + (video ? " или камера" : "") + " недоступны");
    }
    if (C !== c) { c.local.getTracks().forEach((t) => t.stop()); return; }
    attachLocal();
    createPC();
    await c.pc.setLocalDescription(await c.pc.createOffer());
    const ld = c.pc.localDescription;
    const offer = { type: "offer", callId: c.callId, chatId: c.chatId, video: c.video, sdp: { type: ld.type, sdp: ld.sdp } };
    try { await signal(c.peer.id, offer); }
    catch (e) { return endCall("failed", ruError(e)); }
    playTone("ringback");
    // повторяем вызов, пока не ответят (вдруг собеседник открыл приложение уже во время звонка)
    c.resend = setInterval(() => { if (C === c && !c.answered) signal(c.peer.id, offer).catch(() => {}); }, 4000);
    c.timeout = setTimeout(() => {
      if (C === c && !c.connectedAt) { signal(c.peer.id, { type: "end", callId: c.callId }).catch(() => {}); endCall("missed", "Нет ответа"); }
    }, 45000);
  }

  // ---- сигналы ----
  async function onSignal(p) {
    if (!p || !S.me) return;
    if (p.mine) { // от моего другого устройства
      if (C && C.callId === p.callId && C.role === "callee" && !C.accepted && (p.type === "answered-here" || p.type === "declined-here"))
        endCall(null, p.type === "answered-here" ? "Отвечено на другом устройстве" : null);
      return;
    }
    if (p.to !== S.me.id) return;
    const c = C;
    switch (p.type) {
      case "offer": {
        if (c && c.callId === p.callId) return;              // повтор того же вызова
        if (c) { signal(p.from, { type: "busy", callId: p.callId }).catch(() => {}); return; }
        let chat = S.chats.find((x) => x.chat_id === p.chatId && x.other_id === p.from);
        if (!chat) { await loadChats(); chat = S.chats.find((x) => x.chat_id === p.chatId && x.other_id === p.from); }
        if (!chat || C) return;                                // звонить могут только собеседники
        const nc = C = newCall({ role: "callee", peer: { id: p.from, name: chat.name, username: chat.username, avatar_url: chat.avatar_url },
                                  chatId: p.chatId, video: !!p.video, callId: p.callId });
        nc.offer = p.sdp;
        showCallUI(p.video ? "Входящий видеозвонок" : "Входящий звонок");
        playTone("ring");
        callNotification(nc);
        nc.timeout = setTimeout(() => { if (C === nc && !nc.accepted) endCall(null, "Пропущенный звонок"); }, 50000);
        break;
      }
      case "answer":
        if (c && c.callId === p.callId && c.role === "caller" && !c.answered) {
          c.answered = true; clearInterval(c.resend); stopTone();
          setCallStatus("Соединение…");
          await c.pc.setRemoteDescription(p.sdp);
          flushIce();
        }
        break;
      case "ice":
        if (c && c.callId === p.callId && p.candidate) {
          if (c.pc && c.pc.remoteDescription) c.pc.addIceCandidate(p.candidate).catch(() => {});
          else c.pendingIce.push(p.candidate);
        }
        break;
      case "decline":
        if (c && c.callId === p.callId) endCall("declined", "Звонок отклонён");
        break;
      case "busy":
        if (c && c.callId === p.callId) endCall("busy", "Занято — собеседник в другом звонке");
        break;
      case "end":
        if (c && c.callId === p.callId) endCall(c.connectedAt ? "ended" : (c.role === "caller" ? "missed" : null), c.connectedAt ? "Звонок завершён" : c.accepted ? "Звонок завершён" : "Пропущенный звонок");
        break;
    }
  }

  // ---- входящий: принять / отклонить ----
  async function acceptCall() {
    const c = C;
    if (!c || c.role !== "callee" || c.accepted) return;
    c.accepted = true; clearTimeout(c.timeout); stopTone();
    signalMyDevices({ type: "answered-here", callId: c.callId });
    setCallStatus("Соединение…"); renderCallActions();
    $("#call-avatar .avatar")?.classList.remove("ringing");
    try { c.local = await getMedia(c.video); }
    catch (e) {
      try { c.local = await getMedia(false); c.video = c.video && false; } // нет камеры — хотя бы голосом
      catch (_) { signal(c.peer.id, { type: "decline", callId: c.callId }).catch(() => {}); return endCall(null, "Нет доступа к микрофону — разреши его в настройках браузера"); }
    }
    if (C !== c) { c.local.getTracks().forEach((t) => t.stop()); return; }
    attachLocal();
    createPC();
    await c.pc.setRemoteDescription(c.offer);
    await flushIce();
    await c.pc.setLocalDescription(await c.pc.createAnswer());
    const ld = c.pc.localDescription;
    await signal(c.peer.id, { type: "answer", callId: c.callId, sdp: { type: ld.type, sdp: ld.sdp } });
  }
  function declineCall() {
    const c = C;
    if (!c) return;
    signal(c.peer.id, { type: "decline", callId: c.callId }).catch(() => {});
    signalMyDevices({ type: "declined-here", callId: c.callId });
    endCall(null, null);
  }
  function hangup() {
    const c = C;
    if (!c) return;
    signal(c.peer.id, { type: "end", callId: c.callId }).catch(() => {});
    endCall(c.connectedAt ? "ended" : (c.role === "caller" ? "missed" : null), null);
  }

  function endCall(status, msg) {
    const c = C;
    if (!c) return;
    C = null;
    clearTimeout(c.timeout); clearInterval(c.resend); clearInterval(c.tick); clearTimeout(c.dcTimer);
    stopTone();
    try { c.pc && c.pc.close(); } catch (_) {}
    c.local && c.local.getTracks().forEach((t) => t.stop());
    setTimeout(() => { if (!C || C.peer.id !== c.peer.id) dropPeerChannel(c.peer.id); }, 2000);
    // запись о звонке в чате пишет тот, кто звонил
    if (c.role === "caller" && status) {
      const duration = c.connectedAt ? Math.round((Date.now() - c.connectedAt) / 1000) : 0;
      sb.from("messages").insert({ chat_id: c.chatId, kind: "call", text: "", media_meta: { video: c.video, status, duration } })
        .then(({ error }) => { if (error) console.warn(error); loadChatsSoon(); });
    }
    if (msg) {
      setCallStatus(msg);
      $("#call-actions").replaceChildren();
      setTimeout(() => { if (!C) hideCallUI(); }, 1600);
    } else hideCallUI();
  }

  // ---- экран звонка ----
  function showCallUI(status) {
    const c = C;
    const call = $("#call");
    const av = avatar(c.peer, 128); av.classList.add("ringing");
    $("#call-avatar").replaceChildren(av);
    $("#call-name").textContent = c.peer.name || c.peer.username || "";
    call.classList.remove("has-video");
    show($("#remote-video"), false); show($("#local-video"), false);
    setCallStatus(status);
    renderCallActions();
    show(call);
  }
  function hideCallUI() {
    show($("#call"), false);
    for (const id of ["#remote-video", "#local-video", "#remote-audio"]) { const m = $(id); m.srcObject = null; }
  }
  const setCallStatus = (t) => { $("#call-status").textContent = t; };
  function attachLocal() {
    const c = C;
    if (!c || !c.video || !c.local.getVideoTracks().length) return;
    const lv = $("#local-video"); lv.srcObject = c.local; show(lv); lv.play().catch(() => {});
  }
  function attachRemote() {
    const c = C;
    if (!c) return;
    const ra = $("#remote-audio");
    if (ra.srcObject !== c.remote) ra.srcObject = c.remote;
    ra.play().catch(() => {});
    const vt = c.remote.getVideoTracks().find((t) => t.readyState === "live");
    if (vt) {
      const rv = $("#remote-video"); rv.muted = true;
      if (rv.srcObject !== c.remote) rv.srcObject = c.remote;
      show(rv); $("#call").classList.add("has-video"); rv.play().catch(() => {});
    }
  }
  function cact(icon, label, cls, fn) {
    const b = el("button", "cact " + (cls || "")); b.type = "button";
    const ci = el("span", "ci"); ci.append(svg(icon)); b.append(ci, document.createTextNode(label));
    b.addEventListener("click", fn);
    return b;
  }
  function renderCallActions() {
    const c = C, box = $("#call-actions");
    if (!c) return box.replaceChildren();
    if (c.role === "callee" && !c.accepted) {
      return box.replaceChildren(
        cact(CI.hang, "Отклонить", "red", declineCall),
        cact(c.video ? CI.cam : CI.phone, "Принять", "green", acceptCall));
    }
    const btns = [cact(c.muted ? CI.micOff : CI.mic, c.muted ? "Микрофон выкл." : "Микрофон", c.muted ? "on" : "", () => {
      c.muted = !c.muted; c.local?.getAudioTracks().forEach((t) => (t.enabled = !c.muted)); renderCallActions();
    })];
    if (c.video) {
      btns.push(cact(c.camOff ? CI.camOff : CI.cam, c.camOff ? "Камера выкл." : "Камера", c.camOff ? "on" : "", () => {
        c.camOff = !c.camOff; c.local?.getVideoTracks().forEach((t) => (t.enabled = !c.camOff));
        show($("#local-video"), !c.camOff); renderCallActions();
      }));
      if (isTouch()) btns.push(cact(CI.flip, "Повернуть", "", flipCamera));
    }
    btns.push(cact(CI.hang, "Завершить", "red", hangup));
    box.replaceChildren(...btns);
  }
  async function flipCamera() {
    const c = C;
    if (!c || !c.pc || !c.local) return;
    c.facing = c.facing === "user" ? "environment" : "user";
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: c.facing } });
      const nt = s.getVideoTracks()[0];
      const sender = c.pc.getSenders().find((x) => x.track && x.track.kind === "video");
      if (sender) await sender.replaceTrack(nt);
      c.local.getVideoTracks().forEach((t) => { t.stop(); c.local.removeTrack(t); });
      c.local.addTrack(nt);
      $("#local-video").style.transform = c.facing === "user" ? "" : "none";
      attachLocal();
    } catch (_) { toast("Не удалось переключить камеру"); }
  }

  // ---- звук гудков без файлов (WebAudio) ----
  let toneCtx = null, toneTimer = null;
  function beep(freqs, start, dur, vol = 0.12) {
    const g = toneCtx.createGain(); g.gain.value = 0; g.connect(toneCtx.destination);
    const t0 = toneCtx.currentTime + start;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.setValueAtTime(vol, t0 + dur - 0.03); g.gain.linearRampToValueAtTime(0, t0 + dur);
    for (const f of freqs) { const o = toneCtx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t0); o.stop(t0 + dur); }
  }
  function playTone(kind) {
    stopTone();
    try {
      toneCtx = toneCtx || new (window.AudioContext || window.webkitAudioContext)();
      toneCtx.resume && toneCtx.resume();
      const pattern = kind === "ring"
        ? () => { beep([659, 880], 0, 0.35); beep([784, 1047], 0.4, 0.35); beep([659, 880], 1.0, 0.35); beep([784, 1047], 1.4, 0.35); }
        : () => beep([425], 0, 1.0, 0.08);   // длинный гудок, как в телефоне
      pattern();
      toneTimer = setInterval(pattern, kind === "ring" ? 3000 : 4000);
    } catch (_) {}
    if (kind === "ring" && navigator.vibrate) {
      navigator.vibrate([500, 300, 500]);
      const vib = setInterval(() => (toneTimer ? navigator.vibrate([500, 300, 500]) : clearInterval(vib)), 3000);
    }
  }
  function stopTone() {
    clearInterval(toneTimer); toneTimer = null;
    if (navigator.vibrate) navigator.vibrate(0);
  }
  async function callNotification(c) {
    if (document.visibilityState === "visible") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opts = { body: c.video ? "Входящий видеозвонок" : "Входящий звонок", icon: "icons/icon-192.png", tag: "call", renotify: true, requireInteraction: true };
    try { const reg = await navigator.serviceWorker?.getRegistration(); reg ? reg.showNotification(c.peer.name || c.peer.username, opts) : new Notification(c.peer.name || c.peer.username, opts); } catch (_) {}
  }

  $("#call-audio-btn").addEventListener("click", () => startCall(false));
  $("#call-video-btn").addEventListener("click", () => startCall(true));
  window.addEventListener("pagehide", () => { if (C) hangup(); });

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
    if (inSaved() || !S.chatChannel || Date.now() - lastTypingSent < 2500) return;
    lastTypingSent = Date.now();
    S.chatChannel.send({ type: "broadcast", event: "typing", payload: { user: S.me.id } });
  }

  // ---------- Отправка ----------
  const input = $("#input");
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
  function updateSendBtn() {
    const has = !!input.value.trim();
    show($("#send-btn"), has); show($("#mic-btn"), !has);
  }
  input.addEventListener("input", () => { autosize(); updateSendBtn(); if (input.value.trim()) sendTyping(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !isTouch() && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
  });
  input.addEventListener("focus", () => setTimeout(() => { box.scrollTop = box.scrollHeight; }, 300));
  // не даём кнопке «Отправить» забирать фокус — клавиатура на телефоне не закрывается
  $("#send-btn").addEventListener("pointerdown", (e) => { if (document.activeElement === input) e.preventDefault(); });

  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !S.current) return;
    if (inSaved() && S.saved.missing) return toast("Сначала выполни supabase/002_saved.sql в Supabase");
    input.value = ""; autosize(); updateSendBtn();
    send(text);
  });

  async function send(text, temp) {
    const cur = S.current;
    const saved = cur.kind === "saved";
    temp = temp || { id: "tmp-" + Math.random().toString(36).slice(2), chat_id: cur.id, sender_id: S.me.id, text, created_at: new Date().toISOString() };
    temp.pending = true; temp.failed = false; temp.ctx = cur.kind;
    if (!S.messages.includes(temp)) S.messages.push(temp);
    renderMessages(true);
    const req = saved
      ? sb.from("saved_messages").insert({ text }).select().single()
      : sb.from("messages").insert({ chat_id: cur.id, text }).select().single();
    const { data, error } = await req;
    if (saved) loadSavedMetaSoon(); else loadChatsSoon();
    if (S.current !== cur) return;
    const i = S.messages.indexOf(temp);
    if (error) {
      temp.pending = false; temp.failed = true;
      toast(ruError(error));
    } else if (i >= 0) {
      if (S.messages.some((x) => x.id === data.id)) S.messages.splice(i, 1);
      else S.messages[i] = data;
    }
    renderMessages(true);
  }
  function retry(m) {
    if (m.retry) return m.retry();
    if (!S.current || m.ctx !== S.current.kind) return;
    if (m.ctx === "chat" && m.chat_id !== S.current.id) return;
    send(m.text, m);
  }

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
    nb.disabled = false; nb.textContent = "Включить уведомления";
    if (!("Notification" in window)) { nb.disabled = true; nb.textContent = isIOS ? "Уведомления — после установки на экран «Домой»" : "Уведомления недоступны в этом браузере"; }
    else if (Notification.permission === "granted") { nb.disabled = true; nb.textContent = "Уведомления включены"; }
    else if (Notification.permission === "denied") { nb.disabled = true; nb.textContent = "Уведомления запрещены в настройках браузера"; }
    $("#install-hint").textContent = isStandalone() ? "" :
      isIOS ? "Совет: в Safari нажми «Поделиться» → «На экран Домой», чтобы Йетя открывалась как приложение."
            : "Совет: в меню браузера выбери «Установить приложение» или «Добавить на главный экран».";
    dlg.showModal();
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // тап по фону закрывает

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
      const up = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { data, error } = await sb.from("profiles").update({ avatar_url: url }).eq("id", S.me.id).select().single();
      if (error) throw error;
      S.me = { ...S.me, ...data }; renderMe();
      $("#profile-avatar").replaceChildren(avatar(S.me, 88));
      profileMsg("Фото обновлено ✓");
    } catch (err) { profileMsg(ruError(err), true); }
  });

  function shrinkImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        const side = Math.round(Math.min(max, s));
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
