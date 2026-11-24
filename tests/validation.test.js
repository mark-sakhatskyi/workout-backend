const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validDate, dateFilter } = require('../middleware/validation');
test('calendar dates are validated, not normalized', () => {
    assert.equal(validDate('2024-02-29'), true);
    assert.equal(validDate('2026-02-29'), false);
    assert.equal(validDate({ $ne: null }), false);
});
test('range validation supports either boundary and rejects reversed dates', () => {
    assert.deepEqual(dateFilter({ startDate: '2026-01-01' }), { date: { $gte: '2026-01-01' } });
    assert.throws(() => dateFilter({ startDate: '2026-02-01', endDate: '2026-01-01' }));
});
