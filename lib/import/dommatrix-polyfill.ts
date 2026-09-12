import CSSMatrix from "@thednp/dommatrix";

/**
 * pdf.js's own core (bundled by both pdf-parse and unpdf — this isn't
 * specific to either wrapper) has an internal module for canvas
 * pattern/gradient support — a feature our plain-text schedule PDFs never
 * use — that unconditionally constructs `new DOMMatrix()` at its own
 * module-load time. Node has no native DOMMatrix, so without this the
 * module fails to load at all with "ReferenceError: DOMMatrix is not
 * defined" (confirmed via Vercel's runtime logs, twice — once for
 * pdf-parse, and the same underlying pdf.js code resurfaced it when
 * switching to unpdf). `@thednp/dommatrix` is a small, dependency-free,
 * actively maintained DOMMatrix shim (the older `dommatrix` package on npm
 * is deprecated in its favor).
 *
 * Must be imported — and therefore evaluated — before `unpdf` anywhere
 * it's used. This file itself must NOT import unpdf/pdfjs (directly or
 * transitively), or its own load would trigger pdf.js's module before this
 * polyfill runs, defeating the whole point.
 */
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error — CSSMatrix implements the same (a,b,c,d,e,f + transform methods) surface pdf.js's own internal code expects from DOMMatrix.
  globalThis.DOMMatrix = CSSMatrix;
}
