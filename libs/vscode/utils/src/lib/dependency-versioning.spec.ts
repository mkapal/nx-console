import { createVersionMap } from './dependency-versioning';

describe('dependency-versioning', () => {
  describe('createVersionMap', () => {
    it('should group versions by major versions', () => {
      expect(
        createVersionMap({
          versions: {
            '1.0.1': {},
            '1.0.2': {},
            '1.2.3': {},
            '2.1.4': {},
            '2.1.5': {},
          },
          'dist-tags': {},
        }),
      ).toEqual({
        '1': {
          all: ['1.0.1', '1.0.2', '1.2.3'],
          latest: '1.2.3',
        },
        '2': {
          all: ['2.1.4', '2.1.5'],
          latest: '2.1.5',
        },
      });
    });

    it('should skip major versions 0', () => {
      expect(
        createVersionMap({
          versions: {
            '0.0.1': {},
            '1.0.2': {},
          },
          'dist-tags': {},
        }),
      ).toEqual({
        '1': {
          all: ['1.0.2'],
          latest: '1.0.2',
        },
      });
    });

    it('should skip deprecated versions', () => {
      expect(
        createVersionMap({
          versions: {
            '1.0.2': {
              deprecated: 'Deprecated version',
            },
            '1.1.0': {},
          },
          'dist-tags': {},
        }),
      ).toEqual({
        '1': {
          all: ['1.1.0'],
          latest: '1.1.0',
        },
      });
    });

    it('should skip canary versions', () => {
      expect(
        createVersionMap({
          versions: {
            '1.0.2-canary.2': {},
            '1.1.0': {},
          },
          'dist-tags': {},
        }),
      ).toEqual({
        '1': {
          all: ['1.1.0'],
          latest: '1.1.0',
        },
      });
    });

    it('should return an empty object for a package with no versions', () => {
      expect(
        createVersionMap({
          versions: {},
          'dist-tags': {},
        }),
      ).toEqual({});
    });
  });
});
