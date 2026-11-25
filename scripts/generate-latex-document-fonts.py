"""Build browser faces for the LaTeX document fonts from their TeX Live OpenType releases.

Requires fonttools[woff]. Pass a directory holding the extracted TeX Live packages
(tex-gyre, libertine, xcharter, ebgaramond, crimson, cochineal, librebaskerville,
stix2-otf, alegreya, merriweather, lato, fira, roboto and opensans).

Each face keeps Latin text, punctuation, kerning and ligatures. Digits are mapped to the
figure style the pdfLaTeX package selects by default, so Visual shows the same numerals.
"""

import argparse
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

STYLES = ("regular", "bold", "italic", "bolditalic")

# id: (four source files in STYLES order, default figures)
FONTS = {
    "termes": (["texgyretermes-regular.otf", "texgyretermes-bold.otf", "texgyretermes-italic.otf", "texgyretermes-bolditalic.otf"], "lining"),
    "pagella": (["texgyrepagella-regular.otf", "texgyrepagella-bold.otf", "texgyrepagella-italic.otf", "texgyrepagella-bolditalic.otf"], "lining"),
    "bonum": (["texgyrebonum-regular.otf", "texgyrebonum-bold.otf", "texgyrebonum-italic.otf", "texgyrebonum-bolditalic.otf"], "lining"),
    "schola": (["texgyreschola-regular.otf", "texgyreschola-bold.otf", "texgyreschola-italic.otf", "texgyreschola-bolditalic.otf"], "lining"),
    "heros": (["texgyreheros-regular.otf", "texgyreheros-bold.otf", "texgyreheros-italic.otf", "texgyreheros-bolditalic.otf"], "lining"),
    "libertine": (["LinLibertine_R.otf", "LinLibertine_RB.otf", "LinLibertine_RI.otf", "LinLibertine_RBI.otf"], "lining"),
    "xcharter": (["XCharter-Roman.otf", "XCharter-Bold.otf", "XCharter-Italic.otf", "XCharter-BoldItalic.otf"], "lining"),
    "ebgaramond": (["EBGaramond-Regular.otf", "EBGaramond-Bold.otf", "EBGaramond-Italic.otf", "EBGaramond-BoldItalic.otf"], "oldstyle"),
    "crimson": (["Crimson-Roman.otf", "Crimson-Bold.otf", "Crimson-Italic.otf", "Crimson-BoldItalic.otf"], "lining"),
    "cochineal": (["Cochineal-Roman.otf", "Cochineal-Bold.otf", "Cochineal-Italic.otf", "Cochineal-BoldItalic.otf"], "lining"),
    "baskerville": (["LibreBaskerville-Regular.ttf", "LibreBaskerville-Bold.ttf", "LibreBaskerville-Italic.ttf", "LibreBskvl-BoldItalic.ttf"], "lining"),
    "stix": (["STIXTwoText-Regular.otf", "STIXTwoText-Bold.otf", "STIXTwoText-Italic.otf", "STIXTwoText-BoldItalic.otf"], "lining"),
    "alegreya": (["Alegreya-Regular.otf", "Alegreya-Bold.otf", "Alegreya-Italic.otf", "Alegreya-BoldItalic.otf"], "lining"),
    "merriweather": (["Merriweather-Regular.otf", "Merriweather-Bold.otf", "Merriweather-Italic.otf", "Merriweather-BoldItalic.otf"], "oldstyle"),
    "lato": (["Lato-Regular.ttf", "Lato-Bold.ttf", "Lato-Italic.ttf", "Lato-BoldItalic.ttf"], "lining"),
    "fira": (["FiraSans-Regular.otf", "FiraSans-Bold.otf", "FiraSans-Italic.otf", "FiraSans-BoldItalic.otf"], "oldstyle"),
    "roboto": (["Roboto-Regular.otf", "Roboto-Bold.otf", "Roboto-Italic.otf", "Roboto-BoldItalic.otf"], "lining"),
    "opensans": (["OpenSans-Regular.ttf", "OpenSans-Bold.ttf", "OpenSans-Italic.ttf", "OpenSans-BoldItalic.ttf"], "lining"),
}

# Latin-1, Latin Extended-A, general punctuation, the euro and trademark signs, and f-ligatures.
UNICODES = [*range(0x20, 0x7F), *range(0xA0, 0x180), *range(0x2010, 0x2045), 0x20AC, 0x2122, *range(0xFB00, 0xFB05)]


def figure_map(font, feature):
    """Single substitutions a GSUB feature applies, as glyph name pairs."""
    if "GSUB" not in font:
        return {}
    table = font["GSUB"].table
    mapping = {}
    for record in table.FeatureList.FeatureRecord:
        if record.FeatureTag != feature:
            continue
        for index in record.Feature.LookupListIndex:
            lookup = table.LookupList.Lookup[index]
            for subtable in lookup.SubTable:
                if lookup.LookupType == 7:
                    subtable = subtable.ExtSubTable
                mapping.update(getattr(subtable, "mapping", None) or {})
    return mapping


def apply_figures(font, figures):
    swap = figure_map(font, "onum" if figures == "oldstyle" else "lnum")
    for table in font["cmap"].tables:
        for point in range(0x30, 0x3A):
            name = table.cmap.get(point)
            if name in swap:
                table.cmap[point] = swap[name]


def convert(source, destination, figures):
    font = TTFont(source)
    apply_figures(font, figures)
    options = Options()
    options.layout_features = ["kern", "liga", "clig", "mark", "mkmk", "ccmp", "locl"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.flavor = "woff2"
    subsetter = Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    font.save(destination)
    names = font["name"]
    return names.getDebugName(1), names.getDebugName(0), names.getDebugName(13)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("packages", type=Path)
    args = parser.parse_args()
    files = {path.name: path for path in args.packages.rglob("*") if path.suffix in (".otf", ".ttf")}
    destination = Path(__file__).resolve().parents[1] / "packages/markdown/src/fonts/latex/document"
    destination.mkdir(parents=True, exist_ok=True)
    notices = ["# LaTeX document fonts", "", "Subsets of the OpenType releases in TeX Live. Built by scripts/generate-latex-document-fonts.py.", ""]
    for name, (sources, figures) in FONTS.items():
        for style, source in zip(STYLES, sources):
            family, copyright, license = convert(files[source], destination / f"{name}-{style}.woff2", figures)
        notices += [f"## {family}", "", copyright or "", "", license or "", ""]
    (destination / "LICENSES.md").write_text("\n".join(line.rstrip() for line in notices).rstrip() + "\n")


if __name__ == "__main__":
    main()
