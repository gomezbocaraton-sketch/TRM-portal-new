import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

export type PoPdfData = {
  poNumber: string;
  date: string;
  status: string;
  approvalLine: string;
  vendor: string;
  projectName: string;
  clientName: string;
  notes: string;
  items: { description: string; quantity: number; unit: string; unitPrice: number }[];
  total: number;
  closedLine: string | null;
};

// The standard PDF fonts only draw Latin characters; anything else is replaced so a stray symbol cannot stop the file.
function clean(t: string): string {
  return t.replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, '?');
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n').map(clean)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export async function buildPoPdf(d: PoPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612;
  const H = 792;
  const M = 50;
  const ink = rgb(0.1, 0.12, 0.18);
  const soft = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.85, 0.85, 0.85);

  let page = pdf.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, yy: number, size = 10, f = font, color = ink) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const right = (t: string, xr: number, yy: number, size = 10, f = font) => {
    const s = clean(t);
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color: ink });
  };

  text('PURCHASE ORDER', M, y - 6, 20, bold);
  right(d.poNumber, W - M, y - 4, 16, bold);
  y -= 30;
  text('TRM Partners LLC', M, y, 10, bold);
  right(`Date: ${d.date}`, W - M, y, 10);
  y -= 14;
  right(`Status: ${d.status}`, W - M, y, 10, bold);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: line });
  y -= 22;

  text('VENDOR', M, y, 8, bold, soft);
  text('PROJECT', W / 2 + 10, y, 8, bold, soft);
  y -= 14;
  const vLines = wrap(d.vendor, bold, 12, W / 2 - M - 20);
  const pLines = wrap(`${d.projectName}${d.clientName ? `\nClient: ${d.clientName}` : ''}`, font, 11, W / 2 - M - 10);
  const rows = Math.max(vLines.length, pLines.length);
  for (let i = 0; i < rows; i++) {
    if (vLines[i]) text(vLines[i], M, y - i * 15, 12, bold);
    if (pLines[i]) text(pLines[i], W / 2 + 10, y - i * 15, 11, i === 0 ? bold : font);
  }
  y -= rows * 15 + 14;

  // Items table
  const colQty = 340;
  const colUnit = 385;
  const colPrice = 495;
  const colAmt = W - M;
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.95, 0.95, 0.94) });
    text('DESCRIPTION', M + 6, y, 8, bold, soft);
    right('QTY', colQty + 20, y, 8, bold);
    text('UNIT', colUnit, y, 8, bold, soft);
    right('PRICE EACH', colPrice, y, 8, bold);
    right('AMOUNT', colAmt - 4, y, 8, bold);
    y -= 22;
  };
  header();

  for (const it of d.items) {
    const lines = wrap(it.description, font, 10, colQty - M - 40);
    const h = lines.length * 13 + 8;
    if (y - h < M + 90) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    lines.forEach((l, i) => text(l, M + 6, y - i * 13, 10));
    right(String(it.quantity), colQty + 20, y, 10);
    text(it.unit || '', colUnit, y, 10);
    right(money(it.unitPrice), colPrice, y, 10);
    right(money(it.quantity * it.unitPrice), colAmt - 4, y, 10);
    y -= h;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: line });
  }

  if (y < M + 120) {
    page = pdf.addPage([W, H]);
    y = H - M;
  }
  y -= 8;
  right('TOTAL', colPrice - 40, y, 11, bold);
  right(money(d.total), colAmt - 4, y, 12, bold);
  y -= 30;

  if (d.notes) {
    text('NOTES', M, y, 8, bold, soft);
    y -= 13;
    for (const l of wrap(d.notes, font, 10, W - 2 * M)) {
      text(l, M, y, 10);
      y -= 13;
    }
    y -= 8;
  }

  text('APPROVAL', M, y, 8, bold, soft);
  y -= 14;
  for (const l of wrap(d.approvalLine, font, 10, W - 2 * M)) {
    text(l, M, y, 10);
    y -= 13;
  }
  if (d.closedLine) {
    y -= 6;
    for (const l of wrap(d.closedLine, font, 10, W - 2 * M)) {
      text(l, M, y, 10);
      y -= 13;
    }
  }

  return pdf.save();
}
