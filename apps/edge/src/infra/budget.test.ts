import { describe, expect, it } from 'vitest';
import { metered, pending, setJob, flush } from './budget';

function fakeDb(rows: number) {
  const stmt = (q: string): any => ({ q, bind: (..._a: unknown[]) => stmt(q), run: async () => ({ meta: { rows_written: rows } }), all: async () => ({ results: [], meta: { rows_written: 0 } }), first: async () => null });
  const calls: string[][] = [];
  return { calls, db: { prepare: (q: string) => stmt(q), batch: async (s: any[]) => { calls.push(s.map((x) => x.q)); return s.map(() => ({ meta: { rows_written: rows } })); } } as any };
}

describe('write budget meter', () => {
  it('meters run() and batch() through the proxy and flushes one upsert per job', async () => {
    const { db, calls } = fakeDb(3);
    const m = metered(db);
    setJob('ingest');
    await m.prepare('UPDATE catalog SET x=1').bind(1).run();
    await m.batch([m.prepare('INSERT 1'), m.prepare('INSERT 2')]);
    expect(pending()).toBe(9);
    await flush({ DB: m } as any, true);
    expect(pending()).toBe(0);
    expect(calls.at(-1)?.[0]).toContain('INSERT INTO wbudget');
  });
});
