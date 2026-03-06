import { asTrimmedString } from "./helpers.js?v=20260305-batch05";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uniqueBullets(bullets) {
  return Array.from(new Set((Array.isArray(bullets) ? bullets : [])
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean)));
}

function buildBulletSection(heading, bullets) {
  const cleanBullets = uniqueBullets(bullets);
  if (!cleanBullets.length) return "";

  const headingHtml = heading ? `<p><strong>${escapeHtml(heading)}</strong></p>` : "";
  const bulletsHtml = cleanBullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
  return `${headingHtml}<ul>${bulletsHtml}</ul>`;
}

function buildEvaluationHtml(evaluation) {
  if (!evaluation || typeof evaluation !== "object") return "";

  const parts = [];
  const score = evaluation.score;
  const scale = asTrimmedString(evaluation.scale);
  const verdict = asTrimmedString(evaluation.verdict);

  if (score != null || scale || verdict) {
    const scoreParts = [];
    if (score != null) scoreParts.push(String(score));
    if (scale) scoreParts.push(scale);
    const summary = [scoreParts.join(" / ") || null, verdict || null].filter(Boolean).join(" – ");
    if (summary) {
      parts.push(`<p><strong>Bewertung</strong><br>${escapeHtml(summary)}</p>`);
    }
  }

  if (Array.isArray(evaluation.rubric) && evaluation.rubric.length) {
    const bullets = evaluation.rubric
      .map((entry) => {
        const criterion = asTrimmedString(entry?.criterion);
        const status = asTrimmedString(entry?.status);
        const comment = asTrimmedString(entry?.comment);
        const segments = [];
        if (criterion) segments.push(criterion);
        if (status) segments.push(`(${status})`);
        if (comment) segments.push(`– ${comment}`);
        return segments.join(" ").trim();
      })
      .filter(Boolean);

    if (bullets.length) {
      parts.push(buildBulletSection("Rubrik", bullets));
    }
  }

  return parts.join("");
}

function buildDirectiveBullets(flowControlDirectives) {
  const bullets = [];
  const unlockRunProfileIds = Array.isArray(flowControlDirectives?.unlockRunProfileIds)
    ? flowControlDirectives.unlockRunProfileIds.map((value) => asTrimmedString(value)).filter(Boolean)
    : [];
  const completeRunProfileIds = Array.isArray(flowControlDirectives?.completeRunProfileIds)
    ? flowControlDirectives.completeRunProfileIds.map((value) => asTrimmedString(value)).filter(Boolean)
    : [];

  for (const runProfileId of unlockRunProfileIds) {
    bullets.push(`Button freischalten: ${runProfileId}`);
  }
  for (const runProfileId of completeRunProfileIds) {
    bullets.push(`Button erledigt markieren: ${runProfileId}`);
  }

  return bullets;
}

export function buildAgentFeedbackContent({ feedback, flowControlDirectives, evaluation } = {}) {
  const title = asTrimmedString(feedback?.title);
  const summary = asTrimmedString(feedback?.summary);
  const sections = Array.isArray(feedback?.sections) ? feedback.sections : [];

  const chunks = [];
  if (title) chunks.push(`<p><strong>${escapeHtml(title)}</strong></p>`);
  if (summary) chunks.push(`<p>${escapeHtml(summary)}</p>`);

  for (const section of sections) {
    chunks.push(buildBulletSection(asTrimmedString(section?.heading), section?.bullets));
  }

  const directiveBullets = buildDirectiveBullets(flowControlDirectives);
  if (directiveBullets.length) {
    chunks.push(buildBulletSection("Button-Aktionen", directiveBullets));
  }

  const evaluationHtml = buildEvaluationHtml(evaluation);
  if (evaluationHtml) chunks.push(evaluationHtml);

  const html = chunks.filter(Boolean).join("");
  return html || `<p>${escapeHtml("Keine Agentenantwort verfügbar.")}</p>`;
}

export function buildQuestionAnswerContent({ answer } = {}) {
  const text = asTrimmedString(answer) || "Keine Antwort verfügbar.";
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`);

  return paragraphs.join("") || `<p>${escapeHtml(text)}</p>`;
}
