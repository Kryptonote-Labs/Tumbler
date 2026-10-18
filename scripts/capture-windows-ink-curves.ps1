# Synthetic controls from the Windows ink fitter; no Word/user documents are read.
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
$t=[Windows.Ink.Stroke].Assembly.GetType('MS.Internal.Ink.Bezier')
$m=$t.GetMethod('ConstructBezierState',[Reflection.BindingFlags]'Instance,NonPublic')
$f=$t.GetField('_bezierControlPoints',[Reflection.BindingFlags]'Instance,NonPublic')
$cases=@{
 smooth=@(@(0,0),@(200,100),@(400,350),@(600,650),@(800,900),@(1000,1000))
 corner=@(@(0,0),@(500,0),@(500,500),@(1000,1000))
 sparse=@(@(0,0),@(500,1000),@(1000,0))
 repeated=@(@(0,0),@(500,500),@(500,500),@(1000,1000))
}
$random=New-Object Random 42017
foreach($count in @(1,2,3,4,5,6,10,50,200)) {
 foreach($variant in 0..3) {
  $points=@();$x=0;$y=0
  foreach($i in 1..$count) { $x+=$random.Next(-100,101);$y+=$random.Next(-100,101);$points+=,@($x,$y) }
  $cases["random-$count-$variant"]=$points
 }
}
$result=@()
foreach($name in $cases.Keys) {
 foreach($scaled in @($false,$true)) {
  $b=[Activator]::CreateInstance($t,$true)
  $p=New-Object Windows.Input.StylusPointCollection
  $raw=@()
  foreach($v in $cases[$name]) {
   $x=[double]$v[0];$y=[double]$v[1]
   if($scaled){$x=[Math]::Round($x*2.82);$y=[Math]::Round($y*2.115)}
   $raw+=,@($x,$y)
   $p.Add((New-Object Windows.Input.StylusPoint ($x*96/2540),($y*96/2540)))
  }
  $ok=$m.Invoke($b,@($p.PSObject.BaseObject,[double]0))
  $control=@();foreach($point in $f.GetValue($b)){$control+=,@($point.X,$point.Y)}
  $result+=@{name=$name;scaled=$scaled;points=$raw;control=$control;ok=$ok}
 }
}
$result | ConvertTo-Json -Depth 8
