import { describe, expect, it } from 'vitest';
import { nextRank, OPS_AGENTS, OPS_RANKS, rankFor, rankIndex } from './autopilot';

describe('autopilot ranks', () => {
  it('maps xp to ranks in order', () => {
    expect(rankFor(0).id).toBe('trainee');
    expect(rankFor(49).id).toBe('trainee');
    expect(rankFor(50).id).toBe('assistant');
    expect(rankFor(650).id).toBe('expert');
    expect(rankFor(99999).id).toBe('legend');
  });
  it('honours an owner override', () => {
    expect(rankFor(0, 'expert').id).toBe('expert');
    expect(rankFor(0, 'nope').id).toBe('trainee');
  });
  it('knows the next rank', () => {
    expect(nextRank(10)?.id).toBe('assistant');
    expect(nextRank(5000)).toBeNull();
    expect(rankIndex('legend')).toBe(OPS_RANKS.length - 1);
  });
  it('has unique agents with a cadence the 10-min cron can hit', () => {
    expect(new Set(OPS_AGENTS.map((a) => a.id)).size).toBe(OPS_AGENTS.length);
    for (const a of OPS_AGENTS) expect(a.every % 10).toBe(0);
  });
});
