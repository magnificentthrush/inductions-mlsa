// Timer math. Screens tick locally once a second; the only network traffic is server_now(),
// used to measure how far this device's clock is from the server's.

/** Postgres sends microseconds; not every browser parses more than milliseconds. */
export function parseServerTime(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
}

/** offset = server time + half the round trip − client time when the answer arrived. */
export function clockOffsetMs(sentAtMs: number, serverIso: string, receivedAtMs: number): number {
  return parseServerTime(serverIso) + (receivedAtMs - sentAtMs) / 2 - receivedAtMs;
}

/** Time since `startedAtIso` on the server's clock; never negative. */
export function elapsedMs(startedAtIso: string, clientNowMs: number, offsetMs: number): number {
  return Math.max(0, clientNowMs + offsetMs - parseServerTime(startedAtIso));
}

/** 65 000 ms → "01:05"; past an hour → "1:02:05". */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

/** The timer turns amber once the interview reaches the target length. */
export function isOverTarget(ms: number, targetMinutes: number): boolean {
  return ms >= targetMinutes * 60_000;
}
