# Web Tools — слой действий как будущий MCP-контракт

**Дата:** 2026-09-28 · **Статус:** дизайн согласован в чате, ждёт ревью спеки
**Где:** `web/` (Vite + vanilla TS) · **Решение:** №35 (заносится в PLAN при реализации)

## Зачем

Пока пилится новый веб-дизайн, все важные действия Imprint выносятся из `main.ts` в отдельный слой
**Tools** — набор именованных действий со схемой входа, описанием для агента и JSON-результатом.
Новый UI вызывает их, а позже MCP-сервер оборачивает тот же реестр **1:1, без переписывания**.

Что сказал пользователь: tools в вебе на TS; нужны отметка/снятие завершения, добавление/удаление из
группы, создание/удаление группы, перенос бэклог ↔ день, разбиение на шаги, «оверлей» — **только как
выборка без показа**.

Допущения (согласованы в чате):
- Подход **A** — реестр tools со схемой на `zod` (MCP SDK принимает именно zod-схемы).
- Имена tools следуют use-cases Imprint 2.0 (`imprint2.0/01-domain-core.md` §C), чтобы MCP-контракт
  пережил переписывание.
- Семантика каждого tool — зеркало `ChecklistRepository` v1, чтобы телефон сливал результат через
  `BackupMerge` без сюрпризов.

**Успех:** все tools из каталога ниже работают через `ToolContext`, покрыты тестами на
in-memory-контексте, `main.ts` пишет только через `runTool`, и строки из черновика после слияния
выглядят так, как их записал бы телефон.

## Вне рамок (этот шаг)

- **`get_imprint`** (выборка для оверлея) — **шаг 2, отдельная спека.** Требует порта на TS цепочки
  `DayAssembly` → `Completion` → `ReminderContent.select` (+ гашение частотой эпика 1, резерв слота
  эпика 5, облака эпика 2). Веб сейчас День не вычисляет (решение №30).
- Сам MCP-сервер и транспорт.
- `suggest_steps` (Gemini): ключ живёт на телефоне.
- Новый UI для новых tools — ждёт веб-дизайна; в этом шаге текущий UI визуально не меняется.

## Архитектура

```
web/src/tools/
  context.ts         ToolContext — порт
  registry.ts        defineTool(), ALL_TOOLS, runTool(name, rawInput)
  result.ts          типы результата и коды reason/error
  palette.ts         палитра групп (порт GroupColors.kt) + цвет по id
  tasks.ts           tools задач
  groups.ts          tools групп
  queries.ts         list_day, list_backlog, list_groups
  memoryContext.ts   ToolContext в памяти (тесты, будущий MCP в Node)
  browserContext.ts  ToolContext над пирами + localStorage-черновиком
```

### `ToolContext`

Единственное, что видят tools. Никакого `localStorage`, Drive или DOM внутри tools — поэтому один и тот
же код работает в браузере и в Node.

```ts
interface ToolContext {
  state(): MergedState;          // пиры + свой черновик, mergeSnapshots (LWW, tombstones сохранены)
  upsertTask(task: Task): void;
  upsertGroup(group: Group): void;
  appendEvent(event: TaskEvent): void;
  now(): number;                 // epoch millis
  todayKey(): string;            // YYYY-MM-DD, как todayDayKey()
  deviceId: string;
}
```

- `state()` после записи сразу отражает её (черновик участвует в слиянии), поэтому tools могут
  читать своё же изменение в рамках одного вызова.
- `browserContext` — пиры из Drive/файлов, которые сейчас держит `main.ts`, плюс `loadDraft()`;
  запись — через `draft.ts`.
- `memoryContext(seed?: MergedState, clock?)` — всё в памяти, часы и `deviceId` внедряются.

### Tool

```ts
interface ToolDef<I extends z.ZodTypeAny, O> {
  name: string;          // snake_case
  description: string;   // для агента: что делает, когда отказывает
  input: I;              // z.object(...)
  run(ctx: ToolContext, input: z.infer<I>): ToolResult<O>;
}
```

- `ALL_TOOLS` — массив всех определений; `runTool(ctx, name, rawInput)` находит tool, валидирует вход
  через zod и вызывает `run`.
- Результат всегда JSON-сериализуем: без классов, `Map`, `Set`, `undefined`-полей.

### Черновик несёт группы

`Draft` расширяется полем `groups: Group[]` (+ `upsertGroup`), `draftToSnapshot` пишет их вместо
`groups: []`. Старый черновик без поля читается как `groups: []`. Контракт файла не меняется:
`BackupMerge` на телефоне уже сливает группы по LWW.

## Результаты и ошибки

Ошибки — это данные, а не исключения: MCP-агент должен читать причину.

| Случай | Результат |
|---|---|
| Успех | `{ ok: true, changed: true, ...payload }` |
| Правило запрещает / нечего менять | `{ ok: true, changed: false, reason }` |
| Невалидный вход | `{ ok: false, error: "invalid_input", issues }` (issues от zod) |
| Нет задачи/группы (или tombstone) | `{ ok: false, error: "not_found" }` |
| Сбой хранилища (бросил `ToolContext`) | `{ ok: false, error: "storage", message }` — ловит `runTool` |

Коды `reason`: `same_value`, `done_today`, `skipped_today`, `not_empty`, `empty_steps`,
`already_in_day`, `already_in_backlog`.

## Каталог tools

Общие правила записи: каждая изменённая строка получает `updatedAt = ctx.now()`; каждое событие —
новый `id`, `at = now`, `dayKey = ctx.todayKey()`, денормализованные `title`/`groupId`/`isRepeating`
из задачи, `deviceId = ctx.deviceId`, `surface = null`. «Сегодня» для дат — локальное начало дня
(`startOfDayMillis(todayKey)`).

### Задачи

| Tool | Вход | Поведение |
|---|---|---|
| `add_task` | `title` (непустой после trim), `where: "day"\|"backlog"`, `groupId?`, `dueDate?: "YYYY-MM-DD"`, `repeatDays?: ("mon"…"sun")[]` | Как `buildContribution`: Task + `CREATED`. `repeatDays` непустой → повторяющаяся, всегда в бэклоге. `dueDate` учитывается только для одноразовой в бэклоге (в Дне и у повторяющейся игнорируется). Несуществующий `groupId` → `not_found`. Payload: `{ task }` |
| `rename_task` | `taskId`, `title` | trim; пусто → `invalid_input`; то же → `same_value` |
| `set_done` | `taskId`, `done: boolean` | Событие `DONE`/`UNDONE` за сегодня. Если текущее состояние уже такое (`doneTodayIds`) → `same_value`. **Конвейер:** при `done=true` и `parentId != null` — следующий живой шаг той же цепочки в бэклоге (наименьший `position`) переносится в День (`location=DAY`, `enteredDayAt=now`, `MOVED_TO_DAY`). Payload: `{ task, promoted?: task }` |
| `move_to_day` | `taskId` | Одноразовая: уже в Дне → `already_in_day`; иначе `dueDate ??= сегодня`, `location=DAY`, `enteredDayAt=сегодня`, `MOVED_TO_DAY`. Повторяющаяся: если сегодня есть `SKIPPED` → `skipped_today` (пропуск сильнее переноса в `DayAssembly`, а удалить событие веб не может); иначе событие `PULLED_TO_DAY` |
| `move_to_backlog` | `taskId` | Сделана сегодня → `done_today` (инвариант §6.3). Одноразовая: уже в бэклоге → `already_in_backlog`; иначе `location=BACKLOG`, `enteredDayAt=null`, `MOVED_TO_BACKLOG` (срок сохраняется). Повторяющаяся: событие `SKIPPED` на сегодня |
| `set_due_date` | `taskId`, `date: "YYYY-MM-DD" \| null` | Пишет `dueDate`. Если задача в бэклоге и дата ≤ сегодня — сразу в День (`enteredDayAt = dueDate`, `MOVED_TO_DAY`) |
| `set_repeating` | `taskId`, `days: ("mon"…"sun")[] \| null` | Непустой → `isRepeating=true`, маска по `recurrence.ts` (bit0=пн), `location=BACKLOG`, `enteredDayAt=null`. `null`/пустой → `isRepeating=false`. *Упрощение против v1:* очистку дневных отметок (DB-3) и материализацию сделанного появления (№15) делает только телефон — события веб не удаляет |
| `delete_task` | `taskId` | Tombstone (`deletedAt=now`) + `DELETED` |
| `restore_task` | `taskId` | Задача в tombstone → `deletedAt=null`; живая → `same_value`. Ищет среди tombstone (не `not_found`) |
| `split_task` | `taskId`, `steps: string[]` | trim + отброс пустых; ничего не осталось → `empty_steps`. Создаёт группу с именем задачи (цвет по id задачи, `position = max+1`). Шаг *i*: новая задача в группе, `parentId = taskId`, `position = i`, первый — в День (`enteredDayAt=now`), остальные — в бэклог, `createdAt = updatedAt = now + i`, каждому `CREATED`. Исходная — tombstone + `DELETED`. Payload: `{ group, steps }` |

### Группы

| Tool | Вход | Поведение |
|---|---|---|
| `create_group` | `name` (непустой после trim), `color?: number` (packed ARGB) | `position = max(live) + 1`, цвет по умолчанию — палитра по id новой группы. Payload: `{ group }` |
| `rename_group` | `groupId`, `name` | trim; пусто → `invalid_input`; то же → `same_value` |
| `recolor_group` | `groupId`, `color: number` | То же → `same_value` |
| `delete_group` | `groupId` | Есть живые задачи с этим `groupId` → `{ changed:false, reason:"not_empty", taskCount }` (решение №12); иначе tombstone |
| `set_task_group` | `taskId`, `groupId: string \| null` | Добавить в группу / убрать из группы; то же → `same_value`; несуществующая группа → `not_found` |
| `set_group_collapsed` | `groupId?`, `collapsed: boolean` | С `groupId` — одна группа; без — все живые, записываются только изменившиеся (как `setAllGroupsCollapsed`). Payload: `{ updated: number }` |

### Запросы (плоские, без вычисления Дня)

| Tool | Вход | Выход |
|---|---|---|
| `list_day` | — | Живые одноразовые с `location=DAY` + `doneToday` из `doneTodayIds`. **Не** содержит появлений повторяющихся и не делает rollover — это за телефоном до шага 2 |
| `list_backlog` | — | Живые задачи `location=BACKLOG` (включая определения повторяющихся), сгруппированные: `{ groups: [{ group, tasks }], ungrouped: tasks }` |
| `list_groups` | — | Живые группы по `position` + `taskCount` живых задач |

Задачи в выходе — объекты `Task` как есть (контракт `types.ts`), плюс вычисленные поля там, где указано.

### Палитра

`palette.ts` — 8 цветов из `GroupColors.palette` (packed ARGB, те же значения). Цвет по id:
`palette[mod(javaStringHashCode(id), 8)]`, где `javaStringHashCode` — порт `String.hashCode()` JVM
(int32, `h = 31*h + code`), чтобы веб и телефон давали один цвет для одного id. Держать в ногу с
`GroupColors.kt`, как `types.ts` с сущностями.

## Подключение `main.ts`

Обработчики, которые уже есть, — добавление, правка (`withEdits`), отметка, удаление — переводятся на
`runTool(browserContext, …)`. Правка из редактора раскладывается на `rename_task` / `set_task_group` /
`move_to_day`|`move_to_backlog` / `set_due_date` по изменившимся полям. Вид и поведение UI не
меняются. Остальные tools в текущем UI не появляются.

`edit.ts`/`compose.ts` остаются как чистые строители, которые tools переиспользуют (`buildContribution`,
`tombstone`, `doneEvent`); их тесты не трогаются.

## Тесты (Vitest, только новые)

Существующие 29 тестов не меняются и остаются зелёными.

- `tools/*.test.ts` на `memoryContext` с фиксированными часами: по 2–4 кейса на tool, включая
  каждый `reason` и `not_found`.
- Контракт реестра: у каждого tool уникальное `name` в snake_case и непустой `description`; результат
  каждого успешного вызова переживает `JSON.parse(JSON.stringify(r))` без потерь.
- `runTool`: невалидный вход → `invalid_input`; бросающий контекст → `storage`.
- Сквозной «на телефон»: `split_task` → `set_done` первого шага → `draftToSnapshot` →
  `mergeSnapshots` с пиром даёт группу, шаги с `parentId`/`position`, второй шаг в Дне, исходную
  задачу в tombstone.
- `palette`: `javaStringHashCode` совпадает с JVM на нескольких фиксированных строках (значения
  посчитаны заранее), включая отрицательный хэш.

Проверка готовности: `npm test` зелёный, `npm run build` (tsc + vite) собирается, в браузере через
превью: добавить → отметить → удалить работают как раньше, черновик пишется.

## Зависимость

`zod@^3` в `dependencies` — первая рантайм-зависимость веба (~13 КБ gzip).

## Документы

- PLAN.md: решение №35 «Tools-слой веба как будущий MCP-контракт» + строка «шаг 2: `get_imprint`».
- `web/README.md`: раздел с каталогом tools (имя → одна строка).

## Риски

- **Расхождение семантики с телефоном.** Страховка — каждое поведение списано с конкретной функции
  `ChecklistRepository`, сквозной тест через `mergeSnapshots`; упрощения (DB-3, №15, undo skip)
  явно перечислены выше.
- **Правка пира из веба (LWW).** Tool пишет строку чужой задачи со свежим `updatedAt` — это уже так
  работает в триаже 5.4c (решение №30); ничего нового.
- **Часы веба и `resetHour`.** `todayKey` — локальная календарная дата, не логический день телефона
  (известное расхождение веба, решение №25); на границе ночи событие может получить «вчерашний» с
  точки зрения телефона ключ. Не лечится в этом шаге — уходит вместе с 2.0 (P5).
