import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BarChart, Bar, XAxis, YAxis } from 'recharts';
import { toRegRefChartData } from '../../utils/regRefChartData';

const topRegRefs = [
  { ref: '§145.211', count: 3 },
  { ref: '§43.9', count: 1 },
];

describe('Top Regulation References chart data', () => {
  it('drops the `ref` field so Recharts cannot turn it into a React ref', () => {
    const data = toRegRefChartData(topRegRefs);
    expect(data).toEqual([
      { regulation: '§145.211', count: 3 },
      { regulation: '§43.9', count: 1 },
    ]);
    expect(data.every((row) => !('ref' in row))).toBe(true);
    expect(toRegRefChartData(undefined)).toEqual([]);
  });

  it('renders the bars without crashing', () => {
    const { container } = render(
      <BarChart width={400} height={200} layout="vertical" data={toRegRefChartData(topRegRefs)}>
        <XAxis type="number" />
        <YAxis type="category" dataKey="regulation" />
        <Bar dataKey="count" isAnimationActive={false} />
      </BarChart>
    );
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBe(2);
  });
});
