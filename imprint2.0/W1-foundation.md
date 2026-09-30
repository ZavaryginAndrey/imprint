# W1 — Фундамент платформы

**Цель:** пустой, но полный скелет `platform/` — домен, воркер, веб — с рабочим CI, двумя
окружениями и живым деплоем в dev. Ни одной новой продуктовой фичи.

**Зависит от:** W0 · **Тег:** `web-w1`

## Вход

- Реестр tools в `web/src/tools/` (W0) и модули, на которых он стоит: `types`, `merge`, `completion`,
  `compose`, `edit`, `recurrence`, вместе с тестами.
- Спек [карты](../docs/superpowers/specs/2026-09-28-web-platform-roadmap-design.md).

## Задачи

### A. Workspace
- [x] `platform/package.json` — npm workspaces `packages/*`, `apps/*`; общий `tsconfig.base.json`
      (`strict`, `verbatimModuleSyntax`, `noEmit` для проверки типов — грабля v1: `tsc` без `noEmit`
      мусорил `.js` в `src/`, и Vitest гонял тесты дважды).
- [x] `packages/domain`: **копия** перечисленных модулей и их тестов из `web/src/`, импорты
      поправлены, поведение не меняется. `web/` после этого заморожен.
- [x] `apps/worker`: Hono, `wrangler.toml` с окружениями `dev` и `prod` (сделано как `wrangler.jsonc`), заглушка DO `UserStore`,
      `GET /health`, раздача статики веба (Workers Static Assets, SPA-fallback).
- [x] `apps/web`: React 19 + Vite, одна страница вызывает `runTool` из `@imprint/domain` на
      `memoryContext`.
- [x] Лимит размера файла (например, 300 строк) в eslint — защита от нового `ChecklistRepository`.
- [x] Подсказка для Windows в `platform/README.md`: `npm.cmd` вместо `npm` (политика PowerShell).

### B. Окружения (P8)
- [x] Воркеры `imprint-dev` и `imprint-prod`; `wrangler dev` локально на Miniflare. *(`imprint-prod` — только конфиг; деплой — из CI по тегу `platform-v*`.)*
- [ ] Бюджетные ограничения Cloudflare, алерт на рост запросов. *Не сделано: в W1 бесплатный тариф Workers — жёсткие лимиты вместо счёта (ADR 006); алерт — вместе с переходом на платный тариф.*

### C. CI (GitHub Actions)
- [x] Джобы: typecheck, тесты `domain`/`worker`/`web`, сборка, eslint.
- [x] Деплой в dev из `main`, в prod — только по тегу.

### D. Документация
- [x] `platform/docs/adr/` с шаблоном; ADR 001 (DO-хаб), 002 (строки v1 + проекция), 003
      (изоморфный `runTool`), 004 (React), 006 (окружения). ADR 005 (вход) — в W2.
- [x] `platform/CLAUDE.md`: принципы, команды сборки, ссылки на знания.

## Результат

Воркер в dev отвечает на `/health`, отдаёт веб-страницу, заглушка DO просыпается; веб вызывает
`runTool` из пакета; CI зелёный.

## Готово, когда

- [x] Все скопированные тесты домена зелёные в `packages/domain`.
- [x] `hello DO` работает в dev по живому URL: https://imprint-dev.imprint-worker.workers.dev (`/health`, `/api/hello`, SPA по глубокой ссылке).
- [ ] PR проходит все джобы CI. *Ждёт GitHub-remote: воркфлоу `platform.yml` / `platform-release.yml` готовы, первый push + секреты `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` их запустят; до тех пор тот же гейт — `npm run check` (зелёный с чистого `npm ci`).*

## Уроки v1, применённые здесь

`tsc --noEmit`, `npm.cmd`, dev/prod (CRIT-1), god-object (лимит файла), «наскоком» (ADR).

## Риски

- Cloudflare — новая для проекта платформа → живой деплой до любой логики.
- Копия домена разойдётся с `web/` → `web/` заморожен, правки только в `platform/`.

## Вне рамок

Хранилище, вход, любые экраны.
