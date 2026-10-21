import type {Book} from '../../../core/domain';

export interface AlbumNode {
  path:string;
  name:string;
  parent:string|null;
  children:AlbumNode[];
  ownBookCount:number;
  bookCount:number;
}

export function albumContains(parent:string,album?:string):boolean{
  return album===parent||Boolean(album?.split('/').every(Boolean)&&parent.split('/').every(Boolean)&&album.startsWith(`${parent}/`));
}

export function buildAlbumTree(albums:string[],books:Pick<Book,'album'>[]){
  const nodes=new Map<string,AlbumNode>();
  const roots:AlbumNode[]=[];
  for(const album of new Set([...albums,...books.map(book=>book.album).filter((name):name is string=>Boolean(name))])){
    const segments=album.split('/');
    const parts=segments.every(Boolean)?segments:[album];
    let parent:AlbumNode|undefined;
    for(let index=0;index<parts.length;index++){
      const path=parts.slice(0,index+1).join('/');
      let node=nodes.get(path);
      if(!node){
        node={path,name:parts[index],parent:parent?.path??null,children:[],ownBookCount:0,bookCount:0};
        nodes.set(path,node);
        if(parent)parent.children.push(node);else roots.push(node);
      }
      parent=node;
    }
  }
  for(const book of books)if(book.album){const node=nodes.get(book.album);if(node)node.ownBookCount++;}
  function countAndSort(group:AlbumNode[]):number{
    group.sort((left,right)=>left.name.localeCompare(right.name,'vi'));
    return group.reduce((total,node)=>{
      node.bookCount=node.ownBookCount+countAndSort(node.children);
      return total+node.bookCount;
    },0);
  }
  countAndSort(roots);
  return {roots,nodes};
}
