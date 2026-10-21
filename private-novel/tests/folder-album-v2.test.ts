import 'fake-indexeddb/auto';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {planFolderSelection,prepareFolderSelection} from '../src/features/import-export/services/folder-selection';

function file(path:string,size=1){
  const file=new File(['x'],path.split('/').at(-1)!);
  Object.defineProperty(file,'webkitRelativePath',{value:path});Object.defineProperty(file,'size',{value:size});return file;
}
beforeEach(async()=>{await db.delete();await db.open();});
describe('folder Album v2 preflight invariants',()=>{
  it('keeps the selected root and full direct parent, preventing same-leaf collisions',()=>{
    const files=[file('Root/A/Common/10.txt'),file('Root/B/Common/2.txt'),file('Root/root.txt'),file('Root/A/Common/2.txt')];
    const plan=planFolderSelection(files);
    expect(plan.groups.map(group=>group.title)).toEqual(['Root','Root/A/Common','Root/B/Common']);
    expect(plan.assignments.map(item=>[item.file.name,item.album])).toEqual([['root.txt','Root'],['2.txt','Root/A/Common'],['10.txt','Root/A/Common'],['2.txt','Root/B/Common']]);
    expect(plan.assignments.every(item=>files.includes(item.file))).toBe(true);
  });
  it('allows >32 MiB total in one parent and >100 TXT without historical grouping limits',()=>{
    const plan=planFolderSelection(Array.from({length:101},(_,i)=>file(`Root/${i}.txt`,512*1024)));
    expect(plan.groups).toHaveLength(1);expect(plan.assignments).toHaveLength(101);
  });
  it('rejects overlong or normalization-colliding parent Albums before any writes or Worker creation',async()=>{
    const worker=vi.fn();vi.stubGlobal('Worker',worker);
    try{
      for(const files of [[file(`${'r'.repeat(121)}/book.txt`)],[file(' Root/a.txt'),file('Root/b.txt')],[file(' /book.txt')]]){
        await expect(prepareFolderSelection(files,'utf-8',()=>{},new AbortController().signal)).rejects.toThrow();
      }
      expect(worker).not.toHaveBeenCalled();expect(await db.books.count()).toBe(0);
    }finally{vi.unstubAllGlobals();}
  });
});
