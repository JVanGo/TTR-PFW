// Must come first — sets globalThis.DOMMatrix before pdf-parse (imported
// below) ever loads pdfjs-dist. See dommatrix-polyfill.ts for why.
import "@/lib/import/dommatrix-polyfill";

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

/**
 * pdfjs-dist auto-detects a worker script path relative to its own bundled
 * location when none is set, which broke once deployed ("Cannot find
 * module '.../pdf.worker.mjs'") — the physical file doesn't end up where
 * that auto-detected path expects. Resolve it explicitly via Node's own
 * module resolution instead of trusting pdfjs-dist's guess. Requires
 * pdf-parse/pdfjs-dist to ship as real on-disk files (serverExternalPackages
 * in next.config.ts), not bundled/inlined.
 */
const require = createRequire(import.meta.url);
const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
// pdfjs-dist loads this via dynamic import(), which needs a proper file://
// URL — a raw filesystem path works on POSIX but not on Windows.
PDFParse.setWorker(pathToFileURL(workerPath).href);
