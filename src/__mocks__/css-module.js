// Jest mock for CSS Modules — returns class names as-is
module.exports = new Proxy({}, {
  get: (_target, name) => name === '__esModule' ? false : String(name),
});
