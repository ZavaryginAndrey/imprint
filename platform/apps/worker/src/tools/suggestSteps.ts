import { SUGGEST_DAILY_QUOTA, SUGGEST_STEPS, fail, found, parseSteps, prepareSuggestion, unchanged } from "@imprint/domain";
import { defineServerTool } from "./define";

/** «Подсказать шаги» (UX §4, ADR 009): prompt from the domain, a quota slot reserved before the model is awaited. */
export const suggestSteps = defineServerTool({
  ...SUGGEST_STEPS,
  async run(deps, i) {
    const today = deps.today();
    const prep = prepareSuggestion(deps.state(), i.taskId, today, deps.settings());
    if (!prep.ok) return prep.result;
    if (!deps.generate) return fail("unavailable");
    // Reserve first: while `fetch` is pending the object serves other requests (input gate open).
    const remaining = deps.quota.reserve(today, SUGGEST_DAILY_QUOTA);
    if (remaining == null) return unchanged("quota", { remaining: 0 });
    try {
      return found({ steps: parseSteps(await deps.generate(prep.prompt)), remaining });
    } catch (e) {
      deps.quota.release(today);
      return fail("upstream", { message: e instanceof Error ? e.message : String(e) });
    }
  },
});
