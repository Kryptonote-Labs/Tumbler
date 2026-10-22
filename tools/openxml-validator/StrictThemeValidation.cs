using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using DocumentFormat.OpenXml.Drawing;
using DocumentFormat.OpenXml.Packaging;

internal static class StrictThemeValidation
{
    private static readonly XNamespace StrictDrawing = "http://purl.oclc.org/ooxml/drawingml/main";

    // SDK 3.5.1 maps Strict namespaces but leaves a:miter/@lim as an Int32Value.
    // Validate the original Strict lexical form before translating only its in-memory DOM.
    public static int Translate(OpenXmlPackage package)
    {
        var pending = new Stack<OpenXmlPart>(package.Parts.Select(pair => pair.OpenXmlPart));
        var visited = new HashSet<OpenXmlPart>();
        var translated = 0;
        while (pending.TryPop(out var part))
        {
            if (!visited.Add(part)) continue;
            foreach (var child in part.Parts) pending.Push(child.OpenXmlPart);
            if (part is not ThemePart theme) continue;
            using var stream = theme.GetStream(FileMode.Open, FileAccess.Read);
            using var reader = XmlReader.Create(stream, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
            var original = XDocument.Load(reader);
            if (original.Root?.Name != StrictDrawing + "theme") continue;
            var raw = original.Descendants(StrictDrawing + "miter").ToArray();
            var sdk = theme.Theme.Descendants<Miter>().ToArray();
            if (raw.Length != sdk.Length)
                throw new InvalidDataException($"Cannot map Strict theme miter elements for SDK validation: {theme.Uri}");
            for (var index = 0; index < raw.Length; index++)
            {
                if (raw[index].Attribute("lim") is not { } limit) continue;
                sdk[index].Limit = Thousandths(limit.Value, theme.Uri);
                translated++;
            }
        }
        return translated;
    }

    private static int Thousandths(string value, Uri part)
    {
        // ECMA shared-commonSimpleTypes.xsd: ST_PositivePercentage restricts
        // ST_Percentage (xsd:string) with [0-9]+(\.[0-9]+)?%. No whitespace collapse.
        if (!Regex.IsMatch(value, @"\A[0-9]+(?:\.[0-9]+)?%\z", RegexOptions.CultureInvariant | RegexOptions.NonBacktracking))
            throw new InvalidDataException($"Invalid Strict a:miter/@lim '{value}' in {part}: expected ST_PositivePercentage.");
        var pieces = value[..^1].Split('.');
        var fraction = pieces.Length == 2 ? pieces[1].TrimEnd('0') : "";
        if (fraction.Length > 3 || !int.TryParse(pieces[0], NumberStyles.None, CultureInfo.InvariantCulture, out var whole))
            throw new InvalidDataException($"SDK cannot exactly represent Strict a:miter/@lim '{value}' in {part}.");
        var thousandths = (long)whole * 1000 + int.Parse(fraction.PadRight(3, '0'), CultureInfo.InvariantCulture);
        if (thousandths > int.MaxValue)
            throw new InvalidDataException($"SDK cannot exactly represent Strict a:miter/@lim '{value}' in {part}.");
        return (int)thousandths;
    }
}
