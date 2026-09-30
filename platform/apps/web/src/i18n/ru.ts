/** Russian — the source of every UI string; `en.ts` has the same keys (type-checked). Tone: 03-DESIGN §6. */
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export const ru = {
  lang: "ru" as "ru" | "en",
  day: "День",
  history: "История",
  settings: "Настройки",
  backlog: "Бэклог",
  allTasks: "Все задачи",
  noGroup: "Без группы",
  newGroup: "Новая группа",
  group: "Группа",
  addGroup: "Группа",
  placeholder: "Что не забыть?",
  add: "Добавить",
  tomorrow: "Завтра",
  weekend: "Выходные",
  week: "+7 дней",
  date: "Дата",
  pickDate: "Выбрать дату",
  pickGroup: "Выбрать группу",
  delete: "Удалить",
  deleted: "Задача удалена",
  groupDeleted: "Группа удалена",
  notSaved: "Не сохранилось",
  undo: "Отменить",
  retry: "Повторить",
  offline: "нет связи",
  signIn: "Войти через Google",
  signOut: "Выйти",
  signInFailed: "Вход не удался. Попробуйте ещё раз.",
  serverDown: "Сервер недоступен.",
  tagline: "Запишите и забудьте.",
  dayAccent: "…что важно сегодня",
  historyAccent: "…как идут дела",
  settingsAccent: "…под себя",
  soon: "Этот экран появится позже.",
  markDone: (title: string) => `Отметить: ${title}`,
  markUndone: (title: string) => `Вернуть: ${title}`,
  repeat: "Повтор",
  days: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
  /** "2026-10-03" → "3 окт" */
  dateLabel: (key: string) => {
    const [, m, d] = key.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
  },
};

export type Strings = typeof ru;
