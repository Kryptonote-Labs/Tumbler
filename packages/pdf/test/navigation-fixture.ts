import { pdfFixture } from './pdf-fixture.ts';

/** Two pages with explicit, legacy and name-tree destinations, a URI, and nested bookmarks. */
export function navigationFixture() {
  return pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 9 0 R /Dests << /legacy [4 0 R /FitH 150] >> /Names << /Dests << /Kids [12 0 R] >> >> >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots [5 0 R 6 0 R 7 0 R 8 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    '<< /Subtype /Link /Rect [10 170 80 190] /Dest [4 0 R /XYZ 20 160 null] >>',
    '<< /Subtype /Link /Rect [10 140 80 160] /A << /S /GoTo /D /legacy >> >>',
    '<< /Subtype /Link /Rect [10 110 80 130] /Dest (chapter) >>',
    '<< /Subtype /Link /Rect [10 80 80 100] /A << /S /URI /URI (https://example.com) >> >>',
    '<< /Type /Outlines /First 10 0 R /Last 10 0 R /Count 2 >>',
    '<< /Title (Chapter) /Parent 9 0 R /Dest (chapter) /First 11 0 R /Last 11 0 R /Count 1 >>',
    '<< /Title (Detail) /Parent 10 0 R /A << /S /GoTo /D /legacy >> >>',
    '<< /Names [(chapter) << /D [4 0 R /XYZ 30 120 null] >>] >>',
  ]);
}
