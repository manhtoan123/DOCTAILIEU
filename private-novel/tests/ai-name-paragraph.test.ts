import {describe,it,expect} from 'vitest';
import {aiNameParagraph} from '../src/features/reader/services/ai-name-paragraph';
describe('AI Name paragraph correspondence',()=>{
 it('selects only the matching nonempty paragraph, preserving exact source offset',()=>{
  const source='前言\r\n\r\n林儿打开门。\r\n\r\n尾声';
  const translated='Mở đầu\n\nLâm Nhi mở cửa.\n\nKết thúc';
  expect(aiNameParagraph(source,translated,translated.indexOf('Lâm'))).toEqual({start:source.indexOf('林'),text:'林儿打开门。'});
 });
 it('opens a single source paragraph even when AI merges or splits paragraphs',()=>{
  expect(aiNameParagraph('甲\n乙','Một đoạn gộp.',0)).toEqual({start:0,text:'甲'});
  expect(aiNameParagraph('甲','Đoạn một.\nĐoạn hai.',10)).toEqual({start:0,text:'甲'});
 });
 it('maps relative positions across unequal counts including the first and last paragraphs',()=>{
  const source='甲\n乙\n丙\n丁\n戊',translated='Đầu\nGiữa\nCuối';
  expect(aiNameParagraph(source,translated,0)).toEqual({start:0,text:'甲'});
  expect(aiNameParagraph(source,translated,4)).toEqual({start:4,text:'丙'});
  expect(aiNameParagraph(source,translated,9)).toEqual({start:8,text:'戊'});
  expect(aiNameParagraph('',translated,0)).toBeUndefined();
 });
 it('selects a repeated paragraph by position and rejects a blank paragraph',()=>{
  expect(aiNameParagraph('甲\n\n乙','Trùng\n\nTrùng',7)).toEqual({start:3,text:'乙'});
  expect(aiNameParagraph('甲\n\n乙','Trùng\n\nTrùng',6)).toBeUndefined();
 });
});
