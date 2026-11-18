// Where the real Android app lives (GitHub Releases on the public repo).
export const APK_URL = 'https://github.com/Omar08263/safqa/releases/latest/download/safqa.apk';
export const RELEASES_URL = 'https://github.com/Omar08263/safqa/releases/latest';
export const SITE_URL = 'https://safqa-eg-safqa.static.hf.space';

export function platform(): 'android' | 'ios' | 'desktop' {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true || document.referrer.startsWith('android-app://');
}
