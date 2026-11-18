export function log(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** Posts one span when an OTLP HTTP endpoint is configured. Otherwise it is a log line. */
export async function span(
  name: string,
  ms: number,
  endpoint?: string | null,
): Promise<void> {
  log('info', { span: name, ms });
  if (!endpoint) return;
  const now = Date.now();
  await fetch(`${endpoint.replace(/\/$/, '')}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  name,
                  startTimeUnixNano: String((now - ms) * 1_000_000),
                  endTimeUnixNano: String(now * 1_000_000),
                },
              ],
            },
          ],
        },
      ],
    }),
  }).catch(() => undefined);
}
