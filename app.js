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
        const pendingIdx = S.messages.findIndex((x) => x.pending && x.sender_id === m.sender_id && x.text === m.text);
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
      const pendingIdx = S.messages.findIndex((x) => x.pending && x.text === m.text);
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
      richText(b, m.text);
      const meta = el("span", "meta", m.failed ? "не отправлено" : timeStr(m.original_at ? new Date(m.original_at) : d));
      if (mine && !inSaved() && !m.failed) meta.append(el("span", "ticks", m.pending ? "🕓" : m.read_at ? "✓✓" : "✓"));
      b.append(meta);
      box.append(b);
    });
    if (scrollToEnd || nearBottom) box.scrollTop = box.scrollHeight;
    updateDownBtn();
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
    $("#sheet-preview").textContent = m.text;
    const actions = $("#sheet-actions");
    actions.replaceChildren();
    const add = (icon, label, fn, cls) => {
      const btn = el("button", cls || ""); btn.type = "button";
      btn.append(svg(icon), document.createTextNode(label));
      btn.addEventListener("click", () => { if (Date.now() - sheetOpenedAt < 450) return; closeSheet(); fn(); });
      actions.append(btn);
    };
    add(ICON.copy, "Копировать", async () => toast((await copyText(m.text)) ? "Скопировано" : "Не удалось скопировать"));
    if (m.failed) add(ICON.retry, "Отправить снова", () => retry(m));
    if (!m.pending && !m.failed) {
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
    const { error } = await sb.from("saved_messages").insert({
      text: m.text, from_user: m.sender_id, from_name: fromName, original_at: m.created_at,
    });
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
  function updateSendBtn() { $("#send-btn").disabled = !input.value.trim(); }
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
    temp.pending = true; temp.failed = false; temp.kind = cur.kind;
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
    if (!S.current || m.kind !== S.current.kind) return;
    if (m.kind === "chat" && m.chat_id !== S.current.id) return;
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
