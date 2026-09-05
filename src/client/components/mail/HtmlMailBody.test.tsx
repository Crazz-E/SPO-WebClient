import { fireEvent } from '@testing-library/react';
import { HtmlMailBody, handleMailBodyClick } from './HtmlMailBody';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';

describe('handleMailBodyClick', () => {
  function anchorEvent(target: Element | null) {
    return {
      target,
      preventDefault: jest.fn(),
    };
  }

  it('translates a SELECT anchor and navigates', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34';
    const navigate = jest.fn();
    const event = anchorEvent(anchor);

    handleMailBodyClick(event, navigate);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(12, 34);
  });

  it('walks up from a nested element to its ancestor anchor', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=1&y=2';
    const bold = document.createElement('b');
    anchor.appendChild(bold);
    const navigate = jest.fn();

    handleMailBodyClick(anchorEvent(bold), navigate);

    expect(navigate).toHaveBeenCalledWith(1, 2);
  });

  it('cancels but does not navigate for an unrelated link', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://example.com';
    const navigate = jest.fn();
    const event = anchorEvent(anchor);

    handleMailBodyClick(event, navigate);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cancels but does not navigate or throw for a malformed local.asp URL', () => {
    const anchor = document.createElement('a');
    anchor.href = 'http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=abc';
    const navigate = jest.fn();
    const event = anchorEvent(anchor);

    expect(() => handleMailBodyClick(event, navigate)).not.toThrow();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing for a click with no anchor ancestor', () => {
    const span = document.createElement('span');
    const navigate = jest.fn();
    const event = anchorEvent(span);

    handleMailBodyClick(event, navigate);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('HtmlMailBody', () => {
  it('renders the SELECT anchor inline and navigates on click', () => {
    // jsdom does not implement `srcdoc` navigation (the frame's contentDocument never gets
    // populated from it — verified separately by this card's first check command, which
    // works around the same gap). A real browser parses `srcDoc` into the frame's document
    // before firing `load`; here the frame's document is filled in the same shape by hand,
    // then `load` is fired, to exercise exactly the handler this component wires to `onLoad`.
    const onNavigateToBuilding = jest.fn();
    const clientCallbacks = createSpiedCallbacks({ onNavigateToBuilding });

    const { container } = renderWithProviders(
      <HtmlMailBody
        body={[
          '<HTML><BODY><a href="http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34">Town Hall</a></BODY></HTML>',
        ]}
      />,
      { clientCallbacks },
    );

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(iframe).not.toHaveAttribute('src');
    expect(iframe.getAttribute('srcdoc')).toContain('local.asp');

    const doc = iframe.contentDocument;
    expect(doc).not.toBeNull();
    doc!.body.innerHTML =
      '<a href="http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=12&y=34">Town Hall</a>';
    fireEvent.load(iframe);

    const anchor = doc!.querySelector('a');
    expect(anchor).not.toBeNull();
    anchor!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onNavigateToBuilding).toHaveBeenCalledWith(12, 34);
  });

  it('renders a META REFRESH body as a src iframe, not srcdoc', () => {
    const { container } = renderWithProviders(
      <HtmlMailBody
        body={['<HEAD>', '<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://example.com/page">', '</HEAD>']}
      />,
    );

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(iframe.getAttribute('src')).toBe('http://example.com/page');
    expect(iframe.hasAttribute('srcdoc')).toBe(false);
  });
});
