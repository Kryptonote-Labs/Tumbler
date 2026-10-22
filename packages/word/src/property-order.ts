// CT_RPr, CT_PPr and CT_TcPr child order in WordprocessingML.
export const propertyOrder: Record<string, readonly string[]> = {
  tblPr:
    'tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing tblInd tblBorders shd tblLayout tblCellMar tblLook tblCaption tblDescription tblPrChange'.split(
      ' ',
    ),
  tcBorders: 'top left bottom right insideH insideV tl2br tr2bl'.split(' '),
  pBdr: 'top left bottom right between bar'.split(' '),
  trPr: 'cnfStyle divId gridBefore gridAfter wBefore wAfter cantSplit trHeight tblHeader tblCellSpacing jc hidden ins del trPrChange'.split(
    ' ',
  ),
  rPr: 'rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange'.split(
    ' ',
  ),
  pPr: 'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange'.split(
    ' ',
  ),
  tcPr: 'cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark headers cellIns cellDel cellMerge tcPrChange'.split(
    ' ',
  ),
};

/** Emit generated properties in the same schema order used for source edits. */
export function orderedPropertyXml(name: string, values: ReadonlyMap<string, string>): string {
  return (propertyOrder[name] ?? []).map(key => values.get(key) ?? '').join('');
}
