export default {
  label: 'local npm package',
  double(value) { return value * 2; },
  sum(values) { return values.reduce((total, value) => total + value, 0); },
};
