import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CanvasAnchor, DomAnchor } from '../../shared/bug-report-schema';
import { ReportModal } from './ReportModal';

const domAnchor: DomAnchor = {
  kind: 'dom',
  componentChain: ['GameScreen', 'PoliticsPanel', 'TaxRow'],
  cssChain: 'section#panel > button.tax',
  text: 'Set tax',
};

const canvasAnchor: CanvasAnchor = {
  kind: 'canvas', tileX: 412, tileY: 88, layer: 'building', visualClass: 'FarmClass',
};

function renderModal(over: Partial<React.ComponentProps<typeof ReportModal>> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  render(
    <ReportModal
      anchor={domAnchor}
      observedDefault="Set tax"
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...over}
    />
  );
  return { onSubmit, onCancel };
}

describe('ReportModal', () => {
  it('pre-fills observed from the flagged element — the point of the whole feature', () => {
    renderModal();
    expect((screen.getByLabelText('Observed') as HTMLInputElement).value).toBe('Set tax');
    expect((screen.getByLabelText('Expected') as HTMLInputElement).value).toBe('');
  });

  it('names the flagged element by its component chain', () => {
    renderModal();
    expect(screen.getByText('GameScreen › PoliticsPanel › TaxRow')).toBeTruthy();
  });

  it('falls back to the CSS chain when the fiber walk found no components', () => {
    renderModal({ anchor: { ...domAnchor, componentChain: [] } });
    expect(screen.getByText('section#panel > button.tax')).toBeTruthy();
  });

  it('describes a canvas anchor by tile and layer', () => {
    renderModal({ anchor: canvasAnchor, observedDefault: '' });
    expect(screen.getByText('map tile 412,88 (building · FarmClass)')).toBeTruthy();
  });

  it('describes a canvas anchor with no visual class', () => {
    renderModal({ anchor: { kind: 'canvas', tileX: 5, tileY: 6, layer: 'terrain' }, observedDefault: '' });
    expect(screen.getByText('map tile 5,6 (terrain)')).toBeTruthy();
  });

  it('defaults to wrong-data and lets the kind be changed', () => {
    const { onSubmit } = renderModal();
    expect(screen.getByRole('button', { name: 'Wrong data' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    expect(screen.getByRole('button', { name: 'Visual' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Wrong data' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'visual' }));
  });

  it('offers "Could be better" as a non-defect kind', () => {
    const { onSubmit } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Could be better' }));
    expect(screen.getByRole('button', { name: 'Could be better' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'suggestion' }));
  });

  it('hands over everything the human typed', () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText('Observed'), { target: { value: '12 %' } });
    fireEvent.change(screen.getByLabelText('Expected'), { target: { value: '15 %' } });
    fireEvent.change(screen.getByLabelText('Anything else'), { target: { value: 'after a tax write' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'wrong-data', observed: '12 %', expected: '15 %', freeText: 'after a tax write',
    });
  });

  it('cancels without submitting', () => {
    const { onSubmit, onCancel } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('locks the submit button while a report is in flight', () => {
    const { onSubmit } = renderModal({ submitting: true });
    const button = screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
