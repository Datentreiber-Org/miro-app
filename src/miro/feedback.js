import { asTrimmedString } from "./helpers.js?v=20260314-patch12-cleanup6";
import { normalizeUiLanguage, t } from "../i18n/index.js?v=20260314-patch12-cleanup6";

function normalizeVisibleText(value) {
  const raw = String(value ?? "");
  return raw
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|ul|ol|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeShapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uniqueBullets(bullets) {
  return Array.from(new Set((Array.isArray(bullets) ? bullets : [])
    .map((entry) => normalizeVisibleText(asTrimmedString(entry)))
    .filter(Boolean)));
}

function splitIntoParagraphs(text) {
  return normalizeVisibleText(text)
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function renderParagraphText(text) {
  return escapeShapeText(String(text || "").trim()).replace(/\n/g, "<br>");
}

function buildShapeHeading(text) {
  const clean = normalizeVisibleText(asTrimmedString(text));
  if (!clean) return "";
  return `<p><strong>${renderParagraphText(clean)}</strong></p>`;
}

function buildShapeParagraphs(text) {
  return splitIntoParagraphs(text)
    .map((paragraph) => `<p>${renderParagraphText(paragraph)}</p>`)
    .join("");
}

function buildShapeBulletParagraphs(bullets) {
  return uniqueBullets(bullets)
    .map((bullet) => `<p>• ${renderParagraphText(bullet)}</p>`)
    .join("");
}

function buildEvaluationHtml(evaluation, lang = "de") {
  const uiLang = normalizeUiLanguage(lang);
  if (!evaluation || typeof evaluation !== "object") return "";

  const chunks = [];
  const score = evaluation.score;
  const scale = normalizeVisibleText(asTrimmedString(evaluation.scale));
  const verdict = normalizeVisibleText(asTrimmedString(evaluation.verdict));

  if (score != null || scale || verdict) {
    const scoreParts = [];
    if (score != null) scoreParts.push(String(score));
    if (scale) scoreParts.push(scale);
    const summary = [scoreParts.join(" / ") || null, verdict || null].filter(Boolean).join(" – ");
    if (summary) {
      chunks.push(buildShapeHeading(t("feedback.heading.evaluation", uiLang)));
      chunks.push(buildShapeParagraphs(summary));
    }
  }

  if (Array.isArray(evaluation.rubric) && evaluation.rubric.length) {
    const bullets = evaluation.rubric
      .map((entry) => {
        const criterion = normalizeVisibleText(asTrimmedString(entry?.criterion));
        const status = normalizeVisibleText(asTrimmedString(entry?.status));
        const comment = normalizeVisibleText(asTrimmedString(entry?.comment));
        const segments = [];
        if (criterion) segments.push(criterion);
        if (status) segments.push(`(${status})`);
        if (comment) segments.push(`– ${comment}`);
        return segments.join(" ").trim();
      })
      .filter(Boolean);

    if (bullets.length) {
      chunks.push(buildShapeHeading(t("feedback.heading.rubric", uiLang)));
      chunks.push(buildShapeBulletParagraphs(bullets));
    }
  }

  return chunks.filter(Boolean).join("");
}

export function buildAgentFeedbackContent({ feedback, flowControlDirectives, evaluation, lang = "de" } = {}) {
  const uiLang = normalizeUiLanguage(lang);
  const title = normalizeVisibleText(asTrimmedString(feedback?.title));
  const summary = normalizeVisibleText(asTrimmedString(feedback?.summary));
  const sections = Array.isArray(feedback?.sections) ? feedback.sections : [];

  const chunks = [];
  if (title) chunks.push(buildShapeHeading(title));
  if (summary) chunks.push(buildShapeParagraphs(summary));

  for (const section of sections) {
    const headingHtml = buildShapeHeading(asTrimmedString(section?.heading));
    const bulletsHtml = buildShapeBulletParagraphs(section?.bullets);
    if (headingHtml) chunks.push(headingHtml);
    if (bulletsHtml) chunks.push(bulletsHtml);
  }

  const evaluationHtml = buildEvaluationHtml(evaluation, uiLang);
  if (evaluationHtml) chunks.push(evaluationHtml);

  const html = chunks.filter(Boolean).join("");
  return html || buildShapeParagraphs(t("feedback.noAgentResponse", uiLang));
}

export function buildQuestionAnswerContent({ answer, lang = "de" } = {}) {
  const uiLang = normalizeUiLanguage(lang);
  const text = normalizeVisibleText(asTrimmedString(answer) || t("feedback.noAnswer", uiLang));
  const html = buildShapeParagraphs(text || t("feedback.noAnswer", uiLang));
  return html || buildShapeParagraphs(t("feedback.noAnswer", uiLang));
}
