/**
 * Assistant Subfeature 1 validation helpers.
 * Batch A only: pure validation rules, no UI integration yet.
 */

import {
  MAX_CHARS,
  SOFT_WARN_CHARS,
  IMPROVE_MIN_CHARS,
  IMPROVE_MAX_CHARS,
  VALIDATION_CODES
} from './assistant-composer-constants.js';
import {
  getCharCount,
  hasMeaningfulContent,
  hasSoftLengthWarning,
  trimForValidation
} from './assistant-composer-text-rules.js';

export function validateSend({
  text = '',
  isReadonly = false,
  isAssistantAvailable = true,
  isSendPending = false,
  isImprovePending = false,
  maxChars = MAX_CHARS
} = {}) {
  const currentCharCount = getCharCount(text);
  const trimmed = trimForValidation(text);
  const hasHardError = currentCharCount > maxChars;
  const hasSoftWarning = hasSoftLengthWarning(text, SOFT_WARN_CHARS);

  let sendDisabledReason = null;

  if (isReadonly) {
    sendDisabledReason = VALIDATION_CODES.READONLY_THREAD;
  } else if (!isAssistantAvailable) {
    sendDisabledReason = VALIDATION_CODES.ASSISTANT_UNAVAILABLE;
  } else if (isSendPending || isImprovePending) {
    sendDisabledReason = null;
  } else if (!trimmed.length) {
    sendDisabledReason = VALIDATION_CODES.EMPTY;
  } else if (!hasMeaningfulContent(text)) {
    sendDisabledReason = VALIDATION_CODES.NO_MEANINGFUL_CONTENT;
  } else if (hasHardError) {
    sendDisabledReason = VALIDATION_CODES.MAX_LENGTH_EXCEEDED;
  }

  return {
    isValidToSend: !sendDisabledReason && !isSendPending && !isImprovePending,
    sendDisabledReason,
    currentCharCount,
    hasSoftWarning,
    hasHardError
  };
}

export function validateImprove({
  text = '',
  isReadonly = false,
  isAssistantAvailable = true,
  enableImprove = true,
  isImeComposing = false,
  isSendPending = false,
  isImprovePending = false,
  minChars = IMPROVE_MIN_CHARS,
  maxChars = IMPROVE_MAX_CHARS
} = {}) {
  const trimmed = trimForValidation(text);
  const count = trimmed.length;
  let improveDisabledReason = null;

  if (!enableImprove) {
    improveDisabledReason = VALIDATION_CODES.ASSISTANT_UNAVAILABLE;
  } else if (isReadonly) {
    improveDisabledReason = VALIDATION_CODES.READONLY_THREAD;
  } else if (!isAssistantAvailable) {
    improveDisabledReason = VALIDATION_CODES.ASSISTANT_UNAVAILABLE;
  } else if (isImeComposing) {
    improveDisabledReason = VALIDATION_CODES.IME_COMPOSING;
  } else if (isSendPending || isImprovePending) {
    improveDisabledReason = null;
  } else if (count < minChars) {
    improveDisabledReason = VALIDATION_CODES.IMPROVE_TOO_SHORT;
  } else if (count > maxChars) {
    improveDisabledReason = VALIDATION_CODES.IMPROVE_TOO_LONG;
  }

  return {
    isValidToImprove: !improveDisabledReason && !isSendPending && !isImprovePending,
    improveDisabledReason,
    trimmedCount: count
  };
}

export function buildComposerValidationState(options = {}) {
  const sendState = validateSend(options);
  const improveState = validateImprove(options);

  return {
    isValidToSend: sendState.isValidToSend,
    sendDisabledReason: sendState.sendDisabledReason,
    isValidToImprove: improveState.isValidToImprove,
    improveDisabledReason: improveState.improveDisabledReason,
    currentCharCount: sendState.currentCharCount,
    hasSoftWarning: sendState.hasSoftWarning,
    hasHardError: sendState.hasHardError
  };
}

export function getValidationMessage(code) {
  switch (code) {
    case VALIDATION_CODES.EMPTY:
      return 'Enter a request first.';
    case VALIDATION_CODES.NO_MEANINGFUL_CONTENT:
      return 'Add meaningful text before sending.';
    case VALIDATION_CODES.MAX_LENGTH_EXCEEDED:
      return 'This request is too long.';
    case VALIDATION_CODES.READONLY_THREAD:
      return 'This thread is read-only.';
    case VALIDATION_CODES.ASSISTANT_UNAVAILABLE:
      return 'Assistant is unavailable right now.';
    case VALIDATION_CODES.IME_COMPOSING:
      return 'Finish composition before improving.';
    case VALIDATION_CODES.IMPROVE_TOO_SHORT:
      return 'Write a bit more before using Improve.';
    case VALIDATION_CODES.IMPROVE_TOO_LONG:
      return 'Shorten the request before using Improve.';
    default:
      return '';
  }
}
