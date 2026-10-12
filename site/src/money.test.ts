import {describe,expect,it} from 'vitest';
import {formatGen,parseGenAtto} from './money';

describe('exact test GEN amounts',()=>{
  it('converts decimal reward without floating point loss',()=>{
    expect(parseGenAtto('0.001')).toBe(10n**15n);
    expect(parseGenAtto('1.000000000000000001')).toBe(10n**18n+1n);
    expect(formatGen('1000000000000000')).toBe('0.001 GEN');
  });
  it('rejects exponents and excessive precision',()=>{
    expect(()=>parseGenAtto('1e18')).toThrow();
    expect(()=>parseGenAtto('0.0000000000000000001')).toThrow();
  });
});
