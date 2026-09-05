/**
 * HtmlMailBody — renders HTML mail content in a sandboxed iframe.
 *
 * System notifications from the game server arrive as HTML, often with
 * META REFRESH redirects to dynamic ASP pages on the World Web Server.
 *
 * Trust boundary (issue #515): the frame carries **no `allow-scripts`**, so nothing inside
 * it ever executes and it cannot reach the parent; `allow-same-origin` only lets the parent
 * *read* the frame's DOM — forms and top-level navigation stay refused by the sandbox
 * regardless. Every anchor click is cancelled by `handleMailBodyClick` below, so the frame
 * never navigates anywhere, including to itself. The markup rendered here is world-server
 * authored (`MsgZoned.asp` and its siblings under `SpecialMessages/`), fetched by the gateway
 * only from the current world's own IP and stripped of `<script>`/inline handlers by
 * `prepareInlinedMailPage` on the way in — the opposite decision from
 * `src/server/session/newspaper-handler.ts:14-18`, which drops tags outright because those
 * bodies are player-authored and this client has no sanitiser for arbitrary HTML.
 */

import { useCallback, type SyntheticEvent } from 'react';
import { extractMetaRefreshUrl } from '@/shared/mail-html-utils';
import { translateLocalAspUrl } from '@/shared/local-asp-url';
import { useClient } from '../../context';
import styles from './MailPanel.module.css';

interface HtmlMailBodyProps {
  body: string[];
}

/**
 * Every anchor in a mail body is inert; a Voyager map link (`local.asp?frame_Id=MapIsoView&
 * frame_Action=SELECT&x=..&y=..`) becomes the app's own go-to-building navigation instead.
 */
export function handleMailBodyClick(
  event: { target: EventTarget | null; preventDefault(): void },
  navigate: (x: number, y: number) => void,
): void {
  // Elements inside the frame belong to the iframe's own realm — `instanceof Element`
  // against the parent's `Element` is false there in a real browser, so duck-type instead.
  const anchor = (event.target as { closest?: (s: string) => Element | null } | null)?.closest?.('a[href]');
  if (!anchor) return;

  event.preventDefault();
  const translated = translateLocalAspUrl(anchor.getAttribute('href') ?? '');
  if (translated) navigate(translated.x, translated.y);
}

export function HtmlMailBody({ body }: HtmlMailBodyProps) {
  const client = useClient();
  const html = body.join('\n');
  const redirectUrl = extractMetaRefreshUrl(html);

  const attachLinkHandler = useCallback((e: SyntheticEvent<HTMLIFrameElement>) => {
    const doc = e.currentTarget.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', ev => handleMailBodyClick(ev, (x, y) => client.onNavigateToBuilding(x, y)));
  }, [client]);

  // META REFRESH → load the game server page directly in an iframe. Reached only when the
  // gateway could not inline the page itself (fetch failed, or the redirect points somewhere
  // other than the current world's own server).
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

  // Static HTML (including a page the gateway already inlined) → render with srcdoc in a
  // sandboxed, same-origin-readable iframe, and intercept its links on every load — a fresh
  // document each time, so no listener accumulates.
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
