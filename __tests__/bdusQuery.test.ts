import { describe, it, expect } from 'vitest';
import * as bdusQuery from '../integrations/bdusQuery';

describe('integrations/bdusQuery', () => {
  it('re-exports the full direct-query surface', () => {
    expect(typeof bdusQuery.bdusListAll).toBe('function');
    expect(typeof bdusQuery.bdusRecord).toBe('function');
    expect(typeof bdusQuery.bdusQueryFull).toBe('function');
    expect(typeof bdusQuery.bdusFullByFilter).toBe('function');
    expect(typeof bdusQuery.bdusFindOne).toBe('function');
    expect(typeof bdusQuery.bdusToFeatureCollection).toBe('function');
    expect(typeof bdusQuery.normalizeBdusRecord).toBe('function');
    expect(typeof bdusQuery.bdusFileUrl).toBe('function');
    expect(typeof bdusQuery.getBdusServerConfig).toBe('function');
  });
});
