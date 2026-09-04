/**
 * The one sentence the NewTycoon pages render instead of their body when the
 * model server cannot bind the tycoon (`ObjValid = false`): eNewTycon.lng:7,15,
 * 41,82,97,142 — TycoonCurriculum.asp:419, TycoonBankAccount.asp:623,
 * TycoonProfitAndLoses.asp:232, TycoonAutoConnections.asp:327, TycoonPolicy.asp:483
 * (the last one also fires on FullAccess=false, :246 — indistinguishable on the page).
 */
const CACHE_UNAVAILABLE = /cannot retrieve Tycoon information from server/i;

export function isCacheUnavailablePage(html: string): boolean {
  return CACHE_UNAVAILABLE.test(html);
}
