/**
 * Message contract for extension ↔ webview communication.
 * All messages from backend → webview are part of the WebviewMessage union.
 */

/** Per-class/interface data extracted from a Java file (matches parser output). */
export interface ParsedClassInfo {
  Classname: string;
  Methods: string[];
  Loc: number;
  Type: string;
  Extends: string | null;
  Implements: string[];
  // Inner/nested class support
  parentClass?: string;       // Name of parent class (if this is an inner class)
  innerClasses?: string[];    // Names of inner classes (if this class contains any)
  isStatic?: boolean;         // Whether this is a static inner class
  isAnonymous?: boolean;      // Whether this is an anonymous class
}

/** Single parsed file entry in FULL_STATE or PARTIAL_STATE changed list. */
export interface ParsedFile {
  path: string;
  classes: ParsedClassInfo[];
}

/** Error entry when a file fails to parse. */
export interface ParseErrorEntry {
  path: string;
  message: string;
}

/**
 * Full state message — entire parsed codebase. Sent on initial load.
 *
 * @example
 * {
 *   type: "FULL_STATE",
 *   payload: {
 *     files: [
 *       {
 *         path: "/workspace/src/Main.java",
 *         classes: [
 *           {
 *             Classname: "Main",
 *             Methods: ["main(String[])"],
 *             Loc: 10,
 *             Type: "public",
 *             Extends: null,
 *             Implements: []
 *           }
 *         ]
 *       }
 *     ],
 *     rootPath: "/workspace",
 *     timestamp: "2025-02-18T12:00:00.000Z",
 *     status: "ok",
 *     errors: []
 *   }
 * }
 */
export interface FullStateMessage {
  type: 'FULL_STATE';
  payload: {
    files: ParsedFile[];
    rootPath?: string;
    timestamp: string;
    status: 'ok' | 'empty';
    errors: ParseErrorEntry[];
  };
}

/**
 * Partial state message — only what changed. Sent on incremental updates.
 *
 * @example
 * {
 *   type: "PARTIAL_STATE",
 *   payload: {
 *     changed: [
 *       {
 *         path: "/workspace/src/Updated.java",
 *         classes: [{ Classname: "Updated", Methods: [], Loc: 5, Type: "public", Extends: null, Implements: [] }]
 *       }
 *     ],
 *     removed: ["/workspace/src/Deleted.java"],
 *     timestamp: "2025-02-18T12:05:00.000Z"
 *   }
 * }
 */
export interface PartialStateMessage {
  type: 'PARTIAL_STATE';
  payload: {
    changed: ParsedFile[];
    removed: string[];
    timestamp: string;
  };
}

/** All message types from backend → webview. */
export type WebviewMessage = FullStateMessage | PartialStateMessage;

/** Message from webview → extension: webview is ready to receive messages. */
export interface ReadyMessage {
  type: 'READY';
}

/** All message types from webview → extension. */
export type ExtensionMessage = ReadyMessage;
