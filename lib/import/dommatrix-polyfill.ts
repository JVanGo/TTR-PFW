import CSSMatrix from "@thednp/dommatrix";

/**
 * pdfjs-dist (used by pdf-parse) unconditionally constructs a `DOMMatrix` at
 * module load time in one of its internal (canvas pattern/gradient) helper
 * modules — not just when actually rendering patterns/gradients, which our
 * plain-text schedule PDFs never use. Node has no native DOMMatrix, so
 * without this the whole module fails to load with "ReferenceError:
 * DOMMatrix is not defined", confirmed via Vercel's runtime logs. Bundling
 * strategy (default vs serverExternalPackages) made no difference — this is
 * needed either way. Must be imported before "pdf-parse" anywhere it's used,
 * so this runs first (ES modules evaluate imports in the order they appear).
 */
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error — CSSMatrix implements the same (a,b,c,d,e,f + transform methods) surface pdfjs-dist's own internal shim expects from DOMMatrix.
  globalThis.DOMMatrix = CSSMatrix;
}
