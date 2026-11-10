import type { FormulaScalarValue } from '../../src/evaluator.ts';
export interface EngineeringCase {
  name: string; formula: string;
  expected: FormulaScalarValue | readonly (readonly FormulaScalarValue[])[];
  cells?: Record<string, FormulaScalarValue>; tolerance?: number; dateSystem?: '1900' | '1904';
}
const n = (value: number): FormulaScalarValue => ({ type: 'number', value });
const s = (value: string): FormulaScalarValue => ({ type: 'string', value });
const e = (value: `#${string}`): FormulaScalarValue => ({ type: 'error', value });
export const cases: EngineeringCase[] = [];
function add(name: string, formula: string, expected: FormulaScalarValue, tolerance?: number) { cases.push({ name, formula, expected, ...(tolerance === undefined ? {} : { tolerance: Math.max(tolerance, expected.type === 'number' ? Math.abs(expected.value)*2e-13 : 0) }) }); }
const examples: [string, FormulaScalarValue, string, `#${string}`?][] = [
 ['BESSELI(1.5,1)',n(0.9816664285779076),'BESSELI(1,-1)'],
 ['BESSELJ(1.9,2)',n(0.3299257276923872),'BESSELJ(1,-1)'],
 ['BESSELK(1.5,1)',n(0.2773878004568438),'BESSELK(0,1)'],
 ['BESSELY(2.5,1)',n(0.1459181379667858),'BESSELY(-1,1)'],
 ['BIN2DEC("1111111111")',n(-1),'BIN2DEC("102")'],
 ['BIN2HEX("11111011",4)',s('00FB'),'BIN2HEX("101",0)'],
 ['BIN2OCT("1001",4)',s('0011'),'BIN2OCT("2")'],
 ['BITAND(281474976710655,1099511627776)',n(1099511627776),'BITAND(-1,0)'],
 ['BITOR(1099511627776,1)',n(1099511627777),'BITOR(1.1,2)'],
 ['BITXOR(281474976710655,1)',n(281474976710654),'BITXOR(281474976710656,1)'],
 ['BITLSHIFT(4,2)',n(16),'BITLSHIFT(1,54)'],
 ['BITRSHIFT(13,2)',n(3),'BITRSHIFT(-1,2)'],
 ['COMPLEX(3,-1,"j")',s('3-j'),'COMPLEX(1,2,"I")','#VALUE!'],
 ['CONVERT(68,"F","C")',n(20),'CONVERT(1,"ft","sec")','#N/A'],
 ['DEC2BIN(-1)',s('1111111111'),'DEC2BIN(512)'],
 ['DEC2HEX(-1)',s('FFFFFFFFFF'),'DEC2HEX(549755813888)'],
 ['DEC2OCT(-1)',s('7777777777'),'DEC2OCT(-536870913)'],
 ['DELTA(5,5)',n(1),'DELTA("bad")','#VALUE!'],
 ['ERF(0.5)',n(0.5204998778130465),'ERF("bad")','#VALUE!'],
 ['ERF.PRECISE(-1)',n(-0.8427007929497149),'ERF.PRECISE("bad")','#VALUE!'],
 ['ERFC(1)',n(0.15729920705028513),'ERFC("bad")','#VALUE!'],
 ['ERFC.PRECISE(-1)',n(1.8427007929497149),'ERFC.PRECISE("bad")','#VALUE!'],
 ['GESTEP(2,2)',n(1),'GESTEP("bad")','#VALUE!'],
 ['HEX2BIN("FFFFFFFFFF")',s('1111111111'),'HEX2BIN("200")'],
 ['HEX2DEC("FFFFFFFFFF")',n(-1),'HEX2DEC("GG")'],
 ['HEX2OCT("F",4)',s('0017'),'HEX2OCT("20000000")'],
 ['IMABS("5+12i")',n(13),'IMABS("bad")'],
 ['IMAGINARY("3-4j")',n(-4),'IMAGINARY("3+4I")'],
 ['IMARGUMENT("i")',n(Math.PI/2),'IMARGUMENT(0)','#DIV/0!'],
 ['IMCONJUGATE("3+4j")',s('3-4j'),'IMCONJUGATE("bad")'],
 ['IMCOS(0)',s('1'),'IMCOS("bad")'],
 ['IMCOSH(0)',s('1'),'IMCOSH("bad")'],
 ['IMREAL(IMCOT(1))',n(1/Math.tan(1)),'IMCOT(0)'],
 ['IMREAL(IMCSC(1))',n(1/Math.sin(1)),'IMCSC(0)'],
 ['IMREAL(IMCSCH(1))',n(1/Math.sinh(1)),'IMCSCH(0)'],
 ['IMDIV("3+4i","1-i")',s('-0.5+3.5i'),'IMDIV(1,0)'],
 ['IMEXP(0)',s('1'),'IMEXP("bad")'],
 ['IMLN(1)',s('0'),'IMLN(0)'],
 ['IMLOG10(1)',s('0'),'IMLOG10(0)'],
 ['IMLOG2(1)',s('0'),'IMLOG2(0)'],
 ['IMPOWER("1+i",2)',s('2.0000000000000004i'),'IMPOWER("bad",2)'],
 ['IMPRODUCT("1+i","1-i",2)',s('4'),'IMPRODUCT("bad",1)'],
 ['IMREAL("-3+4i")',n(-3),'IMREAL("bad")'],
 ['IMSEC(0)',s('1'),'IMSEC("bad")'],
 ['IMSECH(0)',s('1'),'IMSECH("bad")'],
 ['IMSIN(0)',s('0'),'IMSIN("bad")'],
 ['IMSINH(0)',s('0'),'IMSINH("bad")'],
 ['IMSQRT(4)',s('2'),'IMSQRT("bad")'],
 ['IMSUB("3+4i","1+i")',s('2+3i'),'IMSUB("bad",1)'],
 ['IMSUM("1+i","2-i",3)',s('6'),'IMSUM("bad",1)'],
 ['IMTAN(0)',s('0'),'IMTAN("bad")'],
 ['OCT2BIN("7777777777")',s('1111111111'),'OCT2BIN("1000")'],
 ['OCT2DEC("7777777777")',n(-1),'OCT2DEC("8")'],
 ['OCT2HEX("7777777777")',s('FFFFFFFFFF'),'OCT2HEX("8")'],
];
for (const [formula, expected, failure, code = '#NUM!'] of examples) {
 const name = formula.match(/(?:IMREAL\()?([A-Z][A-Z0-9.]*)\(/)![1]!;
 // Complex transcendental output is checked numerically to avoid display rounding dependence.
 if (formula.startsWith('IMPOWER')) add(`${name} success`, 'IMAGINARY(IMPOWER("1+i",2))', n(2), 1e-12);
 else add(`${name} success`, formula, expected, 1e-10);
 add(`${name} invalid input`,failure,e(code));
 const first = formula.match(/^[A-Z0-9.]+\(("[^"]*"|[+-]?\d+(?:\.\d+)?)/);
 if (first && !formula.startsWith('IMPOWER')) {
   const literal = first[1]!;
   const value = literal.startsWith('"') ? s(literal.slice(1,-1)) : n(Number(literal));
   cases.push({name:`${name} reference success`,formula:formula.slice(0,first[0].length-literal.length)+'Inputs!A1'+formula.slice(first[0].length),expected,cells:{A1:value},tolerance:1e-10});
 }

}
for (const [formula,expected] of [
 ['DEC2BIN(-512)',s('1000000000')],['DEC2BIN(511)',s('111111111')],['DEC2BIN(1.9,4.9)',s('0001')],['DEC2HEX(-549755813888)',s('8000000000')],['DEC2OCT(536870911)',s('3777777777')],
 ['BIN2HEX("1000000000",1)',s('FFFFFFFE00')],['HEX2DEC("8000000000")',n(-549755813888)],['OCT2DEC("4000000000")',n(-536870912)],['HEX2BIN("1FF")',s('111111111')],
 ['BITLSHIFT(281474976710655,1)',e('#NUM!')],['BITLSHIFT(8,-2)',n(2)],['BITRSHIFT(8,-2)',n(32)],['BITRSHIFT(281474976710655,53)',n(0)],['BITAND("12",10)',n(8)],
 ['DELTA(0)',n(1)],['GESTEP(-1)',n(0)],['ERF(1,2)',n(0.1526214720692379)],['ERFC(10)',n(2.088487583762545e-45)],['ERF.PRECISE(1e-12)',n(1.1283791670955126e-12)],
 ['COMPLEX(0,1)',s('i')],['COMPLEX(0,-1)',s('-i')],['COMPLEX(0,0)',s('0')],['IMAGINARY("1e-2-2e+3i")',n(-2000)],['IMREAL(TRUE)',e('#VALUE!')],['IMSUM("i","j")',e('#NUM!')],['IMABS(COMPLEX(3,4))',n(5)],
 ['CONVERT(1,"lbm","kg")',n(0.45359237)],['CONVERT(1,"km","m")',n(1000)],['CONVERT(1,"cm2","m2")',n(0.0001)],['CONVERT(1,"m3","l")',n(1000)],['CONVERT(1,"Mibyte","bit")',n(8388608)],['CONVERT(1,"kift","m")',e('#N/A')],['CONVERT(1,"Km","m")',e('#N/A')],['CONVERT(32,"F","K")',n(273.15)],['CONVERT(80,"Reau","C")',n(100)],
 ['BESSELJ(0,0)',n(1)],['BESSELJ(-1.9,2)',n(0.3299257276923872)],['BESSELI(-1.5,1.9)',n(-0.9816664285779076)],['BESSELI(1000,0)',e('#NUM!')],['BESSELK(1000,0)',n(0)],['BESSELJ(100,0)',n(0.019985850304223122)],['BESSELY(100,0)',n(-0.07724431336508315)],
] as [string,FormulaScalarValue][]) add(`boundary ${formula}`,formula,expected,1e-10);
cases.push({name:'reference numeric text',formula:'DEC2BIN(Inputs!A1,4)',cells:{A1:s('5')},expected:s('0101')});
cases.push({name:'reference error propagation',formula:'IMABS(Inputs!A1)',cells:{A1:e('#N/A')},expected:e('#N/A')});
cases.push({name:'range complex sum',formula:'IMSUM(Inputs!A1:A3)',cells:{A1:s('1+i'),A2:s('2-i'),A3:n(3)},expected:s('6')});
cases.push({name:'range complex product',formula:'IMPRODUCT(Inputs!A1:A2)',cells:{A1:s('1+i'),A2:s('1-i')},expected:s('2')});
cases.push({name:'array radix',formula:'DEC2BIN(Inputs!A1:A2,4)',cells:{A1:n(1),A2:n(2)},expected:[[s('0001')],[s('0010')]]});
for (const dateSystem of ['1900','1904'] as const) cases.push({name:`date serial as number ${dateSystem}`,formula:'GESTEP(Inputs!A1,40000)',cells:{A1:n(45000)},expected:n(1),dateSystem});
// Independent real/imaginary identities exercise nonzero transcendental paths.
// Exact strings independently confirmed in native Excel 16.114.4 (2026-11-09).
cases.push(
 {name:'native complex cosine coefficient precision',formula:'IMCOS("1+i")',expected:s('0.833730025131149-0.988897705762865i')},
 {name:'native complex exponential coefficient precision',formula:'IMEXP("1+i")',expected:s('1.46869393991589+2.28735528717884i')},
 {name:'native small complex decimal coefficient',formula:'COMPLEX(1e-10,1)',expected:s('0.0000000001+i')},
 {name:'native large complex decimal coefficient',formula:'COMPLEX(1e15,1)',expected:s('1000000000000000+i')},
 {name:'native complex lower fixed boundary',formula:'COMPLEX(1e-19,1)',expected:s('0.0000000000000000001+i')},
 {name:'native complex lower scientific boundary',formula:'COMPLEX(1e-20,1)',expected:s('1E-20+i')},
 {name:'native complex upper fixed boundary',formula:'COMPLEX(1e20,1)',expected:s('100000000000000000000+i')},
 {name:'native complex upper scientific boundary',formula:'COMPLEX(1e21,1)',expected:s('1E+21+i')},
 {name:'native complex extreme negative exponent',formula:'COMPLEX(1e-100,1)',expected:s('1E-100+i')},
 {name:'native complex extreme positive exponent',formula:'COMPLEX(1e100,1)',expected:s('1E+100+i')},
);
for (const [fn, re, im] of [
 ['IMCOS',Math.cos(1)*Math.cosh(2),-Math.sin(1)*Math.sinh(2)],
 ['IMSIN',Math.sin(1)*Math.cosh(2),Math.cos(1)*Math.sinh(2)],
 ['IMCOSH',Math.cosh(1)*Math.cos(2),Math.sinh(1)*Math.sin(2)],
 ['IMSINH',Math.sinh(1)*Math.cos(2),Math.cosh(1)*Math.sin(2)],
 ['IMEXP',Math.E*Math.cos(2),Math.E*Math.sin(2)],
 ['IMLN',Math.log(Math.sqrt(5)),Math.atan2(2,1)],
 ['IMLOG10',Math.log(Math.sqrt(5))/Math.LN10,Math.atan2(2,1)/Math.LN10],
 ['IMLOG2',Math.log(Math.sqrt(5))/Math.LN2,Math.atan2(2,1)/Math.LN2],
 ['IMSQRT',Math.sqrt((Math.sqrt(5)+1)/2),Math.sqrt((Math.sqrt(5)-1)/2)],
 ['IMTAN',Math.sin(2)/(Math.cos(2)+Math.cosh(4)),Math.sinh(4)/(Math.cos(2)+Math.cosh(4))],
 ['IMCOT',Math.sin(2)/(Math.cosh(4)-Math.cos(2)),-Math.sinh(4)/(Math.cosh(4)-Math.cos(2))],
] as [string,number,number][]) {
 add(`${fn} nonzero real`, `IMREAL(${fn}("1+2i"))`,n(re),1e-12);
 add(`${fn} nonzero imaginary`, `IMAGINARY(${fn}("1+2i"))`,n(im),1e-12);
}
for (const [fn,base] of [['IMSEC','IMCOS'],['IMCSC','IMSIN'],['IMSECH','IMCOSH'],['IMCSCH','IMSINH']]) {
 add(`${fn} reciprocal identity`, `IMABS(IMPRODUCT(${fn}("1+2i"),${base}("1+2i")))`,n(1),1e-12);
}
for (const [formula,expected] of [
 ['IMPOWER("i",2)',s('-1')],['IMPOWER("1+i",2)',s('2i')],['IMPOWER("1+i",-2)',s('-0.5i')],['IMSQRT(-4)',s('2i')],['IMABS(IMSQRT("-3-4i"))',n(Math.sqrt(5))],
 ['IMABS(IMPOWER("1+i",0.5))',n(2**0.25)],['IMABS(IMDIV("1e300+1e300i","1e300-1e300i"))',n(1)],
 ['BESSELJ(20,200)',n(7.705086185922218e-176)],['BESSELK(1,0)',n(0.42102443824070833)],['BESSELY(1,0)',n(0.08825696421567696)],
 ['CONVERT(1,"tsp","tbs")',n(1/3)],['CONVERT(1,"atm","Pa")',n(101325)],['CONVERT(1,"N","dyn")',n(100000)],['CONVERT(1,"Wh","J")',n(3600)],['CONVERT(1,"HP","W")',n(745.69987158227)],['CONVERT(1,"T","ga")',n(10000)],['CONVERT(1,"kn","m/s")',n(1852/3600)],['CONVERT(1,"day","sec")',n(86400)],
] as [string,FormulaScalarValue][]) add(`extended ${formula}`,formula,expected,1e-12);

// Mathematical reference grid computed independently with SciPy 1.x special functions.
cases.push({name:"numerical grid BESSELI(0.01,0)",formula:"BESSELI(0.01,0)",expected:n(1.0000250001562505),tolerance:2.000050000312501e-10});
cases.push({name:"numerical grid BESSELI(0.01,1)",formula:"BESSELI(0.01,1)",expected:n(0.005000062500260418),tolerance:1.0000125000520836e-12});
cases.push({name:"numerical grid BESSELI(0.01,5)",formula:"BESSELI(0.01,5)",expected:n(2.604177517380487e-14),tolerance:5.208355034760974e-24});
cases.push({name:"numerical grid BESSELI(0.01,20)",formula:"BESSELI(0.01,20)",expected:n(3.919909016180242e-65),tolerance:7.839818032360485e-75});
cases.push({name:"numerical grid BESSELI(0.5,0)",formula:"BESSELI(0.5,0)",expected:n(1.0634833707413236),tolerance:2.1269667414826474e-10});
cases.push({name:"numerical grid BESSELI(0.5,1)",formula:"BESSELI(0.5,1)",expected:n(0.25789430539089636),tolerance:5.1578861078179276e-11});
cases.push({name:"numerical grid BESSELI(0.5,5)",formula:"BESSELI(0.5,5)",expected:n(8.223171313109265e-06),tolerance:1.644634262621853e-15});
cases.push({name:"numerical grid BESSELI(0.5,20)",formula:"BESSELI(0.5,20)",expected:n(3.7494538480790186e-31),tolerance:7.498907696158037e-41});
cases.push({name:"numerical grid BESSELI(5,0)",formula:"BESSELI(5,0)",expected:n(27.239871823604453),tolerance:5.447974364720891e-09});
cases.push({name:"numerical grid BESSELI(5,1)",formula:"BESSELI(5,1)",expected:n(24.33564214245053),tolerance:4.8671284284901064e-09});
cases.push({name:"numerical grid BESSELI(5,5)",formula:"BESSELI(5,5)",expected:n(2.1579745473225467),tolerance:4.3159490946450934e-10});
cases.push({name:"numerical grid BESSELI(5,20)",formula:"BESSELI(5,20)",expected:n(5.024239357971805e-11),tolerance:1.004847871594361e-20});
cases.push({name:"numerical grid BESSELI(12,0)",formula:"BESSELI(12,0)",expected:n(18948.925349296303),tolerance:3.7897850698592608e-06});
cases.push({name:"numerical grid BESSELI(12,1)",formula:"BESSELI(12,1)",expected:n(18141.348781638833),tolerance:3.6282697563277666e-06});
cases.push({name:"numerical grid BESSELI(12,5)",formula:"BESSELI(12,5)",expected:n(6493.612576603806),tolerance:1.2987225153207612e-06});
cases.push({name:"numerical grid BESSELI(12,20)",formula:"BESSELI(12,20)",expected:n(0.007851342737189774),tolerance:1.5702685474379548e-12});
cases.push({name:"numerical grid BESSELI(20,0)",formula:"BESSELI(20,0)",expected:n(43558282.559553534),tolerance:0.008711656511910706});
cases.push({name:"numerical grid BESSELI(20,1)",formula:"BESSELI(20,1)",expected:n(42454973.38512777),tolerance:0.008490994677025554});
cases.push({name:"numerical grid BESSELI(20,5)",formula:"BESSELI(20,5)",expected:n(23018392.213413667),tolerance:0.004603678442682733});
cases.push({name:"numerical grid BESSELI(20,20)",formula:"BESSELI(20,20)",expected:n(3188.750328853613),tolerance:6.377500657707227e-07});
cases.push({name:"numerical grid BESSELI(32,0)",formula:"BESSELI(32,0)",expected:n(5590908381350.874),tolerance:1118.1816762701749});
cases.push({name:"numerical grid BESSELI(32,1)",formula:"BESSELI(32,1)",expected:n(5502845511211.251),tolerance:1100.5691022422502});
cases.push({name:"numerical grid BESSELI(32,5)",formula:"BESSELI(32,5)",expected:n(3762429666628.3145),tolerance:752.4859333256629});
cases.push({name:"numerical grid BESSELI(32,20)",formula:"BESSELI(32,20)",expected:n(11908924541.02592),tolerance:2.381784908205184});
cases.push({name:"numerical grid BESSELI(100,0)",formula:"BESSELI(100,0)",expected:n(1.0737517071310736e+42),tolerance:2.1475034142621472e+32});
cases.push({name:"numerical grid BESSELI(100,1)",formula:"BESSELI(100,1)",expected:n(1.0683693903381619e+42),tolerance:2.1367387806763238e+32});
cases.push({name:"numerical grid BESSELI(100,5)",formula:"BESSELI(100,5)",expected:n(9.470093873035585e+41),tolerance:1.894018774607117e+32});
cases.push({name:"numerical grid BESSELI(100,20)",formula:"BESSELI(100,20)",expected:n(1.4483461256427174e+41),tolerance:2.896692251285435e+31});
cases.push({name:"numerical grid BESSELJ(0.01,0)",formula:"BESSELJ(0.01,0)",expected:n(0.9999750001562495),tolerance:1.9999500003124992e-10});
cases.push({name:"numerical grid BESSELJ(0.01,1)",formula:"BESSELJ(0.01,1)",expected:n(0.0049999375002604185),tolerance:9.999875000520837e-13});
cases.push({name:"numerical grid BESSELJ(0.01,5)",formula:"BESSELJ(0.01,5)",expected:n(2.6041558159916036e-14),tolerance:5.208311631983207e-24});
cases.push({name:"numerical grid BESSELJ(0.01,20)",formula:"BESSELJ(0.01,20)",expected:n(3.919899683074604e-65),tolerance:7.839799366149208e-75});
cases.push({name:"numerical grid BESSELJ(0.5,0)",formula:"BESSELJ(0.5,0)",expected:n(0.938469807240813),tolerance:1.876939614481626e-10});
cases.push({name:"numerical grid BESSELJ(0.5,1)",formula:"BESSELJ(0.5,1)",expected:n(0.2422684576748739),tolerance:4.845369153497478e-11});
cases.push({name:"numerical grid BESSELJ(0.5,5)",formula:"BESSELJ(0.5,5)",expected:n(8.053627241357477e-06),tolerance:1.6107254482714954e-15});
cases.push({name:"numerical grid BESSELJ(0.5,20)",formula:"BESSELJ(0.5,20)",expected:n(3.7272019617047014e-31),tolerance:7.454403923409403e-41});
cases.push({name:"numerical grid BESSELJ(5,0)",formula:"BESSELJ(5,0)",expected:n(-0.17759677131433835),tolerance:3.551935426286767e-11});
cases.push({name:"numerical grid BESSELJ(5,1)",formula:"BESSELJ(5,1)",expected:n(-0.3275791375914652),tolerance:6.551582751829304e-11});
cases.push({name:"numerical grid BESSELJ(5,5)",formula:"BESSELJ(5,5)",expected:n(0.26114054612017007),tolerance:5.2228109224034015e-11});
cases.push({name:"numerical grid BESSELJ(5,20)",formula:"BESSELJ(5,20)",expected:n(2.7703300521289436e-11),tolerance:5.540660104257888e-21});
cases.push({name:"numerical grid BESSELJ(12,0)",formula:"BESSELJ(12,0)",expected:n(0.04768931079683349),tolerance:9.537862159366698e-12});
cases.push({name:"numerical grid BESSELJ(12,1)",formula:"BESSELJ(12,1)",expected:n(-0.22344710449062757),tolerance:4.468942089812552e-11});
cases.push({name:"numerical grid BESSELJ(12,5)",formula:"BESSELJ(12,5)",expected:n(-0.0734709631016586),tolerance:1.469419262033172e-11});
cases.push({name:"numerical grid BESSELJ(12,20)",formula:"BESSELJ(12,20)",expected:n(0.0002512132702453996),tolerance:5.024265404907992e-14});
cases.push({name:"numerical grid BESSELJ(20,0)",formula:"BESSELJ(20,0)",expected:n(0.16702466434058322),tolerance:3.340493286811664e-11});
cases.push({name:"numerical grid BESSELJ(20,1)",formula:"BESSELJ(20,1)",expected:n(0.06683312417584993),tolerance:1.3366624835169986e-11});
cases.push({name:"numerical grid BESSELJ(20,5)",formula:"BESSELJ(20,5)",expected:n(0.15116976798239493),tolerance:3.0233953596478986e-11});
cases.push({name:"numerical grid BESSELJ(20,20)",formula:"BESSELJ(20,20)",expected:n(0.1647477737753266),tolerance:3.294955475506532e-11});
cases.push({name:"numerical grid BESSELJ(32,0)",formula:"BESSELJ(32,0)",expected:n(0.13807900974655593),tolerance:2.7615801949311187e-11});
cases.push({name:"numerical grid BESSELJ(32,1)",formula:"BESSELJ(32,1)",expected:n(-0.026589028475905274),tolerance:5.317805695181055e-12});
cases.push({name:"numerical grid BESSELJ(32,5)",formula:"BESSELJ(32,5)",expected:n(0.026241347352986173),tolerance:5.248269470597235e-12});
cases.push({name:"numerical grid BESSELJ(32,20)",formula:"BESSELJ(32,20)",expected:n(0.15952191183675965),tolerance:3.190438236735193e-11});
cases.push({name:"numerical grid BESSELJ(100,0)",formula:"BESSELJ(100,0)",expected:n(0.01998585030422312),tolerance:3.9971700608446234e-12});
cases.push({name:"numerical grid BESSELJ(100,1)",formula:"BESSELJ(100,1)",expected:n(-0.07714535201411214),tolerance:1.542907040282243e-11});
cases.push({name:"numerical grid BESSELJ(100,5)",formula:"BESSELJ(100,5)",expected:n(-0.07419573696451391),tolerance:1.4839147392902783e-11});
cases.push({name:"numerical grid BESSELJ(100,20)",formula:"BESSELJ(100,20)",expected:n(0.06221745849833954),tolerance:1.2443491699667908e-11});
cases.push({name:"numerical grid BESSELK(0.01,0)",formula:"BESSELK(0.01,0)",expected:n(4.721244730161095),tolerance:9.44248946032219e-10});
cases.push({name:"numerical grid BESSELK(0.01,1)",formula:"BESSELK(0.01,1)",expected:n(99.97389411829624),tolerance:1.999477882365925e-08});
cases.push({name:"numerical grid BESSELK(0.01,5)",formula:"BESSELK(0.01,5)",expected:n(3839976000100.0),tolerance:767.9952000200001});
cases.push({name:"numerical grid BESSELK(0.01,20)",formula:"BESSELK(0.01,20)",expected:n(6.3776982486011335e+62),tolerance:1.2755396497202268e+53});
cases.push({name:"numerical grid BESSELK(0.5,0)",formula:"BESSELK(0.5,0)",expected:n(0.9244190712276656),tolerance:1.8488381424553314e-10});
cases.push({name:"numerical grid BESSELK(0.5,1)",formula:"BESSELK(0.5,1)",expected:n(1.6564411200033007),tolerance:3.3128822400066015e-10});
cases.push({name:"numerical grid BESSELK(0.5,5)",formula:"BESSELK(0.5,5)",expected:n(12097.979476096392),tolerance:2.4195958952192788e-06});
cases.push({name:"numerical grid BESSELK(0.5,20)",formula:"BESSELK(0.5,20)",expected:n(6.665549874417158e+28),tolerance:1.3331099748834316e+19});
cases.push({name:"numerical grid BESSELK(5,0)",formula:"BESSELK(5,0)",expected:n(0.0036910983340425934),tolerance:7.382196668085187e-13});
cases.push({name:"numerical grid BESSELK(5,1)",formula:"BESSELK(5,1)",expected:n(0.004044613445452163),tolerance:8.089226890904326e-13});
cases.push({name:"numerical grid BESSELK(5,5)",formula:"BESSELK(5,5)",expected:n(0.03270627371203186),tolerance:6.541254742406372e-12});
cases.push({name:"numerical grid BESSELK(5,20)",formula:"BESSELK(5,20)",expected:n(482700052.0621488),tolerance:0.09654001041242977});
cases.push({name:"numerical grid BESSELK(12,0)",formula:"BESSELK(12,0)",expected:n(2.200825397311492e-06),tolerance:4.401650794622984e-16});
cases.push({name:"numerical grid BESSELK(12,1)",formula:"BESSELK(12,1)",expected:n(2.2907574647671883e-06),tolerance:4.581514929534376e-16});
cases.push({name:"numerical grid BESSELK(12,5)",formula:"BESSELK(12,5)",expected:n(5.9239191842518325e-06),tolerance:1.1847838368503665e-15});
cases.push({name:"numerical grid BESSELK(12,20)",formula:"BESSELK(12,20)",expected:n(2.7299583384223722),tolerance:5.459916676844744e-10});
cases.push({name:"numerical grid BESSELK(20,0)",formula:"BESSELK(20,0)",expected:n(5.741237815336523e-10),tolerance:1.1482475630673047e-19});
cases.push({name:"numerical grid BESSELK(20,1)",formula:"BESSELK(20,1)",expected:n(5.883057969557036e-10),tolerance:1.1766115939114073e-19});
cases.push({name:"numerical grid BESSELK(20,5)",formula:"BESSELK(20,5)",expected:n(1.053866013997423e-09),tolerance:2.107732027994846e-19});
cases.push({name:"numerical grid BESSELK(20,20)",formula:"BESSELK(20,20)",expected:n(5.543111636125819e-06),tolerance:1.1086223272251639e-15});
cases.push({name:"numerical grid BESSELK(32,0)",formula:"BESSELK(32,0)",expected:n(2.7950575187619784e-15),tolerance:5.590115037523957e-25});
cases.push({name:"numerical grid BESSELK(32,1)",formula:"BESSELK(32,1)",expected:n(2.838399271974669e-15),tolerance:5.676798543949338e-25});
cases.push({name:"numerical grid BESSELK(32,5)",formula:"BESSELK(32,5)",expected:n(4.103537533328515e-15),tolerance:8.20707506665703e-25});
cases.push({name:"numerical grid BESSELK(32,20)",formula:"BESSELK(32,20)",expected:n(1.1125802482893625e-12),tolerance:2.225160496578725e-22});
cases.push({name:"numerical grid BESSELK(100,0)",formula:"BESSELK(100,0)",expected:n(4.656628229175903e-45),tolerance:9.313256458351807e-55});
cases.push({name:"numerical grid BESSELK(100,1)",formula:"BESSELK(100,1)",expected:n(4.67985373563691e-45),tolerance:9.359707471273821e-55});
cases.push({name:"numerical grid BESSELK(100,5)",formula:"BESSELK(100,5)",expected:n(5.273256113292951e-45),tolerance:1.0546512226585903e-54});
cases.push({name:"numerical grid BESSELK(100,20)",formula:"BESSELK(100,20)",expected:n(3.3852054148901705e-44),tolerance:6.770410829780342e-54});
cases.push({name:"numerical grid BESSELY(0.01,0)",formula:"BESSELY(0.01,0)",expected:n(-3.0054556370836463),tolerance:6.010911274167293e-10});
cases.push({name:"numerical grid BESSELY(0.01,1)",formula:"BESSELY(0.01,1)",expected:n(-63.67859628206066),tolerance:1.2735719256412132e-08});
cases.push({name:"numerical grid BESSELY(0.01,5)",formula:"BESSELY(0.01,5)",expected:n(-2444635204829.7114),tolerance:488.9270409659423});
cases.push({name:"numerical grid BESSELY(0.01,20)",formula:"BESSELY(0.01,20)",expected:n(-4.0601794919223903e+62),tolerance:8.120358983844781e+52});
cases.push({name:"numerical grid BESSELY(0.5,0)",formula:"BESSELY(0.5,0)",expected:n(-0.44451873350670656),tolerance:8.890374670134132e-11});
cases.push({name:"numerical grid BESSELY(0.5,1)",formula:"BESSELY(0.5,1)",expected:n(-1.4714723926702433),tolerance:2.942944785340487e-10});
cases.push({name:"numerical grid BESSELY(0.5,5)",formula:"BESSELY(0.5,5)",expected:n(-7946.301478807475),tolerance:1.5892602957614952e-06});
cases.push({name:"numerical grid BESSELY(0.5,20)",formula:"BESSELY(0.5,20)",expected:n(-4.271430121565908e+28),tolerance:8.542860243131816e+18});
cases.push({name:"numerical grid BESSELY(5,0)",formula:"BESSELY(5,0)",expected:n(-0.3085176252490338),tolerance:6.170352504980676e-11});
cases.push({name:"numerical grid BESSELY(5,1)",formula:"BESSELY(5,1)",expected:n(0.14786314339122694),tolerance:2.957262867824539e-11});
cases.push({name:"numerical grid BESSELY(5,5)",formula:"BESSELY(5,5)",expected:n(-0.453694822491102),tolerance:9.07389644982204e-11});
cases.push({name:"numerical grid BESSELY(5,20)",formula:"BESSELY(5,20)",expected:n(-593396529.6914325),tolerance:0.1186793059382865});
cases.push({name:"numerical grid BESSELY(12,0)",formula:"BESSELY(12,0)",expected:n(-0.22523731263436148),tolerance:4.5047462526872294e-11});
cases.push({name:"numerical grid BESSELY(12,1)",formula:"BESSELY(12,1)",expected:n(-0.05709921826089654),tolerance:1.1419843652179309e-11});
cases.push({name:"numerical grid BESSELY(12,5)",formula:"BESSELY(12,5)",expected:n(-0.22981794662508248),tolerance:4.59635893250165e-11});
cases.push({name:"numerical grid BESSELY(12,20)",formula:"BESSELY(12,20)",expected:n(-79.34969740197062),tolerance:1.5869939480394123e-08});
cases.push({name:"numerical grid BESSELY(20,0)",formula:"BESSELY(20,0)",expected:n(0.06264059680938383),tolerance:1.2528119361876767e-11});
cases.push({name:"numerical grid BESSELY(20,1)",formula:"BESSELY(20,1)",expected:n(-0.16551161436252135),tolerance:3.310232287250427e-11});
cases.push({name:"numerical grid BESSELY(20,5)",formula:"BESSELY(20,5)",expected:n(-0.10003576788953245),tolerance:2.000715357790649e-11});
cases.push({name:"numerical grid BESSELY(20,20)",formula:"BESSELY(20,20)",expected:n(-0.28548945860020364),tolerance:5.709789172004073e-11});
cases.push({name:"numerical grid BESSELY(32,0)",formula:"BESSELY(32,0)",expected:n(-0.028742484654433312),tolerance:5.7484969308866626e-12});
cases.push({name:"numerical grid BESSELY(32,1)",formula:"BESSELY(32,1)",expected:n(-0.1385448315327238),tolerance:2.7708966306544758e-11});
// K0(x) approaches -log(x/2) - Euler's constant as x approaches zero.
cases.push({name:"besselk finite tiny positive input",formula:"BESSELK(1e-306,0)",expected:n(704.7069699718363),tolerance:1e-8});
cases.push({name:"besselk finite subnormal input",formula:"BESSELK(5e-324,0)",expected:n(744.5560034370395),tolerance:1e-8});
cases.push({name:"besselk finite near-overflow integral",formula:"BESSELK(3e-308,1)",expected:n(3.333333333333333e307),tolerance:3.4e295});
cases.push({name:"numerical grid BESSELY(32,5)",formula:"BESSELY(32,5)",expected:n(-0.13946415344761096),tolerance:2.7892830689522193e-11});
cases.push({name:"numerical grid BESSELY(32,20)",formula:"BESSELY(32,20)",expected:n(-0.0019371698216246785),tolerance:3.8743396432493573e-13});
cases.push({name:"numerical grid BESSELY(100,0)",formula:"BESSELY(100,0)",expected:n(-0.07724431336508318),tolerance:1.5448862673016637e-11});
cases.push({name:"numerical grid BESSELY(100,1)",formula:"BESSELY(100,1)",expected:n(-0.02037231200275981),tolerance:4.074462400551962e-12});
cases.push({name:"numerical grid BESSELY(100,5)",formula:"BESSELY(100,5)",expected:n(-0.029480196281661913),tolerance:5.8960392563323826e-12});
cases.push({name:"numerical grid BESSELY(100,20)",formula:"BESSELY(100,20)",expected:n(0.05124797307618843),tolerance:1.0249594615237687e-11});
