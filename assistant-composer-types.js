/**
 * Assistant Subfeature 1 foundation type helpers.
 * Patch 1 only: JSDoc typedef layer for the static Zhuxin app.
 */

import {
  ASSISTANT_COMPOSER_SCHEMA_VERSION,
  OUTPUT_MODES,
  VALIDATION_CODES,
  IMPROVE_STATUSES,
  SEND_STATUSES,
  VOICE_STATUSES,
  NOTICE_TONES
} from './assistant-composer-constants.js';

/** @typedef {'none'|'bullets'|'table'|'memo'|'checklist'|'timeline'} OutputMode */
/** @typedef {'info'|'warning'|'error'|'success'} NoticeTone */
/** @typedef {'empty'|'no_meaningful_content'|'max_length_exceeded'|'readonly_thread'|'assistant_unavailable'|'ime_composing'|'improve_too_short'|'improve_too_long'} ValidationCode */
/** @typedef {'task_context_output'|'jurisdiction_audience'|'memo_scaffold'|'table_scaffold'|'timeline_scaffold'} GuidanceCardId */
/** @typedef {'idle'|'pending'|'success'|'error'} ImproveStatus */
/** @typedef {'idle'|'pending'|'error'} SendStatus */
/** @typedef {'idle'|'listening'|'error'|'unsupported'} VoiceStatus */
/** @typedef {'desktop'|'mobile'} ViewportMode */

/**
 * @typedef {Object} PersistedThreadDraft
 * @property {string|null} threadId
 * @property {string} text
 * @property {OutputMode} outputMode
 * @property {number} updatedAt
 * @property {'local_autosave'|'thread_store'} source
 * @property {1} schemaVersion
 */

/**
 * @typedef {Object} ComposerNotice
 * @property {string} id
 * @property {NoticeTone} tone
 * @property {string} message
 * @property {boolean} blocking
 * @property {'validation'|'improve_error'|'send_error'|'draft_recovered'|'improve_undo'|'draft_conflict'} kind
 */

/**
 * @typedef {Object} GuidanceCard
 * @property {GuidanceCardId} id
 * @property {string} title
 * @property {string} description
 * @property {string} template
 */

/**
 * @typedef {Object} ComposerValidationState
 * @property {boolean} isValidToSend
 * @property {ValidationCode|null} sendDisabledReason
 * @property {boolean} isValidToImprove
 * @property {ValidationCode|null} improveDisabledReason
 * @property {number} currentCharCount
 * @property {boolean} hasSoftWarning
 * @property {boolean} hasHardError
 */

/**
 * @typedef {Object} ImproveState
 * @property {ImproveStatus} status
 * @property {string|null} requestId
 * @property {string|null} requestTextHash
 * @property {number|null} requestedTextVersion
 * @property {string|null} lastSuccessfulRequestId
 * @property {string|null} lastAppliedFromText
 * @property {string|null} lastAppliedToText
 * @property {boolean} hasUndoAvailable
 * @property {string|null} lastErrorMessage
 * @property {boolean} lastNoop
 */

/**
 * @typedef {Object} SendState
 * @property {SendStatus} status
 * @property {string|null} requestId
 * @property {number|null} requestedTextVersion
 * @property {string|null} lastErrorMessage
 */

/**
 * @typedef {Object} VoiceState
 * @property {VoiceStatus} status
 * @property {boolean} isSupported
 * @property {string|null} lastErrorMessage
 */

/**
 * @typedef {Object} RecoveryState
 * @property {boolean} hasRecoveredDraftNotice
 * @property {boolean} hasIncomingDraftConflict
 * @property {PersistedThreadDraft|null} incomingDraft
 */

/**
 * @typedef {Object} DraftMetaState
 * @property {number} updatedAt
 * @property {number|null} persistedAt
 * @property {string|null} lastPersistedTextHash
 * @property {OutputMode|null} lastPersistedOutputMode
 */

/**
 * @typedef {Object} ComposerState
 * @property {string|null} threadId
 * @property {string} text
 * @property {OutputMode} outputMode
 * @property {boolean} isFocused
 * @property {boolean} isDirty
 * @property {boolean} isTouched
 * @property {number} selectionStart
 * @property {number} selectionEnd
 * @property {boolean} isImeComposing
 * @property {ComposerValidationState} validation
 * @property {ImproveState} improve
 * @property {SendState} send
 * @property {VoiceState} voice
 * @property {RecoveryState} recovery
 * @property {DraftMetaState} draftMeta
 * @property {number} textVersion
 * @property {number} mountedAt
 */

/**
 * @returns {ComposerValidationState}
 */
export function createEmptyValidationState() {
  return {
    isValidToSend: false,
    sendDisabledReason: VALIDATION_CODES.EMPTY,
    isValidToImprove: false,
    improveDisabledReason: VALIDATION_CODES.IMPROVE_TOO_SHORT,
    currentCharCount: 0,
    hasSoftWarning: false,
    hasHardError: false
  };
}

/**
 * @returns {ImproveState}
 */
export function createEmptyImproveState() {
  return {
    status: IMPROVE_STATUSES.IDLE,
    requestId: null,
    requestTextHash: null,
    requestedTextVersion: null,
    lastSuccessfulRequestId: null,
    lastAppliedFromText: null,
    lastAppliedToText: null,
    hasUndoAvailable: false,
    lastErrorMessage: null,
    lastNoop: false
  };
}

/**
 * @returns {SendState}
 */
export function createEmptySendState() {
  return {
    status: SEND_STATUSES.IDLE,
    requestId: null,
    requestedTextVersion: null,
    lastErrorMessage: null
  };
}

/**
 * @returns {VoiceState}
 */
export function createEmptyVoiceState() {
  return {
    status: VOICE_STATUSES.IDLE,
    isSupported: false,
    lastErrorMessage: null
  };
}

/**
 * @returns {RecoveryState}
 */
export function createEmptyRecoveryState() {
  return {
    hasRecoveredDraftNotice: false,
    hasIncomingDraftConflict: false,
    incomingDraft: null
  };
}

/**
 * @returns {DraftMetaState}
 */
export function createEmptyDraftMetaState() {
  return {
    updatedAt: Date.now(),
    persistedAt: null,
    lastPersistedTextHash: null,
    lastPersistedOutputMode: null
  };
}

/**
 * @param {string|null} threadId
 * @returns {ComposerState}
 */
export function createEmptyComposerState(threadId = null) {
  return {
    threadId,
    text: '',
    outputMode: OUTPUT_MODES.NONE,
    isFocused: false,
    isDirty: false,
    isTouched: false,
    selectionStart: 0,
    selectionEnd: 0,
    isImeComposing: false,
    validation: createEmptyValidationState(),
    improve: createEmptyImproveState(),
    send: createEmptySendState(),
    voice: createEmptyVoiceState(),
    recovery: createEmptyRecoveryState(),
    draftMeta: createEmptyDraftMetaState(),
    textVersion: 0,
    mountedAt: Date.now()
  };
}

export const COMPOSER_DEFAULT_NOTICE_TONE = NOTICE_TONES.INFO;
export const COMPOSER_SCHEMA_VERSION = ASSISTANT_COMPOSER_SCHEMA_VERSION;
