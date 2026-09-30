# W2 — Сервер-хаб

**Цель:** tools исполняются на сервере в Durable Object пользователя; данные изолированы по
пользователю; другие подключения узнают об изменениях сразу.

**Зависит от:** W1 · **Тег:** `web-w2`

## Вход

- `packages/domain` с `ToolContext`, `runTool`, `ALL_TOOLS` (W0/W1).
- Скелет воркера и заглушка `UserStore` (W1).

## Модель

- Один DO `UserStore` на пользователя: `idFromName(userId)`, `userId` = Google `sub`.
- SQLite объекта: `tasks`, `groups`, `events` — колонки один к одному с `types.ts`; `settings`
  (`UserSettings` одной строкой); `meta` (`schemaVersion`, `rev`).
- Запросы одного пользователя сериализуются объектом — гонок нет, HLC не нужен.

## Задачи

### A. `sqlContext`
- [x] `ToolContext` над SQLite: `state()` — из памяти объекта, после пробуждения — из SQLite;
      `upsertTask`/`upsertGroup`/`appendEvent` — в буфер.
- [x] После `run`: буфер фиксируется одной `transactionSync`, `meta.rev += 1`. Исключение в `run` —
      ничего не записано, результат `storage`.
- [x] `now()` — монотонные часы сервера; `todayKey()` — пока UTC (пояс — W3a).
- [x] Миграции по `schemaVersion` при пробуждении, каждая с тестом.

### B. API
- [x] `POST /api/tools/:name` → `{ result, rev }`.
- [x] `GET /api/state` → задачи, группы, настройки, события за 35 дней, `rev`.
- [x] WebSocket `/api/live` (hibernatable) → `{ changed, rev }` остальным подключениям пользователя.
- [x] `DELETE /api/account` → `deleteAll()` в объекте + завершение сессии.

### C. Вход
- [x] Google OAuth (authorization code + PKCE) в воркере; отдельные OAuth-клиенты для dev и prod. *(dev-клиент создан; prod-клиент и `--env prod` секреты — до первого тега `platform-v*`.)*
- [x] Подписанная cookie сессии (`HttpOnly`, `Secure`, `SameSite=Lax`), секрет в wrangler secret.
- [x] Без сессии API отвечает 401.
- [x] ADR 005 — вход и сессии.

## Результат

Tools работают по HTTP для любого вошедшего пользователя; вторая вкладка получает `changed` и
перечитывает состояние.

## Готово, когда

- [x] Тесты на `@cloudflare/vitest-pool-workers`: изоляция двух пользователей; атомарность вызова
      (бросивший tool не оставляет строк); `rev` растёт на 1 за изменивший вызов; миграция
      `schemaVersion`.
- [x] Вход через Google в dev работает с живого URL: https://imprint-dev.imprint-worker.workers.dev (вход + обновление второй вкладки по `{ changed, rev }` проверены).
- [x] Чужие данные недоступны: запрос с сессией A не видит данных B (тест).

## Уроки v1, применённые здесь

Токен в памяти (сессия — cookie, переживает перезагрузку), ожидание 2–5 с на Drive (сервер +
WebSocket), LWW по целой строке (остаётся, но записи сериализованы объектом).

## Риски

- Часовой пояс: до W3a «сегодня» по UTC → в dev это видно на границе суток; закрывается в W3a.
- Холодное пробуждение объекта с большим журналом → загрузка событий только за окно.

## Вне рамок

Проекция Дня (W3a), UI (W4), MCP (W5), Android (W7).
