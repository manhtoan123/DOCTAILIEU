import {it,expect} from 'vitest';
import {MAX_ORIGINAL_DESCRIPTOR_BYTES,parseOriginalDescriptor,parseOriginalDescriptorJson,originalObjectKey,type OriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';
const book='11111111-1111-4111-8111-111111111111';
const descriptor:OriginalDescriptor={version:1,sourceId:'22222222-2222-4222-8222-222222222222',name:'章😀 &amp; e\u0301.txt',relativePath:'Root/章😀 &amp; e\u0301.txt',encoding:'utf-8',sha256:'ab'.repeat(32),bytes:12};

it('literal entity and combining characters remain exact provenance without canonicalization',()=>{
  const source=Object.freeze({...descriptor});expect(parseOriginalDescriptor(source)).toEqual(descriptor);
  const htmlLike={...descriptor,name:'&#46;&#46;.txt',relativePath:'Root/&#46;&#46;.txt'};
  expect(parseOriginalDescriptorJson(JSON.stringify(htmlLike))).toEqual(htmlLike);
  expect(originalObjectKey(book,htmlLike)).toBe(originalObjectKey(book,descriptor));
});

it('legal literal percent sequences in selected filenames remain provenance, never URL decoded',()=>{
  for(const name of ['story%2e.txt','literal%2f.txt','100%25.txt','x%3a.txt']){
    const selected={...descriptor,name,relativePath:`Root/${name}`};
    expect(parseOriginalDescriptor(selected)).toEqual(selected);
    expect(originalObjectKey(book,selected)).toBe(originalObjectKey(book,descriptor));
  }
});

it('JSON raw UTF8 accepts exact limit and rejects the next byte without changing descriptor',()=>{
  const json=JSON.stringify(descriptor),size=new TextEncoder().encode(json).byteLength;
  const exact=json+' '.repeat(MAX_ORIGINAL_DESCRIPTOR_BYTES-size);
  expect(new TextEncoder().encode(exact).byteLength).toBe(MAX_ORIGINAL_DESCRIPTOR_BYTES);
  expect(parseOriginalDescriptorJson(exact)).toEqual(descriptor);
  expect(()=>parseOriginalDescriptorJson(exact+' ')).toThrow();
});

it('same object key does not establish exact declaration retry identity',()=>{
  const changed={...descriptor,bytes:13,encoding:'utf-16le' as const};
  expect(originalObjectKey(book,changed)).toBe(originalObjectKey(book,descriptor));
  expect(parseOriginalDescriptor(changed)).not.toEqual(parseOriginalDescriptor(descriptor));
  // Reservation/backend must compare every canonical descriptor field before ACK.
});

it('SourceFile-only fields and protocol extensions are never silently retained or discarded',()=>{
  for(const extra of [{bookId:book},{blob:{}},{dataStatus:'missing'},{descriptorSHA:'cd'.repeat(32)},{parts:[]}])expect(()=>parseOriginalDescriptor({...descriptor,...extra})).toThrow();
  expect(()=>parseOriginalDescriptorJson(JSON.stringify({...descriptor,version:2}))).toThrow();
});
