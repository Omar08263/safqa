export function sid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export const DEMO_USER_ID = sid(0x9001);
export const DEMO_EMAIL = 'demo@safqa.app';
export const DEMO_PASSWORD = 'demo1234';
