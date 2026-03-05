import {
  DT_DEFAULT_FEEDBACK_FRAME_NAME,
  DT_FEEDBACK_TEXT_LAYOUT,
  DT_TEXT_META_KEY_FEEDBACK
} from "../config.js?v=20260303-flowbatch1";

import { isFiniteNumber } from "../utils.js?v=20260301-step11-hotfix2";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260305-batch05";
import { compareItemIdsAsc, normalizePositiveInt, asTrimmedString } from "./helpers.js?v=20260305-batch05";
import { getViewport, getItemById } from "./items.js?v=20260305-batch05";

// --------------------------------------------------------------------
// Feedback rendering and frame management
// --------------------------------------------------------------------
function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createFeedbackTitle(counter, triggerContext, exercisePack, currentStep, feedback) {
  const prefix = String(counter).padStart(DT_FEEDBACK_TEXT_LAYOUT.counterPadLength, "0");
  const parts = [`[${prefix}]`];

  const packLabel = asTrimmedString(exercisePack?.label);
  const stepLabel = asTrimmedString(currentStep?.label);
  const triggerKey = asTrimmedString(triggerContext?.triggerKey);
  const feedbackTitle = asTrimmedString(feedback?.title);

  if (packLabel) parts.push(packLabel);
  if (stepLabel) parts.push(stepLabel);
  if (triggerKey) parts.push(triggerKey);
  else if (feedbackTitle) parts.push(feedbackTitle);

  return parts.join(" · ");
}

function buildBulletSection(heading, bullets) {
  const cleanBullets = Array.from(new Set((Array.isArray(bullets) ? bullets : [])
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean)));
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
    const textParts = [];
    if (score != null) textParts.push(String(score));
    if (scale) textParts.push(scale);
    const scoreText = textParts.length ? textParts.join(" / ") : null;
    const verdictText = verdict ? ` – ${escapeHtml(verdict)}` : "";
    if (scoreText || verdictText) {
      parts.push(`<p><strong>Bewertung</strong><br>${scoreText ? escapeHtml(scoreText) : ""}${verdictText}</p>`);
    }
  }

  if (Array.isArray(evaluation.rubric) && evaluation.rubric.length) {
    const bullets = evaluation.rubric
      .map((entry) => {
        const criterion = asTrimmedString(entry?.criterion);
        const status = asTrimmedString(entry?.status);
        const comment = asTrimmedString(entry?.comment);
        const bulletParts = [];
        if (criterion) bulletParts.push(criterion);
        if (status) bulletParts.push(`(${status})`);
        if (comment) bulletParts.push(`– ${comment}`);
        return bulletParts.join(" ").trim();
      })
      .filter(Boolean);

    if (bullets.length) {
      parts.push(buildBulletSection("Rubrik", bullets));
    }
  }

  return parts.join("");
}

export function buildFeedbackTextContent({ counter, triggerContext, feedback, recommendations, evaluation, exercisePack, currentStep }) {
  const title = createFeedbackTitle(counter, triggerContext, exercisePack, currentStep, feedback);
  const summary = asTrimmedString(feedback?.summary);
  const sections = Array.isArray(feedback?.sections) ? feedback.sections : [];
  const recommendedNextTrigger = asTrimmedString(recommendations?.recommendedNextTrigger);
  const recommendedNextStepId = asTrimmedString(recommendations?.recommendedNextStepId);
  const recommendationReason = asTrimmedString(recommendations?.reason);
  const advanceStepSuggested = recommendations?.advanceStepSuggested === true;

  const chunks = [`<p><strong>${escapeHtml(title)}</strong></p>`];

  if (summary) {
    chunks.push(`<p><strong>Zusammenfassung</strong><br>${escapeHtml(summary)}</p>`);
  }

  for (const section of sections) {
    chunks.push(buildBulletSection(asTrimmedString(section?.heading), section?.bullets));
  }

  const recommendationBullets = [];
  if (recommendedNextTrigger) recommendationBullets.push(`Empfohlener nächster Trigger: ${recommendedNextTrigger}`);
  if (recommendedNextStepId) recommendationBullets.push(`Empfohlener nächster Schritt: ${recommendedNextStepId}`);
  if (advanceStepSuggested) recommendationBullets.push("Step-Wechsel empfohlen: ja");
  if (recommendationReason) recommendationBullets.push(`Begründung: ${recommendationReason}`);
  if (recommendationBullets.length) {
    chunks.push(buildBulletSection("Empfehlungen", recommendationBullets));
  }

  const evaluationHtml = buildEvaluationHtml(evaluation);
  if (evaluationHtml) chunks.push(evaluationHtml);

  return chunks.filter(Boolean).join("");
}

async function listFramesByTitle(frameTitle, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.get) return [];

  let frames = [];
  try {
    frames = await board.get({ type: "frame" }) || [];
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Feedback-Frames: " + e.message);
    return [];
  }

  const wantedTitle = asTrimmedString(frameTitle);
  const matches = frames.filter((frame) => asTrimmedString(frame?.title) === wantedTitle);
  matches.sort(compareItemIdsAsc);
  return matches;
}

async function createFeedbackFrame(frameTitle, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.createFrame) {
    throw new Error("Feedback-Frame kann nicht erstellt werden: miro.board.createFrame nicht verfügbar");
  }

  const viewport = await getViewport(log);
  const x = isFiniteNumber(viewport?.x) && isFiniteNumber(viewport?.width)
    ? viewport.x + viewport.width * 0.75 + DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx / 2
    : DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx / 2;
  const y = isFiniteNumber(viewport?.y) && isFiniteNumber(viewport?.height)
    ? viewport.y + viewport.height / 2
    : 0;

  const frame = await board.createFrame({
    title: frameTitle,
    x,
    y,
    width: DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx,
    height: DT_FEEDBACK_TEXT_LAYOUT.frameHeightPx,
    style: {
      fillColor: "#ffffff"
    }
  });

  if (typeof log === "function") {
    log("Feedback-Frame erstellt: " + frameTitle + " (Frame " + frame.id + ").");
  }

  return frame;
}

export async function ensureFeedbackFrame(frameTitle, log) {
  await ensureMiroReady(log);

  const normalizedTitle = asTrimmedString(frameTitle) || DT_DEFAULT_FEEDBACK_FRAME_NAME;
  const existingFrames = await listFramesByTitle(normalizedTitle, log);
  if (existingFrames.length > 0) {
    if (existingFrames.length > 1 && typeof log === "function") {
      log("WARNUNG: Mehrere Feedback-Frames mit demselben Titel gefunden. Verwende Frame " + existingFrames[0].id + ".");
    }
    return existingFrames[0];
  }

  return await createFeedbackFrame(normalizedTitle, log);
}

export async function listFeedbackTextItemsInFrame(frameId, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.get || !frameId) return [];

  let texts = [];
  try {
    texts = await board.get({ type: "text" }) || [];
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Feedback-Texte: " + e.message);
    return [];
  }

  const result = [];
  for (const text of texts) {
    if (text?.parentId !== frameId) continue;

    let feedbackMeta = null;
    if (typeof text?.getMetadata === "function") {
      try {
        feedbackMeta = await text.getMetadata(DT_TEXT_META_KEY_FEEDBACK);
      } catch (_) {}
    }

    const counter = normalizePositiveInt(feedbackMeta?.counter) || 0;
    result.push({ text, meta: feedbackMeta || null, counter });
  }

  result.sort((a, b) => {
    const aCounter = a.counter || 0;
    const bCounter = b.counter || 0;
    if (aCounter !== bCounter) return aCounter - bCounter;
    return compareItemIdsAsc(a.text, b.text);
  });

  return result;
}

function computeNextFeedbackTextPosition(frame, existingItems, counter) {
  const usableWidth = Math.max(
    DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx,
    Number(frame?.width || DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx) - 2 * DT_FEEDBACK_TEXT_LAYOUT.framePaddingXPx
  );
  const computedColumns = Math.floor((usableWidth + DT_FEEDBACK_TEXT_LAYOUT.gapXPx) / (DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx + DT_FEEDBACK_TEXT_LAYOUT.gapXPx));
  const columns = Math.max(1, Math.min(DT_FEEDBACK_TEXT_LAYOUT.maxColumns, computedColumns || 1));
  const index = Math.max(0, Number(counter || 1) - 1);
  const col = index % columns;
  const row = Math.floor(index / columns);

  return {
    width: DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx,
    x: DT_FEEDBACK_TEXT_LAYOUT.framePaddingXPx + DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx / 2 + col * (DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx + DT_FEEDBACK_TEXT_LAYOUT.gapXPx),
    y: DT_FEEDBACK_TEXT_LAYOUT.framePaddingYPx + DT_FEEDBACK_TEXT_LAYOUT.itemMinHeightPx / 2 + row * (DT_FEEDBACK_TEXT_LAYOUT.itemMinHeightPx + DT_FEEDBACK_TEXT_LAYOUT.gapYPx)
  };
}

async function createFeedbackTextItem({ frameId, x, y, width, content, metadata }, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.createText) {
    throw new Error("Feedback-Text kann nicht erstellt werden: miro.board.createText nicht verfügbar");
  }

  const frame = frameId ? await getItemById(frameId, log) : null;
  const frameLeft = Number(frame?.x || 0) - Number(frame?.width || 0) / 2;
  const frameTop = Number(frame?.y || 0) - Number(frame?.height || 0) / 2;
  const boardX = frame ? frameLeft + Number(x || 0) : Number(x || 0);
  const boardY = frame ? frameTop + Number(y || 0) : Number(y || 0);

  const textItem = await board.createText({
    content,
    x: boardX,
    y: boardY,
    width,
    style: {
      color: "#111827",
      fillColor: "#ffffff",
      fillOpacity: 1,
      fontFamily: "arial",
      fontSize: 14,
      textAlign: "left"
    }
  });

  if (frame?.type === "frame" && typeof frame.add === "function") {
    try {
      await frame.add(textItem);
      await frame.sync();
    } catch (e) {
      if (typeof log === "function") {
        log("WARNUNG: Feedback-Text konnte dem Frame " + frame.id + " nicht hinzugefügt werden: " + e.message);
      }
    }
  }

  if (metadata && typeof textItem?.setMetadata === "function") {
    try {
      await textItem.setMetadata(DT_TEXT_META_KEY_FEEDBACK, metadata);
    } catch (e) {
      if (typeof log === "function") log("WARNUNG: Konnte Feedback-Metadata für Text " + textItem.id + " nicht speichern: " + e.message);
    }
  }

  return textItem;
}

export async function renderFeedbackTextForRun({
  boardConfig,
  runtime,
  triggerContext,
  feedback,
  recommendations,
  evaluation,
  exercisePack,
  currentStep,
  log
} = {}) {
  await ensureMiroReady(log);

  if (!feedback || typeof feedback !== "object") return null;

  const frameTitle = asTrimmedString(boardConfig?.feedbackFrameName) || DT_DEFAULT_FEEDBACK_FRAME_NAME;
  const frame = await ensureFeedbackFrame(frameTitle, log);
  const existingItems = await listFeedbackTextItemsInFrame(frame.id, log);
  const nextCounter = Math.max(normalizePositiveInt(runtime?.feedbackTextCounter) || 0, existingItems.length) + 1;
  const position = computeNextFeedbackTextPosition(frame, existingItems, nextCounter);
  const createdAt = new Date().toISOString();
  const content = buildFeedbackTextContent({
    counter: nextCounter,
    triggerContext,
    feedback,
    recommendations,
    evaluation,
    exercisePack,
    currentStep
  });

  const textItem = await createFeedbackTextItem({
    frameId: frame.id,
    x: position.x,
    y: position.y,
    width: position.width,
    content,
    metadata: {
      version: 1,
      counter: nextCounter,
      triggerKey: asTrimmedString(triggerContext?.triggerKey),
      stepId: asTrimmedString(currentStep?.id),
      exercisePackId: asTrimmedString(exercisePack?.id),
      createdAt
    }
  }, log);

  return {
    counter: nextCounter,
    frameId: frame.id,
    frameTitle,
    textItemIds: textItem?.id ? [textItem.id] : [],
    createdAt
  };
}

