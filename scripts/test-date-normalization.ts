import { normalizeImplicitPastDateRange } from '../src/agents/conversation-graph';

const referenceDate = new Date('2026-09-02T12:00:00Z');

const cases = [
  {
    name: 'moves an inferred past year to the next occurrence',
    actual: normalizeImplicitPastDateRange('2025-10-01', '2025-10-06', 'Tokyo in October', referenceDate),
    expected: { startDate: '2026-10-01', endDate: '2026-10-06' },
  },
  {
    name: 'preserves an explicitly requested past year',
    actual: normalizeImplicitPastDateRange('2025-10-01', '2025-10-06', 'Tokyo in October 2025', referenceDate),
    expected: { startDate: '2025-10-01', endDate: '2025-10-06' },
  },
  {
    name: 'preserves an inferred future date',
    actual: normalizeImplicitPastDateRange('2026-10-01', '2026-10-06', 'Tokyo in October', referenceDate),
    expected: { startDate: '2026-10-01', endDate: '2026-10-06' },
  },
];

for (const testCase of cases) {
  const actual = JSON.stringify(testCase.actual);
  const expected = JSON.stringify(testCase.expected);
  if (actual !== expected) {
    throw new Error(`${testCase.name}: expected ${expected}, received ${actual}`);
  }
  console.log(`PASS: ${testCase.name}`);
}
