# W4b — Веб-клиент: полный UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести веб-клиент W4a до полной UX-спеки: повтор, шаги с «Подсказать шаги», правка задачи и группы правым кликом, перетаскивание задач и порядка групп, мобильная раскладка (выдвижной сайдбар, тап-ряд, долгий тап, листы снизу, `/g/all`), все e2e UX §8 и тест контраста токенов (скриншот-тесты тем — не в W4b).

**Architecture:** Всё поверх store W4a: каждое действие — `store.run(tool, input)` (оптимистично, очередь, откат). Единственное новое в store — `ask()` для серверного `suggest_steps` (ничего не пишет, в очередь не идёт). Раскладка выбирается одним `LayoutContext` (`desktop` ≥ 1024 px / `mobile`), и компоненты по нему решают: поповер или лист снизу, строка с наведением и перетаскиванием или строка с тап-рядом. Правила (куда падает задача, повтор, шаги ↔ задача, удаление группы с отвязкой) остаются в домене — UI только зовёт tools.

**Tech Stack:** React 19, Vite 6, TypeScript 5.9, `@radix-ui/react-popover` + **`@radix-ui/react-dialog`** (листы, выдвижной сайдбар), **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`**, `@phosphor-icons/react`, `@formkit/auto-animate`, Vitest + happy-dom + Testing Library, Playwright (Chromium/Edge).

**Spec:** [docs/superpowers/specs/2026-09-30-w4-web-ui-design.md](../specs/2026-09-30-w4-web-ui-design.md) (§6 «W4b»), поверх [imprint2.0/05-web-ux.md](../../../imprint2.0/05-web-ux.md) и фазы [imprint2.0/W4-web-ui.md](../../../imprint2.0/W4-web-ui.md). Предыдущий план: [2026-09-30-w4a-web-client.md](2026-09-30-w4a-web-client.md).

## Решения плана (приняты пользователем 2026-09-30)

Спека в этих местах молчит или противоречит себе. Пользователь принял решения 1 и 3–8; решение 2 заменено.

1. **Контраст токенов.** С текущими `tokens.css` тест контраста (UX §8) падает на шести парах: светлый `--muted` на `--surf` 4,13; янтарный текст (подпись под заголовком, «↻ пн чт») на светлом фоне 1,88–2,16; светлый `--done` 2,41; `--side-lab` 4,03; Meta `--danger` 3,74; Meta `--done` 2,84. План вводит `--amber-ink` для янтарного **текста** (светлая тема `#94560f` — коричневатый; тёмная и Meta — прежний `#f0a24e`), янтарь `--amber` остаётся для рамок и заливок; светлый `--muted` → `#5c6380`; `--side-lab` → `#9098c0`; Meta `--danger` → `#f0a08c`. **Зачёркнутый выполненный текст** (`--done`) меряется порогом 3:1, а не AA 4,5 (иначе он не отличим от открытого): светлый → `#767c89`, Meta → `#8e95bb`. Это видимая смена бренда в светлой теме.
2. **Скриншот-тесты тем** (UX §8) — **не в W4b** (решение пользователя): задачи нет, критерий остаётся хвостом фазы. CI в репозитории нет — всё проверяется локально: `npm run check` и `npm run e2e`.
3. **Порядок групп на мобильном** — не в W4b: долгий тап по группе в сайдбаре уже занят правкой (UX §5), а перетаскивание в выдвижном меню спорит с прокруткой. Порядок, заданный на десктопе, мобильный показывает.
4. **Выдвижной сайдбар** — только кнопкой ☰, без свайпа от края: тот же конфликт с системным «Назад» в iOS, из-за которого UX §4 убрал свайпы строк.
5. **Окно «Шаги»:** сверху шаги задачи с кружками (отметка = `set_done` шага); ниже поля новых шагов (одно пустое по умолчанию); «Подсказать шаги» дописывает предложения полями, их можно поправить или убрать ×; «Разбить» или Enter в любом поле — `add_steps` со всеми непустыми полями, окно остаётся открытым с пустым полем. Правка и удаление шагов — не в W4b (в UX их нет).
6. **Название задачи и группы** сохраняются «по мере ввода» с паузой 300 мс (не каждый символ — иначе 20 вызовов в очереди и 20 рассылок другим вкладкам); закрытие окна (Enter, Esc, клик мимо) сохраняет сразу. Пустое имя не отправляется.
7. **Пунктир при перетаскивании:** целевая колонка обводится янтарным пунктиром, строка на старом месте становится пунктирной и полупрозрачной, над курсором — приподнятая копия строки. Порядок внутри колонки задаёт домен, поэтому «место в списке» не рисуется.
8. **Клавиатура:** правка названия задачи и группы открывается и клавишей меню / Shift+F10 на строке или пункте (то же событие `contextmenu`), окно встаёт у элемента.

## Global Constraints

- P1: в `apps/web/src/screens` и `apps/web/src/components` — импорт из `@imprint/domain` только `import type`; значения домена — через `store/` (`store/look.ts`, `store/format.ts`); никаких `Date`/`Intl` (eslint уже это ловит). UI ничего не сортирует и не фильтрует по правилам — только рендерит `View`.
- Файлы (кроме тестов) ≤ 300 строк (eslint `max-lines`), включая `.tsx`.
- **Существующие тесты не меняются и не удаляются** (память `imprint-test-policy`); новые кейсы — в **новых** файлах. Существующие контракты, на которые опираются тесты, сохраняются: `parseRoute`/`routePath` отдают те же объекты; `Sidebar({ route, go })` зовёт `go({ screen: "day", filter })`; `Popover({ open, onOpenChange, trigger, label })`; `RowActions({ row, group, onOpenChange })`.
- `packages/domain` меняется только аддитивно (один экспорт в Task 1); `purity.test.ts` зелёный.
- Не трогать `web/` и `app/`.
- Зависимости ставятся только из `platform/`: `npm install <pkg> -w @imprint/web` (в PowerShell — `npm.cmd`); проверить, что версия записалась в `apps/web/package.json`.
- Коммит на задачу; перед коммитом `npm run check` из `platform/` зелёный. e2e — `npm run e2e` (только localhost, свой `--persist-to`, CRIT-1).
- Компонентные тесты: файл `*.dom.test.tsx` с первой строкой `// @vitest-environment happy-dom`; стор — через `renderWithStore` из `src/test/harness.tsx`; мобильная раскладка — обёрткой `<LayoutContext.Provider value="mobile">`.
- Движение — только сообщение о действии; всё выключено при `prefers-reduced-motion` (CSS-анимации оборачиваются в `@media (prefers-reduced-motion: no-preference)` или гасятся в `reduce`).
- Эффекты наведения — только в десктопной раскладке (`@media (min-width: 1024px)`); раскрытая мобильная строка на наведение не реагирует.
- Мобильный: область нажатия ≥ 44 px (кружок, иконки ряда, ☰); ряд раскрытой строки не переносится и целиком внутри строки на 360 px.
- Тексты интерфейса — в `i18n/ru.ts` и `i18n/en.ts` (тип `Strings` проверяет, что ключи совпадают); тон — 03-DESIGN §6.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Призрачный клик после листа.** Мобильная раскладка в узком окне с мышью: лист закрывают кликом по затемнению — клик не должен провалиться под лист и свернуть раскрытую строку (грабля лендинга). Тест: Task 2 «pointerdown по затемнению не закрывает, клик закрывает и не доходит до строки»; Task 11 e2e «тап по затемнению закрывает лист, ряд остаётся».
2. **Перетаскивание против кликов.** Нажатие на кружок, иконку ряда или поле даты не должно начинать перетаскивание, а обычный клик по строке — съедаться им. Тест: Task 7 `canStartDrag` (кнопки и поля — нет, текст — да) + e2e отметки после перетаскивания.
3. **Название стёрли и закрыли окно.** Пустое название не отправляется и не даёт «Не сохранилось»; быстро набранное и сразу закрытое Esc — сохраняется. Тест: Task 5 «пустое не отправляется», «Esc до паузы сохраняет последнее».
4. **Группа пропала, пока открыт её редактор** (удалили в другой вкладке или «Удалить группу» в том же окне): окно закрывается и не всплывает снова после «Отменить»; фильтр этой группы падает на «Все задачи». Тест: Task 6 «редактор закрывается, когда группы нет, и не открывается после отмены».
5. **«Подсказать шаги» не получилось** (нет ключа, лимит, нет сети): тихая строка в окне, введённые поля целы, ни плашки «Не сохранилось», ни вызова в очереди. Тест: Task 4 три кейса отказа.

---

## File Structure

```
packages/domain/src/index.ts             + export DAY_NAMES, DayName
apps/web/
  package.json                           + @radix-ui/react-dialog, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
  e2e/helpers.ts                         drag, longPress, serverState, expectInside
  e2e/drag.spec.ts, edit.spec.ts, repeat-steps.spec.ts, edges.spec.ts, mobile.spec.ts, mobile-rows.spec.ts
  src/store/store.ts                     + ask()
  src/store/format.ts                    + toggledDays()
  src/store/view.ts                      Row + stepsDone
  src/i18n/ru.ts, en.ts                  новые строки
  src/app/useLayoutMode.ts               matchMedia → Layout
  src/app/router.ts                      + isBacklogPath, backlogPath, usePath, navigatePath
  src/app/mobileNav.ts                   mobileScreen, mobileStep, plantDay, goMobile
  src/app/MobileRoot.tsx                 мобильный корень: ☰, меню, экраны
  src/app/App.tsx                        LayoutContext; десктоп или MobileRoot
  src/app/useRouteGuards.ts              + { restore }
  src/components/layout.ts               LayoutContext, useLayout
  src/components/Sheet.tsx (+css)        лист снизу (Radix Dialog)
  src/components/Popover.tsx             anchor без trigger; на мобильном — Sheet
  src/components/usePressMenu.ts         правый клик / клавиша меню / долгий тап
  src/components/useTypingSave.ts        сохранение по мере ввода
  src/components/RepeatPicker.tsx (+css) Пн–Вс, «Не повторять»
  src/components/StepsPanel.tsx (+css)   шаги, поля, «Подсказать шаги», «Разбить»
  src/components/TitleEditor.tsx         «Название задачи»
  src/components/GroupEditor.tsx (+css)  название, иконки, цвета, «Удалить группу»
  src/components/NavItem.tsx             пункт сайдбара (вынесен из Sidebar)
  src/components/GroupFilters.tsx        группы сайдбара: правка, порядок перетаскиванием
  src/components/drag.ts                 dropCall, reordered, canStartDrag, DragData
  src/components/DragArea.tsx (+css)    DndContext колонок, приподнятая строка, useDropZone, DraggableRow
  src/components/ListRow.tsx             выбор строки по раскладке
  src/components/MobileRow.tsx           тап-ряд, долгий тап
  src/components/OpenRow.tsx             одна раскрытая строка, тап мимо сворачивает
  src/components/MobileShell.tsx (+css)  верхняя полоса ☰ + выдвижное меню
  src/components/RowActions.tsx          + повтор, шаги, режим ряда (tray)
  src/components/RowWithActions.tsx      + правый клик → название
  src/components/TaskRow.tsx (+css)      handlers, open, below, счётчик шагов; наведение только десктоп
  src/components/Sidebar.tsx             NavItem, GroupFilters, режим mobile
  src/components/DayColumn.tsx, BacklogColumn.tsx   ListRow, зоны сброса, role=group у секций
  src/components/Composer.tsx            + backlogAll (мобильное исключение)
  src/screens/DayScreen.tsx              DragArea
  src/screens/MobileList.tsx (+css)      мобильный экран: колонка + ввод
  src/styles/tokens.css                  контраст (решение 1)
  src/styles/contrast.test.ts            тест контраста
```

---

### Task 1: store — `ask()` для серверного tool, повтор в `format`, счётчик шагов в `View`, строки

**Files:**
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/web/src/store/store.ts`, `apps/web/src/store/format.ts`, `apps/web/src/store/view.ts`, `apps/web/src/i18n/ru.ts`, `apps/web/src/i18n/en.ts`
- Test: `apps/web/src/store/ask.test.ts`, `apps/web/src/store/format-repeat.test.ts`, `apps/web/src/store/view-steps.test.ts`

**Interfaces:**
- Produces: `Store.ask(name: string, input: unknown): Promise<ToolResult>`; `toggledDays(task: { isRepeating: boolean; recurrenceMask: number }, day: number): DayName[] | null`; `Row.stepsDone: number`; строки i18n (список ниже) — ими пользуются Task 3–11.

- [x] **Step 1: Failing tests**

`apps/web/src/store/ask.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeApi } from "./fakeApi";
import { Store } from "./store";

const snap = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e1" };
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const f = fakeApi(snap);
  const store = new Store({
    api: f.api, clock: () => Date.UTC(2026, 8, 30, 12), conn: "c1", wait: async () => {}, storage: null, offlineAfterMs: 0,
    live: () => ({ close() {} }),
  });
  return { store, f };
}

describe("Store.ask — a server tool (ADR 009)", () => {
  it("goes straight to the server, without ids, the queue or an optimistic run", async () => {
    const { store, f } = setup();
    await store.start();
    const asked = store.ask("suggest_steps", { taskId: "t1" });
    await flush();
    expect(f.calls[0]).toMatchObject({ name: "suggest_steps", input: { taskId: "t1" }, ids: [] });
    expect(store.getState().pending).toBe(0);
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: false, steps: ["a", "b"], remaining: 19 }, rev: 0 });
    expect(await asked).toEqual({ ok: true, changed: false, steps: ["a", "b"], remaining: 19 });
    expect(store.getState().toasts).toHaveLength(0);
  });

  it("the network reads as upstream, quietly", async () => {
    const { store, f } = setup();
    await store.start();
    const asked = store.ask("suggest_steps", { taskId: "t1" });
    await flush();
    f.calls[0].resolve({ kind: "network" });
    expect(await asked).toMatchObject({ ok: false, error: "upstream" });
    expect(store.getState().toasts).toHaveLength(0);
  });

  it("a lost session signs out", async () => {
    const { store, f } = setup();
    await store.start();
    const asked = store.ask("suggest_steps", { taskId: "t1" });
    await flush();
    f.calls[0].resolve({ kind: "unauthorized" });
    expect(await asked).toMatchObject({ ok: false });
    expect(store.getState().auth).toBe("out");
  });
});
```

`apps/web/src/store/format-repeat.test.ts`:

```ts
import { bit } from "@imprint/domain";
import { describe, expect, it } from "vitest";
import { toggledDays } from "./format";

describe("toggledDays — set_repeating's days after a weekday chip", () => {
  it("turns a day on for a one-shot", () => {
    expect(toggledDays({ isRepeating: false, recurrenceMask: 0 }, 0)).toEqual(["mon"]);
  });
  it("turns a day off, keeping the rest in week order", () => {
    expect(toggledDays({ isRepeating: true, recurrenceMask: bit(0) | bit(3) | bit(6) }, 3)).toEqual(["mon", "sun"]);
  });
  it("the last day off means «Не повторять» (null)", () => {
    expect(toggledDays({ isRepeating: true, recurrenceMask: bit(4) }, 4)).toBeNull();
  });
  it("a stale mask on a one-shot is ignored", () => {
    expect(toggledDays({ isRepeating: false, recurrenceMask: bit(2) }, 0)).toEqual(["mon"]);
  });
});
```

`apps/web/src/store/view-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sandbox } from "./sandbox";
import { project } from "./view";

const base = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e" };

describe("project — steps on a row", () => {
  it("a row carries its steps and how many are done", () => {
    const s = sandbox(base, () => Date.UTC(2026, 8, 28, 12));
    const id = s.run("capture_task", { title: "Shop", view: "day" }).ids[0];
    const [a] = s.run("add_steps", { taskId: id, steps: ["List", "Go"] }).ids;
    s.run("set_done", { taskId: a, done: true });
    const row = project(s.ctx).day[0];
    expect(row.steps.map((x) => x.task.title)).toEqual(["List", "Go"]);
    expect(row.stepsDone).toBe(1);
  });
});
```

- [x] **Step 2: Run to see them fail**

Run (из `platform/`): `npm run test -w @imprint/web -- ask format-repeat view-steps`
Expected: FAIL — `store.ask is not a function`, `toggledDays` не экспортирован, `stepsDone` undefined.

- [x] **Step 3: Implement**

`packages/domain/src/index.ts` — рядом с `export { monotonicClock } from "./tools/support";`:

```ts
export { DAY_NAMES, type DayName } from "./tools/support";
```

`apps/web/src/store/format.ts` — целиком:

```ts
import { DAY_NAMES, isOn, toggle, type DayName } from "@imprint/domain";

/** The weekdays a recurrence mask repeats on (0 = Monday … 6 = Sunday) — i18n names them. */
export function repeatDays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => isOn(mask, d));
}

/**
 * `set_repeating`'s `days` after the weekday chip `day` was clicked (UX §4): the task's days with that one
 * flipped, in week order; none left → null («Не повторять»). A one-shot's leftover mask counts as no days.
 */
export function toggledDays(task: { isRepeating: boolean; recurrenceMask: number }, day: number): DayName[] | null {
  const next = toggle(task.isRepeating ? task.recurrenceMask : 0, day);
  const days = DAY_NAMES.filter((_, i) => isOn(next, i));
  return days.length > 0 ? days : null;
}
```

`apps/web/src/store/view.ts` — тип `Row` и функция `row` внутри `project`:

```ts
/** A task as a row shows it: `kind` in the Day (null in the Backlog), its date as a calendar key, done steps counted. */
export type Row = BacklogItem & { kind: DayKind | null; dueKey: string | null; stepsDone: number };
```

```ts
  const row = (t: BacklogItem, kind: DayKind | null = null): Row => ({
    ...t,
    kind,
    dueKey: t.dueDate == null ? null : dueKey(t.dueDate, settings),
    stepsDone: t.steps.filter((s) => s.done).length,
  });
```

`apps/web/src/store/store.ts` — после метода `run` (над `toast`):

```ts
  /**
   * A server tool (ADR 009: `suggest_steps`) — asked, not queued: it writes nothing, so there is no optimistic
   * run, no ids and no retry. The network or a 5xx reads as `upstream`; a lost session signs out.
   */
  async ask(name: string, input: unknown): Promise<ToolResult> {
    const out = await this.d.api.call(name, input, { conn: this.d.conn, ids: [] });
    if (out.kind === "unauthorized") {
      this.set({ auth: "out" });
      return { ok: false, error: "unavailable", message: "signed out" };
    }
    if (out.kind === "network") return { ok: false, error: "upstream", message: "network" };
    return out.result;
  }
```

`apps/web/src/i18n/ru.ts` — в начало `import type { GroupColorKey, GroupIconKey } from "../store/look";`, в объект `ru` перед `days`:

```ts
  noRepeat: "Не повторять",
  steps: "Шаги",
  stepsOf: (done: number, total: number) => `Шаги: ${done} из ${total}`,
  splitHint: "Разбейте задачу на маленькие шаги.",
  newStep: "Новый шаг",
  removeDraft: "Убрать",
  suggest: "Подсказать шаги",
  split: "Разбить",
  suggestUnavailable: "Подсказки сейчас недоступны",
  suggestQuota: "Подсказки на сегодня закончились",
  suggestFailed: "Не получилось подсказать",
  taskTitle: "Название задачи",
  savedAsTyped: "Сохраняется сразу",
  done: "готово",
  close: "закрыть",
  groupName: "Название",
  icon: "Иконка",
  color: "Цвет",
  deleteGroup: "Удалить группу",
  menu: "Меню",
  toBacklog: "В бэклог",
  toDay: "В День",
  colors: {
    amber: "Янтарь", terracotta: "Терракота", rose: "Роза", plum: "Слива",
    blue: "Синий", teal: "Бирюза", sage: "Шалфей", graphite: "Графит",
  } as Record<GroupColorKey, string>,
  iconNames: {
    tag: "Метка", house: "Дом", briefcase: "Работа", heartbeat: "Здоровье", "shopping-cart": "Покупки",
    "book-open": "Книга", users: "Люди", moon: "Луна", "paw-print": "Питомцы", car: "Машина", airplane: "Поездки",
    barbell: "Спорт", plant: "Растения", wrench: "Ремонт", "graduation-cap": "Учёба", baby: "Ребёнок",
  } as Record<GroupIconKey, string>,
```

`apps/web/src/i18n/en.ts` — те же ключи:

```ts
  noRepeat: "Don't repeat",
  steps: "Steps",
  stepsOf: (done, total) => `Steps: ${done} of ${total}`,
  splitHint: "Break the task into small steps.",
  newStep: "New step",
  removeDraft: "Remove",
  suggest: "Suggest steps",
  split: "Split",
  suggestUnavailable: "Suggestions are unavailable now",
  suggestQuota: "No more suggestions today",
  suggestFailed: "Couldn't suggest",
  taskTitle: "Task title",
  savedAsTyped: "Saved as you type",
  done: "done",
  close: "close",
  groupName: "Name",
  icon: "Icon",
  color: "Colour",
  deleteGroup: "Delete group",
  menu: "Menu",
  toBacklog: "To the backlog",
  toDay: "To the Day",
  colors: { amber: "Amber", terracotta: "Terracotta", rose: "Rose", plum: "Plum", blue: "Blue", teal: "Teal", sage: "Sage", graphite: "Graphite" },
  iconNames: {
    tag: "Tag", house: "Home", briefcase: "Work", heartbeat: "Health", "shopping-cart": "Shopping", "book-open": "Book",
    users: "People", moon: "Moon", "paw-print": "Pets", car: "Car", airplane: "Travel", barbell: "Sport", plant: "Plants",
    wrench: "Repairs", "graduation-cap": "Study", baby: "Baby",
  },
```

- [x] **Step 4: Run to see them pass**

Run: `npm run test -w @imprint/web -- ask format-repeat view-steps` → PASS. Затем `npm run check` → зелёный (в т. ч. `purity.test.ts` домена и все старые тесты).

- [x] **Step 5: Commit**

```bash
git add packages/domain/src/index.ts apps/web/src/store apps/web/src/i18n
git commit -m "web: store asks server tools; repeat days after a chip; done steps on a row; W4b strings"
```

---

### Task 2: раскладка, лист снизу, поповер у точки, жест «меню»

**Files:**
- Modify: `apps/web/package.json` (зависимость), `apps/web/src/components/Popover.tsx`, `apps/web/src/components/Popover.module.css`
- Create: `apps/web/src/components/layout.ts`, `apps/web/src/components/Sheet.tsx`, `apps/web/src/components/Sheet.module.css`, `apps/web/src/components/usePressMenu.ts`, `apps/web/src/app/useLayoutMode.ts`
- Test: `apps/web/src/components/Sheet.dom.test.tsx`, `apps/web/src/components/usePressMenu.dom.test.tsx`, `apps/web/src/components/PopoverAnchor.dom.test.tsx`

**Interfaces:**
- Produces: `type Layout = "desktop" | "mobile"`; `LayoutContext`; `useLayout(): Layout`; `useLayoutMode(): Layout` (app); `Sheet({ open, onOpenChange, trigger?, label, children })`; `Popover({ …, trigger?, anchor?: () => DOMRect })` — на мобильном рисует `Sheet`; `usePressMenu(open: (at: DOMRect) => void, opts?: { at?: "point" | "element"; longMs?: number })` → обработчики для корневого элемента (`onContextMenu`, `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onClickCapture`); CSS-классы `Popover.module.css`: `.foot`, `.kbd`.

- [x] **Step 1: Dependency**

Run (из `platform/`): `npm install @radix-ui/react-dialog@^1.1.23 -w @imprint/web` → проверить строку в `apps/web/package.json` `dependencies`.

- [x] **Step 2: Failing tests**

`apps/web/src/components/Sheet.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutContext } from "./layout";
import { Popover } from "./Popover";

afterEach(cleanup);

function Harness({ onRow }: { onRow(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <LayoutContext.Provider value="mobile">
      <div data-testid="row" onClick={onRow} onPointerDown={onRow}>
        <Popover open={open} onOpenChange={setOpen} label="Окно" trigger={<button type="button">open</button>}>
          <button type="button">inside</button>
        </Popover>
      </div>
    </LayoutContext.Provider>
  );
}

const scrim = () => document.querySelector("[data-scrim]") as HTMLElement;

describe("Sheet (mobile: every window is a sheet from the bottom, UX §4)", () => {
  it("the trigger opens a sheet over a scrim", () => {
    render(<Harness onRow={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog", { name: "Окно" })).toBeTruthy();
    expect(scrim()).toBeTruthy();
  });

  it("a pointerdown on the scrim keeps it; the click closes it and never reaches the row", () => {
    const onRow = vi.fn();
    render(<Harness onRow={onRow} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    onRow.mockClear();
    fireEvent.pointerDown(scrim());
    expect(screen.getByRole("dialog", { name: "Окно" })).toBeTruthy();
    fireEvent.click(scrim());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("clicks inside never reach the row and do not close it", () => {
    const onRow = vi.fn();
    render(<Harness onRow={onRow} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    onRow.mockClear();
    const inside = screen.getByRole("button", { name: "inside" });
    fireEvent.pointerDown(inside);
    fireEvent.click(inside);
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Окно" })).toBeTruthy();
  });
});
```

`apps/web/src/components/PopoverAnchor.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Popover } from "./Popover";

afterEach(cleanup);

describe("Popover without a trigger (right-click windows)", () => {
  it("opens at the given box", () => {
    render(
      <Popover open onOpenChange={() => {}} label="Название задачи" anchor={() => new DOMRect(300, 200, 0, 0)}>
        <input aria-label="поле" />
      </Popover>,
    );
    expect(screen.getByRole("dialog", { name: "Название задачи" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "поле" })).toBeTruthy();
  });

  it("closed, it renders nothing", () => {
    render(
      <Popover open={false} onOpenChange={() => {}} label="Окно" anchor={() => new DOMRect()}>
        <p>inside</p>
      </Popover>,
    );
    expect(screen.queryByText("inside")).toBeNull();
  });
});
```

`apps/web/src/components/usePressMenu.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePressMenu } from "./usePressMenu";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Box({ onOpen, onClick, at }: { onOpen(r: DOMRect): void; onClick?(): void; at?: "point" | "element" }) {
  const press = usePressMenu(onOpen, { at });
  return (
    <div data-testid="box" {...press}>
      <button type="button" onClick={onClick}>child</button>
    </div>
  );
}

describe("usePressMenu — right click, the menu key, a long tap", () => {
  it("a right click opens at the pointer and keeps the browser menu away", () => {
    const onOpen = vi.fn();
    render(<Box onOpen={onOpen} />);
    const ev = fireEvent.contextMenu(screen.getByTestId("box"), { clientX: 40, clientY: 60 });
    expect(ev).toBe(false); // preventDefault
    expect(onOpen).toHaveBeenCalledTimes(1);
    const r = onOpen.mock.calls[0][0] as DOMRect;
    expect([r.x, r.y]).toEqual([40, 60]);
  });

  it("at: element — the item's own box, wherever the click was", () => {
    const onOpen = vi.fn();
    render(<Box onOpen={onOpen} at="element" />);
    const box = screen.getByTestId("box");
    box.getBoundingClientRect = () => new DOMRect(10, 20, 100, 30);
    fireEvent.contextMenu(box, { clientX: 40, clientY: 60 });
    expect((onOpen.mock.calls[0][0] as DOMRect).width).toBe(100);
  });

  it("a long touch opens after 500 ms and swallows the click that follows", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(<Box onOpen={onOpen} onClick={onClick} />);
    const child = screen.getByRole("button", { name: "child" });
    fireEvent.pointerDown(child, { pointerType: "touch", clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(499);
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(child, { pointerType: "touch" });
    fireEvent.contextMenu(child, { clientX: 5, clientY: 5 }); // Android fires it too
    fireEvent.click(child);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("a moving finger (a scroll) cancels the long tap; a short tap clicks", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(<Box onOpen={onOpen} onClick={onClick} />);
    const child = screen.getByRole("button", { name: "child" });
    fireEvent.pointerDown(child, { pointerType: "touch", clientX: 5, clientY: 5 });
    fireEvent.pointerMove(child, { pointerType: "touch", clientX: 5, clientY: 30 });
    vi.advanceTimersByTime(800);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.pointerDown(child, { pointerType: "touch", clientX: 5, clientY: 5 });
    fireEvent.pointerUp(child, { pointerType: "touch" });
    fireEvent.click(child);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 3: Run to see them fail**

Run: `npm run test -w @imprint/web -- Sheet PopoverAnchor usePressMenu` → FAIL (модулей нет, `trigger` обязателен).

- [x] **Step 4: Implement**

`apps/web/src/components/layout.ts`:

```ts
import { createContext, useContext } from "react";

/** UX §1: ≥ 1024 px — desktop (sidebar + two columns); narrower — mobile (one column, a drawer, sheets). */
export type Layout = "desktop" | "mobile";
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** The app provides it from the window's width; without a provider (component tests) it is the desktop. */
export const LayoutContext = createContext<Layout>("desktop");
export const useLayout = (): Layout => useContext(LayoutContext);
```

`apps/web/src/app/useLayoutMode.ts`:

```ts
import { useSyncExternalStore } from "react";
import { DESKTOP_QUERY, type Layout } from "../components/layout";

const query = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DESKTOP_QUERY) : null);

function subscribe(fn: () => void): () => void {
  const mq = query();
  mq?.addEventListener("change", fn);
  return () => mq?.removeEventListener("change", fn);
}

const current = (): Layout => (query()?.matches === false ? "mobile" : "desktop");

/** The layout the window's width asks for; it follows resizes and rotations. */
export function useLayoutMode(): Layout {
  return useSyncExternalStore(subscribe, current);
}
```

`apps/web/src/components/Sheet.tsx`:

```tsx
import * as D from "@radix-ui/react-dialog";
import type { ReactNode, SyntheticEvent } from "react";
import styles from "./Sheet.module.css";

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Mobile: every window is a sheet from the bottom over a scrim (UX §4), so it can never leave the screen. Only a
 * click on the scrim closes it — not its pointerdown, whose click would then land on whatever lies under the scrim
 * and collapse the open row (landing trap). Events inside stop here, as in `Popover`.
 */
export function Sheet({ open, onOpenChange, trigger, label, children }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  trigger?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay
          className={styles.scrim}
          data-overlay
          data-scrim
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(false);
          }}
        />
        <D.Content
          className={styles.sheet}
          data-overlay
          aria-describedby={undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
          onClick={stop}
          onPointerDown={stop}
          onMouseDown={stop}
        >
          <D.Title className={styles.sr}>{label}</D.Title>
          <div className={styles.grab} aria-hidden />
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
```

`apps/web/src/components/Sheet.module.css`:

```css
/* A sheet from the bottom (landing `.pop.sheet`, `.pscrim`). */
.scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(20 22 28 / 0.45);
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 41;
  max-height: 78dvh;
  overflow-y: auto;
  padding: 8px 16px calc(20px + env(safe-area-inset-bottom));
  background: var(--surf);
  color: var(--ink);
  border-top: 1px solid var(--hair);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -12px 32px rgb(20 22 40 / 0.25);
  font-size: 14px;
}

.grab {
  width: 36px;
  height: 4px;
  margin: 2px auto 10px;
  border-radius: 2px;
  background: var(--hair);
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: no-preference) {
  .scrim {
    animation: fade 0.2s;
  }
  .sheet {
    animation: rise 0.25s var(--ease-out);
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    transform: translateY(100%);
  }
}
```

`apps/web/src/components/Popover.tsx` — целиком:

```tsx
import * as P from "@radix-ui/react-popover";
import type { ReactNode, SyntheticEvent } from "react";
import { useLayout } from "./layout";
import styles from "./Popover.module.css";
import { Sheet } from "./Sheet";

const stop = (e: SyntheticEvent) => e.stopPropagation();
const nowhere = () => new DOMRect();

/**
 * Every window (UX §4). Desktop: anchored, pressed to the edge and flipped when it does not fit (Radix collision
 * handling) — at its trigger, or, with no trigger, at `anchor` (a right-click point, a sidebar item). Mobile: a
 * sheet from the bottom. Clicks inside stop here — React bubbles portal events to the row, and the landing learned
 * that a redrawn popover then reads as a click outside. Esc, a click outside or an explicit done closes.
 */
export function Popover({ open, onOpenChange, trigger, anchor, label, children, side = "bottom", align = "start" }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  trigger?: ReactNode;
  anchor?: () => DOMRect;
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const layout = useLayout();
  if (layout === "mobile") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} trigger={trigger} label={label}>
        {children}
      </Sheet>
    );
  }
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <P.Trigger asChild>{trigger}</P.Trigger> : <P.Anchor virtualRef={{ current: { getBoundingClientRect: anchor ?? nowhere } }} />}
      <P.Portal>
        <P.Content
          className={styles.pop}
          data-overlay
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          avoidCollisions
          aria-label={label}
          onClick={stop}
          onPointerDown={stop}
          onMouseDown={stop}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
```

`apps/web/src/components/Popover.module.css` — дописать в конец:

```css
/* A window's footer (mockup `edit-menu.html` `.foot`): a hint left, an action or a key right. */
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--hair);
  color: var(--muted);
  font-size: 12px;
}

.kbd {
  border: 1px solid var(--hair);
  border-radius: 4px;
  padding: 0 5px;
  font: inherit;
  font-size: 11px;
}
```

(Если класса `.name` в `Popover.module.css` нет — `GroupPicker` уже ссылается на `pop.name`; проверить `grep -n "\.name" Popover.module.css` и при отсутствии добавить: `.name { width: 100%; border: 1.5px solid var(--amber); border-radius: 10px; padding: 8px 10px; background: var(--surf); color: var(--ink); outline: none; }`.)

`apps/web/src/components/usePressMenu.ts`:

```ts
import { useRef, type MouseEvent, type PointerEvent } from "react";

const LONG_MS = 500;
const SLOP_PX = 8;

/**
 * The «menu» gesture of an item (UX §4–§5): a right click or the keyboard's menu key on desktop, a long tap on a
 * phone. `open` gets the box to anchor at: the pointer (`at: "point"`, default) or the item itself
 * (`"element"`; also when a keyboard gives no point). A long tap swallows the click that follows it, and the
 * `contextmenu` Android fires after a long tap does not open it twice.
 */
export function usePressMenu(open: (at: DOMRect) => void, opts: { at?: "point" | "element"; longMs?: number } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  const box = (el: Element, x: number, y: number) =>
    opts.at === "element" || (x === 0 && y === 0) ? el.getBoundingClientRect() : new DOMRect(x, y, 0, 0);

  return {
    onContextMenu(e: MouseEvent<HTMLElement>) {
      e.preventDefault();
      cancel();
      if (fired.current) return;
      open(box(e.currentTarget, e.clientX, e.clientY));
    },
    onPointerDown(e: PointerEvent<HTMLElement>) {
      fired.current = false;
      if (e.pointerType === "mouse") return;
      const el = e.currentTarget;
      const { clientX: x, clientY: y } = e;
      start.current = { x, y };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        open(box(el, x, y));
      }, opts.longMs ?? LONG_MS);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
```

- [x] **Step 5: Run to see them pass**

Run: `npm run test -w @imprint/web -- Sheet PopoverAnchor usePressMenu Popover` → PASS (включая старый `Popover.dom.test.tsx`). Затем `npm run check`.

- [x] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/components apps/web/src/app/useLayoutMode.ts
git commit -m "web: layout context, bottom sheet (Radix Dialog) that ignores the scrim's pointerdown, popover at a point, the menu gesture"
```

(Все `git add` в плане — из `platform/`; `package-lock.json` — общий `platform/package-lock.json`.)

---

### Task 3: повтор на строке

**Files:**
- Create: `apps/web/src/components/RepeatPicker.tsx`, `apps/web/src/components/RepeatPicker.module.css`
- Modify: `apps/web/src/components/RowActions.tsx`
- Test: `apps/web/src/components/RepeatPicker.dom.test.tsx`

**Interfaces:**
- Consumes: `toggledDays`, `repeatDays` (store/format), `t.noRepeat`, `t.days`, `t.repeat`, `Popover`.
- Produces: `RepeatPicker({ row: Row })`; в `RowActions` — кнопка `aria-label="Повтор"` (после даты); состояние открытого окна `RowActions` — `type Open = "group" | "repeat" | "steps" | null`.

- [x] **Step 1: Failing test** — `RepeatPicker.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithStore, snapshot, task } from "../test/harness";
import { BacklogColumn } from "./BacklogColumn";

afterEach(cleanup);

const snap = snapshot({ tasks: [task({ id: "t1", title: "Спорт", location: "BACKLOG", enteredDayAt: null })] });
const row = () => screen.getByText("Спорт").closest("[data-row]") as HTMLElement;

describe("repeat (UX §4)", () => {
  it("a day chip saves at once and leaves the window open; the row shows the days", async () => {
    const { calls } = await renderWithStore(<BacklogColumn filter="all" />, snap);
    fireEvent.click(within(row()).getByRole("button", { name: "Повтор" }));
    fireEvent.click(await screen.findByRole("button", { name: "пн" }));
    fireEvent.click(screen.getByRole("button", { name: "чт" }));
    expect(screen.getByRole("button", { name: "чт" }).getAttribute("aria-pressed")).toBe("true");
    expect(row().textContent).toContain("пн чт");
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "set_repeating", input: { taskId: "t1", days: ["mon"] } });
  });

  it("«Не повторять» stops it", async () => {
    const { store } = await renderWithStore(<BacklogColumn filter="all" />, snap);
    fireEvent.click(within(row()).getByRole("button", { name: "Повтор" }));
    fireEvent.click(await screen.findByRole("button", { name: "ср" }));
    fireEvent.click(screen.getByRole("button", { name: /Не повторять/ }));
    expect(store.getState().view?.backlog.ungrouped[0].isRepeating).toBe(false);
  });
});
```

- [x] **Step 2: Run to see it fail** — `npm run test -w @imprint/web -- RepeatPicker` → FAIL (кнопки «Повтор» нет).

- [x] **Step 3: Implement**

`apps/web/src/components/RepeatPicker.tsx`:

```tsx
import { Prohibit } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { repeatDays, toggledDays } from "../store/format";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import pop from "./Popover.module.css";
import styles from "./RepeatPicker.module.css";

/**
 * Repeat (UX §4): Пн–Вс chips and «Не повторять». A chip saves at once and leaves the window open; what repeating
 * means (a backlog definition, its appearances in the Day) is the domain's `set_repeating`.
 */
export function RepeatPicker({ row }: { row: Row }) {
  const t = useT();
  const store = useStoreApi();
  const on = row.isRepeating ? repeatDays(row.recurrenceMask) : [];
  const set = (days: string[] | null) => store.run("set_repeating", { taskId: row.id, days });

  return (
    <div>
      <div className={pop.h}>{t.repeat}</div>
      <div className={styles.days}>
        {t.days.map((name, d) => (
          <button key={name} type="button" className={styles.day} aria-pressed={on.includes(d)} onClick={() => set(toggledDays(row, d))}>
            {name}
          </button>
        ))}
      </div>
      <button type="button" className={`${pop.opt} ${pop.mute} ${on.length === 0 ? pop.on : ""}`} onClick={() => set(null)}>
        <Prohibit size={16} aria-hidden />
        {t.noRepeat}
      </button>
    </div>
  );
}
```

`apps/web/src/components/RepeatPicker.module.css`:

```css
/* Weekday chips (landing `.days`). */
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 6px;
}

.day {
  height: 32px;
  border: 1px solid var(--hair);
  border-radius: 999px;
  font-size: 12px;
}

.day[aria-pressed="true"] {
  background: var(--amber);
  border-color: var(--amber);
  color: var(--on-amber);
  font-weight: 600;
}
```

`apps/web/src/components/RowActions.tsx` — целиком (шаги добавит Task 4, режим ряда — Task 9):

```tsx
import { ArrowsClockwise, CalendarBlank, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n";
import { useStoreApi, useView } from "../store/hooks";
import type { GroupRow, Row } from "../store/view";
import { DateButton } from "./DateButton";
import { GroupIcon } from "./GroupIcon";
import { GroupPicker } from "./GroupPicker";
import { Popover } from "./Popover";
import { RepeatPicker } from "./RepeatPicker";
import styles from "./RowActions.module.css";

type Open = "group" | "repeat" | "steps" | null;

/**
 * A row's actions (UX §4), in order: group label, date, repeat, steps, delete. The domain decides what each does
 * (a future date takes a Day task to the Backlog); the row only asks. `onOpenChange` keeps the row lit while one
 * of their windows is open.
 */
export function RowActions({ row, group, onOpenChange }: { row: Row; group?: GroupRow; onOpenChange?(open: boolean): void }) {
  const t = useT();
  const view = useView();
  const store = useStoreApi();
  const [open, setOpen] = useState<Open>(null);

  const toggle = (k: Exclude<Open, null>) => (o: boolean) => {
    setOpen(o ? k : null);
    onOpenChange?.(o);
  };

  const remove = () => {
    store.run("delete_task", { taskId: row.id });
    store.toast({ text: "deleted", action: { name: "restore_task", input: { taskId: row.id } } });
  };

  return (
    <>
      <Popover
        open={open === "group"}
        onOpenChange={toggle("group")}
        label={t.pickGroup}
        align="end"
        trigger={
          <button type="button" className={group ? styles.tag : `${styles.tag} ${styles.empty}`} aria-label={t.pickGroup} title={group?.name ?? t.group}>
            {group ? (
              <>
                <GroupIcon icon={group.icon} colorKey={group.colorKey} size={13} />
                <span className={styles.gn}>{group.name}</span>
              </>
            ) : (
              <Plus size={12} aria-hidden />
            )}
          </button>
        }
      >
        <GroupPicker
          value={row.groupId}
          onPick={(groupId) => {
            store.run("set_task_group", { taskId: row.id, groupId });
            toggle("group")(false);
          }}
        />
      </Popover>
      <DateButton className={styles.ib} value={row.dueKey} min={view?.today ?? ""} label={t.date} onPick={(date) => store.run("set_due_date", { taskId: row.id, date })}>
        <CalendarBlank size={17} aria-hidden />
      </DateButton>
      <Popover
        open={open === "repeat"}
        onOpenChange={toggle("repeat")}
        label={t.repeat}
        align="end"
        trigger={
          <button type="button" className={styles.ib} aria-label={t.repeat} title={t.repeat}>
            <ArrowsClockwise size={17} aria-hidden />
          </button>
        }
      >
        <RepeatPicker row={row} />
      </Popover>
      <button type="button" className={styles.ib} aria-label={t.delete} title={t.delete} onClick={remove}>
        <Trash size={17} aria-hidden />
      </button>
    </>
  );
}
```

- [x] **Step 4: Run** — `npm run test -w @imprint/web -- RepeatPicker RowActions` → PASS; `npm run check` → зелёный.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components
git commit -m "web: repeat on the row — weekday chips and «Не повторять», the window stays open"
```

---

### Task 4: шаги и «Подсказать шаги»

**Files:**
- Create: `apps/web/src/components/StepsPanel.tsx`, `apps/web/src/components/StepsPanel.module.css`
- Modify: `apps/web/src/components/RowActions.tsx` (кнопка «Шаги» между повтором и удалением), `apps/web/src/components/TaskRow.tsx`, `apps/web/src/components/TaskRow.module.css` (счётчик шагов)
- Test: `apps/web/src/components/StepsPanel.dom.test.tsx`

**Interfaces:**
- Consumes: `Store.ask`, `Row.steps: { task: Task; done: boolean }[]`, `Row.stepsDone`, `Checkbox`, строки Task 1.
- Produces: `StepsPanel({ row: Row })`; кнопка `aria-label="Шаги"` в `RowActions`; в `TaskRow` метка `[data-steps]` «☑ n/m» с `aria-label={t.stepsOf(n, m)}`.

- [x] **Step 1: Failing test** — `StepsPanel.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithStore, snapshot, task } from "../test/harness";
import { DayColumn } from "./DayColumn";
import { Toasts } from "./Toasts";

afterEach(cleanup);

const snap = snapshot({ tasks: [task({ id: "t1", title: "Покупки" })] });
const row = () => screen.getByText("Покупки").closest("[data-row]") as HTMLElement;
const openSteps = async () => {
  fireEvent.click(within(row()).getByRole("button", { name: "Шаги" }));
  return (await screen.findAllByRole("textbox", { name: "Новый шаг" }))[0];
};
const typeStep = (field: HTMLElement, text: string) => {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
};

describe("steps (UX §4)", () => {
  it("Enter adds the step; the window stays open with an empty field; the row counts them", async () => {
    const { calls } = await renderWithStore(<DayColumn />, snap);
    typeStep(await openSteps(), "Список");
    expect(screen.getByText("Список")).toBeTruthy();
    expect((screen.getAllByRole("textbox", { name: "Новый шаг" })[0] as HTMLInputElement).value).toBe("");
    expect(within(row()).getByLabelText("Шаги: 0 из 1")).toBeTruthy();
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "add_steps", input: { taskId: "t1", steps: ["Список"] } });
  });

  it("ticking the last open step closes the task; unticking reopens it; the window stays", async () => {
    const { store } = await renderWithStore(<DayColumn />, snap);
    const field = await openSteps();
    typeStep(field, "Раз");
    typeStep(screen.getAllByRole("textbox", { name: "Новый шаг" })[0], "Два");
    fireEvent.click(screen.getByRole("button", { name: "Отметить: Раз" }));
    expect(store.getState().view?.day[0].doneToday).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Отметить: Два" }));
    expect(store.getState().view?.day[0].doneToday).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Вернуть: Раз" }));
    expect(store.getState().view?.day[0].doneToday).toBe(false);
    expect(screen.getAllByRole("textbox", { name: "Новый шаг" })).toBeTruthy();
  });

  it("«Подсказать шаги» fills fields; «Разбить» adds them all", async () => {
    const { calls } = await renderWithStore(<DayColumn />, snap);
    await openSteps();
    fireEvent.click(screen.getByRole("button", { name: /Подсказать шаги/ }));
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "suggest_steps", input: { taskId: "t1" }, ids: [] });
    await act(async () => calls[0].resolve({ kind: "done", result: { ok: true, changed: false, steps: ["А", "Б"], remaining: 3 }, rev: 1 }));
    const values = screen.getAllByRole("textbox", { name: "Новый шаг" }).map((f) => (f as HTMLInputElement).value);
    expect(values).toEqual(["А", "Б"]);
    fireEvent.click(screen.getByRole("button", { name: "Разбить" }));
    await act(async () => {});
    expect(calls[1]).toMatchObject({ name: "add_steps", input: { taskId: "t1", steps: ["А", "Б"] } });
  });

  it.each([
    [{ kind: "done", result: { ok: false, error: "unavailable" }, rev: -1 }, "Подсказки сейчас недоступны"],
    [{ kind: "done", result: { ok: true, changed: false, reason: "quota", remaining: 0 }, rev: 1 }, "Подсказки на сегодня закончились"],
    [{ kind: "network" }, "Не получилось подсказать"],
  ] as const)("a failed suggestion is a quiet note; typed fields stay; no toast, no queue (%#)", async (answer, note) => {
    const { store, calls } = await renderWithStore(
      <>
        <DayColumn />
        <Toasts />
      </>,
      snap,
    );
    const field = await openSteps();
    fireEvent.change(field, { target: { value: "Моё" } });
    fireEvent.click(screen.getByRole("button", { name: /Подсказать шаги/ }));
    await act(async () => {});
    await act(async () => calls[0].resolve(answer as never));
    expect(screen.getByText(note)).toBeTruthy();
    expect((screen.getAllByRole("textbox", { name: "Новый шаг" })[0] as HTMLInputElement).value).toBe("Моё");
    expect(store.getState().toasts).toHaveLength(0);
    expect(store.getState().pending).toBe(0);
  });

  it("«Разбить» with only blank fields sends nothing", async () => {
    const { calls } = await renderWithStore(<DayColumn />, snap);
    const field = await openSteps();
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Разбить" }));
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });
});
```

- [x] **Step 2: Run to see it fail** — `npm run test -w @imprint/web -- StepsPanel` → FAIL.

- [x] **Step 3: Implement**

`apps/web/src/components/StepsPanel.tsx`:

```tsx
import { Sparkle, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { ToolResult } from "@imprint/domain";
import { useT, type Strings } from "../i18n";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import { Checkbox } from "./Checkbox";
import pop from "./Popover.module.css";
import styles from "./StepsPanel.module.css";

/** Why a suggestion did not come, in the window's quiet line. */
function refusal(r: ToolResult, t: Strings): string {
  if (!r.ok && r.error === "unavailable") return t.suggestUnavailable;
  if (r.ok && r.reason === "quota") return t.suggestQuota;
  return t.suggestFailed;
}

/**
 * «Разбить на шаги» (UX §4, the phone's SplitDialog): the task's steps, each ticked by its circle; fields for new
 * ones; «Подсказать шаги» asks the server (`suggest_steps`) and adds its steps as fields to edit; «Разбить» or Enter
 * adds every filled field. Steps and the task are one state — the domain syncs them; ticking never closes the window.
 */
export function StepsPanel({ row }: { row: Row }) {
  const t = useT();
  const store = useStoreApi();
  const [drafts, setDrafts] = useState<string[]>([""]);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  const split = () => {
    const steps = drafts.map((s) => s.trim()).filter((s) => s !== "");
    if (steps.length === 0) return;
    store.run("add_steps", { taskId: row.id, steps });
    setDrafts([""]);
    setNote(null);
    first.current?.focus();
  };

  const suggest = async () => {
    setAsking(true);
    setNote(null);
    const r = await store.ask("suggest_steps", { taskId: row.id });
    setAsking(false);
    const steps = r.ok && Array.isArray(r.steps) ? (r.steps as unknown[]).filter((s): s is string => typeof s === "string") : [];
    if (steps.length > 0) setDrafts((d) => [...d.filter((s) => s.trim() !== ""), ...steps]);
    else setNote(refusal(r, t));
  };

  const edit = (i: number, value: string) => setDrafts((all) => all.map((x, j) => (j === i ? value : x)));

  return (
    <div className={styles.panel}>
      <div className={pop.h}>{t.steps}</div>
      {row.steps.length === 0 && <p className={styles.hint}>{t.splitHint}</p>}
      {row.steps.map((s) => (
        <div key={s.task.id} className={styles.step} data-done={s.done}>
          <Checkbox
            done={s.done}
            label={s.done ? t.markUndone(s.task.title) : t.markDone(s.task.title)}
            onToggle={() => store.run("set_done", { taskId: s.task.id, done: !s.done })}
          />
          <span className={styles.st}>{s.task.title}</span>
        </div>
      ))}
      {drafts.map((d, i) => (
        <div key={i} className={styles.draft}>
          <input
            ref={i === 0 ? first : undefined}
            className={styles.field}
            value={d}
            placeholder={t.newStep}
            aria-label={t.newStep}
            maxLength={500}
            onChange={(e) => edit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              split();
            }}
          />
          {drafts.length > 1 && (
            <button type="button" className={styles.x} aria-label={t.removeDraft} onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}>
              <X size={13} aria-hidden />
            </button>
          )}
        </div>
      ))}
      {note && (
        <p className={styles.note} aria-live="polite">
          {note}
        </p>
      )}
      <div className={pop.foot}>
        <button type="button" className={styles.suggest} disabled={asking} onClick={() => void suggest()}>
          <Sparkle size={15} aria-hidden />
          {t.suggest}
        </button>
        <button type="button" className={styles.split} onClick={split}>
          {t.split}
        </button>
      </div>
    </div>
  );
}
```

(`import type { ToolResult } from "@imprint/domain"` — type-only, P1-линт это разрешает.)

`apps/web/src/components/StepsPanel.module.css`:

```css
.panel {
  width: 100%;
}

.hint,
.note {
  margin: 2px 4px 8px;
  color: var(--muted);
  font-size: 12px;
}

.step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
}

.st {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.step[data-done="true"] .st {
  color: var(--done);
  text-decoration: line-through;
}

.draft {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.field {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--hair);
  border-radius: 10px;
  padding: 7px 10px;
  background: var(--surf);
  outline: none;
}

.field:focus {
  border-color: var(--amber);
}

.x {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: var(--muted);
}

.suggest {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink);
}

.suggest:disabled {
  opacity: 0.5;
  cursor: default;
}

.split {
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--amber);
  color: var(--on-amber);
  font-weight: 600;
}
```

`apps/web/src/components/RowActions.tsx` — импорт `ListChecks` из `@phosphor-icons/react` и `StepsPanel`; между повтором и удалением:

```tsx
      <Popover
        open={open === "steps"}
        onOpenChange={toggle("steps")}
        label={t.steps}
        align="end"
        trigger={
          <button type="button" className={styles.ib} aria-label={t.steps} title={t.steps}>
            <ListChecks size={17} aria-hidden />
          </button>
        }
      >
        <StepsPanel row={row} />
      </Popover>
```

`apps/web/src/components/TaskRow.tsx` — импорт `ListChecks`; сразу после `<span className={styles.t}>{row.title}</span>`:

```tsx
        {row.steps.length > 0 && (
          <span className={styles.steps} data-steps aria-label={t.stepsOf(row.stepsDone, row.steps.length)}>
            <ListChecks size={13} aria-hidden />
            {row.stepsDone}/{row.steps.length}
          </span>
        )}
```

`TaskRow.module.css` — в селектор `.meta, .rep, .date` добавить `.steps`, и:

```css
.steps {
  color: var(--muted);
}
```

- [x] **Step 4: Run** — `npm run test -w @imprint/web -- StepsPanel TaskRow RowActions` → PASS; `npm run check`.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components
git commit -m "web: steps window — tick, add, «Подсказать шаги» via the server tool, «Разбить»; step counter on the row"
```

---

### Task 5: название задачи по правому клику

**Files:**
- Create: `apps/web/src/components/useTypingSave.ts`, `apps/web/src/components/TitleEditor.tsx`
- Modify: `apps/web/src/components/TaskRow.tsx` (проп `handlers`), `apps/web/src/components/RowWithActions.tsx`
- Test: `apps/web/src/components/TitleEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `usePressMenu`, `Popover` c `anchor`, `t.taskTitle`, `t.savedAsTyped`, `t.done`, `pop.foot`, `pop.kbd`, `pop.name`.
- Produces: `useTypingSave(save: (value: string) => void, ms = 300): { type(value: string): void; flush(): void }` (на размонтировании сохраняет остаток); `TitleEditor({ row, onDone })`; `TaskRow` принимает `handlers?: HTMLAttributes<HTMLDivElement>` (раскладываются на корень строки).

- [ ] **Step 1: Failing test** — `TitleEditor.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithStore, snapshot, task } from "../test/harness";
import { DayColumn } from "./DayColumn";
import { Toasts } from "./Toasts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const snap = snapshot({ tasks: [task({ id: "t1", title: "Молоко" })] });
const row = () => screen.getByText(/Молоко|Кефир/).closest("[data-row]") as HTMLElement;
const field = () => screen.getByRole("textbox", { name: "Название задачи" }) as HTMLInputElement;

describe("task title by right click (UX §4)", () => {
  it("opens at the click with the title; saves after a pause; Enter closes", async () => {
    const { store, calls } = await renderWithStore(<DayColumn />, snap);
    vi.useFakeTimers();
    fireEvent.contextMenu(row(), { clientX: 200, clientY: 120 });
    expect(field().value).toBe("Молоко");
    fireEvent.change(field(), { target: { value: "Кефир" } });
    expect(store.getState().view?.day[0].title).toBe("Молоко");
    act(() => vi.advanceTimersByTime(300));
    expect(store.getState().view?.day[0].title).toBe("Кефир");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(screen.queryByRole("textbox", { name: "Название задачи" })).toBeNull();
    vi.useRealTimers();
    await act(async () => {});
    expect(calls.filter((c) => c.name === "rename_task")).toHaveLength(1);
  });

  it("Esc before the pause still saves the last text", async () => {
    const { store } = await renderWithStore(<DayColumn />, snap);
    fireEvent.contextMenu(row(), { clientX: 200, clientY: 120 });
    fireEvent.change(field(), { target: { value: "Кефир" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(store.getState().view?.day[0].title).toBe("Кефир");
  });

  it("a blank title is never sent and no «Не сохранилось» shows", async () => {
    const { store, calls } = await renderWithStore(
      <>
        <DayColumn />
        <Toasts />
      </>,
      snap,
    );
    fireEvent.contextMenu(row(), { clientX: 200, clientY: 120 });
    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.keyDown(field(), { key: "Enter" });
    await act(async () => {});
    expect(calls).toHaveLength(0);
    expect(store.getState().toasts).toHaveLength(0);
    expect(store.getState().view?.day[0].title).toBe("Молоко");
  });

  it("a left click on the text opens nothing", async () => {
    await renderWithStore(<DayColumn />, snap);
    fireEvent.click(screen.getByText("Молоко"));
    expect(screen.queryByRole("textbox", { name: "Название задачи" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npm run test -w @imprint/web -- TitleEditor` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/components/useTypingSave.ts`:

```ts
import { useCallback, useEffect, useRef } from "react";

/**
 * Save as you type (UX §4–§5): the last value goes `ms` after typing stops, and at once on `flush` or when the
 * window closes (unmount) — never one call per keystroke (the queue and every other tab would get them all).
 */
export function useTypingSave(save: (value: string) => void, ms = 300): { type(value: string): void; flush(): void } {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = last.current;
    last.current = null;
    if (v !== null) saveRef.current(v);
  }, []);

  useEffect(() => flush, [flush]);

  const type = useCallback(
    (value: string) => {
      last.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    [flush, ms],
  );

  return { type, flush };
}
```

`apps/web/src/components/TitleEditor.tsx`:

```tsx
import { useState } from "react";
import { useT } from "../i18n";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import pop from "./Popover.module.css";
import { useTypingSave } from "./useTypingSave";

/** «Название задачи» (UX §4): saved as you type; Enter or Esc closes. A blank title is not sent. */
export function TitleEditor({ row, onDone }: { row: Row; onDone(): void }) {
  const t = useT();
  const store = useStoreApi();
  const [value, setValue] = useState(row.title);
  const saver = useTypingSave((v) => {
    if (v.trim() !== "") store.run("rename_task", { taskId: row.id, title: v });
  });

  return (
    <div>
      <div className={pop.h}>{t.taskTitle}</div>
      <input
        className={pop.name}
        autoFocus
        value={value}
        aria-label={t.taskTitle}
        maxLength={500}
        onChange={(e) => {
          setValue(e.target.value);
          saver.type(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          saver.flush();
          onDone();
        }}
      />
      <div className={pop.foot}>
        <span>{t.savedAsTyped}</span>
        <span>
          <kbd className={pop.kbd}>Enter</kbd> {t.done}
        </span>
      </div>
    </div>
  );
}
```

`apps/web/src/components/TaskRow.tsx` — сигнатура и корень:

```tsx
export function TaskRow({ row, where, group, actions, active = false, handlers }: {
  row: Row;
  where: "day" | "backlog";
  group?: GroupRow;
  actions?: ReactNode;
  active?: boolean;
  /** Gesture handlers for the whole row: the menu gesture (right click, long tap), the phone's tap. */
  handlers?: HTMLAttributes<HTMLDivElement>;
}) {
```

```tsx
    <div className={styles.row} data-row data-id={row.id} data-done={done} data-fresh={fresh} data-active={active} {...handlers}>
```

(импорт `type HTMLAttributes` из `react`).

`apps/web/src/components/RowWithActions.tsx` — целиком:

```tsx
import { useState } from "react";
import { useT } from "../i18n";
import type { GroupRow, Row } from "../store/view";
import { Popover } from "./Popover";
import { RowActions } from "./RowActions";
import { TaskRow } from "./TaskRow";
import { TitleEditor } from "./TitleEditor";
import { usePressMenu } from "./usePressMenu";

/**
 * A desktop row with its hover actions; while one of their windows is open the row stays lit. A right click (or
 * the menu key) opens «Название задачи» at the click; a left click on the text does nothing (UX §4).
 */
export function RowWithActions({ row, where, group }: { row: Row; where: "day" | "backlog"; group?: GroupRow }) {
  const t = useT();
  const [active, setActive] = useState(false);
  const [renameAt, setRenameAt] = useState<DOMRect | null>(null);
  const press = usePressMenu(setRenameAt);

  return (
    <>
      <TaskRow
        row={row}
        where={where}
        group={group}
        active={active || renameAt !== null}
        handlers={press}
        actions={<RowActions row={row} group={group} onOpenChange={setActive} />}
      />
      <Popover open={renameAt !== null} onOpenChange={(o) => !o && setRenameAt(null)} anchor={() => renameAt ?? new DOMRect()} label={t.taskTitle}>
        <TitleEditor row={row} onDone={() => setRenameAt(null)} />
      </Popover>
    </>
  );
}
```

- [ ] **Step 4: Run** — `npm run test -w @imprint/web -- TitleEditor TaskRow RowActions` → PASS; `npm run check`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components
git commit -m "web: task title by right click — saved as you type (300 ms), Enter/Esc close, a blank title is not sent"
```

---

### Task 6: правка группы в сайдбаре

**Files:**
- Create: `apps/web/src/components/NavItem.tsx`, `apps/web/src/components/GroupFilters.tsx`, `apps/web/src/components/GroupEditor.tsx`, `apps/web/src/components/GroupEditor.module.css`
- Modify: `apps/web/src/components/Sidebar.tsx`
- Test: `apps/web/src/components/GroupEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `usePressMenu({ at: "element" })`, `useTypingSave`, `Popover` c `anchor`, `GROUP_ICONS`, `GROUP_COLOR_KEYS` (store/look), `t.colors`, `t.iconNames`, `store.toast("groupDeleted")`.
- Produces: `NavItem(props)` — пункт сайдбара (то, что было локальным `Item` в `Sidebar.tsx`), принимает и прокидывает на `<button>` любые `ButtonHTMLAttributes` и `ref`; `GroupFilters({ filter, onPick })` — список групп сайдбара с правкой (Task 7 добавит порядок); `GroupEditor({ group, onClose })`.

- [ ] **Step 1: Failing test** — `GroupEditor.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { group, renderWithStore, snapshot, task } from "../test/harness";
import { Sidebar } from "./Sidebar";
import { Toasts } from "./Toasts";

afterEach(cleanup);

const snap = snapshot({
  groups: [group({ id: "g1", name: "Дом", colorKey: "amber", icon: "tag" })],
  tasks: [task({ id: "t1", title: "Полка", location: "BACKLOG", enteredDayAt: null, groupId: "g1" })],
});
const ui = (
  <>
    <Sidebar route={{ screen: "day", filter: "all" }} go={() => {}} />
    <Toasts />
  </>
);
const openEditor = () => fireEvent.contextMenu(screen.getByRole("button", { name: /Дом/ }), { clientX: 30, clientY: 200 });

describe("group edit by right click (UX §5)", () => {
  it("icon and colour save at once and keep the window open", async () => {
    const { store, calls } = await renderWithStore(ui, snap);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Работа" }));
    fireEvent.click(screen.getByRole("button", { name: "Бирюза" }));
    expect(store.getState().view?.groups[0]).toMatchObject({ icon: "briefcase", colorKey: "teal" });
    expect(screen.getByRole("button", { name: "Бирюза" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Название" })).toBeTruthy();
    await act(async () => {});
    expect(calls.map((c) => c.name)).toEqual(["set_group_icon"]);
  });

  it("the name saves as typed; blank is not sent", async () => {
    const { store } = await renderWithStore(ui, snap);
    openEditor();
    const name = screen.getByRole("textbox", { name: "Название" });
    fireEvent.change(name, { target: { value: " " } });
    fireEvent.keyDown(name, { key: "Escape" });
    expect(store.getState().view?.groups[0].name).toBe("Дом");
    openEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "Дача" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Название" }), { key: "Enter" });
    expect(store.getState().view?.groups[0].name).toBe("Дача");
  });

  it("«Удалить группу»: gone at once, its task stays without a group; «Отменить» brings both back", async () => {
    const { store } = await renderWithStore(ui, snap);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Удалить группу/ }));
    expect(screen.queryByRole("textbox", { name: "Название" })).toBeNull();
    expect(store.getState().view?.groups).toHaveLength(0);
    expect(store.getState().view?.backlog.ungrouped[0].id).toBe("t1");
    expect(screen.getByRole("status").textContent).toContain("Группа удалена");
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(store.getState().view?.groups[0].name).toBe("Дом");
    expect(store.getState().view?.backlog.groups[0].tasks[0].id).toBe("t1");
  });

  it("the editor closes when its group disappears and does not come back after undo", async () => {
    const { store } = await renderWithStore(ui, snap);
    openEditor();
    act(() => void store.run("delete_group", { groupId: "g1" }));
    expect(screen.queryByRole("textbox", { name: "Название" })).toBeNull();
    act(() => void store.run("restore_group", { groupId: "g1" }));
    expect(screen.queryByRole("textbox", { name: "Название" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npm run test -w @imprint/web -- GroupEditor` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/components/NavItem.tsx` — перенос `Item` из `Sidebar.tsx` с пробросом атрибутов:

```tsx
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Sidebar.module.css";

/** A sidebar item: the screen (amber bar, `current`) or a backlog filter (lit text, `pressed`), with a counter. */
export function NavItem({ icon, label, count, current, pressed, onClick, ref, className, ...rest }: {
  icon: ReactNode;
  label: string;
  count?: number;
  current?: boolean;
  pressed?: boolean;
  onClick(): void;
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const cls = [styles.it, current ? styles.sel : "", pressed ? styles.flt : "", className ?? ""].join(" ");
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      className={cls}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
    >
      <span className={styles.ic} aria-hidden>
        {icon}
      </span>
      <span className={styles.lb}>{label}</span>
      {count !== undefined && count > 0 && <span className={styles.n}>{count}</span>}
    </button>
  );
}
```

`apps/web/src/components/GroupEditor.tsx`:

```tsx
import { Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n";
import { useStoreApi } from "../store/hooks";
import { GROUP_COLOR_KEYS, GROUP_ICONS } from "../store/look";
import type { GroupRow } from "../store/view";
import styles from "./GroupEditor.module.css";
import { GroupIcon } from "./GroupIcon";
import pop from "./Popover.module.css";
import { useTypingSave } from "./useTypingSave";

/**
 * Group edit (UX §5, mockup `edit-menu.html`): name (saved as you type), icon grid, colours, «Удалить группу».
 * Picks never close the window. Delete does: the group goes at once, its tasks stay without a group, and the
 * toast's «Отменить» brings both back (`restore_group`).
 */
export function GroupEditor({ group, onClose }: { group: GroupRow; onClose(): void }) {
  const t = useT();
  const store = useStoreApi();
  const [name, setName] = useState(group.name);
  const saver = useTypingSave((v) => {
    if (v.trim() !== "") store.run("rename_group", { groupId: group.id, name: v });
  });

  const remove = () => {
    store.run("delete_group", { groupId: group.id });
    store.toast({ text: "groupDeleted", action: { name: "restore_group", input: { groupId: group.id } } });
    onClose();
  };

  return (
    <div className={styles.ed}>
      <div className={pop.h}>{t.groupName}</div>
      <input
        className={pop.name}
        autoFocus
        value={name}
        aria-label={t.groupName}
        maxLength={80}
        onChange={(e) => {
          setName(e.target.value);
          saver.type(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          saver.flush();
          onClose();
        }}
      />
      <div className={pop.h}>{t.icon}</div>
      <div className={styles.icons}>
        {GROUP_ICONS.map((k) => (
          <button key={k} type="button" className={styles.icon} aria-label={t.iconNames[k]} aria-pressed={group.icon === k} onClick={() => store.run("set_group_icon", { groupId: group.id, icon: k })}>
            <GroupIcon icon={k} colorKey={null} size={17} />
          </button>
        ))}
      </div>
      <div className={pop.h}>{t.color}</div>
      <div className={styles.colors}>
        {GROUP_COLOR_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.swatch}
            style={{ background: `var(--g-${k})` }}
            aria-label={t.colors[k]}
            aria-pressed={group.colorKey === k}
            onClick={() => store.run("set_group_color", { groupId: group.id, colorKey: k })}
          />
        ))}
      </div>
      <div className={pop.foot}>
        <button type="button" className={styles.del} onClick={remove}>
          <Trash size={14} aria-hidden />
          {t.deleteGroup}
        </button>
        <span>
          <kbd className={pop.kbd}>Esc</kbd> {t.close}
        </span>
      </div>
    </div>
  );
}
```

`apps/web/src/components/GroupEditor.module.css`:

```css
.ed {
  width: 256px;
  max-width: 100%;
}

.icons {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 4px;
}

.icon {
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
}

.icon:hover {
  background: var(--soft);
}

.icon[aria-pressed="true"] {
  background: var(--ink);
}

.icon[aria-pressed="true"] svg {
  fill: var(--surf);
}

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.35);
}

.swatch[aria-pressed="true"] {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.del {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--danger);
}

@media (max-width: 1023px) {
  .ed {
    width: 100%;
  }
}
```

`apps/web/src/components/GroupFilters.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useView } from "../store/hooks";
import type { GroupRow } from "../store/view";
import { GroupEditor } from "./GroupEditor";
import { GroupIcon } from "./GroupIcon";
import { NavItem } from "./NavItem";
import { Popover } from "./Popover";
import { usePressMenu } from "./usePressMenu";

/**
 * The sidebar's groups (UX §2, §5): a click filters the backlog; a right click (a long tap on a phone) opens the
 * edit window to the right of the item. The window closes for good when its group is gone — deleted here or in
 * another tab — and does not reopen if «Отменить» brings the group back.
 */
export function GroupFilters({ filter, onPick }: { filter: string | null; onPick(groupId: string): void }) {
  const t = useT();
  const view = useView();
  const [editing, setEditing] = useState<{ id: string; at: DOMRect } | null>(null);
  const groups = view?.groups ?? [];
  const edited = editing ? groups.find((g) => g.id === editing.id) : undefined;

  useEffect(() => {
    if (editing && !edited) setEditing(null);
  }, [editing, edited]);

  return (
    <>
      {groups.map((g) => (
        <GroupItem key={g.id} group={g} pressed={filter === g.id} onPick={onPick} onEdit={(at) => setEditing({ id: g.id, at })} />
      ))}
      <Popover
        open={edited !== undefined}
        onOpenChange={(o) => !o && setEditing(null)}
        anchor={() => editing?.at ?? new DOMRect()}
        label={edited ? edited.name : t.group}
        side="right"
        align="start"
      >
        {edited && <GroupEditor group={edited} onClose={() => setEditing(null)} />}
      </Popover>
    </>
  );
}

function GroupItem({ group, pressed, onPick, onEdit }: { group: GroupRow; pressed: boolean; onPick(id: string): void; onEdit(at: DOMRect): void }) {
  const press = usePressMenu(onEdit, { at: "element" });
  return (
    <NavItem
      {...press}
      icon={<GroupIcon icon={group.icon} colorKey={group.colorKey} size={17} onSide />}
      label={group.name}
      count={group.openCount}
      pressed={pressed}
      onClick={() => onPick(group.id)}
    />
  );
}
```

`apps/web/src/components/Sidebar.tsx` — удалить локальный `Item`, импортировать `NavItem` и `GroupFilters`; все `<Item …/>` → `<NavItem …/>`; блок `view?.groups.map(...)` заменить на:

```tsx
        <GroupFilters filter={filter} onPick={(id) => go({ screen: "day", filter: id })} />
```

- [ ] **Step 4: Run** — `npm run test -w @imprint/web -- GroupEditor Sidebar` → PASS (включая старый `Sidebar.dom.test.tsx`); `npm run check`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components
git commit -m "web: group edit by right click — name as you type, icon, colour, delete with undo; the editor closes when its group is gone"
```

---

### Task 7: перетаскивание задач и порядок групп

**Files:**
- Modify: `apps/web/package.json` (зависимости)
- Create: `apps/web/src/components/drag.ts`, `apps/web/src/components/DragArea.tsx`, `apps/web/src/components/DragArea.module.css`, `apps/web/src/components/ListRow.tsx`
- Modify: `apps/web/src/components/DayColumn.tsx`, `apps/web/src/components/BacklogColumn.tsx`, `apps/web/src/components/Column.module.css`, `apps/web/src/components/GroupFilters.tsx`, `apps/web/src/screens/DayScreen.tsx`
- Test: `apps/web/src/components/drag.test.ts`, `apps/web/src/components/drag.dom.test.tsx`

**Interfaces:**
- Consumes: `move_task { taskId, to: "day"|"backlog", filterGroupId? }`, `reorder_groups { groupIds }`, `TaskRow`, `RowWithActions`.
- Produces: `type Column = "day" | "backlog"`; `interface DragData { row: Row; from: Column }`; `dropCall(taskId, from, to, filter): { name: "move_task"; input: Record<string, unknown> } | null`; `reordered(ids, active, over): string[] | null`; `canStartDrag(target: Element): boolean`; `DragArea({ filter, children })`, `DragOn` (context), `useDropZone(id: Column): { ref, lit }`, `DraggableRow({ row, where, children })`; `ListRow({ row, where, group })` — строка по раскладке (Task 9 добавит мобильную ветку); у секций бэклога `role="group"` + `aria-label` (имя группы или «Без группы»).

- [ ] **Step 1: Dependencies**

Run (из `platform/`): `npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2 -w @imprint/web` → проверить `apps/web/package.json`.

- [ ] **Step 2: Failing tests**

`apps/web/src/components/drag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dropCall, reordered } from "./drag";

describe("dropCall — UX §4's three rules are move_task's; the UI only says where", () => {
  it("Day → Backlog with «Все задачи»: no filter group (the task keeps its own)", () => {
    expect(dropCall("t1", "day", "backlog", "all")).toEqual({ name: "move_task", input: { taskId: "t1", to: "backlog" } });
  });
  it("Day → Backlog filtered by a group: the task takes it", () => {
    expect(dropCall("t1", "day", "backlog", "g1")).toEqual({ name: "move_task", input: { taskId: "t1", to: "backlog", filterGroupId: "g1" } });
  });
  it("Backlog → Day", () => {
    expect(dropCall("t1", "backlog", "day", "g1")).toEqual({ name: "move_task", input: { taskId: "t1", to: "day" } });
  });
  it("dropped where it started, or nowhere: nothing", () => {
    expect(dropCall("t1", "day", "day", "all")).toBeNull();
    expect(dropCall("t1", "day", null, "all")).toBeNull();
  });
});

describe("reordered — the whole group list after a drag (reorder_groups)", () => {
  it("moves the dragged id to the target's place", () => {
    expect(reordered(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(reordered(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });
  it("no target, itself, or an unknown id: nothing", () => {
    expect(reordered(["a", "b"], "a", null)).toBeNull();
    expect(reordered(["a", "b"], "a", "a")).toBeNull();
    expect(reordered(["a", "b"], "x", "a")).toBeNull();
  });
});
```

`apps/web/src/components/drag.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { canStartDrag } from "./drag";

describe("canStartDrag — any part of the row except the circle and the icons (UX §4)", () => {
  it("the text starts a drag; buttons, inputs and marked parts do not", () => {
    document.body.innerHTML = `
      <div data-row>
        <button id="circle"><span id="dot"></span></button>
        <span id="text">Молоко</span>
        <span data-no-drag><span id="marked"></span></span>
        <input id="date" type="date" />
      </div>`;
    const el = (id: string) => document.getElementById(id) as Element;
    expect(canStartDrag(el("text"))).toBe(true);
    expect(canStartDrag(el("circle"))).toBe(false);
    expect(canStartDrag(el("dot"))).toBe(false);
    expect(canStartDrag(el("date"))).toBe(false);
    expect(canStartDrag(el("marked"))).toBe(false);
  });
});
```

- [ ] **Step 3: Run to see them fail** — `npm run test -w @imprint/web -- drag` → FAIL.

- [ ] **Step 4: Implement**

`apps/web/src/components/drag.ts`:

```ts
import type { Row } from "../store/view";

export type Column = "day" | "backlog";
export interface DragData {
  row: Row;
  from: Column;
}

/**
 * The call a dropped task makes (UX §4). The three rules — the group kept or taken from the filter, the date
 * dropped in the Day — are `move_task`'s; the UI only says where it landed. Null: it landed where it started.
 */
export function dropCall(taskId: string, from: Column, to: Column | null, filter: string): { name: "move_task"; input: Record<string, unknown> } | null {
  if (to === null || to === from) return null;
  const input: Record<string, unknown> = { taskId, to };
  if (to === "backlog" && filter !== "all") input.filterGroupId = filter;
  return { name: "move_task", input };
}

/** The group order after dragging `active` onto `over` — `reorder_groups` takes the whole list. */
export function reordered(ids: readonly string[], active: string, over: string | null): string[] | null {
  if (over === null || active === over) return null;
  const from = ids.indexOf(active);
  const to = ids.indexOf(over);
  if (from < 0 || to < 0) return null;
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** A drag starts on any part of a row except the circle, the icons and the date field (UX §4). */
export function canStartDrag(target: Element): boolean {
  return target.closest("button, input, a, [data-no-drag]") === null;
}
```

`apps/web/src/components/DragArea.tsx`:

```tsx
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { createContext, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import styles from "./DragArea.module.css";
import { canStartDrag, dropCall, type Column, type DragData } from "./drag";
import { TaskRow } from "./TaskRow";

/** Rows are draggable only inside a DragArea (the desktop Day screen); elsewhere — tests, mobile — they are plain. */
export const DragOn = createContext(false);

/** A left-button press on the row itself (not its circle or icons), and only after 6 px — a click stays a click. */
class RowSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: e }: ReactPointerEvent) => e.isPrimary && e.button === 0 && canStartDrag(e.target as Element),
    },
  ];
}

/**
 * Drag between the Day and the Backlog (UX §4): the target column gets a dashed amber outline, the row's old place
 * turns dashed, a lifted copy follows the pointer. The drop is one `move_task`; the domain decides the rest.
 */
export function DragArea({ filter, children }: { filter: string; children: ReactNode }) {
  const store = useStoreApi();
  const [lifted, setLifted] = useState<DragData | null>(null);
  const sensors = useSensors(useSensor(RowSensor, { activationConstraint: { distance: 6 } }));

  const onStart = (e: DragStartEvent) => setLifted((e.active.data.current as DragData | undefined) ?? null);
  const onEnd = (e: DragEndEvent) => {
    const d = e.active.data.current as DragData | undefined;
    setLifted(null);
    if (!d) return;
    const call = dropCall(d.row.id, d.from, (e.over?.id as Column | undefined) ?? null, filter);
    if (call) store.run(call.name, call.input);
  };

  return (
    <DragOn.Provider value={true}>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setLifted(null)}>
        {children}
        <DragOverlay dropAnimation={null}>
          {lifted && (
            <div className={styles.lifted}>
              <TaskRow row={lifted.row} where={lifted.from} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragOn.Provider>
  );
}

/** A column as a drop target; `lit` while a row from the other column is over it. Inert outside a DragArea. */
export function useDropZone(id: Column): { ref: (el: HTMLElement | null) => void; lit: boolean } {
  const { setNodeRef, isOver, active } = useDroppable({ id });
  const from = (active?.data.current as DragData | undefined)?.from;
  return { ref: setNodeRef, lit: isOver && from !== undefined && from !== id };
}

/** A row that can be picked up; a routine shown in both columns has one id per column. */
export function DraggableRow({ row, where, children }: { row: Row; where: Column; children: ReactNode }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `${where}:${row.id}`, data: { row, from: where } satisfies DragData });
  return (
    <div ref={setNodeRef} {...listeners} className={styles.slot} data-dragging={isDragging}>
      {children}
    </div>
  );
}
```

`apps/web/src/components/DragArea.module.css`:

```css
/* The row's old place while it is dragged: dashed and faint (UX §4 «пунктир показывает место»). */
.slot[data-dragging="true"] > [data-row] {
  border-style: dashed;
  border-color: var(--amber);
  opacity: 0.45;
}

/* The lifted copy (UX §6: lifting while dragging). */
.lifted {
  cursor: grabbing;
}

.lifted > [data-row] {
  box-shadow: 0 14px 30px rgb(30 39 73 / 0.22);
  border-color: var(--amber);
}

@media (prefers-reduced-motion: no-preference) {
  .lifted > [data-row] {
    transform: rotate(-1deg) scale(1.02);
  }
}
```

`apps/web/src/components/ListRow.tsx`:

```tsx
import { useContext } from "react";
import type { GroupRow, Row } from "../store/view";
import { DraggableRow, DragOn } from "./DragArea";
import type { Column } from "./drag";
import { RowWithActions } from "./RowWithActions";

/** A list's row as the layout wants it: desktop — hover actions, draggable inside a DragArea. */
export function ListRow({ row, where, group }: { row: Row; where: Column; group?: GroupRow }) {
  const drag = useContext(DragOn);
  const inner = <RowWithActions row={row} where={where} group={group} />;
  return drag ? (
    <DraggableRow row={row} where={where}>
      {inner}
    </DraggableRow>
  ) : (
    inner
  );
}
```

`apps/web/src/components/DayColumn.tsx` — `RowWithActions` → `ListRow`; зона сброса на корне:

```tsx
  const drop = useDropZone("day");
  ...
    <section ref={drop.ref} className={styles.col} data-drop={drop.lit}>
  ...
            <ListRow key={row.id} row={row} where="day" group={row.groupId ? groups.get(row.groupId) : undefined} />
```

`apps/web/src/components/BacklogColumn.tsx` — `RowWithActions` → `ListRow`; `const drop = useDropZone("backlog");` на `<section ref={drop.ref} … data-drop={drop.lit}>`; у `Section`:

```tsx
    <div className={styles.section} role="group" aria-label={group?.name ?? label}>
```

`apps/web/src/components/Column.module.css` — дописать:

```css
/* A drop target while a row from the other column is over it. */
.col[data-drop="true"] {
  outline: 2px dashed var(--amber);
  outline-offset: 6px;
  border-radius: var(--r-row);
}
```

`apps/web/src/screens/DayScreen.tsx` — обернуть колонки:

```tsx
          <DragArea filter={filter}>
            <div className={styles.cols}>
              <DayColumn />
              <BacklogColumn filter={filter} />
            </div>
          </DragArea>
```

`apps/web/src/components/GroupFilters.tsx` — порядок групп перетаскиванием (десктоп). Импорты: `DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent` из `@dnd-kit/core`; `SortableContext, useSortable, verticalListSortingStrategy` из `@dnd-kit/sortable`; `CSS` из `@dnd-kit/utilities`; `useStoreApi`; `useLayout`; `reordered`. В `GroupFilters`:

```tsx
  const store = useStoreApi();
  const layout = useLayout();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const ids = groups.map((g) => g.id);
  const onEnd = (e: DragEndEvent) => {
    const next = reordered(ids, String(e.active.id), e.over ? String(e.over.id) : null);
    if (next) store.run("reorder_groups", { groupIds: next });
  };
```

список групп оборачивается:

```tsx
      <DndContext sensors={sensors} onDragEnd={onEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {groups.map((g) => (
            <GroupItem key={g.id} group={g} sortable={layout === "desktop"} pressed={filter === g.id} onPick={onPick} onEdit={(at) => setEditing({ id: g.id, at })} />
          ))}
        </SortableContext>
      </DndContext>
```

`GroupItem` — сортируемый (на мобильном выключен, решение 3); `attributes` dnd-kit **не** раскладываются (они переписали бы `aria-pressed` фильтра), обработчик `onPointerDown` объединяется с жестом меню:

```tsx
function GroupItem({ group, sortable, pressed, onPick, onEdit }: {
  group: GroupRow;
  sortable: boolean;
  pressed: boolean;
  onPick(id: string): void;
  onEdit(at: DOMRect): void;
}) {
  const press = usePressMenu(onEdit, { at: "element" });
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: group.id, disabled: !sortable });
  return (
    <NavItem
      {...press}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}
      onPointerDown={(e) => {
        press.onPointerDown(e);
        listeners?.onPointerDown?.(e);
      }}
      icon={<GroupIcon icon={group.icon} colorKey={group.colorKey} size={17} onSide />}
      label={group.name}
      count={group.openCount}
      pressed={pressed}
      onClick={() => onPick(group.id)}
    />
  );
}
```

- [ ] **Step 5: Run** — `npm run test -w @imprint/web` → PASS (все старые dom-тесты колонок и сайдбара тоже: вне `DragArea` строки простые, `useDroppable` вне `DndContext` инертен); `npm run check`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src
git commit -m "web: drag tasks between the Day and the Backlog (move_task) and groups in the sidebar (reorder_groups), dnd-kit"
```

---

### Task 8: мобильная раскладка — оболочка, меню, адреса, ввод

**Files:**
- Modify: `apps/web/src/app/router.ts`, `apps/web/src/app/App.tsx`, `apps/web/src/app/useRouteGuards.ts`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/Composer.tsx`, `apps/web/src/components/Composer.module.css`, `apps/web/src/components/Column.module.css`
- Create: `apps/web/src/app/mobileNav.ts`, `apps/web/src/app/MobileRoot.tsx`, `apps/web/src/components/MobileShell.tsx`, `apps/web/src/components/MobileShell.module.css`, `apps/web/src/screens/MobileList.tsx`, `apps/web/src/screens/MobileList.module.css`
- Test: `apps/web/src/app/mobileNav.test.ts`, `apps/web/src/app/MobileRoot.dom.test.tsx`, `apps/web/src/components/ComposerMobile.dom.test.tsx`

**Interfaces:**
- Consumes: `LayoutContext`, `useLayoutMode`, `Sidebar`, `DayColumn`, `BacklogColumn`, `Composer`, `MetaStub`.
- Produces: `router.ts`: `isBacklogPath(path)`, `backlogPath(filter)`, `navigatePath(path, opts?)`, `usePath()`; `mobileNav.ts`: `type MobileScreen = "day" | "backlog" | "history" | "settings"`, `mobileScreen(route, path)`, `mobileStep(from, to)`, `goMobile(to)`, `plantDay()`; `MobileRoot({ route })`; `MobileShell({ sidebar, drawer, onDrawer, children })`; `MobileList({ list, filter })`; `Sidebar` — необязательный проп `mobile?: { backlog: boolean; onFilter(filter: string): void }`; `Composer` — необязательный проп `backlogAll?: boolean`; `useRouteGuards(route, go, opts?: { restore?: boolean })`.

- [ ] **Step 1: Failing tests**

`apps/web/src/app/mobileNav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backlogPath, isBacklogPath, parseRoute } from "./router";
import { mobileScreen, mobileStep } from "./mobileNav";

describe("mobile addresses (UX §2)", () => {
  it("/g/... is the Backlog screen; / is the Day", () => {
    expect(isBacklogPath("/g/all")).toBe(true);
    expect(isBacklogPath("/g/abc")).toBe(true);
    expect(isBacklogPath("/")).toBe(false);
    expect(isBacklogPath("/history")).toBe(false);
    expect(backlogPath("all")).toBe("/g/all");
    expect(backlogPath("a b")).toBe("/g/a%20b");
  });

  it("the screen from the route and the path", () => {
    expect(mobileScreen(parseRoute("/"), "/")).toBe("day");
    expect(mobileScreen(parseRoute("/g/all"), "/g/all")).toBe("backlog");
    expect(mobileScreen(parseRoute("/g/g1"), "/g/g1")).toBe("backlog");
    expect(mobileScreen(parseRoute("/settings"), "/settings")).toBe("settings");
  });

  it("Back from the Backlog, History or Settings returns to the Day", () => {
    expect(mobileStep("/", "/g/all")).toEqual({ kind: "push", path: "/g/all" });
    expect(mobileStep("/g/all", "/history")).toEqual({ kind: "replace", path: "/history" });
    expect(mobileStep("/history", "/")).toEqual({ kind: "back" });
    expect(mobileStep("/g/all", "/g/all")).toBeNull();
  });
});
```

`apps/web/src/app/MobileRoot.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutContext } from "../components/layout";
import { group, renderWithStore, snapshot } from "../test/harness";
import { MobileRoot } from "./MobileRoot";
import { useRoute } from "./router";

afterEach(cleanup);
beforeEach(() => history.replaceState(null, "", "/"));

function Harness() {
  const [route] = useRoute();
  return (
    <LayoutContext.Provider value="mobile">
      <MobileRoot route={route} />
    </LayoutContext.Provider>
  );
}

const snap = snapshot({ groups: [group({ id: "g1", name: "Дом" })] });

describe("mobile shell (UX §2)", () => {
  it("opens on the Day; ☰ opens the menu; «Все задачи» shows the whole Backlog and closes the menu", async () => {
    await renderWithStore(<Harness />, snap);
    expect(screen.getByRole("heading", { name: "День" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: /Все задачи/ }));
    expect(location.pathname).toBe("/g/all");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Бэклог" })).toBeTruthy();
  });

  it("a group opens its Backlog; «День» comes back", async () => {
    await renderWithStore(<Harness />, snap);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: /Дом/ }));
    expect(location.pathname).toBe("/g/g1");
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("button", { name: /Дом/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /День/ }).getAttribute("aria-current")).toBeNull();
  });
});
```

`apps/web/src/components/ComposerMobile.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithStore, snapshot } from "../test/harness";
import { Composer } from "./Composer";

afterEach(cleanup);

describe("mobile input exception (UX §3)", () => {
  it("the whole Backlog screen, no date → the Backlog without a group", async () => {
    const { store } = await renderWithStore(<Composer filter="all" backlogAll />, snapshot());
    const field = screen.getByRole("textbox", { name: "Что не забыть?" });
    fireEvent.change(field, { target: { value: "Полка" } });
    fireEvent.keyDown(field, { key: "Enter" });
    const v = store.getState().view!;
    expect(v.day).toHaveLength(0);
    expect(v.backlog.ungrouped.map((r) => r.title)).toEqual(["Полка"]);
  });
});
```

- [ ] **Step 2: Run to see them fail** — `npm run test -w @imprint/web -- mobileNav MobileRoot ComposerMobile` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/app/router.ts` — рядом с `routePath`; `navigate` переписывается через `navigatePath` (поведение то же):

```ts
/** Mobile (UX §2): any `/g/...` address is the Backlog screen — `/g/all` all of it, `/g/<id>` one group. */
export function isBacklogPath(path: string): boolean {
  return /^\/g\/[^/]+\/?$/.test(path);
}

export function backlogPath(filter: string): string {
  return `/g/${filter === "all" ? "all" : encodeURIComponent(filter)}`;
}

export function navigatePath(path: string, opts: { replace?: boolean } = {}): void {
  if (path === window.location.pathname) return;
  if (opts.replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  if (r.screen === "day") remember(r.filter);
  navigatePath(routePath(r), opts);
}

/** The raw path — the mobile layout tells `/` from `/g/all`, which the Route does not. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath);
}
```

(`useRoute` можно выразить через `usePath()`; комментарий у `Route` поправить: «`/g/all` на десктопе — День со всеми задачами, на мобильном — весь Бэклог».)

`apps/web/src/app/mobileNav.ts`:

```ts
import { isBacklogPath, navigatePath, type Route } from "./router";

export type MobileScreen = "day" | "backlog" | "history" | "settings";

export function mobileScreen(route: Route, path: string): MobileScreen {
  if (route.screen !== "day") return route.screen;
  return isBacklogPath(path) ? "backlog" : "day";
}

export type MobileStep = { kind: "push" | "replace"; path: string } | { kind: "back" };

/**
 * The system Back from the Backlog, History or Settings returns to the Day (UX §2). Invariant: under any other
 * screen's entry lies the Day's. So: from the Day — push; between the others — replace; to the Day — back.
 */
export function mobileStep(from: string, to: string): MobileStep | null {
  if (from === to) return null;
  if (to === "/") return { kind: "back" };
  return from === "/" ? { kind: "push", path: to } : { kind: "replace", path: to };
}

export function goMobile(to: string): void {
  const step = mobileStep(window.location.pathname, to);
  if (!step) return;
  if (step.kind === "back") history.back();
  else navigatePath(step.path, { replace: step.kind === "replace" });
}

let planted = false;

/** Opened straight onto another screen: put the Day under it once, so Back lands on the Day, not off the app. */
export function plantDay(): void {
  if (planted) return;
  planted = true;
  const path = window.location.pathname;
  if (path === "/") return;
  history.replaceState(null, "", "/");
  history.pushState(null, "", path);
}
```

`apps/web/src/components/MobileShell.tsx`:

```tsx
import { List } from "@phosphor-icons/react";
import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import styles from "./MobileShell.module.css";

/**
 * Mobile (UX §1–§2): ☰ at the top, one screen under it; the sidebar slides in as a drawer over a scrim (a tap on
 * the scrim, Esc or a choice closes it). No edge swipe — it fights the system Back on iOS (plan decision 4).
 */
export function MobileShell({ sidebar, drawer, onDrawer, children }: {
  sidebar: ReactNode;
  drawer: boolean;
  onDrawer(open: boolean): void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className={styles.phone}>
      <D.Root open={drawer} onOpenChange={onDrawer}>
        <header className={styles.top}>
          <D.Trigger asChild>
            <button type="button" className={styles.menu} aria-label={t.menu}>
              <List size={22} aria-hidden />
            </button>
          </D.Trigger>
        </header>
        <D.Portal>
          <D.Overlay className={styles.scrim} data-overlay />
          <D.Content className={styles.drawer} data-overlay aria-describedby={undefined}>
            <D.Title className={styles.sr}>{t.menu}</D.Title>
            <nav className={styles.side}>{sidebar}</nav>
          </D.Content>
        </D.Portal>
      </D.Root>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
```

`apps/web/src/components/MobileShell.module.css`:

```css
.phone {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.top {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 6px;
}

.menu {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--ink);
}

.main {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgb(20 22 28 / 0.45);
}

.drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 31;
  width: min(80vw, 300px);
  background: var(--side);
  color: var(--side-muted);
  box-shadow: 4px 0 18px rgb(20 22 40 / 0.35);
}

.side {
  height: 100%;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: no-preference) {
  .scrim {
    animation: fade 0.25s;
  }
  .drawer {
    animation: slide 0.35s var(--ease-out);
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes slide {
  from {
    transform: translateX(-104%);
  }
}
```

`apps/web/src/screens/MobileList.tsx` (Task 9 обернёт содержимое в `OpenRowArea`):

```tsx
import { BacklogColumn } from "../components/BacklogColumn";
import { Composer } from "../components/Composer";
import { DayColumn } from "../components/DayColumn";
import { useStore } from "../store/hooks";
import styles from "./MobileList.module.css";

/**
 * A mobile screen (UX §2–§3): one column — the Day, or the Backlog (all of it or one group) — and the input under
 * it. The Day adds like «Все задачи»; a group screen into that group; the whole Backlog without a date → the
 * Backlog without a group (the mobile exception).
 */
export function MobileList({ list, filter }: { list: "day" | "backlog"; filter: string }) {
  const ready = useStore((s) => s.view !== null);
  if (!ready) return <section className={styles.view} />;
  return (
    <section className={styles.view}>
      {list === "day" ? <DayColumn /> : <BacklogColumn filter={filter} />}
      <Composer filter={list === "day" ? "all" : filter} backlogAll={list === "backlog" && filter === "all"} />
    </section>
  );
}
```

`apps/web/src/screens/MobileList.module.css`:

```css
.view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 16px calc(12px + env(safe-area-inset-bottom));
}

.view > section {
  flex: 1;
  min-height: 0;
}
```

`apps/web/src/app/MobileRoot.tsx`:

```tsx
import { useEffect, useState } from "react";
import { MobileShell } from "../components/MobileShell";
import { Sidebar } from "../components/Sidebar";
import { MetaStub } from "../screens/MetaStub";
import { MobileList } from "../screens/MobileList";
import { goMobile, mobileScreen, plantDay } from "./mobileNav";
import { backlogPath, routePath, usePath, type Route } from "./router";

/** The mobile app: ☰ + drawer, one screen at a time, Back → the Day (UX §2). */
export function MobileRoot({ route }: { route: Route }) {
  const path = usePath();
  const [drawer, setDrawer] = useState(false);
  const screen = mobileScreen(route, path);

  useEffect(plantDay, []);

  const go = (to: string) => {
    setDrawer(false);
    goMobile(to);
  };
  const sidebar = (
    <Sidebar
      route={route}
      go={(r) => go(r.screen === "day" ? "/" : routePath(r))}
      mobile={{ backlog: screen === "backlog", onFilter: (f) => go(backlogPath(f)) }}
    />
  );

  return (
    <MobileShell sidebar={sidebar} drawer={drawer} onDrawer={setDrawer}>
      {screen === "day" || screen === "backlog" ? (
        <MobileList list={screen} filter={route.screen === "day" ? route.filter : "all"} />
      ) : (
        <MetaStub screen={screen} />
      )}
    </MobileShell>
  );
}
```

`apps/web/src/components/Sidebar.tsx` — новый проп и выбор пунктов:

```tsx
export function Sidebar({ route, go, mobile }: {
  route: Route;
  go: Go;
  /** Mobile (UX §2): the Day and each filter are separate screens; filters open a Backlog screen. */
  mobile?: { backlog: boolean; onFilter(filter: string): void };
}) {
  ...
  const onDay = route.screen === "day" && !mobile?.backlog;
  const filter = route.screen !== "day" ? null : mobile ? (mobile.backlog ? route.filter : null) : route.filter;
  const pick = (f: string) => (mobile ? mobile.onFilter(f) : go({ screen: "day", filter: f }));
```

— «День»: `current={onDay}`, `onClick={() => go({ screen: "day", filter: mobile ? "all" : (filter ?? "all") })}`; «Все задачи»: `onClick={() => pick("all")}`; `<GroupFilters filter={filter} onPick={pick} />`.

`apps/web/src/components/Composer.tsx` — проп и вид:

```tsx
export function Composer({ filter, backlogAll = false }: { filter: string; /** Mobile «Все задачи» Backlog screen (UX §3). */ backlogAll?: boolean }) {
```

```tsx
      view: backlogAll ? "backlog" : filter === "all" ? "day" : { group: filter },
```

`Composer.module.css` — подсказка `N` не нужна на телефоне:

```css
@media (max-width: 1023px) {
  .kbd {
    display: none;
  }
}
```

`Column.module.css` — хайрлайн Бэклога только на десктопе: правило `.bk { … }` обернуть в `@media (min-width: 1024px) { … }`.

`apps/web/src/app/useRouteGuards.ts` — третий параметр:

```ts
export function useRouteGuards(route: Route, go: Go, { restore = true }: { restore?: boolean } = {}): void {
```

и в эффекте `if (!restored.current) { restored.current = true; if (restore) { … } }` (на мобильном `/` — всегда День, UX §2).

`apps/web/src/app/App.tsx` — `Root`:

```tsx
function Root() {
  const auth = useStore((s) => s.auth);
  const layout = useLayoutMode();
  const [route, go] = useRoute();
  useRouteGuards(route, go, { restore: layout === "desktop" });
  ...
  return (
    <LayoutContext.Provider value={layout}>
      {layout === "desktop" ? (
        <Shell sidebar={<Sidebar route={route} go={go} />}>
          {route.screen === "day" ? <DayScreen filter={route.filter} /> : <MetaStub screen={route.screen} />}
        </Shell>
      ) : (
        <MobileRoot route={route} />
      )}
      <Toasts />
    </LayoutContext.Provider>
  );
}
```

(`LoginScreen` остаётся вне провайдера — он одинаковый.)

- [ ] **Step 4: Run** — `npm run test -w @imprint/web` → PASS (старые `router.test.ts`, `Sidebar.dom.test.tsx`, `Composer.dom.test.tsx` — без изменений); `npm run check`.

- [ ] **Step 5: Smoke by eye** — `npm run dev` (из `platform/`), окно 390 px в DevTools: ☰, меню, День, `/g/all`, «Назад». Остановить сервер.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "web: mobile layout — ☰ and a drawer, one screen at a time, /g/all, Back returns to the Day, the input's mobile exception"
```

---

### Task 9: мобильная строка — тап-ряд, долгий тап

**Files:**
- Create: `apps/web/src/components/OpenRow.tsx`, `apps/web/src/components/MobileRow.tsx`
- Modify: `apps/web/src/components/ListRow.tsx`, `apps/web/src/components/TaskRow.tsx`, `apps/web/src/components/TaskRow.module.css`, `apps/web/src/components/RowActions.tsx`, `apps/web/src/components/RowActions.module.css`, `apps/web/src/screens/MobileList.tsx`
- Test: `apps/web/src/components/MobileRow.dom.test.tsx`

**Interfaces:**
- Consumes: `usePressMenu`, `RowActions`, `TitleEditor`, `Popover` (на мобильном — `Sheet`), `move_to_day` / `move_to_backlog`.
- Produces: `OpenRowContext`, `OpenRowArea({ className?, children })`; `MobileRow({ row, where, group })`; `TaskRow` — пропы `open?: boolean` (`data-open`) и `below?: ReactNode` (под `.line`); `RowActions` — проп `tray?: boolean` (разделитель после лейбла группы; кнопки 44 px через `[data-tray]`).

- [ ] **Step 1: Failing test** — `MobileRow.dom.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutContext } from "./layout";
import { group, renderWithStore, snapshot, task } from "../test/harness";
import { MobileList } from "../screens/MobileList";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const snap = snapshot({
  groups: [group({ id: "g1", name: "Дом" })],
  tasks: [task({ id: "t1", title: "Молоко" }), task({ id: "t2", title: "Хлеб" })],
});
const ui = (
  <LayoutContext.Provider value="mobile">
    <MobileList list="day" filter="all" />
  </LayoutContext.Provider>
);
const row = (title: string) => screen.getByText(title).closest("[data-row]") as HTMLElement;
const trayOf = (title: string) => row(title).querySelector("[data-tray]");

describe("phone row (UX §4)", () => {
  it("a tap opens the tray under the text — move, group, date, repeat, steps, delete; no hover icons", async () => {
    await renderWithStore(ui, snap);
    expect(row("Молоко").querySelector("[data-actions]")).toBeNull();
    fireEvent.click(screen.getByText("Молоко"));
    const tray = within(trayOf("Молоко") as HTMLElement);
    for (const name of ["В бэклог", "Выбрать группу", "Дата", "Повтор", "Шаги", "Удалить"]) expect(tray.getByLabelText(name)).toBeTruthy();
    expect(row("Молоко").getAttribute("data-open")).toBe("true");
  });

  it("one row open at a time; a tap outside every row closes it", async () => {
    await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    fireEvent.click(screen.getByText("Хлеб"));
    expect(trayOf("Молоко")).toBeNull();
    expect(trayOf("Хлеб")).toBeTruthy();
    fireEvent.click(screen.getByRole("heading", { name: "День" }));
    expect(trayOf("Хлеб")).toBeNull();
  });

  it("the tray's windows are sheets; a day chip and the scrim leave the row open", async () => {
    await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    fireEvent.click(within(trayOf("Молоко") as HTMLElement).getByLabelText("Повтор"));
    fireEvent.click(await screen.findByRole("button", { name: "пн" }));
    expect(screen.getByRole("dialog", { name: "Повтор" })).toBeTruthy();
    const scrim = document.querySelector("[data-scrim]") as HTMLElement;
    fireEvent.pointerDown(scrim);
    fireEvent.click(scrim);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trayOf("Молоко")).toBeTruthy();
  });

  it("the move icon sends the task to the Backlog (move_to_backlog)", async () => {
    const { store } = await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    fireEvent.click(within(trayOf("Молоко") as HTMLElement).getByLabelText("В бэклог"));
    expect(store.getState().view?.day.map((r) => r.title)).toEqual(["Хлеб"]);
  });

  it("a long tap opens the title sheet and does not toggle the tray", async () => {
    await renderWithStore(ui, snap);
    vi.useFakeTimers();
    const text = screen.getByText("Молоко");
    fireEvent.pointerDown(text, { pointerType: "touch", clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(text, { pointerType: "touch" });
    fireEvent.click(text);
    expect(screen.getByRole("dialog", { name: "Название задачи" })).toBeTruthy();
    expect(trayOf("Молоко")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npm run test -w @imprint/web -- MobileRow` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/components/OpenRow.tsx`:

```tsx
import { createContext, useState, type MouseEvent, type ReactNode } from "react";

export const OpenRowContext = createContext<{ open: string | null; setOpen(id: string | null): void }>({ open: null, setOpen: () => {} });

/**
 * One open row at a time (UX §4); a tap outside every row closes it — but not a tap in a window or on its scrim,
 * nor on something a redraw already detached from the page (landing trap: the root then took it for «outside»).
 */
export function OpenRowArea({ className, children }: { className?: string; children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element;
    if (!target.isConnected || target.closest("[data-row], [data-overlay]")) return;
    setOpen(null);
  };
  return (
    <OpenRowContext.Provider value={{ open, setOpen }}>
      <div className={className} onClick={onClick}>
        {children}
      </div>
    </OpenRowContext.Provider>
  );
}
```

`apps/web/src/components/MobileRow.tsx`:

```tsx
import { Sun, Tray } from "@phosphor-icons/react";
import { useContext, useState, type MouseEvent } from "react";
import { useT } from "../i18n";
import { useStoreApi } from "../store/hooks";
import type { GroupRow, Row } from "../store/view";
import type { Column } from "./drag";
import { OpenRowContext } from "./OpenRow";
import { Popover } from "./Popover";
import { RowActions } from "./RowActions";
import actions from "./RowActions.module.css";
import { TaskRow } from "./TaskRow";
import { TitleEditor } from "./TitleEditor";
import { usePressMenu } from "./usePressMenu";

/**
 * A phone row (UX §4): a tap opens the tray under the text — move (a tray in the Day, a sun in the Backlog; icon
 * only), group, date, repeat, steps, delete; a long tap opens the title sheet. No swipes. The open row stays lit
 * and never reacts to hover.
 */
export function MobileRow({ row, where, group }: { row: Row; where: Column; group?: GroupRow }) {
  const t = useT();
  const store = useStoreApi();
  const { open, setOpen } = useContext(OpenRowContext);
  const [renaming, setRenaming] = useState(false);
  const press = usePressMenu(() => setRenaming(true));
  const isOpen = open === row.id;
  const toDay = where === "backlog";

  const tap = (e: MouseEvent) => {
    if ((e.target as Element).closest("button, input, a, [data-overlay]")) return;
    setOpen(isOpen ? null : row.id);
  };

  const tray = (
    <div className={actions.tray} data-tray>
      <button
        type="button"
        className={actions.ib}
        aria-label={toDay ? t.toDay : t.toBacklog}
        onClick={() => store.run(toDay ? "move_to_day" : "move_to_backlog", { taskId: row.id })}
      >
        {toDay ? <Sun size={18} aria-hidden /> : <Tray size={18} aria-hidden />}
      </button>
      <RowActions row={row} group={group} tray />
    </div>
  );

  return (
    <>
      <TaskRow row={row} where={where} group={group} open={isOpen} handlers={{ ...press, onClick: tap }} below={isOpen ? tray : undefined} />
      <Popover open={renaming} onOpenChange={setRenaming} label={t.taskTitle}>
        <TitleEditor row={row} onDone={() => setRenaming(false)} />
      </Popover>
    </>
  );
}
```

`apps/web/src/components/ListRow.tsx` — импорты `useLayout` из `./layout` и `MobileRow` из `./MobileRow`; мобильная ветка — первой строкой функции (до `useContext(DragOn)` хуков не менять местами: оба хука вызываются всегда):

```tsx
export function ListRow({ row, where, group }: { row: Row; where: Column; group?: GroupRow }) {
  const layout = useLayout();
  const drag = useContext(DragOn);
  if (layout === "mobile") return <MobileRow row={row} where={where} group={group} />;
  const inner = <RowWithActions row={row} where={where} group={group} />;
  ...
```

и докстринг: «desktop — hover actions, draggable inside a DragArea; mobile — the tap tray».

`apps/web/src/components/RowActions.tsx` — проп `tray?: boolean`; после `</Popover>` группы:

```tsx
      {tray && <span className={styles.sp} aria-hidden />}
```

`apps/web/src/components/TaskRow.tsx` — пропы `open = false` и `below`:

```tsx
    <div className={styles.row} data-row data-id={row.id} data-done={done} data-fresh={fresh} data-active={active} data-open={open} {...handlers}>
      <div className={styles.line}>…</div>
      {below}
    </div>
```

`TaskRow.module.css` — наведение только в десктопной раскладке; раскрытая строка подсвечена постоянно. Правило

```css
.row:hover,
.row:focus-within,
.row[data-active="true"] {
  border-color: var(--amber);
}
```

заменить на:

```css
.row:focus-within,
.row[data-active="true"],
.row[data-open="true"] {
  border-color: var(--amber);
}

/* Hover belongs to the desktop layout only (landing trap: a phone layout in a window with a mouse jumped). */
@media (min-width: 1024px) {
  .row:hover {
    border-color: var(--amber);
  }
}
```

(правила `.row:hover .acts` и `.row:has(.acts):hover .t` уже касаются только строк с `.acts`, т. е. десктопа.)

`RowActions.module.css` — дописать ряд:

```css
/* The phone's tray (UX §4, landing `.tray`): icons only, one line, never wider than the row at 360 px. */
.tray {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  min-width: 0;
  margin-top: 6px;
  padding-top: 2px;
  border-top: 1px solid var(--hair);
}

.tray > * {
  flex: none;
}

.sp {
  flex: 1 1 0;
  min-width: 0;
}

[data-tray] .ib {
  width: 44px;
  height: 44px;
}

[data-tray] .tag {
  max-width: 84px;
  margin: 9px 0;
}

[data-tray] .gn {
  max-width: 7ch;
}

@media (prefers-reduced-motion: no-preference) {
  .tray {
    animation: open 0.2s var(--ease-out);
  }
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
```

(`.sp` у `.tray > *` перебивается собственным `flex` — порядок: `.sp` ниже `.tray > *`, специфичность равна, побеждает последнее.)

`apps/web/src/screens/MobileList.tsx` — корень становится зоной «тап мимо»:

```tsx
  return (
    <OpenRowArea className={styles.view}>
      {list === "day" ? <DayColumn /> : <BacklogColumn filter={filter} />}
      <Composer filter={list === "day" ? "all" : filter} backlogAll={list === "backlog" && filter === "all"} />
    </OpenRowArea>
  );
```

- [ ] **Step 4: Run** — `npm run test -w @imprint/web` → PASS; `npm run check`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "web: phone row — tap tray (move, group, date, repeat, steps, delete), one open at a time, long tap → title sheet; hover only on desktop"
```

---

### Task 10: e2e — десктоп W4b

**Files:**
- Create: `apps/web/e2e/helpers.ts`, `apps/web/e2e/drag.spec.ts`, `apps/web/e2e/edit.spec.ts`, `apps/web/e2e/repeat-steps.spec.ts`, `apps/web/e2e/edges.spec.ts`

**Interfaces:**
- Consumes: `signIn`, `tool`, `saved`, `dateIn` из `e2e/session.ts`; доступные имена из Task 1–9.
- Produces: `helpers.ts`: `drag(page, from: Locator, to: Locator)`, `longPress(target: Locator)`, `serverState(page)`, `expectInside(inner: Locator, outer: { x; y; width; height })`, `expectInViewport(page, locator)`.

- [ ] **Step 1: Helpers** — `apps/web/e2e/helpers.ts`:

```ts
import { expect, type Locator, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

/** A real pointer drag: press, move past dnd-kit's 6 px, travel, drop. */
export async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
  await page.mouse.up();
}

/** A long touch (UX §4): pointerdown, 650 ms, pointerup — what the row's long-tap timer listens for. */
export async function longPress(target: Locator): Promise<void> {
  const box = (await target.boundingBox())!;
  const init = { pointerType: "touch", isPrimary: true, bubbles: true, clientX: box.x + 10, clientY: box.y + box.height / 2 };
  await target.dispatchEvent("pointerdown", init);
  await target.page().waitForTimeout(650);
  await target.dispatchEvent("pointerup", init);
}

export interface ServerTask {
  id: string;
  title: string;
  groupId: string | null;
  dueDate: number | null;
  deletedAt: number | null;
  parentId: string | null;
}
export interface ServerGroup {
  id: string;
  name: string;
  position: number;
  deletedAt: number | null;
  icon?: string;
  colorKey?: string | null;
}

export async function serverState(page: Page): Promise<{ tasks: ServerTask[]; groups: ServerGroup[] }> {
  return (await (await page.request.get("/api/state")).json()) as { tasks: ServerTask[]; groups: ServerGroup[] };
}

export async function expectInside(inner: Locator, outer: Box): Promise<void> {
  const box = (await inner.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(box.y).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
}

export async function expectInViewport(page: Page, target: Locator): Promise<void> {
  const vp = page.viewportSize()!;
  await expectInside(target, { x: 0, y: 0, width: vp.width, height: vp.height });
}
```

- [ ] **Step 2: `drag.spec.ts`** (UX §8: три правила перетаскивания, порядок групп):

```ts
import { expect, test, type Page } from "@playwright/test";
import { drag, serverState } from "./helpers";
import { dateIn, saved, signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
});

test("Day → Backlog with «Все задачи»: the group stays, the task lands in its group's section", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await tool(page, "capture_task", { title: "Полить цветы", view: "day", groupId: g.id });
  await page.reload();
  await drag(page, day(page).getByText("Полить цветы"), backlog(page));
  await expect(backlog(page).getByRole("group", { name: "Дом" }).getByText("Полить цветы")).toBeVisible();
  await expect(day(page).getByText("Полить цветы")).toHaveCount(0);
  await saved(page);
  expect((await serverState(page)).tasks.find((t) => t.title === "Полить цветы")?.groupId).toBe(g.id);
});

test("Day → Backlog filtered by a group: the task takes that group", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Работа" })).group as { id: string };
  await tool(page, "capture_task", { title: "Отчёт", view: "day" });
  await page.goto(`/g/${g.id}`);
  await drag(page, day(page).getByText("Отчёт"), backlog(page));
  await expect(backlog(page).getByText("Отчёт")).toBeVisible();
  await saved(page);
  expect((await serverState(page)).tasks.find((t) => t.title === "Отчёт")?.groupId).toBe(g.id);
});

test("Backlog → Day: today's, the date gone, the group kept", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await tool(page, "capture_task", { title: "Фильтр для воды", view: { group: g.id }, date: dateIn(5) });
  await page.goto("/");
  await drag(page, backlog(page).getByText("Фильтр для воды"), day(page));
  await expect(day(page).getByText("Фильтр для воды")).toBeVisible();
  await saved(page);
  const t = (await serverState(page)).tasks.find((x) => x.title === "Фильтр для воды")!;
  expect(t.dueDate).toBeNull();
  expect(t.groupId).toBe(g.id);
});

test("a drag never starts from the circle: pressing it still ticks", async ({ page }) => {
  await tool(page, "capture_task", { title: "Молоко", view: "day" });
  await page.reload();
  await page.getByRole("button", { name: "Отметить: Молоко" }).click();
  await expect(page.getByRole("button", { name: "Вернуть: Молоко" })).toBeVisible();
});

test("group order by dragging in the sidebar; it survives a reload and orders the sections", async ({ page }) => {
  for (const name of ["Альфа", "Бета", "Гамма"]) await tool(page, "create_group", { name });
  for (const name of ["Альфа", "Бета", "Гамма"]) {
    const g = (await serverState(page)).groups.find((x) => x.name === name)!;
    await tool(page, "capture_task", { title: `Задача ${name}`, view: { group: g.id } });
  }
  await page.reload();
  const nav = page.getByRole("navigation");
  await drag(page, nav.getByRole("button", { name: /Гамма/ }), nav.getByRole("button", { name: /Альфа/ }));
  await saved(page);
  await page.reload();
  const names = await nav.getByRole("button", { name: /Альфа|Бета|Гамма/ }).allTextContents();
  expect(names.map((n) => n.replace(/\d+$/, ""))).toEqual(["Гамма", "Альфа", "Бета"]);
  const sections = await backlog(page).getByRole("heading", { level: 3 }).allTextContents();
  expect(sections).toEqual(["Гамма", "Альфа", "Бета"]);
});
```

- [ ] **Step 3: `edit.spec.ts`** (UX §8: правка группы и задачи правым кликом, удаление и отмена удаления группы):

```ts
import { expect, test, type Page } from "@playwright/test";
import { saved, signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
});

test("task title by right click: saved as you type, Enter closes, a reload keeps it", async ({ page }) => {
  await tool(page, "capture_task", { title: "Молоко", view: "day" });
  await page.reload();
  await day(page).getByText("Молоко").click({ button: "right" });
  const field = page.getByRole("textbox", { name: "Название задачи" });
  await field.fill("Кефир");
  await expect(day(page).getByText("Кефир")).toBeVisible();
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(day(page).getByText("Кефир")).toBeVisible();
});

test("group edit by right click: icon, colour and name; picks keep the window open", async ({ page }) => {
  await tool(page, "create_group", { name: "Дом" });
  await page.reload();
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: /Дом/ }).click({ button: "right" });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Работа" }).click();
  await dialog.getByRole("button", { name: "Синий" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Название" }).fill("Офис");
  await page.keyboard.press("Escape");
  await expect(nav.getByRole("button", { name: /Офис/ })).toBeVisible();
  await saved(page);
  await page.reload();
  await nav.getByRole("button", { name: /Офис/ }).click({ button: "right" });
  await expect(page.getByRole("dialog").getByRole("button", { name: "Работа" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Синий" })).toHaveAttribute("aria-pressed", "true");
});

test("delete a group: its task stays without a group; «Отменить» brings both back", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await tool(page, "capture_task", { title: "Полка", view: { group: g.id } });
  await page.reload();
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: /Дом/ }).click({ button: "right" });
  await page.getByRole("button", { name: /Удалить группу/ }).click();
  await expect(nav.getByRole("button", { name: /Дом/ })).toHaveCount(0);
  await expect(backlog(page).getByRole("group", { name: "Без группы" }).getByText("Полка")).toBeVisible();
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(backlog(page).getByRole("group", { name: "Дом" }).getByText("Полка")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(backlog(page).getByRole("group", { name: "Дом" }).getByText("Полка")).toBeVisible();
});

test("deleting the group being filtered falls back to «Все задачи»", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await page.goto(`/g/${g.id}`);
  await page.getByRole("navigation").getByRole("button", { name: /Дом/ }).click({ button: "right" });
  await page.getByRole("button", { name: /Удалить группу/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Все задачи").first()).toBeVisible();
});
```

- [ ] **Step 4: `repeat-steps.spec.ts`** (UX §8: календарь — `input[type=date]` уже в W4a; шаги ↔ задача; окна не закрываются):

```ts
import { expect, test, type Page } from "@playwright/test";
import { saved, signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
});

test("repeat: day chips keep the window open; the row shows the days; «Не повторять» clears them", async ({ page }) => {
  await tool(page, "capture_task", { title: "Спорт", view: "backlog" });
  await page.reload();
  const row = backlog(page).locator("[data-row]", { hasText: "Спорт" });
  await row.hover();
  await row.getByRole("button", { name: "Повтор" }).click();
  const dialog = page.getByRole("dialog", { name: "Повтор" });
  await dialog.getByRole("button", { name: "пн" }).click();
  await dialog.getByRole("button", { name: "чт" }).click();
  await expect(dialog).toBeVisible();
  await expect(backlog(page).locator("[data-row]", { hasText: "Спорт" })).toContainText("пн чт");
  await dialog.getByRole("button", { name: /Не повторять/ }).click();
  await expect(backlog(page).locator("[data-row]", { hasText: "Спорт" })).not.toContainText("пн");
});

test("steps: the last open step closes the task, unticking reopens it; the window stays open", async ({ page }) => {
  await tool(page, "capture_task", { title: "Покупки", view: "day" });
  await page.reload();
  const row = day(page).locator("[data-row]", { hasText: "Покупки" });
  await row.hover();
  await row.getByRole("button", { name: "Шаги" }).click();
  const dialog = page.getByRole("dialog", { name: "Шаги" });
  for (const s of ["Список", "Магазин"]) {
    await dialog.getByRole("textbox", { name: "Новый шаг" }).first().fill(s);
    await dialog.getByRole("textbox", { name: "Новый шаг" }).first().press("Enter");
  }
  await dialog.getByRole("button", { name: "Отметить: Список" }).click();
  await dialog.getByRole("button", { name: "Отметить: Магазин" }).click();
  await expect(day(page).getByRole("button", { name: "Вернуть: Покупки" })).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Вернуть: Магазин" }).click();
  await expect(day(page).getByRole("button", { name: "Отметить: Покупки" })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(day(page).locator("[data-row]", { hasText: "Покупки" }).getByLabel("Шаги: 1 из 2")).toBeVisible();
});

test("«Подсказать шаги» without a model configured: a quiet note, no toast", async ({ page }) => {
  await tool(page, "capture_task", { title: "Переезд", view: "day" });
  await page.reload();
  const row = day(page).locator("[data-row]", { hasText: "Переезд" });
  await row.hover();
  await row.getByRole("button", { name: "Шаги" }).click();
  await page.getByRole("button", { name: /Подсказать шаги/ }).click();
  await expect(page.getByText("Подсказки сейчас недоступны")).toBeVisible();
  await expect(page.getByText("Не сохранилось")).toHaveCount(0);
});
```

(e2e-воркер запускается с `GEMINI_API_KEY:` пустым → `suggest_steps` отвечает `unavailable`; если окажется, что пустая строка считается ключом, — проверить `apps/worker/src/userStore.ts` около строки 105 и поправить тест, **не** воркер.)

- [ ] **Step 5: `edges.spec.ts`** (UX §8: любое окно целиком в видимой области у правого и нижнего края):

```ts
import { expect, test } from "@playwright/test";
import { expectInViewport } from "./helpers";
import { signIn, tool } from "./session";

test.use({ viewport: { width: 1024, height: 768 } });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
  for (let i = 1; i <= 25; i++) await tool(page, "capture_task", { title: `Потом ${i}`, view: "backlog" });
  for (let i = 1; i <= 9; i++) await tool(page, "create_group", { name: `Группа ${i}` });
  await page.reload();
});

async function lastBacklogRow(page: import("@playwright/test").Page) {
  const list = page.getByRole("region", { name: "Бэклог" });
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const row = list.locator("[data-row]", { hasText: "Потом 25" });
  await row.hover();
  return row;
}

for (const name of ["Повтор", "Шаги"]) {
  test(`«${name}» at the bottom-right corner stays in view`, async ({ page }) => {
    const row = await lastBacklogRow(page);
    await row.getByRole("button", { name }).click();
    await expectInViewport(page, page.getByRole("dialog", { name }));
  });
}

test("«Название задачи» at a click near the bottom-right corner stays in view", async ({ page }) => {
  const row = await lastBacklogRow(page);
  const box = (await row.boundingBox())!;
  await page.mouse.click(box.x + box.width - 4, box.y + box.height - 2, { button: "right" });
  await expectInViewport(page, page.getByRole("dialog", { name: "Название задачи" }));
});

test("the group editor of the lowest group stays in view", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: /Группа 9/ }).click({ button: "right" });
  const dialog = page.getByRole("dialog", { name: "Группа 9" });
  await expect(dialog).toBeVisible();
  await expectInViewport(page, dialog);
});
```

- [ ] **Step 6: Run** — `npm run e2e` (из `platform/`) → все старые и новые сценарии зелёные. Если сайдбар с девятью группами вылезает за экран на 768 px — это нарушение UX §1: список фильтров в `Sidebar.module.css` должен прокручиваться сам (`.filters { min-height: 0; overflow-y: auto; }`, `.sb` — flex-колонка); поправить CSS, а не тест.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e apps/web/src
git commit -m "web: e2e — three drag rules, group order, right-click edits, group delete and undo, repeat, steps ↔ task, windows at the edges"
```

---

### Task 11: e2e — мобильный

**Files:**
- Create: `apps/web/e2e/mobile.spec.ts`, `apps/web/e2e/mobile-rows.spec.ts`

**Interfaces:**
- Consumes: `helpers.ts` (Task 10), мобильная раскладка (Task 8–9).

- [ ] **Step 1: `mobile.spec.ts`** (UX §8: 390×844 — нет прокрутки страницы, пункты сайдбара и поле видны; мобильное исключение ввода; адреса + «Назад»):

```ts
import { expect, test, type Page } from "@playwright/test";
import { signIn, tool } from "./session";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const field = (page: Page) => page.getByRole("textbox", { name: "Что не забыть?" });
const add = async (page: Page, title: string) => {
  await field(page).fill(title);
  await field(page).press("Enter");
};
const openMenu = (page: Page) => page.getByRole("button", { name: "Меню" }).tap();

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("390×844: no page scroll; the list scrolls; the menu shows every sidebar item; the input is visible", async ({ page }) => {
  await page.goto("/");
  for (let i = 1; i <= 30; i++) await tool(page, "capture_task", { title: `Задача ${i}`, view: "day" });
  await page.reload();
  await expect(page.getByText("Задача 30")).toBeAttached();
  const scroll = await page.evaluate(() => ({ sh: document.scrollingElement!.scrollHeight, ih: innerHeight, sw: document.scrollingElement!.scrollWidth, iw: innerWidth }));
  expect(scroll.sh).toBeLessThanOrEqual(scroll.ih);
  expect(scroll.sw).toBeLessThanOrEqual(scroll.iw);
  await expect(field(page)).toBeInViewport();
  const list = page.getByRole("region", { name: "День" });
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByText("Задача 30")).toBeInViewport();
  await openMenu(page);
  const nav = page.getByRole("navigation");
  for (const name of ["День", "История", "Настройки", "Все задачи", "Группа", "Выйти"]) {
    await expect(nav.getByRole("button", { name: new RegExp(name) }).first()).toBeInViewport();
  }
});

test("the input table on a phone: the Day; the whole Backlog → no group (the exception); a group screen → that group", async ({ page }) => {
  await page.goto("/");
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await page.reload();
  await add(page, "Молоко");
  await expect(page.getByRole("region", { name: "День" }).getByText("Молоко")).toBeVisible();

  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /Все задачи/ }).tap();
  await expect(page).toHaveURL(/\/g\/all$/);
  await add(page, "Полка");
  await expect(page.getByRole("region", { name: "Бэклог" }).getByRole("group", { name: "Без группы" }).getByText("Полка")).toBeVisible();

  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /Дом/ }).tap();
  await expect(page).toHaveURL(new RegExp(`/g/${g.id}$`));
  await add(page, "Лампа");
  await expect(page.getByRole("region", { name: "Бэклог" }).getByText("Лампа")).toBeVisible();
});

test("Back from the Backlog, History or Settings returns to the Day", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /Все задачи/ }).tap();
  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /История/ }).tap();
  await expect(page).toHaveURL(/\/history$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "День" })).toBeVisible();
});

test("opened straight on /g/all, Back still lands on the Day", async ({ page }) => {
  await page.goto("/g/all");
  await expect(page.getByRole("heading", { name: "Бэклог" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "День" })).toBeVisible();
});
```

- [ ] **Step 2: `mobile-rows.spec.ts`** (UX §8: ряд целиком внутри строки на 390 и 360; наведение на раскрытую строку не меняет её размер; окна — листы в видимой области; день повтора и отметка шага не закрывают лист и не сворачивают ряд; долгий тап):

```ts
import { expect, test, type Page } from "@playwright/test";
import { expectInViewport, expectInside, longPress } from "./helpers";
import { signIn, tool } from "./session";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const day = (page: Page) => page.getByRole("region", { name: "День" });
const row = (page: Page, title: string) => day(page).locator("[data-row]", { hasText: title });
const tray = (page: Page, title: string) => row(page, title).locator("[data-tray]");

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
  const g = (await tool(page, "create_group", { name: "Очень длинное название группы" })).group as { id: string };
  await tool(page, "capture_task", { title: "Позвонить в банк про карту и заодно спросить про вклад", view: "day", groupId: g.id });
  await tool(page, "capture_task", { title: "Хлеб", view: "day" });
  await page.reload();
});

for (const width of [390, 360]) {
  test(`${width} px: the open row's tray lies wholly inside the row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await row(page, "Позвонить").getByText(/Позвонить/).tap();
    const box = (await row(page, "Позвонить").boundingBox())!;
    for (const item of await tray(page, "Позвонить").locator(":scope > *").all()) await expectInside(item, box);
  });
}

test("hovering the open row changes nothing", async ({ page }) => {
  await row(page, "Хлеб").getByText("Хлеб").tap();
  const before = await row(page, "Хлеб").boundingBox();
  await row(page, "Хлеб").hover();
  const after = await row(page, "Хлеб").boundingBox();
  expect(after).toEqual(before);
});

test("repeat sheet: a day chip keeps the sheet and the row open; the scrim closes only the sheet", async ({ page }) => {
  await row(page, "Хлеб").getByText("Хлеб").tap();
  await tray(page, "Хлеб").getByLabel("Повтор").tap();
  const sheet = page.getByRole("dialog", { name: "Повтор" });
  await expectInViewport(page, sheet);
  await sheet.getByRole("button", { name: "пн" }).tap();
  await expect(sheet).toBeVisible();
  await expect(tray(page, "Хлеб")).toBeVisible();
  await page.touchscreen.tap(195, 40);
  await expect(sheet).toHaveCount(0);
  await expect(tray(page, "Хлеб")).toBeVisible();
});

test("steps sheet: ticking a step keeps the sheet and the row open", async ({ page }) => {
  await row(page, "Хлеб").getByText("Хлеб").tap();
  await tray(page, "Хлеб").getByLabel("Шаги").tap();
  const sheet = page.getByRole("dialog", { name: "Шаги" });
  await sheet.getByRole("textbox", { name: "Новый шаг" }).first().fill("Взять пакет");
  await sheet.getByRole("textbox", { name: "Новый шаг" }).first().press("Enter");
  await sheet.getByRole("button", { name: "Отметить: Взять пакет" }).tap();
  await expect(sheet).toBeVisible();
  await expect(tray(page, "Хлеб")).toBeVisible();
});

test("a long tap opens the title sheet", async ({ page }) => {
  await longPress(row(page, "Хлеб").getByText("Хлеб"));
  await expect(page.getByRole("dialog", { name: "Название задачи" })).toBeVisible();
  await expect(tray(page, "Хлеб")).toHaveCount(0);
});

test("a long tap on a group in the menu opens its edit sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Меню" }).tap();
  await longPress(page.getByRole("navigation").getByRole("button", { name: /Очень длинное/ }));
  await expect(page.getByRole("textbox", { name: "Название" })).toBeVisible();
});
```

- [ ] **Step 3: Run** — `npm run e2e` → зелёный. Падение «ряд шире строки на 360» чинится в `RowActions.module.css` (ширина `.tag`/`.gn` в ряду), не в тесте.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e apps/web/src
git commit -m "web: e2e mobile — 390×844 layout, the input exception, Back → Day, the tray at 360/390, sheets keep the row open, long taps"
```

---

### Task 12: контраст токенов

**Files:**
- Create: `apps/web/src/styles/contrast.test.ts`
- Modify: `apps/web/src/styles/tokens.css`, `apps/web/src/screens/ScreenTitle.module.css`, `apps/web/src/screens/LoginScreen.module.css`, `apps/web/src/components/TaskRow.module.css`

**Interfaces:**
- Consumes: `contrastRatio`, `GROUP_COLORS` из `@imprint/domain` (тест — не `components/`, P1-линт не касается).
- Produces: токен `--amber-ink` (янтарный текст) во всех трёх мирах.

- [ ] **Step 1: Failing test** — `apps/web/src/styles/contrast.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GROUP_COLORS, contrastRatio } from "@imprint/domain";
import { describe, expect, it } from "vitest";

/** tokens.css → the variables of each world: light `:root`, the dark media block, Meta. */
function worlds(): Record<"light" | "dark" | "meta", Record<string, string>> {
  const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));
  const light = vars(/^:root\s*\{([\s\S]*?)\}/m.exec(css)![1]);
  const dark = { ...light, ...vars(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/.exec(css)![1]) };
  const meta = { ...dark, ...vars(/:root\[data-world="meta"\]\s*\{([\s\S]*?)\}/.exec(css)![1]) };
  return { light, dark, meta };
}

const AA = 4.5;
const W = worlds();

describe("token contrast (UX §6, §8)", () => {
  for (const [world, v] of Object.entries(W)) {
    it.each(["ink", "muted", "amber-ink", "danger"])(`${world}: --%s text is AA on --surf (rows, windows)`, (k) => {
      expect(contrastRatio(v[k], v.surf)).toBeGreaterThanOrEqual(AA);
    });
    // On the page itself: titles, their amber line, section labels. --danger lives only in windows.
    it.each(["ink", "muted", "amber-ink"])(`${world}: --%s text is AA on --bg`, (k) => {
      expect(contrastRatio(v[k], v.bg)).toBeGreaterThanOrEqual(AA);
    });
    it(`${world}: struck-through done text is at least 3:1 (plan decision 1)`, () => {
      expect(contrastRatio(v.done, v.surf)).toBeGreaterThanOrEqual(3);
    });
    it(`${world}: text on the amber button is AA`, () => {
      expect(contrastRatio(v["on-amber"], v.amber)).toBeGreaterThanOrEqual(AA);
    });
  }

  it.each(["side-ink", "side-muted", "side-lab"])("sidebar --%s is AA on SideBg", (k) => {
    expect(contrastRatio(W.light[k], W.light.side)).toBeGreaterThanOrEqual(AA);
  });

  it.each(["side-ink", "side-muted"])("sidebar --%s is AA on a selected item", (k) => {
    expect(contrastRatio(W.light[k], W.light["side-surf"])).toBeGreaterThanOrEqual(AA);
  });

  it.each(Object.entries(GROUP_COLORS))("group colour %s is ≥ 3:1 on every surface it sits on", (_k, tone) => {
    for (const s of [W.light.surf, W.light.bg]) expect(contrastRatio(tone.light, s)).toBeGreaterThanOrEqual(3);
    for (const s of [W.dark.surf, W.dark.bg, W.meta.surf, W.light.side]) expect(contrastRatio(tone.dark, s)).toBeGreaterThanOrEqual(3);
  });
});
```

(Если `GROUP_COLORS[k]` хранит тона под другими именами, чем `light`/`dark`, — взять их из `packages/domain/src/group/palette.ts`, `interface GroupTone`; `app/groupColors.ts` уже пользуется `.light`/`.dark`.)

- [ ] **Step 2: Run to see it fail** — `npm run test -w @imprint/web -- contrast` → FAIL (ожидаемо: `amber-ink` нет, светлый `muted` 4,13, `done` 2,41, `side-lab` 4,03, Meta `danger` 3,74, Meta `done` 2,84).

- [ ] **Step 3: Fix tokens** (значения — решение 1 плана; если пользователь выбрал другие — подставить их и прогнать тест):

`tokens.css`, светлый `:root`: `--muted: #5c6380;`, `--done: #767c89;`, `--side-lab: #9098c0;`, после `--amber-n` добавить `--amber-ink: #94560f;`.
Тёмный блок: добавить `--amber-ink: #f0a24e;`.
Meta: `--done: #8e95bb;`, `--danger: #f0a08c;`, добавить `--amber-ink: #f0a24e;`.

Янтарный **текст** переходит на `--amber-ink` (рамки и заливки остаются `--amber`): `ScreenTitle.module.css` (строка с `color: var(--amber)`), `LoginScreen.module.css` (то же), `TaskRow.module.css` `.rep { color: var(--amber-ink); }`. Проверить `grep -rn "color: var(--amber)" apps/web/src --include=*.css` → только не-текстовые места (`border-color`).

- [ ] **Step 4: Run** — `npm run test -w @imprint/web -- contrast` → PASS; `npm run check`; `npm run e2e` (локаторы по тексту от цвета не зависят).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "web: token contrast test (text AA, done 3:1, group colours 3:1); darker muted, amber-ink for amber text"
```

---

### Task 13: P1-ревью, документы, закрытие фазы

**Files:**
- Modify: `imprint2.0/W4-web-ui.md`, `imprint2.0/README.md`, `docs/superpowers/specs/2026-09-30-w4-web-ui-design.md` (статус), `HISTORY.md`

- [ ] **Step 1: P1-ревью `apps/web/src`** — критерий W4 «Готово, когда»: «В `apps/web/src` нет правил домена». Прогнать и разобрать каждое попадание в `components/`, `screens/`, `app/`:

```bash
grep -rnE "\.sort\(|\.filter\(|\.reduce\(|dueDate|recurrenceMask|location ===|isRepeating \?|Date|Intl" apps/web/src/components apps/web/src/screens apps/web/src/app --include=*.ts --include=*.tsx | grep -v "\.test\."
```

Допустимо: фильтры, которые не решают правил (скрыть пустую секцию, убрать пустые поля шагов, найти группу по id, `reordered` — жест пользователя), чтение `isRepeating` для выбора подписи. Недопустимо: решение, куда попадает задача, что считается выполненным, какой день «сегодня», какая дата «будущая». Найденное — перенести в `store/` через домен отдельным коммитом. Итог ревью — список «что проверено и почему допустимо» — вписать в `HISTORY.md` (шаг 3).

- [ ] **Step 2: Полная проверка** — `npm run check` и `npm run e2e` из `platform/` → зелёные; приложить число сценариев e2e.

- [ ] **Step 3: Документы**
  - `imprint2.0/W4-web-ui.md`: статус «W4 закрыт (тег `web-w4`)»; отметить `[x]` все задачи и критерии «Готово, когда»; записать решения плана 1–8 одной строкой каждое и хвосты (порядок групп на мобильном; скриншот-тесты тем из UX §8 не сделаны; `dueKey` при смене пояса — W6).
  - `imprint2.0/README.md`: строка фазы W4 → закрыта.
  - Спека: `**Статус:**` — «W4a и W4b реализованы (планы …)».
  - `HISTORY.md`: раздел «W4b — Web client, full UX (closed …, tag `web-w4`)» по образцу W4a: *What was built* и *Rakes* (записывать настоящие грабли, встреченные при исполнении плана; кандидаты — призрачный клик после листа, `aria-pressed` против атрибутов dnd-kit, мобильный `/` против запомненного фильтра, контраст янтаря).

- [ ] **Step 4: Commit**

```bash
git add imprint2.0 docs/superpowers/specs HISTORY.md
git commit -m "docs: W4b closed — phase status, P1 review, history and rakes"
```

- [ ] **Step 5: Выкладка и тег — только с согласия пользователя.** Спросить: влить ветку (superpowers:finishing-a-development-branch), выложить на dev (`npm run deploy:dev`), поставить тег `web-w4`. После выкладки — ручная проверка на dev с телефона: вход, ☰, тап-ряд, лист повтора, долгий тап, «Назад» → День; на десктопе — перетаскивание и правый клик.
