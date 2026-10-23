import { strToU8, zipSync } from 'fflate';
import type { TutorPayment } from './db';

/** Lo mínimo para escribir texto dentro del XML de Word. */
const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

const prettyPhone = (p: string) =>
  /^\d{10}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

// Carta con márgenes de 1.9 cm: 12240 − 2 × 1080 = 10080 twips de ancho útil.
const COLS = [
  { title: '#', width: 500 },
  { title: 'Tutor', width: 2600 },
  { title: 'Teléfono', width: 1500 },
  { title: 'Niños registrados', width: 3180 },
  { title: 'Pagó', width: 1100, right: true },
  { title: 'Fecha', width: 1200 },
];

function run(text: string, { bold = false, size = 0, color = '' } = {}) {
  const props =
    (bold ? '<w:b/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') +
    (size ? `<w:sz w:val="${size}"/>` : '');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function para(runs: string, { right = false, after = 0 } = {}) {
  return (
    `<w:p><w:pPr><w:spacing w:before="0" w:after="${after}"/>` +
    (right ? '<w:jc w:val="right"/>' : '') +
    `</w:pPr>${runs}</w:p>`
  );
}

/** Una celda; cada elemento de `lines` va en su propio renglón. */
function cell(lines: string[], width: number, { bold = false, right = false, fill = '', color = '', span = 1 } = {}) {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') +
    (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
    '</w:tcPr>' +
    (lines.length ? lines : ['']).map((l) => para(run(l, { bold, color }), { right })).join('') +
    '</w:tc>'
  );
}

function row(cells: string, header = false) {
  return `<w:tr>${header ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells}</w:tr>`;
}

/**
 * Lista de quienes ya cooperaron, como .docx para leerla o imprimirla: un
 * renglón por tutor con su teléfono, sus niños y cuánto pagó. Se arma en el
 * navegador con los datos que ya trajo funciones especiales, así que no pide
 * el código otra vez ni pasa por el servidor.
 */
export function paymentsDocx(tutors: TutorPayment[], coloniaName: string): Uint8Array {
  const paid = tutors.filter((t) => t.paid_total > 0);
  const total = paid.reduce((sum, t) => sum + t.paid_total, 0);
  const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const header = row(
    COLS.map((c) => cell([c.title], c.width, { bold: true, right: c.right, fill: '6B2FA0', color: 'FFFFFF' })).join(''),
    true
  );

  const body = paid
    .map((t, i) =>
      row(
        [
          cell([String(i + 1)], COLS[0].width),
          cell([t.name], COLS[1].width, { bold: true }),
          cell([prettyPhone(t.phone)], COLS[2].width),
          cell(t.children.length ? t.children : ['—'], COLS[3].width),
          cell([money(t.paid_total)], COLS[4].width, { right: true }),
          cell([t.paid_at ? shortDate(t.paid_at) : '—'], COLS[5].width),
        ].join('')
      )
    )
    .join('');

  const totalRow = row(
    cell(['Total'], COLS.slice(0, 4).reduce((w, c) => w + c.width, 0), { bold: true, fill: 'EEE6F5', span: 4 }) +
      cell([money(total)], COLS[4].width, { bold: true, right: true, fill: 'EEE6F5' }) +
      cell([''], COLS[5].width, { fill: 'EEE6F5' })
  );

  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
  const table =
    '<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
    '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `<w:tblGrid>${COLS.map((c) => `<w:gridCol w:w="${c.width}"/>`).join('')}</w:tblGrid>` +
    header +
    body +
    totalRow +
    '</w:tbl>';

  const summary =
    paid.length === 0
      ? 'Todavía nadie ha registrado su pago.'
      : `${paid.length} de ${tutors.length} familias han cooperado · ${money(total)} en total.`;

  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    para(run('Ruta de los Dulces 2026', { bold: true, size: 36, color: '6B2FA0' }), { after: 40 }) +
    para(run(`Pagos de ${coloniaName}`, { bold: true, size: 26 }), { after: 40 }) +
    para(run(`Corte al ${today}. ${summary}`, { color: '595959' }), { after: 240 }) +
    (paid.length ? table : '') +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>' +
    '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="21"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults></w:styles>';

  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '</Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>'
    ),
    'word/_rels/document.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    ),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
  });
}
