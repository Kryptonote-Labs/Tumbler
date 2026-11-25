import { expect, test } from "bun:test";
import { interpretLatexTitlePage, latexPageLayout, type LatexTitleBlock } from "../src/latex";

const report = String.raw`\documentclass[12pt,twoside]{report}
\setlength{\parskip}{2ex plus 0.5ex minus 0.2ex}
\setlength{\parindent}{0pt}
\makeatletter
\linespread{1.5}
\def\submitdate#1{\gdef\@submitdate{#1}}
\def\maketitle{
  \begin{titlepage}{
    \Large Faculty of Letters \\
    Division of Applied Theory
    \rm
    \vskip 3in
    \Large \bf \@title \par
  }
  \vskip 0.3in
  \par
  {\Large \@author}
  \vskip 4in
  \par
  Submitted for the degree of
  \linebreak
  the Diploma of the Faculty, \@submitdate
  \vfil
  \end{titlepage}
}
\def\titlepage{
  \newpage
  \centering
  \linespread{1}
  \normalsize
  \vbox to \vsize\bgroup\vbox to 9in\bgroup
}
\def\endtitlepage{
  \par
  \kern 0pt
  \egroup
  \vss
  \egroup
  \cleardoublepage
}
\makeatother
\title{Learning}
\begin{document}
`;

test("a class title page is read as styled text and editable fields", () => {
  const layout = latexPageLayout(report);
  const page = interpretLatexTitlePage(report, layout);
  const [outer] = page ?? [];
  expect(outer?.kind).toBe("box");
  if (outer?.kind !== "box") return;
  expect(outer.height).toBeCloseTo(layout.height - layout.top - layout.bottom);
  expect(outer.blocks.at(-1)).toEqual({ kind: "skip", height: 0, stretch: 1 });
  const inner = outer.blocks[0];
  if (inner?.kind !== "box") throw new Error("expected the inner box");
  expect(inner.height).toBe(864);
  const paragraphs = inner.blocks.filter((block) => block.kind === "paragraph");
  const text = (block: LatexTitleBlock) =>
    block.kind === "paragraph"
      ? block.lines.map((line) =>
          line.map((run) => (run.kind === "text" ? run.text : `<${run.field}>`)).join(""),
        )
      : [];
  expect(paragraphs.map(text)).toEqual([
    ["Faculty of Letters", "Division of Applied Theory"],
    ["<title>"],
    ["<author>"],
    ["Submitted for the degree of", "the Diploma of the Faculty, <submitdate>"],
  ]);
  const [heading, title, author, note] = paragraphs;
  expect(heading?.align).toBe("center");
  // \titlepage resets the class's 1.5 stretch; \Large is 17.28pt on 22pt in a 12pt class.
  const point = 96 / 72.27;
  expect(heading?.leading).toBeCloseTo(22 * point);
  const titleRun = title?.lines[0]?.[0];
  expect(titleRun?.style).toMatchObject({ bold: true, size: 17.28 * point });
  // The group closes before the paragraph ends, so the author line keeps the normal baselineskip.
  expect(author?.lines[0]?.[0]?.style.size).toBeCloseTo(17.28 * point);
  expect(author?.leading).toBeCloseTo(14.5 * point);
  expect(note?.lines[0]?.[0]?.style).toMatchObject({ bold: false, size: 12 * point });
  expect(inner.blocks).toContainEqual({ kind: "skip", height: 288, stretch: 0 });
  expect(inner.blocks).toContainEqual({ kind: "skip", height: 0, stretch: 1 });
});

test("a title page with TeX the interpreter does not model is left to the compiler", () => {
  const source = report.replace("Division of Applied Theory", "\\hfill Division of Applied Theory");
  expect(interpretLatexTitlePage(source, latexPageLayout(source))).toBeUndefined();
});
