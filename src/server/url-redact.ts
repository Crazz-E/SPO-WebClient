/**
 * Credential redaction for logged URLs.
 *
 * The world's ASP pages authenticate by query string — `politics.asp`,
 * `boardreader.asp`, `tycooncampaign.asp` and their siblings all take
 * `Password=` in the URL, because that is what Voyager sends
 * (`Voyager/TownHallSheet.pas:320-352`). We cannot change that without changing
 * the server, but we can keep the secret out of our own logs.
 *
 * SEC-L-1: "Passwords MUST never be written to any log."
 *
 * The RDO wire has its own redaction (`redactSensitiveRdoFrame`,
 * `redactRdoRaw`); this is the HTTP half, which had none.
 */

/**
 * Query parameters whose value must never reach a log. Matched case-insensitively
 * because the ASP pages are inconsistent about casing.
 */
const SENSITIVE_PARAMS = ['password', 'passwd', 'pwd'];

const SENSITIVE_RE = new RegExp(
  `([?&](?:${SENSITIVE_PARAMS.join('|')})=)[^&#\\s]*`,
  'gi',
);

/**
 * Replace the value of every credential-bearing query parameter with `***`.
 *
 * Everything else — host, path, world name, tycoon name — is left intact, so the
 * log still identifies which request failed.
 *
 * Operates on the raw string rather than via `URL`, so a malformed or relative
 * URL is redacted rather than throwing, and the output stays byte-comparable to
 * the input for every non-sensitive character.
 */
export function redactUrlCredentials(url: string): string {
  return url.replace(SENSITIVE_RE, '$1***');
}
