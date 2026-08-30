/**
 * The DAAddr/DAPort pair every ASP page needs to open its own RDO connection to the
 * model server's lock channel. There is no usable fallback: config.rdo.ports.directory
 * names the Directory Server, which registers only tidRDOHook_DirectoryServer and cannot
 * serve those pages — so an unset pair refuses the call instead of substituting it.
 * daPort is null before the world-property sweep completes and after every session reset.
 */
export function requireDaParams(ctx: {
  readonly daAddr: string | null;
  readonly daPort: number | null;
}): { DAAddr: string; DAPort: string } {
  if (!ctx.daAddr || !ctx.daPort) {
    throw new Error('ASP call refused: DA lock channel not announced yet (daAddr/daPort unset)');
  }
  return { DAAddr: ctx.daAddr, DAPort: String(ctx.daPort) };
}
