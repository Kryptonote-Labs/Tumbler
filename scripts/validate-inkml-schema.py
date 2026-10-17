"""Independent W3C XSD validation. Requires lxml; does not fetch external resources."""
import argparse
from pathlib import Path
from lxml import etree

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--schema", required=True, type=Path)
parser.add_argument("--xml-schema", required=True, type=Path)
parser.add_argument("files", nargs="+", type=Path)
args = parser.parse_args()
xml_parser = etree.XMLParser(no_network=True, resolve_entities=False)
schema = etree.parse(str(args.schema), xml_parser)
# The published schema deliberately leaves the XML namespace import location unset.
imports = schema.xpath('//x:import[@namespace="http://www.w3.org/XML/1998/namespace"]',
                       namespaces={"x": "http://www.w3.org/2001/XMLSchema"})
imports[0].set("schemaLocation", str(args.xml_schema.resolve()))
validator = etree.XMLSchema(schema)
for file in args.files:
    validator.assertValid(etree.parse(str(file), xml_parser))
print(f"W3C XSD validation passed for {len(args.files)} InkML documents.")
