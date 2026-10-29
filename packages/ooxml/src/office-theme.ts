import { ThemeColorScheme } from "./theme-colors.ts";
const slots = [
  "lt1",
  "dk1",
  "lt2",
  "dk2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;
/** Office's current default document colours. Imported documents supply their own scheme. */
export const DEFAULT_OFFICE_THEME = new ThemeColorScheme(
  "Office",
  new Map(
    slots.map((slot, index) => [
      slot,
      [
        "FFFFFF",
        "000000",
        "E8E8E8",
        "0E2841",
        "156082",
        "E97132",
        "196B24",
        "0F9ED5",
        "A02B93",
        "4EA72E",
        "467886",
        "96607D",
      ][index],
    ]),
  ),
);

/** Office DrawingML themes are shared by Word, slides, and spreadsheets. */
export function officeThemeXml(scheme = DEFAULT_OFFICE_THEME): string {
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = `<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr">${fill}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office">${(
    [
      "dk1",
      "lt1",
      "dk2",
      "lt2",
      "accent1",
      "accent2",
      "accent3",
      "accent4",
      "accent5",
      "accent6",
      "hlink",
      "folHlink",
    ] as const
  )
    .map((slot) => {
      const value = scheme.color(slot) ?? DEFAULT_OFFICE_THEME.color(slot)!;
      if (!/^[0-9a-f]{6}$/i.test(value)) throw new TypeError("Invalid theme colour.");
      return `<a:${slot}><a:srgbClr val="${value}"/></a:${slot}>`;
    })
    .join(
      "",
    )}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}
