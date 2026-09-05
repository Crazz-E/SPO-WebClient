import { waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { HtmlMailBody, handleMailBodyClick } from './HtmlMailBody';

describe('handleMailBodyClick', () => {
  function anchorEvent(target: Element) {
    return { target, preventDefault: jest.fn() };
  }

  it('a SELECT anchor prevents default and navigates to its tile', () => {
    const a = document.createElement('a');
    a.href = 'http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34';
    const ev = anchorEvent(a);
    const navigate = jest.fn();

    handleMailBodyClick(ev, navigate);

    expect(ev.preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(12, 34);
  });

  it('a click on an element nested inside the anchor still resolves to it', () => {
    const a = document.createElement('a');
    a.href = 'http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34';
    const b = document.createElement('b');
    a.appendChild(b);
    const ev = anchorEvent(b);
    const navigate = jest.fn();

    handleMailBodyClick(ev, navigate);

    expect(ev.preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(12, 34);
  });

  it('any other link is prevented but never navigated', () => {
    const a = document.createElement('a');
    a.href = 'http://example.com';
    const ev = anchorEvent(a);
    const navigate = jest.fn();

    handleMailBodyClick(ev, navigate);

    expect(ev.preventDefault).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a malformed local.asp URL is prevented but ignored, not thrown', () => {
    const a = document.createElement('a');
    a.href = 'http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=abc';
    const ev = anchorEvent(a);
    const navigate = jest.fn();

    expect(() => handleMailBodyClick(ev, navigate)).not.toThrow();
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a click with no anchor ancestor does nothing', () => {
    const span = document.createElement('span');
    const ev = anchorEvent(span);
    const navigate = jest.fn();

    handleMailBodyClick(ev, navigate);

    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('HtmlMailBody', () => {
  it('intercepts a click on a translated building link and navigates there', async () => {
    const onNavigateToBuilding = jest.fn();
    const body = [
      '<HTML><BODY><a href="http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34">Town Hall</a></BODY></HTML>',
    ];

    renderWithProviders(<HtmlMailBody body={body} />, {
      clientCallbacks: createSpiedCallbacks({ onNavigateToBuilding }),
    });

    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(iframe).toHaveAttribute('srcdoc');

    // The jsdom build jest's component project pins does not parse `srcdoc` navigation
    // content (proven live: `contentDocument.body` stays empty even after `load` fires) —
    // a jsdom-version gap between the harness and the plain `jsdom` package used by this
    // plan's own check command. Writing the same markup into the frame's document directly
    // is the standard jsdom workaround and still exercises the real `attachLinkHandler` /
    // `handleMailBodyClick` wiring end to end: `onLoad` re-reads `contentDocument` fresh.
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(body.join('\n'));
    doc.close();
    fireEvent.load(iframe);

    await waitFor(() => {
      expect(iframe.contentDocument?.querySelector('a')).toBeTruthy();
    });

    const anchor = iframe.contentDocument!.querySelector('a')!;
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onNavigateToBuilding).toHaveBeenCalledWith(12, 34);
  });

  it('a META REFRESH body renders the src iframe, sandboxed, with no srcdoc', () => {
    const body = ['<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://example.com/page">'];

    renderWithProviders(<HtmlMailBody body={body} />);

    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(iframe).toHaveAttribute('src', 'http://example.com/page');
    expect(iframe).not.toHaveAttribute('srcdoc');
  });
});
