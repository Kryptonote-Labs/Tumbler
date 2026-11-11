# Signed pie values

Pie, 3-D pie and doughnut slices use the magnitude of a cached value for their
angle. Labels retain the signed source value and show a positive share of the
magnitude total. Each doughnut ring normalizes independently. Native point
indices continue to select their original colours, formatting and custom labels.

Slice fractions normalize by the largest magnitude before summing. Finite
inputs whose total overflows a number therefore retain finite geometry. Label
fractions remain independent of angle rounding, and nonzero points keep their
identity even when their visible angle underflows to zero.

Split pies apply the same weighting to their composite slice and secondary
plot. Value splitting compares signed source values; percentage splitting uses
the magnitude fraction. Position splitting counts native category/cache slots,
including zero-valued points. A computed aggregate label still uses ordinary
numeric precision; normalizing geometry does not increase that precision.

## Native references

```sh
bun scripts/generate-chart-pie-value-fixtures.ts /tmp/chart-pie-values/input
bash scripts/validate-openxml.sh /tmp/chart-pie-values/input/*.docx /tmp/chart-pie-values/input/*.pptx /tmp/chart-pie-values/input/*.xlsx
```

All 15 Word, PowerPoint and Excel packages pass Open XML SDK validation.
LibreOffice 24.2.7.2 converts the representative pie, doughnut and bar-of-pie
PowerPoint files to PDF. The pie and doughnut references display `-4` with a
44% label for the cache `[-4, 3, 2]`. This agrees with the magnitude sizing in
[LibreOffice's pie renderer](https://github.com/LibreOffice/core/blob/master/chart2/source/view/charttypes/PieChart.cxx).

At 96 dpi, the largest pure-colour fill components have these measured shares:

| Plot | Component | Tumbler | LibreOffice |
| --- | --- | --- | --- |
| Pie | Red | 44.76% | 44.63% |
| Pie | Green | 33.27% | 33.37% |
| Pie | Blue | 21.98% | 22.00% |
| Doughnut | Red | 44.93% | 44.84% |
| Doughnut | Green | 33.14% | 33.32% |
| Doughnut | Blue | 21.92% | 21.84% |

The component measurement excludes separate legend swatches. Text and borders
remove coloured pixels, so these shares differ slightly from the exact slice
fractions. The largest difference between renderers is 0.19 percentage points;
this checks weighting and does not establish complete plot-layout pixel parity.

The installed LibreOffice imports split-pie samples as ordinary pies, including
explicit position splits. It does not validate the secondary plot's pixel
layout. Focused tests cover both split variants, custom negative points, split
criteria, zero slots and underflowing primary labels.
