# 005 — Вход через Google и сессии

**Статус:** принято · **Дата:** 2026-09-29

## Контекст
Платформа многопользовательская с первого дня (W2). Нужен вход без своих паролей, изоляция данных
по пользователю и сессия, которая переживает перезагрузку страницы (урок v1: токен в памяти
терялся). Позже (W5) тот же вход оборачивается OAuth-провайдером для MCP-клиентов.

## Решение
- Google OAuth 2.0, authorization code + PKCE (S256) **в воркере**: `/auth/login` → Google →
  `/auth/callback`. `state` и `code_verifier` живут 10 минут в подписанной cookie `imprint_oauth`
  (`Path=/auth`). Отдельные OAuth-клиенты для dev и prod; `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` —
  wrangler secrets своего окружения.
- `userId` = Google `sub`; объект пользователя — `idFromName(sub)`. Email хранится в сессии только
  если Google отметил его подтверждённым.
- ID-токен приходит напрямую с token endpoint по TLS, поэтому подпись не проверяется (OIDC Core
  §3.1.3.7); `iss`, `aud`, `exp` и `sub` проверяются всегда.
- Сессия — **без состояния на сервере**: cookie `imprint_session` = `base64url(JSON).HMAC-SHA256`
  с `kind: "session"`, `sub`, `email`, `exp` (30 дней). `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`. Ключ — wrangler secret `SESSION_SECRET`.
- Защита от CSRF: `SameSite=Lax` + изменяющие запросы (`POST`/`DELETE`) и WebSocket `/api/live`
  сверяют `Origin` с origin воркера или `APP_ORIGIN` (без `Origin` — не браузер, пропускаем);
  причина — `*.imprint-worker.workers.dev` dev и prod — один «сайт» для SameSite.
- Каждый пользовательский маршрут требует сессию (`requireSession`), без неё — 401.
  `DELETE /api/account` → `deleteAll()` в объекте + удаление cookie; `POST /auth/logout` удаляет cookie.

## Последствия
- Никакой таблицы сессий: проверка — одна HMAC-операция, без обращения к хранилищу.
- Украденную cookie нельзя отозвать до `exp`; выход «везде» — только сменой `SESSION_SECRET`
  (выходят все). Пересмотреть, когда понадобится отзыв одной сессии (например, в W5 или W7).
- После удаления аккаунта старая cookie, если где-то сохранилась, откроет **пустой** объект —
  данных в нём нет.
- Локально `APP_ORIGIN=http://localhost:5173`: Vite проксирует `/auth` и `/api` на воркер, а
  redirect URI этого адреса зарегистрирован в dev-клиенте.
