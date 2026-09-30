# Imprint platform

Веб-платформа Imprint 2.0: `@imprint/domain` (правила), `apps/worker` (Cloudflare Worker + Durable
Object на пользователя), `apps/web` (React). Карта фаз — [imprint2.0/README.md](../imprint2.0/README.md),
решения — [docs/adr/](docs/adr/).

## Команды (из `platform/`)

| Что | Команда |
|---|---|
| Всё сразу (как CI) | `npm run check` |
| Тесты / типы / линт | `npm run test` · `npm run typecheck` · `npm run lint` |
| Воркер + веб локально (:8787 + :5173) | `npm run dev` |
| Воркер локально (:8787) | `npm run dev -w @imprint/worker` |
| Веб локально (:5173, прокси на :8787) | `npm run dev -w @imprint/web` |
| Деплой dev / prod | `npm run deploy:dev` · `npm run deploy:prod` (prod — только из CI по тегу) |

**Windows:** в PowerShell используйте `npm.cmd` вместо `npm` — политика выполнения блокирует `npm.ps1`.
В Git Bash работает `npm`.

`web/` в корне репозитория — замороженный Drive-верстак v1; сюда из него скопирован домен (W1).

## Вход через Google (настройка окружения)

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID → Web application**,
   по клиенту на окружение:
   - **Imprint dev** — redirect URIs `https://imprint-dev.imprint-worker.workers.dev/auth/callback` и
     `http://localhost:5173/auth/callback`;
   - **Imprint prod** — `https://imprint-prod.imprint-worker.workers.dev/auth/callback`.
   Экран согласия: scopes `openid`, `email`. Пока приложение в статусе Testing, войти могут только
   тестовые пользователи: Audience → Test users → добавьте свой Google-аккаунт.
   Встроенные webview Google может блокировать (`disallowed_useragent`) — входите в обычном браузере.
2. Секреты (из `platform/apps/worker`, для prod — `--env prod`):
   `npx wrangler secret put GOOGLE_CLIENT_ID --env dev` · `… GOOGLE_CLIENT_SECRET --env dev` ·
   `… SESSION_SECRET --env dev` (значение: `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"`).
3. Локально: скопируйте `apps/worker/.dev.vars.example` в `apps/worker/.dev.vars` и впишите данные
   dev-клиента. `.dev.vars` в git не попадает.

API: `GET /api/me` · `POST /api/tools/:name` → `{ result, rev }` · `GET /api/state` · WebSocket
`/api/live?conn=<id>` → `{ changed, rev }` · `DELETE /api/account`. Без сессии — 401.
