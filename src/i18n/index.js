import { UI_STRINGS } from "./catalog.js?v=20260310-batch92";

export const SUPPORTED_UI_LANGUAGES = Object.freeze(["de", "en"]);
export const DEFAULT_UI_LANGUAGE = "de";

export function normalizeUiLanguage(value) {
  return SUPPORTED_UI_LANGUAGES.includes(value) ? value : DEFAULT_UI_LANGUAGE;
}

export function pickLocalized(value, lang, fallback = DEFAULT_UI_LANGUAGE) {
  const wanted = normalizeUiLanguage(lang);
  const fallbackLang = normalizeUiLanguage(fallback);

  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  return value[wanted] || value[fallbackLang] || Object.values(value).find((entry) => typeof entry === "string" && entry.trim()) || "";
}

export function interpolate(template, vars = {}) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    return vars[key] == null ? "" : String(vars[key]);
  });
}

export function t(key, lang, vars = {}) {
  const entry = UI_STRINGS[key];
  const raw = entry ? pickLocalized(entry, lang) : key;
  return interpolate(raw, vars);
}

export function allLocaleVariants(localizedValue) {
  if (typeof localizedValue === "string") return [localizedValue];
  if (!localizedValue || typeof localizedValue !== "object") return [];
  return Array.from(new Set(Object.values(localizedValue).filter((value) => typeof value === "string" && value.trim())));
}

export function getLocaleForLanguage(lang) {
  return normalizeUiLanguage(lang) === "en" ? "en-US" : "de-DE";
}
