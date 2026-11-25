// Client-side navigation from code that is outside a route component (toasts, effects).
// The router is imported lazily so this module never creates an import cycle.
export function go(to: string, replace = false) {
  void import('../router').then(({ router }) => router.history[replace ? 'replace' : 'push'](to));
}
/** Query string of the current URL (clean history routes: /pay?tier=gold). */
export const query = () => new URLSearchParams(window.location.search);
