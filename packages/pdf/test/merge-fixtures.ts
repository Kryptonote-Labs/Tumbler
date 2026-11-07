import { deflateSync } from 'node:zlib';
import { pdfFixture, pdfStream } from './pdf-fixture.ts';

/** Generated sources deliberately reuse object numbers and resource names with different content. */
export function mergeFixture(label: string, variant = 0) {
  const content = `q /GS gs 0.2 0.4 0.8 rg 20 20 60 40 re f Q\nBT /F 14 Tf 20 140 Td (${label}) Tj ET\nq 30 0 0 30 100 20 cm /Im Do Q\n/Fm Do`;
  return pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm 11 0 R /StructTreeRoot 14 0 R /MarkInfo << /Marked true >> /OCProperties << /OCGs [17 0 R] /D << /OFF [17 0 R] /Order [17 0 R] >> >> /Outlines 18 0 R >>',
    `<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] /MediaBox [0 0 ${200 + variant * 20} 200] /CropBox [5 5 195 195] /Rotate ${variant * 90} /Resources << /Font << /F 7 0 R >> /XObject << /Im 8 0 R /Fm 9 0 R >> /ExtGState << /GS 10 0 R >> >> >>`,
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Annots [12 0 R 13 0 R] /StructParents 0 /UserUnit 1.5 >>',
    '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
    pdfStream(deflateSync(Buffer.from(`/P << /MCID 0 >> BDC ${content} EMC`)), '/Filter /FlateDecode'),
    pdfStream(`BT /F 12 Tf 20 100 Td (${label} second) Tj ET`),
    `<< /Type /Font /Subtype /Type1 /BaseFont /${variant ? 'Courier' : 'Helvetica'} >>`,
    pdfStream(new Uint8Array(variant ? [255, 0, 0] : [0, 255, 0]), '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8'),
    pdfStream('0 0 1 RG 20 80 m 100 110 l S', '/Type /XObject /Subtype /Form /BBox [0 0 200 200] /Resources << >>'),
    '<< /Type /ExtGState /ca 0.4 /CA 0.7 /BM /Multiply >>',
    '<< /Fields [12 0 R] /DR << /Font << /F 7 0 R >> >> /DA (/F 10 Tf 0 g) /NeedAppearances true >>',
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (${label} value) /Rect [20 50 100 70] /P 3 0 R >>`,
    '<< /Type /Annot /Subtype /Link /Rect [20 130 150 150] /Dest [4 0 R /Fit] /Contents (Next page) >>',
    '<< /Type /StructTreeRoot /K [15 0 R] /ParentTree 16 0 R >>',
    `<< /Type /StructElem /S /P /P 14 0 R /Pg 3 0 R /K 0 /Alt (${label} accessible) >>`,
    '<< /Nums [0 [15 0 R]] >>',
    `<< /Type /OCG /Name (${label} layer) >>`,
    '<< /Type /Outlines /First 19 0 R /Last 19 0 R /Count 1 >>',
    `<< /Title (${label} bookmark) /Parent 18 0 R /Dest [3 0 R /Fit] >>`,
  ]);
}
