import CSSMatrix from "@thednp/dommatrix";

/**
 * A pdfjs-dist internal module (canvas pattern/gradient support our
 * plain-text PDFs never use) unconditionally constructs a `new DOMMatrix()`
 * at its own module-load time. pdfjs-dist tries to source a real one from
 * the optional `canvas` package first and only *warns* (never throws) if
 * that's missing — we don't have `canvas` installed, so without this the
 * global stays undefined and that line throws ("ReferenceError: DOMMatrix
 * is not defined", confirmed via Vercel's runtime logs). `@thednp/dommatrix`
 * is a small, dependency-free, actively maintained shim (the older
 * `dommatrix` package on npm is deprecated in its favor).
 *
 * Must be imported — and therefore evaluated — before `pdf-parse` anywhere
 * it's used. This file itself must NOT import pdf-parse (directly or
 * transitively), or its own load would trigger pdfjs-dist's module before
 * this polyfill runs, defeating the whole point.
 */
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error — CSSMatrix implements the same (a,b,c,d,e,f + transform methods) surface pdfjs-dist's own internal shim expects from DOMMatrix.
  globalThis.DOMMatrix = CSSMatrix;
}
