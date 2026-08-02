using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

if (args.Length == 0)
{
    Console.Error.WriteLine("Pass at least one OOXML file to validate.");
    return 2;
}

var failed = false;
var validator = new OpenXmlValidator { MaxNumberOfErrors = 100 };
foreach (var path in args)
{
    try
    {
        using var document = SpreadsheetDocument.Open(path, false);
        var errors = validator.Validate(document).ToArray();
        if (errors.Length == 0)
        {
            Console.WriteLine($"PASS {path}");
            continue;
        }

        failed = true;
        Console.Error.WriteLine($"FAIL {path} ({errors.Length} validation errors)");
        foreach (var error in errors)
        {
            Console.Error.WriteLine($"  {error.Id}: {error.Description}");
            if (error.Path?.XPath is { } xpath) Console.Error.WriteLine($"    {xpath}");
            if (error.Part?.Uri is { } uri) Console.Error.WriteLine($"    {uri}");
        }
    }
    catch (Exception exception)
    {
        failed = true;
        Console.Error.WriteLine($"FAIL {path}: {exception.Message}");
    }
}

return failed ? 1 : 0;
