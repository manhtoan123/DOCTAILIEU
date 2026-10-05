import {test,expect} from '@playwright/test';

test('failed portable replacement keeps original bytes and dictionary installation commits with the book',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const dbPath='/src/db.ts';const backupPath='/src/backup.ts';
    const {db}=await import(/* @vite-ignore */dbPath);
    const {prepareBackup,stageBackup,restoreBackup,hashBlob}=await import(/* @vite-ignore */backupPath);
    const original=new Blob(['Original TXT bytes']);
    await db.books.add({id:'atomic-book',title:'Atomic fixture',author:'',status:'ready',chapterCount:1,charCount:1,createdAt:1,updatedAt:1});
    await db.sources.add({id:'atomic-source',bookId:'atomic-book',name:'source.txt',relativePath:'source.txt',encoding:'utf-8',sha256:await hashBlob(original),bytes:original.size,blob:original});
    await db.chapters.add({id:'atomic-chapter',bookId:'atomic-book',sourceId:'atomic-source',order:0,title:'One',text:'文',revision:1});
    const dictionary=new Blob(['文=văn\n']);
    await db.dictionaries.put({kind:'vp',name:'Fixture.txt',sha256:await hashBlob(dictionary),blob:dictionary,updatedAt:1});
    const plan=await prepareBackup('atomic-book',{mode:'portable'});
    const part=await plan.part(0);const packet=JSON.parse(await part.blob.text());
    await db.dictionaries.delete('vp');
    const body=JSON.parse(packet.body);body.book.chapterCount=2;
    const badBody=JSON.stringify(body);
    const badPacket={...packet,body:badBody,checksum:await hashBlob(new Blob([badBody]))};
    const [id]=await stageBackup([new File([JSON.stringify(badPacket)],'bad.json')],()=>{});
    let failed=false;
    try{await restoreBackup(id,{onConflict:'replace'});}catch{failed=true;}
    const afterFailure={failed,dictionaryAbsent:!(await db.dictionaries.get('vp')),oldReady:(await db.books.get('atomic-book'))?.status==='ready',originalBytes:await(await db.sources.get('atomic-source')).blob.text(),staging:await db.books.where('status').equals('staging').count()};
    // A failed packet intentionally differs from the original: remove only this
    // synthetic packet set before staging the valid version of the fixture.
    await db.restorePackets.where('backupId').equals(id).delete();
    await stageBackup([new File([part.blob],part.name)],()=>{});
    const restored=await restoreBackup(id,{onConflict:'replace'});
    return {afterFailure,afterSuccess:{dictionary:await(await db.dictionaries.get('vp')).blob.text(),ready:(await db.books.get(restored))?.status==='ready',oldGone:!(await db.books.get('atomic-book')),bookCount:await db.books.count()}};
  });
  expect(result).toEqual({afterFailure:{failed:true,dictionaryAbsent:true,oldReady:true,originalBytes:'Original TXT bytes',staging:0},afterSuccess:{dictionary:'文=văn\n',ready:true,oldGone:true,bookCount:1}});
});
