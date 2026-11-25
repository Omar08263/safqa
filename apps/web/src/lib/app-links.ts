// Where the native Android app lives (GitHub Releases on the public repo).
// Pinned to the tag so another release (e.g. an admin build) never breaks the link.
export const APP_VERSION = '5.0.0';
export const APK_URL = `https://github.com/Omar08263/safqa/releases/download/v${APP_VERSION}/safqa.apk`;
export const RELEASES_URL = `https://github.com/Omar08263/safqa/releases/tag/v${APP_VERSION}`;
export const SITE_URL = 'https://safqaeg.pages.dev';

export function platform(): 'android' | 'ios' | 'desktop' {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true || document.referrer.startsWith('android-app://');
}
