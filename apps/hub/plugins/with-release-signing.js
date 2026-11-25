// Signs release builds with a keystore that lives OUTSIDE the repo.
// Reads SAFQA_KEYSTORE / SAFQA_KEYSTORE_PASS / SAFQA_KEY_ALIAS from the
// environment at Gradle time; without them the release falls back to the
// debug key (so CI and contributors can still build).
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('safqaRelease')) {
      g = g.replace(
        /signingConfigs\s*\{/,
        `signingConfigs {
        safqaRelease {
            if (System.getenv("SAFQA_KEYSTORE")) {
                storeFile file(System.getenv("SAFQA_KEYSTORE"))
                storePassword System.getenv("SAFQA_KEYSTORE_PASS")
                keyAlias System.getenv("SAFQA_KEY_ALIAS") ?: "safqa"
                keyPassword System.getenv("SAFQA_KEYSTORE_PASS")
            }
        }`,
      );
      g = g.replace(
        /(release\s*\{[^}]*?)signingConfig\s+signingConfigs\.debug/,
        '$1signingConfig System.getenv("SAFQA_KEYSTORE") ? signingConfigs.safqaRelease : signingConfigs.debug',
      );
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
