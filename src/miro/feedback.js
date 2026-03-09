import { asTrimmedString } from "./helpers.js?v=20260305-batch05";
import { normalizeUiLanguage, t } from "../i18n/index.js?v=20260309-batch91hotfix1";

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
    .replace(/[ 	]+\n/g, "\n")
    .replace(/\n[ 	]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ 	]{2,}/g, " ")
    .trim();
}

function uniqueBullets(bullets) {
  return Array.from(new Set((Array.isArray(bullets) ? bullets : [])
    .map((entry) => normalizeVisibleText(asTrimmedString(entry)))
    .filter(Boolean)));
}

function buildBulletSection(heading, bullets) {
  const cleanBullets = uniqueBullets(bullets);
  if (!cleanBullets.length) return "";

  const lines = [];
  const cleanHeading = normalizeVisibleText(asTrimmedString(heading));
  if (cleanHeading) lines.push(cleanHeading);
  for (const bullet of cleanBullets) {
    lines.push("• " + bullet);
  }
  return lines.join("\n");
}

function buildEvaluationText(evaluation, lang = "de") {
  const uiLang = normalizeUiLanguage(lang);
  if (!evaluation || typeof evaluation !== "object") return "";

  const parts = [];
  const score = evaluation.score;
  const scale = normalizeVisibleText(asTrimmedString(evaluation.scale));
  const verdict = normalizeVisibleText(asTrimmedString(evaluation.verdict));

  if (score != null || scale || verdict) {
    const scoreParts = [];
    if (score != null) scoreParts.push(String(score));
    if (scale) scoreParts.push(scale);
    const summary = [scoreParts.join(" / ") || null, verdict || null].filter(Boolean).join(" – ");
    if (summary) {
      parts.push(t("feedback.heading.evaluation", uiLang) + "\n" + summary);
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
      parts.push(buildBulletSection(t("feedback.heading.rubric", uiLang), bullets));
    }
  }

  return parts.join("\n\n");
}

export function buildAgentFeedbackContent({ feedback, flowControlDirectives, evaluation, lang = "de" } = {}) {
  const uiLang = normalizeUiLanguage(lang);
  const title = normalizeVisibleText(asTrimmedString(feedback?.title));
  const summary = normalizeVisibleText(asTrimmedString(feedback?.summary));
  const sections = Array.isArray(feedback?.sections) ? feedback.sections : [];

  const chunks = [];
  if (title) chunks.push(title);
  if (summary) chunks.push(summary);

  for (const section of sections) {
    const block = buildBulletSection(asTrimmedString(section?.heading), section?.bullets);
    if (block) chunks.push(block);
  }

  const evaluationText = buildEvaluationText(evaluation, uiLang);
  if (evaluationText) chunks.push(evaluationText);

  const text = chunks.filter(Boolean).join("\n\n");
  return text || t("feedback.noAgentResponse", uiLang);
}

export function buildQuestionAnswerContent({ answer, lang = "de" } = {}) {
  const uiLang = normalizeUiLanguage(lang);
  const text = normalizeVisibleText(asTrimmedString(answer) || t("feedback.noAnswer", uiLang));
  return text || t("feedback.noAnswer", uiLang);
}
