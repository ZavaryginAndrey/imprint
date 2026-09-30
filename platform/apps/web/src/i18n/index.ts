import { useStore } from "../store/hooks";
import { en } from "./en";
import { ru, type Strings } from "./ru";

export type { Strings };
export type Lang = "ru" | "en";

export const STRINGS: Record<Lang, Strings> = { ru, en };

/** Before sign-in there are no user settings: the browser's language decides. */
export function browserLang(): Lang {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** The strings of the user's language (`UserSettings.language`), the browser's until the state arrives. */
export function useT(): Strings {
  const lang = useStore((s) => s.view?.settings.language ?? null);
  return STRINGS[lang ?? browserLang()];
}
