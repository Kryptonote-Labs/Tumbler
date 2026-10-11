"""Index section locators, not standards prose or normative requirements.

Run against the ignored reference archive. This does not claim that every prose
obligation has been extracted. Missing qualification plans remain in the score.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ECMA = 'https://ecma-international.org/publications-and-standards/standards/ecma-376/'
SOURCES = [
    ('ecma-1', 'ecma/Ecma Office Open XML Part 1 - Fundamentals And Markup Language Reference.md', '2016, fifth edition', ECMA),
    ('ecma-2', 'ecma/Ecma Office Open XML Part 2 - Open Packaging Conventions.md', '2021, fifth edition', ECMA),
    ('ecma-3', 'ecma/Ecma Office Open XML Part 3 - Markup Compatibility and Extensibility.md', '2015, fifth edition', ECMA),
    ('ecma-4', 'ecma/Ecma Office Open XML Part 4 - Transitional Migration Features.md', '2016, fifth edition', ECMA),
    *[(name.lower(), f'microsoft/[{name}].md', 'local archive, 2026-08-02; exact PDF SHA-256 pinned', f'https://learn.microsoft.com/en-us/openspecs/office_standards/{name.lower()}/')
      for name in ['MS-DOCX', 'MS-ODRAWXML', 'MS-OEXTXML', 'MS-OI29500']],
]


def branch(section, prefixes):
    return any(section == prefix or section.startswith(prefix + '.') for prefix in prefixes)


def selected(source, section, title):
    if source == 'ecma-1':
        return branch(section, ['2', '9', '10', '11', '14', '15', '17', '20.1', '20.2', '20.3', '20.4', '21', '22']) and not branch(section, ['11.1', '15.1', '17.1'])
    if source == 'ecma-2':
        return branch(section, ['4', '6', '7', '8', '9', '10'])
    if source == 'ecma-3':
        return branch(section, ['7', '8', '9', '10'])
    if source == 'ecma-4':
        return branch(section, ['2', '8', '9', '12', '13', '14', '17', '18', '19', '20']) and not branch(section, ['19.4'])
    if source == 'ms-oi29500':
        match = re.search(r'Part ([1-4]) Section ([\d.]+)', title)
        return bool(match and selected('ecma-' + match[1], match[2].rstrip('.'), ''))
    if source == 'ms-odrawxml':
        return branch(section, ['2']) and not branch(section, ['2.20', '2.21', '2.43'])
    return branch(section, ['2'])


def headings(text):
    """Read dotted-leader TOC entries, including wrapped titles; deduplicate repeats."""
    found = {}
    pending = ''
    for line in text.splitlines():
        start = re.match(r'^\s*(\d+(?:\.\d+)*)(?:\.)?\s+(.+)$', line)
        if start:
            pending = start[1] + ' ' + start[2]
        elif pending:
            pending += ' ' + line.strip()
        match = re.match(r'^(\d+(?:\.\d+)*)\s+(.+?)\s*\.{3,}\s*(\d+)\s*$', pending)
        if match:
            section, title, page = match.groups()
            found.setdefault(section, (' '.join(title.split()), int(page)))
            pending = ''
        elif len(pending) > 600 or not line.strip():
            pending = ''
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path, help='docs/reference/vendor directory')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    topics, sources = [], []
    for source, relative, edition, url in SOURCES:
        text_path = args.archive / 'markdown' / relative
        pdf_path = args.archive / 'raw' / relative.replace('.md', '.pdf')
        text_bytes, pdf_bytes = text_path.read_bytes(), pdf_path.read_bytes()
        entries = headings(text_bytes.decode())
        selected_entries = {key: value for key, value in entries.items() if selected(source, key, value[0])}
        # A leaf is counted once; parent sections are navigation, not extra score credit.
        leaves = [(key, value) for key, value in selected_entries.items() if not any(other.startswith(key + '.') for other in selected_entries)]
        if not leaves:
            raise ValueError(f'No topics extracted from {source}')
        for section, (title, page) in leaves:
            topics.append(dict(id=f'{source}:{section}', source=source, section=section, title=title, page=page))
        sources.append(dict(id=source, edition=edition, url=url, archivePath=relative.replace('.md', '.pdf'),
                            pdfSha256=hashlib.sha256(pdf_bytes).hexdigest(), textSha256=hashlib.sha256(text_bytes).hexdigest(),
                            extractedHeadings=len(entries), selectedLeafTopics=len(leaves)))
    topics.sort(key=lambda topic: (topic['source'], [int(n) for n in topic['section'].split('.')]))
    outputs = {
        'topics.json': '[\n' + ',\n'.join('  ' + json.dumps(topic, ensure_ascii=False, separators=(',', ':')) for topic in topics) + '\n]\n',
        'sources.json': json.dumps(sources, indent=2, ensure_ascii=False) + '\n',
    }
    lock = dict(version=1, scope='word-standards-v1', topics=len(topics), files={name: hashlib.sha256(value.encode()).hexdigest() for name, value in outputs.items()})
    outputs['lock.json'] = json.dumps(lock, indent=2) + '\n'
    for name, value in outputs.items():
        path = HERE / 'catalog' / name
        if args.check:
            if path.read_text() != value:
                raise ValueError(f'Inventory differs: {name}; review scope changes and version them')
        else:
            path.write_text(value)
    print(f'{len(topics)} leaf topics across {len(sources)} pinned sources')


if __name__ == '__main__':
    main()
