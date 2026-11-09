// Recharts copies every data field whose name is a valid SVG prop onto the bar's
// <path>, and its allowlist includes `ref`. A string `ref` from the stats query
// becomes a React string ref there, which React 19 rejects (error #284) and the
// whole page falls over. Rename the field before it reaches the chart.
export function toRegRefChartData(topRegRefs: { ref: string; count: number }[] | undefined) {
  return (topRegRefs ?? []).map(({ ref, count }) => ({ regulation: ref, count }));
}
