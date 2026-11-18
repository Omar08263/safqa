import { hash32 } from '../lib/arabic';
import { type Agent, type Mood, type Status, statusLabel, teamById } from '../lib/agents';

/**
 * Procedural vector avatar. Every agent gets a unique face (hair, eyes,
 * accessories) in its team's palette and motif. Pure SVG, so it is sharp at
 * any size; `downloadAvatar` renders it to a 4096×4096 PNG.
 */
export function AgentAvatar({ agent, mood = agent.baseMood, status, size = 64, ring = true }: { agent: Agent; mood?: Mood; status?: Status; size?: number; ring?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label={`${agent.name} — وكيل ذكي`} dangerouslySetInnerHTML={{ __html: avatarSvgInner(agent, mood, status, ring) }} />;
}

export function avatarSvgInner(agent: Agent, mood: Mood, status?: Status, ring = true): string {
  const team = teamById(agent.team);
  const [c1, c2, c3] = team.colors;
  const h = hash32(agent.id);
  const uid = `a${agent.id}`;
  const hairStyle = h % 5;
  const eyeGap = 52 + (h % 3) * 6;
  const faceW = 118 + ((h >>> 3) % 3) * 8;
  const motif = motifSvg(team.motif, c2, c3, h);
  const eyes = eyesFor(mood, eyeGap);
  const mouth = mouthFor(mood);
  const brows = browsFor(mood, eyeGap, agent.hair);
  const acc = accessory(agent.team, c1, c2, c3);
  const hair = hairFor(hairStyle, agent.hair, faceW);
  const st = status ? statusLabel[status][2] : null;
  return `
<defs>
  <radialGradient id="${uid}bg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${c2}"/><stop offset="0.55" stop-color="${c1}"/><stop offset="1" stop-color="#0b0b12"/></radialGradient>
  <linearGradient id="${uid}ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c3}"/><stop offset="0.5" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient>
  <radialGradient id="${uid}skin" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="${lighten(agent.skin, 0.18)}"/><stop offset="1" stop-color="${agent.skin}"/></radialGradient>
  <linearGradient id="${uid}body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient>
  <clipPath id="${uid}clip"><circle cx="256" cy="256" r="240"/></clipPath>
  <filter id="${uid}glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<g clip-path="url(#${uid}clip)">
  <rect width="512" height="512" fill="url(#${uid}bg)"/>
  ${motif}
  <path d="M96 520 C110 400 180 360 256 360 C332 360 402 400 416 520 Z" fill="url(#${uid}body)"/>
  <path d="M206 360 L256 410 L306 360" fill="none" stroke="${c3}" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
  <rect x="226" y="318" width="60" height="52" rx="18" fill="${agent.skin}"/>
  <ellipse cx="256" cy="232" rx="${faceW}" ry="${faceW + 18}" fill="url(#${uid}skin)"/>
  <ellipse cx="${256 - faceW + 4}" cy="240" rx="16" ry="26" fill="${agent.skin}"/>
  <ellipse cx="${256 + faceW - 4}" cy="240" rx="16" ry="26" fill="${agent.skin}"/>
  ${hair}
  <ellipse cx="${256 - eyeGap - 22}" cy="272" rx="20" ry="11" fill="#ff7a7a" opacity="${mood === 'happy' || mood === 'excited' || mood === 'playful' ? 0.35 : 0.12}"/>
  <ellipse cx="${256 + eyeGap + 22}" cy="272" rx="20" ry="11" fill="#ff7a7a" opacity="${mood === 'happy' || mood === 'excited' || mood === 'playful' ? 0.35 : 0.12}"/>
  ${brows}
  ${eyes}
  <path d="M250 250 Q256 268 262 250" fill="none" stroke="${darken(agent.skin, 0.35)}" stroke-width="5" stroke-linecap="round"/>
  ${mouth}
  ${acc}
  <g transform="translate(256 82)" filter="url(#${uid}glow)"><line x1="0" y1="0" x2="0" y2="-34" stroke="${c3}" stroke-width="6"/><circle cx="0" cy="-40" r="11" fill="${c3}"/></g>
  <g transform="translate(330 420)"><rect x="0" y="0" width="86" height="40" rx="20" fill="#0b0b12" opacity="0.75"/><text x="43" y="28" font-family="Readex Pro, sans-serif" font-size="24" font-weight="700" fill="${c3}" text-anchor="middle">AI</text></g>
</g>
${ring ? `<circle cx="256" cy="256" r="244" fill="none" stroke="url(#${uid}ring)" stroke-width="10"/>` : ''}
${st ? `<circle cx="430" cy="430" r="40" fill="#0b0b12"/><circle cx="430" cy="430" r="30" fill="${st}"/>` : ''}`;
}

function motifSvg(m: string, a: string, b: string, h: number): string {
  const o = 0.16;
  switch (m) {
    case 'shield':
      return Array.from({ length: 6 }, (_, i) => `<path d="M${40 + i * 90} 40 l30 12 v26 c0 18 -14 30 -30 36 c-16 -6 -30 -18 -30 -36 v-26z" fill="${b}" opacity="${o}"/>`).join('') + `<path d="M0 470 L512 300" stroke="${b}" stroke-width="3" opacity="0.25"/>`;
    case 'bubbles':
      return Array.from({ length: 12 }, (_, i) => `<circle cx="${((h * (i + 3)) >>> 0) % 512}" cy="${(h >>> i) % 300}" r="${10 + ((h >>> (i + 2)) % 30)}" fill="${i % 2 ? a : b}" opacity="${o + 0.06}"/>`).join('');
    case 'waves':
      return Array.from({ length: 6 }, (_, i) => `<path d="M0 ${60 + i * 45} Q128 ${30 + i * 45} 256 ${60 + i * 45} T512 ${60 + i * 45}" fill="none" stroke="${i % 2 ? a : b}" stroke-width="6" opacity="${o + 0.08}"/>`).join('');
    case 'rays':
      return Array.from({ length: 16 }, (_, i) => `<path d="M256 220 L${256 + Math.cos((i * Math.PI) / 8) * 420} ${220 + Math.sin((i * Math.PI) / 8) * 420} L${256 + Math.cos((i * Math.PI) / 8 + 0.1) * 420} ${220 + Math.sin((i * Math.PI) / 8 + 0.1) * 420}Z" fill="${b}" opacity="${o}"/>`).join('');
    case 'pulse':
      return Array.from({ length: 5 }, (_, i) => `<circle cx="256" cy="220" r="${120 + i * 50}" fill="none" stroke="${i % 2 ? a : b}" stroke-width="5" opacity="${0.28 - i * 0.04}"/>`).join('');
    case 'circuit':
      return Array.from({ length: 10 }, (_, i) => {
        const x = ((h * (i + 7)) >>> 0) % 480;
        const y = (h >>> i) % 200;
        return `<path d="M${x} ${y} h40 v30 h30" fill="none" stroke="${b}" stroke-width="4" opacity="0.3"/><circle cx="${x + 70}" cy="${y + 30}" r="6" fill="${a}" opacity="0.5"/>`;
      }).join('');
    default:
      return Array.from({ length: 8 }, (_, i) => `<path transform="translate(${((h * (i + 2)) >>> 0) % 470} ${(h >>> i) % 220}) scale(1.2)" d="M12 21s-7-4.5-9.5-9C1 8.5 3 5 6.5 5 8.5 5 10 6 12 8c2-2 3.5-3 5.5-3C21 5 23 8.5 21.5 12 19 16.5 12 21 12 21z" fill="${b}" opacity="0.22"/>`).join('');
  }
}

function eyesFor(mood: Mood, gap: number): string {
  const L = 256 - gap;
  const R = 256 + gap;
  const y = 228;
  if (mood === 'sleepy') return [L, R].map((x) => `<path d="M${x - 18} ${y} Q${x} ${y + 12} ${x + 18} ${y}" fill="none" stroke="#1d1d1d" stroke-width="6" stroke-linecap="round"/>`).join('') + `<text x="${R + 60}" y="150" font-size="44" fill="#fff" opacity="0.85" font-family="sans-serif">z</text><text x="${R + 92}" y="118" font-size="30" fill="#fff" opacity="0.6" font-family="sans-serif">z</text>`;
  if (mood === 'happy' || mood === 'proud') return [L, R].map((x) => `<path d="M${x - 18} ${y + 6} Q${x} ${y - 14} ${x + 18} ${y + 6}" fill="none" stroke="#1d1d1d" stroke-width="7" stroke-linecap="round"/>`).join('');
  const r = mood === 'excited' ? 17 : 14;
  const pupil = mood === 'worried' ? 6 : 8;
  return [L, R].map((x) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r + 3}" fill="#fff"/><circle cx="${x + 2}" cy="${y + 2}" r="${pupil + 3}" fill="#1d1d1d"/><circle cx="${x + 6}" cy="${y - 3}" r="4" fill="#fff"/>`).join('') + (mood === 'playful' ? `<path d="M${R - 18} ${y} h36" stroke="#1d1d1d" stroke-width="7" stroke-linecap="round"/>` : '');
}

function browsFor(mood: Mood, gap: number, color: string): string {
  const L = 256 - gap;
  const R = 256 + gap;
  const y = 196;
  const tilt = mood === 'strict' ? 10 : mood === 'worried' ? -10 : mood === 'excited' ? -4 : 0;
  const lift = mood === 'excited' ? -8 : 0;
  return `<path d="M${L - 22} ${y + lift + tilt * -0.4} L${L + 20} ${y + lift + tilt}" stroke="${color}" stroke-width="9" stroke-linecap="round"/><path d="M${R - 20} ${y + lift + tilt} L${R + 22} ${y + lift + tilt * -0.4}" stroke="${color}" stroke-width="9" stroke-linecap="round"/>`;
}

function mouthFor(mood: Mood): string {
  switch (mood) {
    case 'excited':
      return '<path d="M214 292 Q256 350 298 292 Z" fill="#7a1f2b"/><path d="M228 300 Q256 316 284 300" fill="#fff"/>';
    case 'happy':
    case 'proud':
      return '<path d="M220 296 Q256 330 292 296" fill="none" stroke="#7a1f2b" stroke-width="8" stroke-linecap="round"/>';
    case 'playful':
      return '<path d="M222 298 Q256 326 290 298" fill="none" stroke="#7a1f2b" stroke-width="8" stroke-linecap="round"/><ellipse cx="270" cy="314" rx="12" ry="9" fill="#e35d6a"/>';
    case 'strict':
      return '<path d="M226 306 h60" stroke="#7a1f2b" stroke-width="8" stroke-linecap="round"/>';
    case 'worried':
      return '<path d="M224 312 Q256 290 288 312" fill="none" stroke="#7a1f2b" stroke-width="8" stroke-linecap="round"/>';
    case 'sleepy':
      return '<ellipse cx="256" cy="306" rx="12" ry="9" fill="#7a1f2b"/>';
    default:
      return '<path d="M230 302 Q256 316 282 302" fill="none" stroke="#7a1f2b" stroke-width="8" stroke-linecap="round"/>';
  }
}

function hairFor(style: number, color: string, w: number): string {
  const top = `<path d="M${256 - w - 6} 220 C${256 - w} 110 ${256 + w} 110 ${256 + w + 6} 220 C${256 + w - 20} 160 ${256 - w + 20} 160 ${256 - w - 6} 220Z" fill="${color}"/>`;
  switch (style) {
    case 0:
      return top;
    case 1:
      return `${top}<path d="M${256 - w} 170 Q256 120 ${256 + w} 190 Q256 150 ${256 - w} 170Z" fill="${color}"/>`;
    case 2:
      return `<path d="M${256 - w - 14} 330 C${256 - w - 40} 120 ${256 + w + 40} 120 ${256 + w + 14} 330 L${256 + w - 6} 230 C${256 + w - 30} 150 ${256 - w + 30} 150 ${256 - w + 6} 230Z" fill="${color}"/>`;
    case 3:
      return `${top}<circle cx="256" cy="104" r="36" fill="${color}"/>`;
    default:
      return `<path d="M${256 - w - 4} 200 C${256 - w + 10} 120 ${256 + w - 10} 120 ${256 + w + 4} 200 Q256 168 ${256 - w - 4} 200Z" fill="${color}"/>`;
  }
}

function accessory(team: string, c1: string, c2: string, c3: string): string {
  switch (team) {
    case 'legal':
      return `<g transform="translate(150 380)"><path d="M0 0 h50 v30 c0 20 -25 32 -25 32 c0 0 -25 -12 -25 -32z" fill="${c2}" stroke="${c3}" stroke-width="4"/><text x="25" y="34" font-size="26" text-anchor="middle">⚖</text></g><rect x="${256 - 70}" y="214" width="140" height="6" fill="#1d1d1d" opacity="0.0"/>`;
    case 'deals':
      return `<g transform="translate(340 360)" stroke="${c3}" stroke-width="6" fill="none"><circle cx="30" cy="30" r="26"/><circle cx="30" cy="30" r="10"/><path d="M30 -4 v14 M30 50 v14 M-4 30 h14 M50 30 h14"/></g>`;
    case 'notify':
      return `<g transform="translate(150 370)"><path d="M25 0 c-16 0 -24 12 -24 28 v14 l-8 10 h64 l-8 -10 v-14 c0 -16 -8 -28 -24 -28z" fill="${c3}"/><circle cx="25" cy="58" r="7" fill="${c3}"/></g>`;
    case 'ops':
      return `<path d="M${256 - 128} 236 C${256 - 128} 120 ${256 + 128} 120 ${256 + 128} 236" fill="none" stroke="#1d1d1d" stroke-width="12"/><rect x="${256 - 146}" y="222" width="30" height="56" rx="12" fill="${c2}"/><rect x="${256 + 116}" y="222" width="30" height="56" rx="12" fill="${c2}"/><path d="M${256 + 130} 278 Q${256 + 110} 330 280 326" fill="none" stroke="#1d1d1d" stroke-width="6"/><circle cx="276" cy="326" r="9" fill="${c3}"/>`;
    case 'support':
      return `<g transform="translate(160 385) scale(2.2)"><path d="M12 21s-7-4.5-9.5-9C1 8.5 3 5 6.5 5 8.5 5 10 6 12 8c2-2 3.5-3 5.5-3C21 5 23 8.5 21.5 12 19 16.5 12 21 12 21z" fill="${c3}"/></g>`;
    case 'chat':
      return `<g transform="translate(330 360)"><rect x="0" y="0" width="80" height="52" rx="18" fill="${c3}"/><path d="M18 52 l-6 18 l20 -18z" fill="${c3}"/><circle cx="22" cy="26" r="6" fill="${c1}"/><circle cx="40" cy="26" r="6" fill="${c1}"/><circle cx="58" cy="26" r="6" fill="${c1}"/></g>`;
    default:
      return `<g transform="translate(150 380)">${[0, 1, 2, 3, 4].map((i) => `<rect x="${i * 14}" y="${(i * 7) % 20}" width="9" height="16" rx="3" fill="${i % 2 ? c3 : c2}" transform="rotate(${i * 25} ${i * 14} 10)"/>`).join('')}</g>`;
  }
}

function shade(hex: string, amt: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}
const lighten = (h: string, a: number) => shade(h, a);
const darken = (h: string, a: number) => shade(h, -a);

/** Render the avatar to a 4096×4096 PNG and download it. */
export async function downloadAvatar(agent: Agent, mood: Mood) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="4096" viewBox="0 0 512 512">${avatarSvgInner(agent, mood, undefined, true)}</svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 4096;
  canvas.getContext('2d')?.drawImage(img, 0, 0, 4096, 4096);
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `safqa-agent-${agent.id}-4k.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
