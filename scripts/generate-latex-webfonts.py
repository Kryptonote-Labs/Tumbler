"""Build editable browser fonts from the AMS Computer Modern Type 1 release.

Requires fonttools[woff]. Pass the TeX Live texmf-dist directory and the
accompanying AMS Fonts OFL.txt or OFL.txt.gz.
"""

import argparse
import gzip
import re
from pathlib import Path

from fontTools import agl, t1Lib
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen

FACES = {
    "cmr10": ("Tumbler TeX Roman", "Regular"),
    "cmbx10": ("Tumbler TeX Roman", "Bold"),
    "cmti10": ("Tumbler TeX Roman", "Italic"),
    "cmbxti10": ("Tumbler TeX Roman", "Bold Italic"),
    "cmr12": ("Tumbler TeX Roman 12", "Regular"),
    "cmbx12": ("Tumbler TeX Roman 12", "Bold"),
    "cmr17": ("Tumbler TeX Roman 17", "Regular"),
    "cmss10": ("Tumbler TeX Sans", "Regular"),
    "cmss12": ("Tumbler TeX Sans 12", "Regular"),
    "cmssbx10": ("Tumbler TeX Sans", "Bold"),
    "cmtt10": ("Tumbler TeX Mono", "Regular"),
}


def features(metrics, glyphs):
    kern = []
    ligatures = []
    for line in metrics.splitlines():
        if line.startswith("KPX "):
            _, left, right, amount = line.split()
            if left in glyphs and right in glyphs:
                kern.append(f"pos {left} {right} {amount};")
        if line.startswith("C "):
            left = re.search(r"\bN (\S+)", line).group(1)
            for right, result in re.findall(r"\bL (\S+) (\S+)", line):
                if all(name in glyphs for name in (left, right, result)):
                    ligatures.append(f"sub {left} {right} by {result};")
    return "\n".join(
        f"feature {name} {{\n" + "\n".join(rules) + f"\n}} {name};"
        for name, rules in (("kern", kern), ("liga", ligatures))
        if rules
    )


def glyph_bounds(glyphs, name):
    pen = BoundsPen(glyphs)
    glyphs[name].draw(pen)
    return pen.bounds


def convert(tree, source, family, style, destination, copyright):
    original = t1Lib.T1Font(tree / f"fonts/type1/public/amsfonts/cm/{source}.pfb")
    glyphs = original.getGlyphSet()
    cmap = {}
    widths = {}
    outlines = {}
    for name, glyph in glyphs.items():
        text = agl.toUnicode(name)
        if len(text) == 1:
            cmap[ord(text)] = name
        bounds = BoundsPen(glyphs)
        glyph.draw(bounds)
        pen = T2CharStringPen(glyph.width, glyphs)
        glyph.draw(pen)
        outlines[name] = pen.getCharString()
        widths[name] = (glyph.width, round(bounds.bounds[0]) if bounds.bounds else 0)
    # TeX's ASCII quotes use these glyphs in OT1. Keep CSS word spacing on the ASCII space.
    for point, name in ((0x27, "quoteright"), (0x60, "quoteleft"), (0xA0, "space")):
        if name in glyphs:
            cmap[point] = name

    full_name = f"{family} {style}"
    postscript = family.replace(" ", "") + "-" + style.replace(" ", "")
    italic = "Italic" in style
    bold = "Bold" in style
    builder = FontBuilder(1000, isTTF=False)
    builder.setupGlyphOrder([".notdef", *(name for name in glyphs if name != ".notdef")])
    builder.setupCharacterMap(cmap)
    builder.setupCFF(postscript, {"FullName": full_name, "FamilyName": family}, outlines, {})
    builder.setupHorizontalMetrics(widths)
    builder.setupHorizontalHeader(ascent=900, descent=-100)
    builder.setupNameTable({
        "familyName": family, "styleName": style, "fullName": full_name,
        "psName": postscript, "uniqueFontIdentifier": postscript,
        "copyright": copyright, "licenseDescription": "SIL Open Font License, Version 1.1",
        "licenseInfoURL": "https://openfontlicense.org/",
    })
    builder.setupOS2(
        sTypoAscender=900, sTypoDescender=-100, usWinAscent=900, usWinDescent=250,
        sCapHeight=round(glyph_bounds(glyphs, "H")[3]),
        sxHeight=round(glyph_bounds(glyphs, "x")[3]),
        fsSelection=(0x01 if italic else 0) | (0x20 if bold else 0) or 0x40,
        usWeightClass=700 if bold else 400,
    )
    builder.setupHead(macStyle=int(bold) | (int(italic) << 1), created=2082844800, modified=2082844800)
    builder.setupPost(italicAngle=original.font.get("FontInfo", {}).get("ItalicAngle", 0))
    afm = tree / f"fonts/afm/public/amsfonts/cm/{source}.afm"
    addOpenTypeFeaturesFromString(builder.font, features(afm.read_text(), glyphs))
    builder.font.recalcTimestamp = False
    builder.font.flavor = "woff2"
    builder.font.save(destination / (postscript.lower() + ".woff2"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("texmf", type=Path)
    parser.add_argument("license", type=Path)
    args = parser.parse_args()
    destination = Path(__file__).resolve().parents[1] / "packages/markdown/src/fonts/latex"
    destination.mkdir(parents=True, exist_ok=True)
    license_text = (
        gzip.decompress(args.license.read_bytes()) if args.license.suffix == ".gz"
        else args.license.read_bytes()
    )
    (destination / "OFL.txt").write_bytes(b"\n".join(line.rstrip() for line in license_text.splitlines()) + b"\n")
    for source, (family, style) in FACES.items():
        convert(args.texmf, source, family, style, destination, license_text.decode().splitlines()[0])


if __name__ == "__main__":
    main()
