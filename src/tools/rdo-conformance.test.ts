// The entry point only wires the CLI to the run; importing it must have no effect.
it('rdo-conformance entry point loads without running anything', () => {
  const exit = process.exitCode;
  expect(() => require('./rdo-conformance')).not.toThrow();
  expect(process.exitCode).toBe(exit);
});
