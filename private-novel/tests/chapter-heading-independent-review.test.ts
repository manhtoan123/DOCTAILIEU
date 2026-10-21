import {it,expect} from 'vitest';
import {StreamingSplitter,isHeading,type Part} from '../src/features/import-export/services/splitter';

function split(source:string,chunk:number,max=0,custom?:RegExp){const parts:Part[]=[];const splitter=new StreamingSplitter('Intro',p=>parts.push(p),custom,max);for(let at=0;at<source.length;at+=chunk)splitter.feed(source.slice(at,at+chunk));splitter.feed('',true);expect(parts.map(p=>p.text).join('')).toBe(source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'));return parts;}

it('review: custom regex sees raw heading markers without built-in wrapper preprocessing',()=>{
 expect(isHeading('###第1章 开始###',/^###第/u)).toBe(true);expect(isHeading('###第1章 开始###',/^第/u)).toBe(false);
 const source='来源\n###第1章 开始###\n第一段\n第2章 保留正文\n###第3章 结束###\n尾';
 expect(split(source,1,0,/^###第/u).map(p=>p.title)).toEqual(['Intro','###第1章 开始###','###第3章 结束###']);
});

it('review: wrapped stub and adjacent complete headings remain one chapter with all raw markers',()=>{
 const source='###第1章###\n###第1章 起点###\n###第1章 起点###\n正文\n###第2章 终点###\n尾';
 const parts=split(source,1);expect(parts.map(p=>p.title)).toEqual(['第1章 起点','第2章 终点']);expect(parts[0].text).toContain('###第1章###\n###第1章 起点###\n###第1章 起点###');
});

it.each(['Episode','Tiết'])('review: explicit %s chapters keep bare subsection counters in their bodies',word=>{
 const source=`${word} 1: Start\nStory\n1.\nSubsection\n${word} 2: End\nTail`;
 expect(split(source,7).map(p=>p.title)).toEqual([`${word} 1: Start`,`${word} 2: End`]);
});

it('review: Book and Volume group markers do not suppress genuine bare numbered chapter headings',()=>{
 const source='Book 1: First volume\n1\nStory one\n2\nStory two\nVolume 2: Next volume\n3\nStory three';
 expect(split(source,1).map(p=>p.title)).toEqual(['Book 1: First volume','1','2','Volume 2: Next volume','3']);
});

it.each([1,2,7,1024])('review: credit offset, Unicode and wrapper bytes stay lossless for feed %s',chunk=>{
 const source='\uFEFF正文🙂\r\nSSS🙂 @译者   第 1 集.开始🙂\r\n1.\r\n正文🙂\r\n###第二章 结束###\r\n尾🙂';
 const parts=split(source,chunk);expect(parts).toEqual(split(source,source.length));expect(parts.map(p=>p.title)).toEqual(['Intro','第 1 集.开始🙂','第二章 结束']);expect(parts[0].text).toContain('SSS🙂 @译者   ');expect(parts[1].text.startsWith('第 1 集.开始🙂')).toBe(true);
});

it('review: disabling detection preserves every heading and counter as one body',()=>{
 const source='###第一章###\n@Credit   第2章\n1.\n第二章  结尾',parts:Part[]=[];const splitter=new StreamingSplitter('Raw',p=>parts.push(p),undefined,0,false);splitter.feed(source,true);expect(parts).toEqual([{title:'Raw',text:source}]);
});

it('episode review: paired wrappers activate the same episode policy as plain headings',()=>{
 const source='###第1话. 起点###\n故事。\n1. 技能条目\n2. 另一技能\n###第2话. 终点###\n尾';
 expect(split(source,1).map(p=>p.title)).toEqual(['第1话. 起点','第2话. 终点']);
});

it.each([['第一话. 起点','第二话. 终点'],['第１話. 起点','第２話. 终点']])('episode review: supported numeral heading %s keeps skill tables in its body',(first,second)=>{
 const source=`${first}\n故事。\n1. 技能条目\n2. 另一技能\n${second}\n尾`;
 expect(split(source,1).map(p=>p.title)).toEqual([first,second]);
});

it('episode review: explicit non-episode chapter ends the previous episode policy',()=>{
 const suffix='第2章 新的阶段\n正文。\n1. 开始旅程\n新的故事。\n2. 继续旅程\n尾',standalone=split(suffix,1),withEpisode=split('第1话. 前篇\n前篇内容。\n'+suffix,1);
 expect(withEpisode.slice(1)).toEqual(standalone);
});

it('episode review: damaged next-episode recovery is not applied inside a later regular chapter',()=>{
 const source='第331话. 起点\n故事。\n第1章 正式篇\n332 ?.\n这是正文。\n第2章 尾声\n尾';
 expect(split(source,1).map(p=>p.title)).toEqual(['第331话. 起点','第1章 正式篇','第2章 尾声']);
});

it('episode review: damaged numeric marker outside an episode sequence stays in an existing body',()=>{
 const source='前文叙述。\n332 ?.\n这是正文。';expect(split(source,1)).toEqual([{title:'Intro',text:source}]);
});

it('episode review: explicit custom regex controls numbered lines even after an episode title',()=>{
 const source='第1话. 起点\n正文\n1. 技能\n2. 技能\n第2话. 尾声\n尾';
 expect(split(source,1,0,/^第|^\d+\./u).map(p=>p.title)).toEqual(['第1话. 起点','1. 技能','2. 技能','第2话. 尾声']);
});
