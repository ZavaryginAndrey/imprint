import type { Session } from "./auth/session";
import type { UserStore } from "./userStore";

/** Worker bindings (wrangler.jsonc). ASSETS exists only in the dev/prod environments. */
export interface Env {
  USER_STORE: DurableObjectNamespace<UserStore>;
  ASSETS?: Fetcher;
  /** HMAC key for our cookies (wrangler secret). */
  SESSION_SECRET?: string;
  /** Google OAuth web client of this environment (wrangler secrets; dev and prod differ, P8). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** The browser's origin when it is not the worker's own — local Vite: http://localhost:5173. */
  APP_ORIGIN?: string;
  /** Gemini key for «Подсказать шаги» (wrangler secret); absent → suggest_steps is unavailable. */
  GEMINI_API_KEY?: string;
}

export type AppEnv = { Bindings: Env; Variables: { session: Session } };
