// Настройки подключения к Supabase.
// Где взять: Supabase → твой проект → Project Settings → API (или кнопка «Connect»).
//   SUPABASE_URL      — Project URL, вида https://xxxxxxxx.supabase.co
//   SUPABASE_ANON_KEY — ключ "anon public" (или "publishable"). Его МОЖНО публиковать на GitHub:
//                       доступ к данным защищён правилами RLS из supabase/schema.sql.
// НИКОГДА не вставляй сюда ключ service_role / secret.
window.YETYA_CONFIG = {
  SUPABASE_URL: "https://gknmtgwkclgkuqwztqdr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_sRHrDI3FzUCaNEmT_QFupw_iuOcNQuD",
  // Необязательно: свой TURN-сервер для звонков через «сложные» сети (мобильный интернет, рабочий Wi-Fi).
  // Пример: ICE_SERVERS: [{ urls: "stun:stun.l.google.com:19302" },
  //                       { urls: "turn:ВАШ_СЕРВЕР:3478", username: "ЛОГИН", credential: "ПАРОЛЬ" }],
};
