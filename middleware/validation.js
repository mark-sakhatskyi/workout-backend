const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const dateFilter = query => {
    const { startDate, endDate } = query;
    if ((startDate !== undefined && !validDate(startDate)) || (endDate !== undefined && !validDate(endDate)) || (startDate && endDate && startDate > endDate)) throw Object.assign(new Error('Invalid date range'), { status: 400 });
    const range = {};
    if (startDate) range.$gte = startDate;
    if (endDate) range.$lte = endDate;
    return Object.keys(range).length ? { date: range } : {};
};
const fail = (res, err) => {
    const invalid = err.status === 400 || ['ValidationError','CastError'].includes(err.name);
    return res.status(invalid ? 400 : err.code === 11000 ? 409 : 500).json({ message: invalid ? 'Invalid data' : err.code === 11000 ? 'Duplicate record' : 'Internal server error' });
};
module.exports = { validDate, dateFilter, fail };
