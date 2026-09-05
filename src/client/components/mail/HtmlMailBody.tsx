/**
 * HtmlMailBody — renders HTML mail content in a sandboxed iframe.
 *
 * System notifications from the game server arrive as HTML, often with META REFRESH
 * redirects to dynamic ASP pages on the World Web Server. The gateway now inlines that page
 * (`server/session/mail-handler.ts`, `inlineWorldPage`) whenever it can, so this component
 * renders the fetched markup with `srcdoc` in a same-origin-readable sandbox and attaches a
 * click handler once the frame's document exists.
 *
 * Trust boundary: the srcdoc iframe carries `sandbox="allow-same-origin"` and nothing more —
 * there is no `allow-scripts`, so nothing inside it executes and it cannot reach the parent;
 * `allow-same-origin` only lets *this* document read the frame's DOM. Forms and top-level
 * navigation stay refused by the sandbox regardless. Every anchor click inside the frame is
 * cancelled by `handleMailBodyClick`, and the markup itself was already stripped of scripts
 * and inline handlers by `prepareInlinedMailPage` on the gateway. The inlined page is
 * world-server-authored (`MsgZoned.asp` and its kin) and fetched only from the world's own
 * IP — the opposite decision from `src/server/session/newspaper-handler.ts:14-18`, which
 * strips tags outright because those bodies are player-authored.
 *
 * The META-REFRESH branch below is the fallback: it is reached only when the gateway could
 * not inline the page (fetch failed, or the META REFRESH pointed at a host that is not the
 * world server) — that cross-origin frame cannot be read from here, so no click handler can
 * be attached to it.
 */

import { useCallback, type SyntheticEvent } from 'react';
import { extractMetaRefreshUrl } from '@/shared/mail-html-utils';
import { translateLocalAspUrl } from '@/shared/local-asp-url';
import { useClient } from '../../context/ClientContext';
import styles from './MailPanel.module.css';

interface HtmlMailBodyProps {
  body: string[];
}

interface MailAnchorClickEvent {
  target: EventTarget | null;
  preventDefault(): void;
}

/**
 * Every anchor in a mail body is inert; a Voyager map link becomes the app's own go-to.
 *
 * Duck-types the click target rather than using `instanceof Element`: elements inside the
 * frame belong to the iframe's realm, and an `instanceof` check against the parent's
 * `Element` is false there in a real browser.
 */
export function handleMailBodyClick(
  event: MailAnchorClickEvent,
  navigate: (x: number, y: number) => void,
): void {
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  const anchor = target?.closest?.('a[href]');
  if (!anchor) return;

  event.preventDefault();
  const translated = translateLocalAspUrl(anchor.getAttribute('href') ?? '');
  if (translated) navigate(translated.x, translated.y);
}

export function HtmlMailBody({ body }: HtmlMailBodyProps) {
  const client = useClient();
  const html = body.join('\n');
  const redirectUrl = extractMetaRefreshUrl(html);

  const attachLinkHandler = useCallback(
    (e: SyntheticEvent<HTMLIFrameElement>) => {
      const doc = e.currentTarget.contentDocument;
      if (!doc) return;
      doc.addEventListener('click', ev => handleMailBodyClick(ev, (x, y) => client.onNavigateToBuilding(x, y)));
    },
    [client],
  );

  // META REFRESH the gateway could not inline → load the game server page directly,
  // cross-origin, in an iframe this document cannot read into.
  if (redirectUrl) {
    return (
      <iframe
        className={styles.htmlBody}
        src={redirectUrl}
        sandbox="allow-same-origin"
        title="Mail content"
      />
    );
  }

  // Static HTML (including an inlined world page) → render with srcdoc, same-origin readable.
  return (
    <iframe
      className={styles.htmlBody}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={attachLinkHandler}
      title="Mail content"
    />
  );
}
