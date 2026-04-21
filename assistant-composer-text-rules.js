/**
 * Assistant Subfeature 1 text normalization and utility rules.
 * Batch A only: pure functions, no UI integration yet.
 */

import {
  MAX_CHARS,
  SOFT_WARN_CHARS,
  IMPROVE_MIN_CHARS,
  IMPROVE_MAX_CHARS
} from './assistant-composer-constants.js';

export function normalizeLineEndings(text = '') {
  return String(text).replace(/\r\n?/g, '\n');
}

export function trimForValidation(text = '') {
  return normalizeLineEndings(text).trim();
}

export function getCharCount(text = '') {
  return normalizeLineEndings(text).length;
}

export function clampToMaxChars(text = '', maxChars = MAX_CHARS) {
  const normalized = normalizeLineEndings(text);
  return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
}

export function truncatePasteToFit(currentText = '', pastedText = '', maxChars = MAX_CHARS) {
  const safeCurrent = normalizeLineEndings(currentText);
  const safePaste = normalizeLineEndings(pastedText);
  const remaining = Math.max(0, maxChars - safeCurrent.length);
  return safePaste.slice(0, remaining);
}

export function hasMeaningfulContent(text = '') {
  return /[\p{L}\p{N}]/u.test(normalizeLineEndings(text));
}

export function hasSoftLengthWarning(text = '', softWarnChars = SOFT_WARN_CHARS) {
  return getCharCount(text) >= softWarnChars;
}

export function exceedsHardLimit(text = '', maxChars = MAX_CHARS) {
  return getCharCount(text) > maxChars;
}

export function isImproveLengthValid(text = '', minChars = IMPROVE_MIN_CHARS, maxChars = IMPROVE_MAX_CHARS) {
  const trimmed = trimForValidation(text);
  const count = trimmed.length;
  return count >= minChars && count <= maxChars;
}

export function buildTextHash(text = '') {
  const normalized = normalizeLineEndings(text);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}`;
}

export function appendAtCursor(text = '', insertion = '', selectionStart = 0, selectionEnd = 0, maxChars = MAX_CHARS) {
  const normalized = normalizeLineEndings(text);
  const next = normalized.slice(0, selectionStart) + insertion + normalized.slice(selectionEnd);
  const clamped = clampToMaxChars(next, maxChars);
  const cursor = Math.min(clamped.length, selectionStart + insertion.length);
  return {
    text: clamped,
    selectionStart: cursor,
    selectionEnd: cursor,
    truncated: clamped.length < next.length
  };
}
