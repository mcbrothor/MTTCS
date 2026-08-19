import assert from 'node:assert/strict';
import test from 'node:test';
import { readInvestorFlowRows } from '../lib/recommendations/investor-flow-read.ts';

function fakeClient(allRows) {
  const ranges = [];
  return {
    ranges,
    from() {
      const query = {
        select: () => query,
        gte: () => query,
        lte: () => query,
        order: () => query,
        range: async (from, to) => {
          ranges.push([from, to]);
          return { data: allRows.slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  };
}

test('investor-flow reader consumes every PostgREST page instead of keeping only the oldest page', async () => {
  const sourceRows = Array.from({ length: 12 }, (_, index) => ({ ticker: String(index), trade_date: `2026-08-${String(index + 1).padStart(2, '0')}` }));
  const client = fakeClient(sourceRows);
  const rows = await readInvestorFlowRows({ client, startDate: '2026-08-01', endDate: '2026-08-20', pageSize: 5 });
  assert.equal(rows.length, 12);
  assert.deepEqual(client.ranges, [[0, 4], [5, 9], [10, 14]]);
  assert.equal(rows.at(-1).trade_date, '2026-08-12');
});
