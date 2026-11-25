// Arabic-first app: force RTL natively at process start so the very first
// frame is already right-to-left (I18nManager.forceRTL from JS only applies
// after a restart).
const { withMainApplication } = require('expo/config-plugins');

module.exports = function withForceRtl(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('I18nUtil')) {
      src = src.replace(
        /super\.onCreate\(\)/,
        'super.onCreate()\n    com.facebook.react.modules.i18nmanager.I18nUtil.instance.allowRTL(this, true)\n    com.facebook.react.modules.i18nmanager.I18nUtil.instance.forceRTL(this, true)',
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
