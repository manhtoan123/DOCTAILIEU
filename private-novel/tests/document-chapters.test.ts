import {it,expect} from 'vitest';
import {assembleDocumentChapters,documentChapterTitle} from '../src/features/import-export/services/document-chapters';
const text=(s:string)=>({text:s,html:`<p>${s}</p>`});
it('joins page-like chunks without any heading into exactly one chapter',()=>{
 const blocks=[text('Before'),{html:'<img src="image1.png"/>'},text('After'),text('2'),text('More')];
 expect(assembleDocumentChapters(blocks)).toEqual([{title:'Nội dung',html:blocks.map(b=>b.html).join('')}]);
});
it('preserves preface, images, real chapter titles and cross-page continuations',()=>{
 const blocks=[text('Preface'),text('第一章 起点'),text('Page one'),{html:'<img src="image1.png"/>'},text('Page two'),text('第二章 归来'),text('End')],chapters=assembleDocumentChapters(blocks);
 expect(chapters.map(c=>c.title)).toEqual(['第一章 起点','第二章 归来']);
 expect(chapters.map(c=>c.html).join('')).toBe(blocks.map(b=>b.html).join(''));
 expect(chapters[0].html).toContain('Page two');expect(chapters[1].html).not.toContain('image1.png');
});
it('does not create another chapter for a repeated running heading',()=>{expect(assembleDocumentChapters([text('Chapter 1 Start'),text('Body'),text('Chapter 1 Start'),text('Continuation')])).toHaveLength(1);});
it.each(['1','42','1. list item','Trang 2','Page 3','Trong Chương 2 có nói rằng','第一章中提到这个问题','第1节课','Chapter 1 This is prose. More text!','Chapter 1 Intro ........ 3','第一章 起点 …… 5'])('does not treat %s as a chapter title',s=>{expect(documentChapterTitle(s)).toBeUndefined();});
it.each(['第一章 开始','第 ２ 章 继续','Chương 12: Trở về','Chapter 2 Next','Chapter IV Arrival','Chương １２ Trở về','【第三章 测试】','序章'])('recognizes explicit chapter marker %s',s=>{expect(documentChapterTitle(s)).toBeTruthy();});
it('respects top-level semantic DOCX heading without making numeric paragraphs headings',()=>{const result=assembleDocumentChapters([text('Intro'),{...text('Arrival'),heading:true},text('1'),{...text('Departure'),heading:true},text('End')]);expect(result.map(c=>c.title)).toEqual(['Arrival','Departure']);});
it('fails explicitly rather than inventing page or size chapter boundaries',()=>{expect(()=>assembleDocumentChapters([text('a'.repeat(128001))])).toThrow(/Không tự cắt theo trang/);expect(()=>assembleDocumentChapters([{html:' '.repeat(450001)}])).toThrow();});
