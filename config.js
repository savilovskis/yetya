// Настройки подключения к Supabase.
// Где взять: Supabase → твой проект → Project Settings → API (или кнопка «Connect»).
//   SUPABASE_URL      — Project URL, вида https://xxxxxxxx.supabase.co
//   SUPABASE_ANON_KEY — ключ "anon public" (или "publishable"). Его МОЖНО публиковать на GitHub:
//                       доступ к данным защищён правилами RLS из supabase/schema.sql.
// НИКОГДА не вставляй сюда ключ service_role / secret.
window.YETYA_CONFIG = {
  SUPABASE_URL: "https://gknmtgwkclgkuqwztqdr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_sRHrDI3FzUCaNEmT_QFupw_iuOcNQuD",
  // TURN-сервер для звонков (нужен, чтобы звонки проходили через мобильный интернет и VPN).
  // Бесплатно: зарегистрируйся на https://dashboard.metered.ca/signup, создай приложение
  // и вставь сюда его имя (то, что перед .metered.live) и API Key. Подробно — в README.
  METERED_APP: "yetya",
  METERED_API_KEY: "94712472de2367eb758c06c9b9f5362da58e",
  // Или свой сервер вручную:
  // ICE_SERVERS: [{ urls: "turn:ВАШ_СЕРВЕР:3478", username: "ЛОГИН", credential: "ПАРОЛЬ" }],
};
