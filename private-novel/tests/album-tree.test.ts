import {describe,it,expect} from 'vitest';
import {albumContains,buildAlbumTree,groupBooksByAlbumPath} from '../src/features/library/services/album-tree';

describe('author and series Album hierarchy',()=>{
  it('builds missing parents and counts direct books separately from all descendant books',()=>{
    const books=[{album:'Tác giả'},{album:'Tác giả/Series'},{album:'Tác giả/Series'},{album:'Tác giả/Series/Phần hai'},{}];
    const before=JSON.stringify(books);
    const tree=buildAlbumTree(['Tác giả/Series','Tác giả/Series/Phần hai','Tác giả/Series rỗng'],books);
    expect(tree.roots.map(node=>node.path)).toEqual(['Tác giả']);
    expect(tree.roots[0]).toMatchObject({ownBookCount:1,bookCount:4});
    expect(tree.nodes.get('Tác giả/Series')).toMatchObject({name:'Series',parent:'Tác giả',ownBookCount:2,bookCount:3});
    expect(tree.nodes.get('Tác giả/Series rỗng')?.bookCount).toBe(0);
    expect(JSON.stringify(books)).toBe(before);
  });

  it('keeps equally named series under different authors and respects complete path segments',()=>{
    const tree=buildAlbumTree(['An/Series','Anh/Series','An/Series'],[]);
    expect(tree.roots.map(node=>node.path)).toEqual(['An','Anh']);
    expect(tree.nodes.get('An/Series')).not.toBe(tree.nodes.get('Anh/Series'));
    expect(albumContains('An','An/Series')).toBe(true);
    expect(albumContains('An','An')).toBe(true);
    expect(albumContains('An','Anh/Series')).toBe(false);
    expect(albumContains('An')).toBe(false);
  });

  it('preserves legacy labels with empty path segments instead of silently renaming them',()=>{
    const tree=buildAlbumTree(['An//Series'],[{album:'An//Series'}]);
    expect(tree.roots.map(node=>node.path)).toEqual(['An//Series']);
    expect(tree.roots[0].bookCount).toBe(1);
    expect(albumContains('An','An//Series')).toBe(false);
  });

  it('groups books under each valid ancestor and preserves malformed legacy paths exactly',()=>{
    const books=[{id:'author',album:'An'},{id:'series',album:'An/Series'},{id:'nested',album:'An/Series/Volume 2'},{id:'other',album:'Anh/Series'},{id:'legacy',album:'An//Series'}, {id:'none'}];
    const groups=groupBooksByAlbumPath(books);
    for(const parent of ['An','An/Series','An/Series/Volume 2','Anh','Anh/Series','An//Series']){
      expect(groups.get(parent)??[]).toEqual(books.filter(book=>albumContains(parent,book.album)));
    }
    expect(groups.get('An')?.map(book=>book.id)).toEqual(['author','series','nested']);
    expect(groups.get('An//Series')?.map(book=>book.id)).toEqual(['legacy']);
    expect(groups.has('An//')).toBe(false);
  });
});
