import {describe,it,expect} from 'vitest';
import 'fake-indexeddb/auto';
import {Index} from '../src/features/names-convert/services/language';
import {normalizeKey} from '../src/features/names-convert/services/reference-convert';
import {PackedBuilder,PackedIndex,validatePackedData} from '../src/features/names-convert/services/packed-index';
import {packedSignature,readPackedCache} from '../src/features/names-convert/services/packed-cache';
import {loadLanguageEngine} from '../src/features/names-convert/services/load-language-engine';
import {LanguageEngine} from '../src/features/names-convert/services/language';

describe('packed dictionary index',()=>{
 it('matches Index semantics including normalized collisions and supplementary characters',async()=>{
  const rows=[['你好','hello'],['你好，','punct'],['……','ellipsis'],['——','dash'],['你 好','space'],['你\t好','tab'],['𠀀天','rare'],['A B','first'],['A\tB','second'],['dup','old'],['dup','new'],['x'.repeat(256),'long'],['x'.repeat(257),'too long']] as const;
  const reference=new Index(),builder=new PackedBuilder(normalizeKey);for(const [k,v]of rows){reference.add(k,v);builder.add(k,v);}const data=await builder.build(),packed=new PackedIndex(data,normalizeKey);
  for(const key of ['你好','你好，','……','——','你 好','你\t好','𠀀天','A B','A\tB','dup','x'.repeat(256),'x'.repeat(257)])for(const normalized of [false,true])expect(packed.get(key,normalized)).toBe(reference.get(key,normalized));
  for(const text of ['你好，世界','𠀀天你好','A\tB','……——','x'.repeat(257)])for(let at=0;at<text.length;at++)expect(packed.match(text,at)).toEqual(reference.match(text,at));
  expect(validatePackedData(data)).toBe(true);
 });
 it('keeps writes in a small overlay',async()=>{const b=new PackedBuilder(normalizeKey);b.add('你好','xin chao');const packed=new PackedIndex(await b.build(),normalizeKey),reference=new Index();reference.add('你好','xin chao');for(const [k,v]of [['你好','mới'],['你 好','dạng chuẩn'],['新增','new']]){packed.add(k,v);reference.add(k,v);}for(const k of ['你好','你 好','新增'])for(const n of [false,true])expect(packed.get(k,n)).toBe(reference.get(k,n));});
 it('preserves engine tokens and lookup for packed vp/hanviet',async()=>{const plain=new LanguageEngine(),packed=new LanguageEngine(),entries=[['vp','你好=xin chào'],['vp','世界=thế giới'],['hanviet','你=nhĩ'],['hanviet','好=hảo']] as const;const builders={vp:new PackedBuilder(normalizeKey),hanviet:new PackedBuilder(normalizeKey)};for(const [kind,line]of entries){plain.add(kind,line);packed.add(kind,line);const p=line.indexOf('=');builders[kind].add(line.slice(0,p),line.slice(p+1));}packed.setPacked('vp',new PackedIndex(await builders.vp.build(),normalizeKey));packed.setPacked('hanviet',new PackedIndex(await builders.hanviet.build(),normalizeKey));for(const sample of ['你好，世界','世界你好','你好'])for(const options of [{},{mode:'hanviet' as const},{reference:true},{standardizePunctuation:false},{capitalize:false}])expect(packed.convert(sample,[],options)).toEqual(plain.convert(sample,[],options));expect(packed.lookup('你好')).toEqual(plain.lookup('你好'));});
 it('reads a valid cache without reading the source Blob and rebuilds on signature change',async()=>{
  const row={kind:'vp' as const,name:'Vietphrase.txt',sha256:'hash-a',updatedAt:1,blob:new Blob(['你好=xin chào\n'])};const options={packed:{enabled:true as const,normalizeKey,idb:indexedDB}};
  const first=await loadLanguageEngine([row],options);expect(first.engine.convert('你好',[],{}).map(x=>x.targetText).join('')).toContain('xin chào');
  const unreadable={...row,blob:{size:row.blob.size,arrayBuffer:()=>{throw new Error('blob read');}} as unknown as Blob};const second=await loadLanguageEngine([unreadable],options);expect(second.stats).toEqual(first.stats);
  expect(await readPackedCache('vp',packedSignature({sha256:'hash-b',updatedAt:1}))).toBeUndefined();
 });
});
