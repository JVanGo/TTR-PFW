import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { SnapshotListRow, Teilrunde } from "@/lib/verbandsrangliste";

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait, in points
const MARGIN = 40;
const FONT_SIZE = 9;
const ROW_HEIGHT = 13;
const HEADER_HEIGHT = 64;
const FOOTER_HEIGHT = 24;
const COLUMNS = {
  rank: MARGIN,
  name: MARGIN + 40,
  club: MARGIN + 290,
  dtrRight: PAGE.width - MARGIN,
};

/**
 * The standard PDF fonts only cover Latin-1 (enough for every name on file
 * as of 2026-10-25). Anything else falls back to its unaccented letter, or
 * "?", rather than failing the whole download.
 */
function printable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text, (c) => {
    if (supported.has(c.codePointAt(0)!)) return c;
    const base = c.normalize("NFD")[0];
    return supported.has(base.codePointAt(0)!) ? base : "?";
  }).join("");
}

function fitWidth(text: string, font: PDFFont, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, FONT_SIZE) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, FONT_SIZE) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** "2026-08-01" -> "1. August 2026". */
function germanDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The Verbandsrangliste as an A4 PDF: rank, name, club, DTR — strongest first, as `rows` is ordered. */
export async function buildVerbandsranglistePdf(
  rows: SnapshotListRow[],
  season: string,
  teilrunde: Teilrunde,
  snapshotDateIso: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Verbandsrangliste ${season} – Teilrunde ${teilrunde}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.4, 0.4, 0.4);

  const rowsPerPage = Math.floor(
    (PAGE.height - 2 * MARGIN - HEADER_HEIGHT - FOOTER_HEIGHT) / ROW_HEIGHT,
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - MARGIN - 14;
    page.drawText(`Verbandsrangliste ${season} – Teilrunde ${teilrunde}`, {
      x: MARGIN,
      y,
      size: 14,
      font: bold,
    });
    y -= 16;
    page.drawText(`Stand: ${germanDate(snapshotDateIso)}`, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: grey,
    });

    y = PAGE.height - MARGIN - HEADER_HEIGHT + 6;
    const header = { size: FONT_SIZE, font: bold };
    page.drawText("Rang", { x: COLUMNS.rank, y, ...header });
    page.drawText("Name", { x: COLUMNS.name, y, ...header });
    page.drawText("Verein", { x: COLUMNS.club, y, ...header });
    page.drawText("DTR", {
      x: COLUMNS.dtrRight - bold.widthOfTextAtSize("DTR", FONT_SIZE),
      y,
      ...header,
    });
    page.drawLine({
      start: { x: MARGIN, y: y - 4 },
      end: { x: PAGE.width - MARGIN, y: y - 4 },
      thickness: 0.5,
      color: grey,
    });

    const start = pageIndex * rowsPerPage;
    rows.slice(start, start + rowsPerPage).forEach((row, i) => {
      y -= ROW_HEIGHT;
      const text = { y, size: FONT_SIZE, font };
      page.drawText(String(start + i + 1), { x: COLUMNS.rank, ...text });
      page.drawText(fitWidth(printable(row.name, font), font, COLUMNS.club - COLUMNS.name - 8), {
        x: COLUMNS.name,
        ...text,
      });
      page.drawText(
        fitWidth(printable(row.club ?? "", font), font, COLUMNS.dtrRight - 40 - COLUMNS.club),
        { x: COLUMNS.club, ...text },
      );
      const dtr = String(row.dtr);
      page.drawText(dtr, { x: COLUMNS.dtrRight - font.widthOfTextAtSize(dtr, FONT_SIZE), ...text });
    });

    const footer = `ttr-pfw.vercel.app · Seite ${pageIndex + 1} von ${pageCount}`;
    page.drawText(footer, {
      x: PAGE.width - MARGIN - font.widthOfTextAtSize(footer, 8),
      y: MARGIN,
      size: 8,
      font,
      color: grey,
    });
  }

  return doc.save();
}
