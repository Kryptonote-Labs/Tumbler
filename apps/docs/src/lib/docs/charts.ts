import type { Doc } from './types';

export const chartsDoc: Doc = {
  "title": "Charts",
  "description": "Inspect, author and render shared OOXML charts across Word, spreadsheets and PowerPoint.",
  "sections": [
    {
      "id": "model",
      "title": "Parse and render",
      "blocks": [
        {
          "kind": "code",
          "language": "typescript",
          "code": "import { parseOoxmlChart, layoutChartScene } from '@tumblerjs/charts';\n\nconst chart = parseOoxmlChart(chartXml, 'transitional');"
        },
        {
          "kind": "text",
          "text": "The shared engine reads native chart semantics and resolves theme colours and fonts through the owning document. Layout produces a scene used by SVG and canvas. Hosts supply text measurement and decoded picture assets."
        },
        {
          "kind": "text",
          "text": "Chart families include bar/column, line, area, pie, doughnut, scatter, bubble, radar, stock, split pie and surface. Native 3D plots use shared camera and axis geometry. Coverage and Office visual fidelity remain incomplete."
        }
      ]
    },
    {
      "id": "author",
      "title": "Author across formats",
      "blocks": [
        {
          "kind": "text",
          "text": "Shared source/content operations insert and edit charts in DOCX, PPTX and XLSX. Property panes and CLI commands use the same chart engine. Source data, formulas, axes, titles, series and portable related-part graphs remain available for editing."
        },
        {
          "kind": "text",
          "text": "Read the source before editing. Source node IDs refer to that inspected revision. Omitted resources preserve existing related parts; supplying a resource snapshot replaces that graph while retaining shared targets and cycles. External relationship targets are retained as URLs and are not fetched."
        }
      ]
    },
    {
      "id": "paint",
      "title": "Fills and native text",
      "blocks": [
        {
          "kind": "text",
          "text": "Edit solid, gradient, picture and all 54 native pattern fills. Shared fill commands retain unrelated source transforms and extension markup. The workbench previews a draft; Apply commits one edit and Cancel discards it."
        },
        {
          "kind": "text",
          "text": "Rich titles and axis titles retain native formatting. Manual plot and legend layouts, legend entry styles, text rotation, pie labels, leader lines and authored axis properties reach shared scene geometry. Automatic layout remains a policy and can differ from Office."
        }
      ]
    },
    {
      "id": "reference",
      "title": "API and validation",
      "blocks": [
        {
          "kind": "link",
          "href": "https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/charts/README.md",
          "label": "Chart APIs, source editing and interoperability fixtures"
        },
        {
          "kind": "link",
          "href": "/docs/cli",
          "label": "CLI chart authoring"
        },
        {
          "kind": "text",
          "text": "Schema validation and successful LibreOffice conversion establish evidence for the tested structures. They do not prove complete fidelity or pixel parity."
        }
      ]
    }
  ],
  "source": "apps/docs/src/lib/docs/charts.ts"
};
