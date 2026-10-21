import {expect,it} from 'vitest';
import {formatNameCase} from '../src/features/names-convert/services/name-case';
it.each([
 ['lower','trương tam phong'],['first','Trương tam phong'],
 ['firstTwo','Trương Tam phong'],['lastLower','Trương Tam phong'],['title','Trương Tam Phong'],
] as const)('formats %s without altering the words', (mode,expected)=>{
  expect(formatNameCase('TRƯƠNG TAM PHONG',mode)).toBe(expected);
});
it('preserves spacing, punctuation, emoji and supplementary characters',()=>{
  expect(formatNameCase('🙂  trương\t tam-phong  𠀀','firstTwo')).toBe('🙂  Trương\t Tam-phong  𠀀');
  expect(formatNameCase('tên','lastLower')).toBe('tên');
  expect(formatNameCase('','title')).toBe('');
  expect(formatNameCase('  🙂  ','title')).toBe('  🙂  ');
});
