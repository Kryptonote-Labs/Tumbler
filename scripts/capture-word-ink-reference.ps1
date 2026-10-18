# Run in the interactive desktop session with a blank Word document open.
# Input DOCX files go in Root/input; Root/output must be empty.
param(
    [Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][int]$WordProcessId
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WordWindowAccess {
 public delegate bool Callback(IntPtr hwnd, IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hwnd, Callback callback, IntPtr data);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int capacity);
 [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint id, ref Guid iid, [MarshalAs(UnmanagedType.IDispatch)] out object result);
 public static object Get(IntPtr parent) {
  IntPtr target = IntPtr.Zero;
  EnumChildWindows(parent, (hwnd, data) => { var name = new StringBuilder(256); GetClassName(hwnd,name,256); if(name.ToString()=="_WwG") { target=hwnd; return false; } return true; }, IntPtr.Zero);
  if(target==IntPtr.Zero) throw new Exception("Word document window not found");
  Guid iid = new Guid("00020400-0000-0000-C000-000000000046"); object result;
  int hr = AccessibleObjectFromWindow(target, 0xfffffff0, ref iid, out result);
  Marshal.ThrowExceptionForHR(hr); return result;
 }
}
'@
function Get-VisibleWord {
 $process = Get-Process -Id $WordProcessId -ErrorAction Stop
 if ($process.MainWindowHandle -eq 0) { throw 'Expected visible Word window is missing' }
 $window = [WordWindowAccess]::Get($process.MainWindowHandle)
 return $window.Application
}

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Root = (Resolve-Path $Root).Path
if (!(Test-Path (Join-Path $Root 'input'))) { throw 'Root/input is missing' }
$output = Join-Path $Root 'output'
if ((Test-Path $output) -and @(Get-ChildItem $output).Count -gt 0) { throw 'Root/output must be empty' }
New-Item -ItemType Directory -Force $output | Out-Null
$report = [ordered]@{ status = 'starting'; version = ''; build = ''; cases = @(); error = $null }
function Save-Report { $report | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path (Join-Path $Root 'output\report.json') }
function Read-Shapes($Document) {
    $shapes = @()
    foreach ($shape in $Document.InlineShapes) { $shapes += [ordered]@{ placement = 'inline'; type = [int]$shape.Type; width = [double]$shape.Width; height = [double]$shape.Height } }
    foreach ($shape in $Document.Shapes) { $shapes += [ordered]@{ placement = 'floating'; type = [int]$shape.Type; width = [double]$shape.Width; height = [double]$shape.Height; rotation = [double]$shape.Rotation; left = [double]$shape.Left; top = [double]$shape.Top } }
    return ,$shapes
}
$word = $null
$document = $null
Save-Report
try {
    # Attach to the chosen visible instance; close only documents opened by this script.
    $word = Get-VisibleWord
    $report.version = [string]$word.Version
    $report.build = [string]$word.Build
    $report.status = 'running'
    Save-Report
    foreach ($file in Get-ChildItem -Path (Join-Path $Root 'input') -Filter '*.docx' | Sort-Object Name) {
        $case = [ordered]@{ name = $file.Name; status = 'opening'; shapes = @(); editedShapes = @(); error = $null }
        $report.cases += $case
        Save-Report
        try {
            $document = $word.Documents.Open($file.FullName, $false, $true, $false)
            $case.shapes = Read-Shapes $document
            $case.status = 'exporting'
            Save-Report
            $base = Join-Path $Root ('output\' + $file.BaseName)
            # Explicit types avoid passing PowerShell wrapper objects to Office COM.
            [string]$pdf = $base + '.pdf'; $document.ExportAsFixedFormat($pdf, 17)
            [string]$saved = $base + '-roundtrip.docx'; [int]$format = 16; $document.SaveAs2([ref]$saved, [ref]$format)
            if ($document.InlineShapes.Count -eq 1) { $shape = $document.InlineShapes.Item(1).ConvertToShape() }
            elseif ($document.Shapes.Count -eq 1) { $shape = $document.Shapes.Item(1) }
            else { $shape = $null }
            if ($null -ne $shape) {
                $shape.LockAspectRatio = 0
                $shape.Rotation = 30
                $shape.Width = $shape.Width * 1.4
                $shape.Height = $shape.Height * 0.7
                $case.editedShapes = Read-Shapes $document
                [string]$saved = $base + '-word-resized.docx'; $document.SaveAs2([ref]$saved, [ref]$format)
                [string]$pdf = $base + '-word-resized.pdf'; $document.ExportAsFixedFormat($pdf, 17)
            }
            $case.status = 'complete'
        } catch { $case.status = 'failed'; $case.error = $_.Exception.Message }
        finally { if ($null -ne $document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document); $document = $null }; Save-Report }
    }
    $report.status = if (@($report.cases | Where-Object { $_.status -ne 'complete' }).Count) { 'failed' } else { 'complete' }
} catch { $report.status = 'failed'; $report.error = $_.Exception.Message }
finally {
    if ($null -ne $word) {
        # Word reuses a clean blank window when opening the first test document.
        # Leave a new blank document available for the next reference run.
        if ($word.Documents.Count -eq 0) { [void]$word.Documents.Add() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
    Save-Report
}

if ($report.status -ne 'complete') { exit 1 }
