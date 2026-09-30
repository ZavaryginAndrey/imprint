# 04 — КОД: что переносить, что переписать

> Инвентарь кодовой базы `JustDoYourTasks` v1.4.0 (7 695 строк Kotlin, 15 из них тесты).
> Оценка: **A** = забрать почти как есть · **B** = забрать идею, переписать · **C** = не тащить.
> Дата извлечения: 2026-09-06.

---

## 0. Стек (работает, менять незачем)

```
Kotlin 2.1.20 · Jetpack Compose (Material 3) · Room (KSP) · AlarmManager
ручной DI (без Hilt) · minSdk 26 · compile/target 36 · AGP 8.12.0 · Gradle 8.13
Полностью локально и офлайн, без Google Play Services.
Тесты: только JVM (`app/src/test`) + Robolectric — без него Room-запросы и миграции
на JVM не выполняются (SQL живёт в SQLite = Android, не в Kotlin).
```

**Что добавить в новом проекте с нуля:** `applicationIdSuffix ".debug"`, экспорт/импорт БД,
`values/` = английский, `isMinifyEnabled = true` для release, `exportSchema = true` с самого начала.

---

## A — Чистые доменные функции (забрать почти как есть)

Все — без зависимостей от Android/Room, покрыты JVM-тестами. Это самое ценное в кодовой базе.

### `domain/LogicalDay.kt` (35 строк) — **A+**
«Логический день» = промежуток между сбросами, а не календарный день. Всё, что произошло до часа
сброса, принадлежит **предыдущему** дню.
```kotlin
LogicalDay.dateOf(now: LocalDateTime, resetHour, resetMinute): LocalDate
LogicalDay.keyOf(now|millis, resetHour, resetMinute): String   // "YYYY-MM-DD"
```
*Почему важно:* даёт группировку без часовых поясов в SQL, совпадает с тем, что приложение
считает днём, и держит отметку и её снятие в одном ведре. **См. 02-BUGS DB-4.**

### `domain/RecurrenceMask.kt` (32 строки) — **A+**
Каденция как 7-битная маска. Бит 0 = Пн … бит 6 = Вс.
```kotlin
DAILY = 127 · WEEKDAYS = 31 · WEEKEND = 96
isOn(mask, day) · withDay(mask, day, on) · daysOn(mask): List<DayOfWeek>
```

### `domain/DayAssembly.kt` (53 строки) — **A**
Сборка «вычисляемого Дня»: реальные строки + появления рутин. Ядро модели рутин.
```kotlin
merge(realDay, routineDefs, doneToday, skippedToday, today: LocalDate): List<DayTask>
```
Рутина появляется ⟺ каденция включает сегодняшний день недели **И** `startDate` наступил
**И** не `SKIPPED` сегодня **И** её id ещё не является реальной DAY-строкой (защита от
дубликата ключа в `LazyColumn`, см. 02-BUGS CMP-2).

### `domain/ReminderContent.kt` (43 строки) — **A+**
**Единственная точка отбора контента напоминаний.** Обе поверхности берут её.
```kotlin
const val SLOTS = 5
data class Candidate(id, title, lastShownAt: Long?, priority: Int = 0)
select(candidates, slots = SLOTS): List<Candidate>
```
Ранжирование: `priority DESC` → **никогда не показанные первыми** → **дольше всего не
показывалось**. Стабильная сортировка → набор детерминирован внутри одного показа.
*Сюда же в будущем встают эпик 1 (авто-приоритет) и эпик 5 (резерв слота) — без правки вызовов.*

### `domain/ReminderSurface.kt` (21 строка) — **A**
```kotlin
chooseReminderSurface(overlayEnabled, canDrawOverlays, deviceLocked): OVERLAY | NOTIFICATION
```
Плашка — только когда включена, разрешена **и** экран активен. Иначе уведомление.

### `domain/DueDates.kt` (46 строк) — **A**
Дата = epoch-millis начала локального дня.
```kotlin
startOfDay(date) · todayStart() · tomorrow() · inSevenDays() · nextWeekend() · toLocalDate(millis)
```
`nextWeekend`: Пн–Пт → ближайшая суббота; Сб → завтра (Вс); Вс → следующая суббота. Всегда вперёд.

### `domain/LegacyHistory.kt` (33 строки) — **C**
Одноразовый сдвиг дат при импорте старой истории. В новом проекте не нужен (нечего импортировать),
но **логика сдвига** пригодится, если будете импортировать данные из старой БД.

---

## B — Архитектурные решения (забрать идею)

### B-1. Одна таблица + ортогональные оси ⭐ главное архитектурное решение
`day_tasks` + оси `location` («DAY» | «BACKLOG»), `dueDate`, `groupId`, `isRoutine`.
**Никакой отдельной `BacklogTask`** — иначе дубль CRUD/миграций и потеря идентичности при переезде.
Вердикт аудита: *«архитектура здоровая, держит нагрузку»*.

### B-2. Append-only журнал событий `task_events` ⭐
```
id, taskId?, type, at, dayKey, title, groupId, isRoutine, surface?
типы: CREATED · DONE · UNDONE · MOVED_TO_DAY · MOVED_TO_BACKLOG ·
      SURFACED · SPLIT · SHOWN · DELETED · SKIPPED
```
**Денормализация намеренная:** `title`/`groupId`/`isRoutine` копируются **в событие**, поэтому
переименование или удаление задачи никогда не переписывает прошлое, а частота перестаёт считаться
по текущей строке названия.
Индексы: `taskId`, `dayKey`, `type`. История — **проекция** из журнала (чистый зачёт = отметки
минус снятия в пределах `dayKey`), а не отдельная таблица.
⚠️ **Но см. 02-BUGS FUNC-2:** нельзя оставлять `isDone` на строке параллельно журналу.
**Решить один раз: журнал — единственный источник истины о выполненности.**

### B-3. Рутина = вычисляемое появление, а не копия строки ⭐
Одна строка-определение живёт в бэклоге (`location=BACKLOG`, `isRoutine`, `recurrenceMask`,
`startDate`). В Дне **не хранится и не копируется** — показывается вычислением (`DayAssembly`).
- отметка → событие `DONE(taskId, dayKey)`
- свайп в Дне → `SKIPPED` = «пропустить сегодня», определение цело
- удалить совсем — только свайпом в бэклоге (защита внешней памяти от случайной потери)
- правка названия в Дне правит определение в бэклоге

Даёт **идеальную атрибуцию частоты** (все выполнения копятся на одной строке) — без этого
эпик 1 «агрессивное гашение частотой» небезопасен.

**`startDate` vs `dueDate`:** `startDate` — якорь начала повтора (до него рутина не появляется даже
в свой каденс-день); `dueDate` — одноразовое всплытие. Рутины **исключены** из `promoteDueBacklog`.

### B-4. Оверлей без сервиса
`OverlayController` — **объект-синглтон**, добавляет View через `WindowManager`
(`TYPE_APPLICATION_OVERLAY`, `FLAG_NOT_FOCUSABLE`). Видимое окно само удерживает процесс живым.
Список строк в `ScrollView` (макс 50% высоты экрана), шапка/подвал закреплены.
Свайп-вверх для закрытия через `GestureDetector` на фоне карточки (интерактивные дети
перехватывают раньше). **Никакого foreground-сервиса** — см. 02-BUGS AND-1.

### B-5. Планировщик, который сам себя перевзводит
`ReminderScheduler.scheduleAll()` ставит три аларма (день / вечер / сброс); **каждый ресивер
перевзводит свой следующий** при срабатывании → одного вызова хватает навсегда.
```kotlin
nextDayReminderMillis(settings, now): Long   // учитывает окно [start,end], в т.ч. до полуночи
```
Плюс `BootReceiver`, метка последнего сброса в prefs и догон пропущенного сброса при старте.

### B-6. Настройки в SharedPreferences с реактивным потоком
Иммутабельный снимок `data class Settings` + `observe(): Flow<Settings>` через `callbackFlow`
на `OnSharedPreferenceChangeListener`. Просто и достаточно.
```
dayRemindersEnabled=true, dayStart 9:00, dayEnd 21:00, dayIntervalMinutes=180,
bedtimeEnabled=true, bedtime 22:00, reset 4:00, overlayEnabled=false*, dynamicTheme=false
* свежие установки явно пишут overlayEnabled=true (плашка — герой механизма)
```

### B-7. Классификация установки «свежая vs апгрейд»
`initInstallDefaultsOnce()` синхронно в `Application.onCreate` **до первой записи prefs**:
пустой store → свежая (онбординг + плашка вкл.), непустой → апгрейд (не трогаем).
⚠️ Ломается об Auto Backup — см. 02-BUGS CRIT-1.

---

## C — UI-код (переписывать, но идеи забрать)

| Файл | Строк | Вердикт |
|---|---|---|
| `ui/BacklogScreen.kt` | 818 | **C** — раздулся, переписать. Идеи: чипы дат, морфинг строки, пикер каденции |
| `ui/HistoryScreen.kt` | 542 | **C** — переписать. Идеи: 3 нейтральных блока аналитики (см. ниже) |
| `ui/SettingsScreen.kt` | 448 | **C** — переписать под новый набор настроек |
| `ui/Checklist.kt` | 149 | **B** — переиспользуемый экран чек-листа, идея хорошая |
| `ui/components/*` | 862 | **B** — `Common`, `Editors`, `Groups`, `SwipeRows`, `TaskRow`: снять паттерны (03-DESIGN §5) |
| `ui/theme/*` | 417 | **A** — токены и типографика переносимы почти как есть |
| `ui/onboarding/` | 121 | **B** — структура (механизм → разрешения по очереди → готово) верна, тексты готовы |
| `ui/PermissionCards.kt` | 215 | **B** — общий `PermissionRequestCard` (заголовок, «зачем», нота+кнопка / тихая ✓) — хороший паттерн |

**Аналитика истории (без геймификации), три блока — забрать спецификацию:**
1. Среднее и итоги за период (7 / 30 дней)
2. Разбивка по дням недели
3. Частота задач (топ по числу выполнений)

Тренд «растёт/падает» **сознательно не брали** — читается как оценка.

---

## D — Тесты, которые стоит перенести первыми (15 файлов, ~1 100 строк)

| Тест | Что защищает |
|---|---|
| `ResetBoundaryTest` | граница логического дня |
| `DayAssemblyTest` / `RoutineDayAssemblyTest` | сборка Дня, гейт `startDate`, каденция |
| `ReminderContentTest` | ротация слотов, «никогда не показанные первыми» |
| `ReminderSurfaceTest` | выбор поверхности |
| `RecurrenceMaskTest` / `DueDatesTest` | маска дней, даты |
| `ChecklistRepositoryRolloverTest` / `JournalTest` | перекат дня, запись событий |
| `Migration4to5Test` / `Migration5to6Test` | миграции (Robolectric) |
| `ReminderSchedulerTest` | расчёт времени аларма, окно через полночь |
| `SettingsInstallInitTest` | классификация установки |

---

## E — Что НЕ тащить

- `domain/LegacyHistory.kt` — импорт старой `task_history`
- Замороженная сущность `CompletedTask` / таблица `task_history`
- Все миграции 1→2→3→4→5→6 — новая БД начинается с v1
- Отдельная таблица `bedtime_items` + вкладка «Вечер» — **уже был согласован план растворить
  её в рутинах** (ежедневная рутина в группе «Вечер»); в новом проекте просто не создавать
- `LockReminderActivity` / `USE_FULL_SCREEN_INTENT` — удалены ещё в v1.3.0
- `PendingOverlay` / `UserPresentReceiver` — удалены, не работает (02-BUGS AND-3)
- Расширенный пакет Material-иконок целиком (`material-icons-extended`) — брать точечно
