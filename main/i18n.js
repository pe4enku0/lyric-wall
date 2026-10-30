// UI language: English or Russian. "auto" follows the system language list.
const { app } = require('electron');
const settings = require('./settings');

const dicts = {
  en: require('../locales/en.json'),
  ru: require('../locales/ru.json')
};

function lang() {
  const chosen = settings.get('language');
  if (dicts[chosen]) return chosen;
  for (const l of app.getPreferredSystemLanguages()) {
    const code = l.slice(0, 2).toLowerCase();
    if (dicts[code]) return code;
  }
  return 'en';
}

function t(key) {
  const d = dicts[lang()];
  return key in d ? d[key] : (dicts.en[key] ?? key);
}

// All strings for the wallpaper UI (it cannot read files itself), in the UI language or the one asked for.
function uiStrings(l = lang()) {
  return { ...dicts.en, ...dicts[l] };
}

module.exports = { lang, t, uiStrings };
