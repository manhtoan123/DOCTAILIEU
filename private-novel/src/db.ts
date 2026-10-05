import Dexie, { type EntityTable } from 'dexie';
import type { Book,Chapter,SourceFile,Progress,NameEntry,DictionaryFile,ImportJob,RestoreJob } from './domain';
export const db = new Dexie('thu-phong-v1') as Dexie & {
  books:EntityTable<Book,'id'>; chapters:EntityTable<Chapter,'id'>; sources:EntityTable<SourceFile,'id'>;
  progress:EntityTable<Progress,'bookId'>; names:EntityTable<NameEntry,'id'>;
  dictionaries:EntityTable<DictionaryFile,'kind'>; settings:EntityTable<{key:string;value:unknown},'key'>;
  importJobs:EntityTable<ImportJob,'jobId'>;
  restorePackets:EntityTable<{id:string;backupId:string;index:number;total:number;body:string;checksum:string},'id'>;
  restoreJobs:EntityTable<RestoreJob,'jobId'>;
};
db.version(1).stores({books:'id,status,updatedAt',chapters:'id,bookId,[bookId+order]',sources:'id,bookId,sha256',progress:'bookId',names:'id,bookId,[bookId+key]',dictionaries:'kind',settings:'key',restorePackets:'id,backupId,index'});
db.version(2).stores({importJobs:'jobId,bookId,phase,updatedAt'});
db.version(3).stores({restoreJobs:'jobId,backupId,bookId,status,updatedAt'});
export async function deleteBook(id: string) {
  await db.transaction('rw',[db.books,db.chapters,db.sources,db.progress,db.names,db.importJobs],async()=>{
    await db.chapters.where('bookId').equals(id).delete(); await db.sources.where('bookId').equals(id).delete();
    await db.names.where('bookId').equals(id).delete(); await db.progress.delete(id); await db.importJobs.where('bookId').equals(id).delete();
    await db.books.delete(id);
  });
}
export async function readyChapters(bookId: string) { return db.chapters.where('[bookId+order]').between([bookId,Dexie.minKey],[bookId,Dexie.maxKey]).toArray(); }
export async function commitImport(bookId:string) {
  await db.transaction('rw',[db.books,db.importJobs],async()=>{
    const book=await db.books.get(bookId);if(!book||book.status!=='staging')throw new Error('Bản nhập không còn ở trạng thái xem trước.');
    const jobs=await db.importJobs.where('bookId').equals(bookId).filter(job=>job.phase==='preview').toArray();
    if(jobs.length!==1||jobs[0].processedFiles!==jobs[0].totalFiles)throw new Error('Bản nhập chưa hoàn tất để xác nhận.');
    await db.books.update(bookId,{status:'ready',updatedAt:Date.now()});await db.importJobs.update(jobs[0].jobId,{phase:'committed',updatedAt:Date.now()});
  });
}
