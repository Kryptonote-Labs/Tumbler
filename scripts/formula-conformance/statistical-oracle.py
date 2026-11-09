"""Rebuild independent statistical expectations with SciPy. No Tumbler code runs here.
Run in a disposable Python environment with scipy installed. ETS cases use an
analytically exact linear series; they do not assert Excel optimizer parity.
"""
from pathlib import Path
import json
import numpy as np
from scipy import stats, special

x=np.array([1.,2.,3.,4.,5.]); y=np.array([2.,4.,5.,4.,5.])
A='Inputs!A1:A5'; B='Inputs!B1:B5'
cells={f'{col}{i+1}':{'type':'number','value':float(value)} for col,seq in [('A',x),('B',y),('C',[1,1,2,2,2]),('D',[.1,.2,.3,.2,.2])] for i,value in enumerate(seq)}
cases=[]
def add(name, formula, expected, **kw):
 def value(x):return {'type':'number','value':float(x)}
 cases.append(dict(name=name,formula=formula,expected=[[value(v) for v in row] for row in expected] if isinstance(expected,list) else value(expected),**kw))
for name,result in {'AVEDEV':np.mean(abs(y-y.mean())),'AVERAGE':y.mean(),'AVERAGEA':y.mean(),'COUNT':5,'COUNTA':5,'COUNTBLANK':0,'DEVSQ':sum((y-y.mean())**2),'GEOMEAN':stats.gmean(y),'HARMEAN':stats.hmean(y),'KURT':stats.kurtosis(y,bias=False),'MAX':max(y),'MAXA':max(y),'MEDIAN':np.median(y),'MIN':min(y),'MINA':min(y),'SKEW':stats.skew(y,bias=False),'SKEW.P':stats.skew(y,bias=True),'STDEV.S':y.std(ddof=1),'STDEV.P':y.std(),'STDEVA':y.std(ddof=1),'STDEVPA':y.std(),'VAR.S':y.var(ddof=1),'VAR.P':y.var(),'VARA':y.var(ddof=1),'VARPA':y.var()}.items():add(name,f'{name}({B})',result)
for name,result in {'AVERAGEIF':np.mean(y[y>3]),'COUNTIF':sum(y>3)}.items():add(name,f'{name}({B},">3")',result)
add('AVERAGEIFS',f'AVERAGEIFS({B},{A},">2",{B},"<5")',4)
add('COUNTIFS',f'COUNTIFS({A},">2",{B},"<5")',1)
add('MAXIFS',f'MAXIFS({B},{A},"<3")',4);add('MINIFS',f'MINIFS({B},{A},">2")',4)
for name in ['CORREL','PEARSON','RSQ','COVARIANCE.P','COVARIANCE.S','SLOPE','INTERCEPT','STEYX']:
 r=stats.linregress(x,y)
 result={'CORREL':r.rvalue,'PEARSON':r.rvalue,'RSQ':r.rvalue**2,'COVARIANCE.P':np.cov(x,y,ddof=0)[0,1],'COVARIANCE.S':np.cov(x,y,ddof=1)[0,1],'SLOPE':r.slope,'INTERCEPT':r.intercept,'STEYX':np.sqrt(sum((y-(r.intercept+r.slope*x))**2)/3)}[name]
 add(name,f'{name}({B},{A})',result)
for name in ['FORECAST','FORECAST.LINEAR']:add(name,f'{name}(6,{B},{A})',r.intercept+r.slope*6)
add('LINEST',f'LINEST({B},{A})',[[r.slope,r.intercept]])
add('TREND',f'TREND({B},{A},{{6;7}})',[[r.intercept+r.slope*6],[r.intercept+r.slope*7]])
lr=stats.linregress(x,np.log(y))
add('LOGEST',f'LOGEST({B},{A})',[[np.exp(lr.slope),np.exp(lr.intercept)]])
add('GROWTH',f'GROWTH({B},{A},{{6;7}})',[[np.exp(lr.intercept+lr.slope*6)],[np.exp(lr.intercept+lr.slope*7)]])
add('FREQUENCY',f'FREQUENCY({B},{{3;4}})',[[1],[2],[2]])
add('MODE.MULT',f'MODE.MULT({B})',[[4],[5]])
add('MODE.SNGL',f'MODE.SNGL({B})',4)
for name,k,expected in [('LARGE',2,5),('SMALL',2,4),('RANK.AVG',4,3.5),('RANK.EQ',4,3)]:
 add(name,f'{name}(4,{B})' if name.startswith('RANK') else f'{name}({B},{k})',expected)
for name in ['PERCENTILE.INC','PERCENTILE.EXC','QUARTILE.INC','QUARTILE.EXC']:
 p=.25 if name.startswith('PERCENTILE') else 1
 result=np.quantile(y,.25,method='weibull' if name.endswith('EXC') else 'linear')
 add(name,f'{name}({B},{p})',result)
add('PERCENTRANK.INC',f'PERCENTRANK.INC({A},2.5,3)',.375);add('PERCENTRANK.EXC',f'PERCENTRANK.EXC({A},2.5,3)',.416)
add('PROB',f'PROB({A},Inputs!D1:D5,2,4)',.7)
add('TRIMMEAN',f'TRIMMEAN({B},0.4)',13/3)
add('FISHER','FISHER(0.6)',np.arctanh(.6));add('FISHERINV','FISHERINV(0.7)',np.tanh(.7))
add('STANDARDIZE','STANDARDIZE(42,40,3)',2/3)
add('PERMUT','PERMUT(7,3)',210);add('PERMUTATIONA','PERMUTATIONA(7,3)',343)
add('BETA.DIST','BETA.DIST(0.4,2,3,TRUE)',stats.beta.cdf(.4,2,3));add('BETA.INV','BETA.INV(0.7,2,3)',stats.beta.ppf(.7,2,3))
add('BINOM.DIST','BINOM.DIST(3,10,0.4,FALSE)',stats.binom.pmf(3,10,.4));add('BINOM.DIST.RANGE','BINOM.DIST.RANGE(10,0.4,2,4)',sum(stats.binom.pmf(np.arange(2,5),10,.4)));add('BINOM.INV','BINOM.INV(10,0.4,0.7)',stats.binom.ppf(.7,10,.4))
for name,result in {'CHISQ.DIST':stats.chi2.cdf(4,5),'CHISQ.DIST.RT':stats.chi2.sf(4,5),'CHISQ.INV':stats.chi2.ppf(.7,5),'CHISQ.INV.RT':stats.chi2.isf(.7,5)}.items():add(name,f'{name}({"0.7" if "INV" in name else "4"},5'+(',TRUE)' if name=='CHISQ.DIST' else ')'),result)
add('CHISQ.TEST','CHISQ.TEST({10,20;30,40},{12,18;28,42})',stats.chi2.sf(sum((a-b)**2/b for a,b in zip([10,20,30,40],[12,18,28,42])),1))
add('CONFIDENCE.NORM','CONFIDENCE.NORM(0.05,3,20)',stats.norm.isf(.025)*3/np.sqrt(20));add('CONFIDENCE.T','CONFIDENCE.T(0.05,3,20)',stats.t.isf(.025,19)*3/np.sqrt(20))
add('EXPON.DIST','EXPON.DIST(2,0.5,TRUE)',stats.expon.cdf(2,scale=2))
for name,result in {'F.DIST':stats.f.cdf(2,5,9),'F.DIST.RT':stats.f.sf(2,5,9),'F.INV':stats.f.ppf(.7,5,9),'F.INV.RT':stats.f.isf(.7,5,9)}.items():add(name,f'{name}({"0.7" if "INV" in name else "2"},5,9'+(',TRUE)' if name=='F.DIST' else ')'),result)
f=y.var(ddof=1)/x.var(ddof=1);add('F.TEST',f'F.TEST({B},{A})',2*min(stats.f.cdf(f,4,4),stats.f.sf(f,4,4)))
add('GAMMA','GAMMA(4.5)',special.gamma(4.5));add('GAMMA.DIST','GAMMA.DIST(2,3,2,TRUE)',stats.gamma.cdf(2,3,scale=2));add('GAMMA.INV','GAMMA.INV(0.7,3,2)',stats.gamma.ppf(.7,3,scale=2))
for name in ['GAMMALN','GAMMALN.PRECISE']:add(name,f'{name}(4.5)',special.gammaln(4.5))
add('GAUSS','GAUSS(0.7)',stats.norm.cdf(.7)-.5)
add('HYPGEOM.DIST','HYPGEOM.DIST(2,5,8,20,TRUE)',stats.hypergeom.cdf(2,20,8,5))
add('LOGNORM.DIST','LOGNORM.DIST(3,0.5,1.2,TRUE)',stats.lognorm.cdf(3,1.2,scale=np.exp(.5)));add('LOGNORM.INV','LOGNORM.INV(0.7,0.5,1.2)',stats.lognorm.ppf(.7,1.2,scale=np.exp(.5)))
add('NEGBINOM.DIST','NEGBINOM.DIST(3,5,0.4,TRUE)',stats.nbinom.cdf(3,5,.4))
add('NORM.DIST','NORM.DIST(2,1,3,TRUE)',stats.norm.cdf(2,loc=1,scale=3));add('NORM.INV','NORM.INV(0.7,1,3)',stats.norm.ppf(.7,loc=1,scale=3))
add('NORM.S.DIST','NORM.S.DIST(0.7,TRUE)',stats.norm.cdf(.7));add('NORM.S.INV','NORM.S.INV(0.7)',stats.norm.ppf(.7))
add('PHI','PHI(0.7)',stats.norm.pdf(.7));add('POISSON.DIST','POISSON.DIST(3,2,TRUE)',stats.poisson.cdf(3,2))
add('T.DIST','T.DIST(1.5,9,TRUE)',stats.t.cdf(1.5,9));add('T.DIST.RT','T.DIST.RT(1.5,9)',stats.t.sf(1.5,9));add('T.DIST.2T','T.DIST.2T(1.5,9)',2*stats.t.sf(1.5,9));add('T.INV','T.INV(0.7,9)',stats.t.ppf(.7,9));add('T.INV.2T','T.INV.2T(0.05,9)',stats.t.isf(.025,9))
add('T.TEST',f'T.TEST({B},{A},2,3)',stats.ttest_ind(y,x,equal_var=False).pvalue)
add('WEIBULL.DIST','WEIBULL.DIST(2,3,4,TRUE)',stats.weibull_min.cdf(2,3,scale=4));add('Z.TEST',f'Z.TEST({B},3)',stats.norm.sf((y.mean()-3)/(y.std(ddof=1)/np.sqrt(5))))
add('FORECAST.ETS','FORECAST.ETS(6,{2;4;6;8;10},{1;2;3;4;5},0)',12)
add('FORECAST.ETS.CONFINT','FORECAST.ETS.CONFINT(6,{2;4;6;8;10},{1;2;3;4;5},0.95,0)',0,tolerance=1e-10)
add('FORECAST.ETS.SEASONALITY','FORECAST.ETS.SEASONALITY({2;4;6;8;10},{1;2;3;4;5})',1)
add('FORECAST.ETS.STAT','FORECAST.ETS.STAT({2;4;6;8;10},{1;2;3;4;5},8,0)',1)
cases.sort(key=lambda x:x['name'])
root=Path(__file__).resolve().parents[2]
(root/'packages/formulas/test/fixtures/statistical.ts').write_text('import type { FormulaFixtureCase } from "../../../../scripts/formula-conformance/corpus.ts";\n\n// Expectations generated independently by statistical-oracle.py (SciPy).\nconst inputs = '+json.dumps(cells)+' as const;\nconst fixtures: readonly FormulaFixtureCase[] = [\n'+",\n".join("  "+json.dumps(case) for case in cases)+'\n];\nexport const cases: readonly FormulaFixtureCase[] = fixtures.map(fixture => ({ ...fixture, cells: inputs }));\n')
print(f'{len(cases)} statistical functions')
