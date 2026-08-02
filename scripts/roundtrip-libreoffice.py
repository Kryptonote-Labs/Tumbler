from pathlib import Path
import sys
import time

import uno
from com.sun.star.beans import PropertyValue


def property_value(name: str, value: object) -> PropertyValue:
    result = PropertyValue()
    result.Name = name
    result.Value = value
    return result


def connect():
    local_context = uno.getComponentContext()
    resolver = local_context.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_context
    )
    for _ in range(100):
        try:
            return resolver.resolve(
                "uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext"
            )
        except Exception:
            time.sleep(0.1)
    raise RuntimeError("LibreOffice did not expose its UNO socket within ten seconds.")


input_directory = Path(sys.argv[1]).resolve()
output_directory = Path(sys.argv[2]).resolve()
context = connect()
desktop = context.ServiceManager.createInstanceWithContext(
    "com.sun.star.frame.Desktop", context
)

for source in sorted(input_directory.glob("*.xlsx")):
    document = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(str(source)),
        "_blank",
        0,
        (property_value("Hidden", True),),
    )
    if document is None:
        raise RuntimeError(f"LibreOffice could not load {source.name}.")
    try:
        document.enableAutomaticCalculation(True)
        document.calculateAll()
        document.storeToURL(
            uno.systemPathToFileUrl(str(output_directory / source.name)),
            (
                property_value("FilterName", "Calc MS Excel 2007 XML"),
                property_value("Overwrite", True),
            ),
        )
    finally:
        document.close(True)
