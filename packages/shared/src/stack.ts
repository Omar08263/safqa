export interface StackLayer {
  id: string;
  label: string;
  kind: 'bank' | 'coupon';
  /** Percent off the running total, before the cap. */
  percent?: number;
  /** Fixed pounds off, applied after the percent. */
  amountEgp?: number;
  /** Maximum pounds this layer may remove. */
  capEgp?: number;
  minSpendEgp?: number;
}

export interface StackResult {
  startEgp: number;
  finalEgp: number;
  savedEgp: number;
  applied: Array<{ id: string; savedEgp: number }>;
  skipped: Array<{ id: string; reason: 'min_spend' }>;
}

/** Apply bank then coupon layers. Caps are per layer, not on the whole stack. */
export function stackPrice(startEgp: number, layers: StackLayer[]): StackResult {
  let running = startEgp;
  const applied: StackResult['applied'] = [];
  const skipped: StackResult['skipped'] = [];
  for (const layer of layers) {
    if (layer.minSpendEgp != null && startEgp < layer.minSpendEgp) {
      skipped.push({ id: layer.id, reason: 'min_spend' });
      continue;
    }
    let saved = 0;
    if (layer.percent) saved += running * (layer.percent / 100);
    if (layer.amountEgp) saved += layer.amountEgp;
    if (layer.capEgp != null) saved = Math.min(saved, layer.capEgp);
    saved = Math.min(saved, running);
    saved = Math.round(saved);
    running -= saved;
    applied.push({ id: layer.id, savedEgp: saved });
  }
  return {
    startEgp,
    finalEgp: running,
    savedEgp: startEgp - running,
    applied,
    skipped,
  };
}
