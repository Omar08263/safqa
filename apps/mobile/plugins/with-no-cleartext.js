// Release builds: HTTPS only. Android 9+ already blocks cleartext by default; this makes it
// explicit so no library or future config can turn it back on. Debug/debugOptimized
// manifests keep cleartext for Metro (they use tools:replace, so the merge stays clean).
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withNoCleartext(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'false';
    return cfg;
  });
};
