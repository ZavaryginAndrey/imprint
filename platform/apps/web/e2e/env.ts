/** e2e runs its own worker and web on these ports, with its own local storage — never real data (CRIT-1). */
export const E2E_SECRET = "e2e-session-secret-not-a-secret";
export const WORKER_PORT = 8788;
export const WEB_PORT = 5174;
export const WEB = `http://localhost:${WEB_PORT}`;
