import { requireDaParams } from '../asp-da-params';

describe('requireDaParams', () => {
  it('returns the pair, with DAPort stringified, when both fields are set', () => {
    expect(requireDaParams({ daAddr: '1.2.3.4', daPort: 7001 })).toEqual({
      DAAddr: '1.2.3.4',
      DAPort: '7001',
    });
  });

  it('throws when daAddr is unset', () => {
    expect(() => requireDaParams({ daAddr: null, daPort: 7001 })).toThrow(
      'ASP call refused: DA lock channel not announced yet (daAddr/daPort unset)',
    );
  });

  it('throws when daPort is unset', () => {
    expect(() => requireDaParams({ daAddr: '1.2.3.4', daPort: null })).toThrow(
      'ASP call refused: DA lock channel not announced yet (daAddr/daPort unset)',
    );
  });
});
