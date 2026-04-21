/**
 * Assistant Subfeature 1 foundation constants.
 * Patch 1 only: safe constants layer, no live behavior changes yet.
 */

export const ASSISTANT_COMPOSER_SCHEMA_VERSION = 1;

export const MAX_CHARS = 8000;
export const SOFT_WARN_CHARS = 6000;
export const IMPROVE_MIN_CHARS = 15;
export const IMPROVE_MAX_CHARS = 4000;

export const VIEWPORT_MODES = Object.freeze({
  DESKTOP: 'desktop',
  MOBILE: 'mobile'
});

export const OUTPUT_MODES = Object.freeze({
  NONE: 'none',
  BULLETS: 'bullets',
  TABLE: 'table',
  MEMO: 'memo',
  CHECKLIST: 'checklist',
  TIMELINE: 'timeline'
});

export const NOTICE_TONES = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success'
});

export const VALIDATION_CODES = Object.freeze({
  EMPTY: 'empty',
  NO_MEANINGFUL_CONTENT: 'no_meaningful_content',
  MAX_LENGTH_EXCEEDED: 'max_length_exceeded',
  READONLY_THREAD: 'readonly_thread',
  ASSISTANT_UNAVAILABLE: 'assistant_unavailable',
  IME_COMPOSING: 'ime_composing',
  IMPROVE_TOO_SHORT: 'improve_too_short',
  IMPROVE_TOO_LONG: 'improve_too_long'
});

export const GUIDANCE_CARD_IDS = Object.freeze({
  TASK_CONTEXT_OUTPUT: 'task_context_output',
  JURISDICTION_AUDIENCE: 'jurisdiction_audience',
  MEMO_SCAFFOLD: 'memo_scaffold',
  TABLE_SCAFFOLD: 'table_scaffold',
  TIMELINE_SCAFFOLD: 'timeline_scaffold'
});

export const IMPROVE_STATUSES = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error'
});

export const SEND_STATUSES = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  ERROR: 'error'
});

export const VOICE_STATUSES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported'
});

export const DEFAULT_OUTPUT_MODE = OUTPUT_MODES.NONE;

export const DESKTOP_TEXTAREA_ROWS = Object.freeze({
  MIN: 4,
  MAX: 12
});

export const MOBILE_TEXTAREA_ROWS = Object.freeze({
  MIN: 3,
  MAX: 8
});

export const AUTOSAVE_DEBOUNCE_MS = 800;

export const COMPOSER_THREAD_KEYS = Object.freeze({
  NEW_THREAD: '__new_thread__'
});

export function getViewportMode() {
  return window.innerWidth >= 980 ? VIEWPORT_MODES.DESKTOP : VIEWPORT_MODES.MOBILE;
}
