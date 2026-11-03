"""Independent PDFium inspection and rasterization. No Tumbler implementation is imported."""

import ctypes
import json
import pathlib
import struct
import sys
import zlib

import pypdfium2 as pdfium
import pypdfium2.raw as raw


def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def write_png(bitmap, path):
    # A forced RGB bitmap can contain stride padding, which is not pixel data.
    buffer = bytes(bitmap.buffer)
    rows = b''.join(b'\0' + buffer[y * bitmap.stride:y * bitmap.stride + bitmap.width * 3]
                    for y in range(bitmap.height))
    header = struct.pack('>IIBBBBB', bitmap.width, bitmap.height, 8, 2, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', header)
                     + png_chunk(b'IDAT', zlib.compress(rows)) + png_chunk(b'IEND', b''))


def annotations(page):
    result = []
    for index in range(raw.FPDFPage_GetAnnotCount(page)):
        handle = raw.FPDFPage_GetAnnot(page, index)
        if not handle:
            raise RuntimeError('PDFium failed to open annotation')
        try:
            size = raw.FPDFAnnot_GetStringValue(handle, b'Contents', None, 0)
            buffer = (ctypes.c_ushort * ((size + 1) // 2))()
            if size:
                raw.FPDFAnnot_GetStringValue(handle, b'Contents', buffer, size)
            contents = bytes(buffer)[:max(0, size - 2)].decode('utf-16-le')
            result.append({'subtype': raw.FPDFAnnot_GetSubtype(handle), 'contents': contents})
        finally:
            raw.FPDFPage_CloseAnnot(handle)
    return result


def page_objects(page):
    result = []
    def visit(handle, parent):
        kind = raw.FPDFPageObj_GetType(handle)
        if kind == raw.FPDF_PAGEOBJ_FORM:
            matrix = raw.FS_MATRIX()
            if not raw.FPDFPageObj_GetMatrix(handle, ctypes.byref(matrix)):
                raise RuntimeError('PDFium failed to return a Form matrix')
            a,b,c,d,e,f = parent
            child = [a*matrix.a+c*matrix.b,b*matrix.a+d*matrix.b,
                     a*matrix.c+c*matrix.d,b*matrix.c+d*matrix.d,
                     a*matrix.e+c*matrix.f+e,b*matrix.e+d*matrix.f+f]
            for i in range(raw.FPDFFormObj_CountObjects(handle)):
                visit(raw.FPDFFormObj_GetObject(handle, i), child)
            return
        if kind not in [raw.FPDF_PAGEOBJ_PATH, raw.FPDF_PAGEOBJ_IMAGE]:
            return
        fill, stroke = ctypes.c_int(), ctypes.c_int()
        if kind == raw.FPDF_PAGEOBJ_PATH:
            if not raw.FPDFPath_GetDrawMode(handle, ctypes.byref(fill), ctypes.byref(stroke)):
                raise RuntimeError('PDFium failed to return path paint mode')
            if fill.value == 0 or stroke.value:
                return
        left,bottom,right,top = [ctypes.c_float() for _ in range(4)]
        if not raw.FPDFPageObj_GetBounds(handle, ctypes.byref(left), ctypes.byref(bottom), ctypes.byref(right), ctypes.byref(top)):
            raise RuntimeError('PDFium failed to return object bounds')
        a,b,c,d,e,f = parent
        points = [(a*x+c*y+e,b*x+d*y+f) for x,y in [(left.value,bottom.value),(left.value,top.value),(right.value,bottom.value),(right.value,top.value)]]
        result.append({'kind':'path' if kind == raw.FPDF_PAGEOBJ_PATH else 'image',
                       'bounds':[min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]})
    for i in range(raw.FPDFPage_CountObjects(page)):
        visit(raw.FPDFPage_GetObject(page,i),[1,0,0,1,0,0])
    return result


def inspect(source, output, password):
    document = pdfium.PdfDocument(source, password=password or None)
    pages = []
    try:
        for index in range(len(document)):
            page = document[index]
            try:
                textpage = page.get_textpage()
                try:
                    # get_text_bounded supports full Unicode, unlike the UCS-2 range API.
                    text = textpage.get_text_bounded(errors='strict')
                    boxes = [list(textpage.get_charbox(i)) for i in range(textpage.count_chars())]
                    characters = []
                    for i in range(textpage.count_chars()):
                        x, y = ctypes.c_double(), ctypes.c_double()
                        if not raw.FPDFText_GetCharOrigin(textpage, i, ctypes.byref(x), ctypes.byref(y)):
                            raise RuntimeError('PDFium failed to return a character origin')
                        matrix = raw.FS_MATRIX()
                        if not raw.FPDFText_GetMatrix(textpage, i, ctypes.byref(matrix)):
                            raise RuntimeError('PDFium failed to return a text matrix')
                        characters.append({'code': raw.FPDFText_GetUnicode(textpage, i),
                                           'generated': raw.FPDFText_IsGenerated(textpage, i) == 1,
                                           'origin': [x.value, y.value],
                                           'fontSize': raw.FPDFText_GetFontSize(textpage, i),
                                           'matrix': [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]})
                finally:
                    textpage.close()
                bitmap = page.render(scale=1, rev_byteorder=True, force_bitmap_format=raw.FPDFBitmap_BGR,
                                     draw_annots=True)
                try:
                    image = f'page-{index + 1:03d}.png'
                    write_png(bitmap, output / image)
                finally:
                    bitmap.close()
                pages.append({'width': page.get_width(), 'height': page.get_height(),
                              'text': text, 'boxes': boxes, 'characters': characters,
                              'annotations': annotations(page), 'objects':page_objects(page), 'image': image})
            finally:
                page.close()
    finally:
        document.close()
    return {'pdfium': str(pdfium.PDFIUM_INFO), 'binding': str(pdfium.PYPDFIUM_INFO), 'pages': pages}


if __name__ == '__main__':
    source, destination, *password = sys.argv[1:]
    output = pathlib.Path(destination)
    output.mkdir(parents=True, exist_ok=False)
    result = inspect(source, output, password[0] if password else '')
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
