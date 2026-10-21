import {describe,it,expect} from 'vitest';
import {albumContains,buildAlbumTree} from '../src/features/library/services/album-tree';

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
});
