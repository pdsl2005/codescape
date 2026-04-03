/**
 * Message contract for extension ↔ webview communication.
 * Shapes match runtime payloads (ClassInfo from parsers, layout from cityLayout).
 */

import type { ClassInfo } from '../parser/javaExtractor';
import type { LayoutMap } from '../layout/types';

/** Per-class entity as produced by Java/Python extractors (single shared schema). */
export type ParsedClassInfo = ClassInfo;

/** Single parsed file entry (optional grouping; webview may use flat `classes` only). */
export interface ParsedFile {
  path: string;
  classes: ParsedClassInfo[];
}

/** Error entry when a file fails to parse. */
export interface ParseErrorEntry {
  path: string;
  message: string;
}

/** Payload for FULL_STATE — flat class list + precomputed layout from extension. */
export interface FullStatePayload {
  classes: ClassInfo[];
  layout: LayoutMap;
  status: 'ready' | 'empty' | 'loading';
  rootPath?: string;
  timestamp?: string;
  errors?: ParseErrorEntry[];
  /** Legacy: file-grouped data */
  files?: ParsedFile[];
}

/**
 * Partial/incremental update. Always includes `fullClasses` + `layout` after an incremental
 * parse so the webview can replace state without dropping unrelated classes.
 */
export interface PartialStatePayload {
  changed: ClassInfo[];
  related: ClassInfo[];
  removed: string[];
  fullClasses: ClassInfo[];
  layout: LayoutMap;
  timestamp?: string;
}

export interface FullStateMessage {
  type: 'FULL_STATE';
  payload: FullStatePayload;
}

export interface PartialStateMessage {
  type: 'PARTIAL_STATE';
  payload: PartialStatePayload;
}

/** All message types from backend → webview. */
export type WebviewMessage = FullStateMessage | PartialStateMessage;

/** Message from webview → extension: webview is ready to receive messages. */
export interface ReadyMessage {
  type: 'READY';
}

/** Message from webview → extension: user clicked a building and wants to open its source. */
export interface OpenClassSourceMessage {
  type: 'OPEN_CLASS_SOURCE';
  payload: {
    className: string;
  };
}

/** All message types from webview → extension. */
export type ExtensionMessage = ReadyMessage | OpenClassSourceMessage;
