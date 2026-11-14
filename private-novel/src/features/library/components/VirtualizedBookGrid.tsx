import {useCallback,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import {defaultRangeExtractor,useWindowVirtualizer} from '@tanstack/react-virtual';
import type {Book} from '../../../core/domain';

const VIRTUALIZE_AFTER=300;
const VIRTUAL_OVERSCAN=3;
type LibraryView='grid'|'list'|'compact';

export function VirtualizedBookGrid({items,view,renderItem}:{
  items:readonly Book[];
  view:LibraryView;
  renderItem:(book:Book,index:number,virtualized:boolean)=>ReactNode;
}){
  const gridRef=useRef<HTMLDivElement>(null);
  const spacerRef=useRef<HTMLDivElement>(null);
  const [columns,setColumns]=useState(1);
  const [contentWidth,setContentWidth]=useState(0);
  const [scrollMargin,setScrollMargin]=useState(0);
  const [focusedBookIndex,setFocusedBookIndex]=useState<number|null>(null);
  const virtualized=items.length>VIRTUALIZE_AFTER;

  useLayoutEffect(()=>{
    const grid=gridRef.current;
    if(!grid)return;
    const measure=()=>{
      const style=getComputedStyle(grid);
      const width=Math.max(0,grid.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
      const gap=window.innerWidth<=700?12:18;
      const nextColumns=view!=='grid'?1:window.innerWidth<=700?2:Math.max(1,Math.floor((width+gap)/(172+gap)));
      setContentWidth(current=>Math.abs(current-width)<1?current:width);
      setColumns(current=>current===nextColumns?current:nextColumns);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(grid);
    window.addEventListener('resize',measure);
    measure();
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[view]);

  const rows=useMemo(()=>{
    const result:Array<Array<{book:Book;index:number}>>=[];
    for(let start=0;start<items.length;start+=columns){
      result.push(items.slice(start,start+columns).map((book,offset)=>({book,index:start+offset})));
    }
    return result;
  },[items,columns]);

  useLayoutEffect(()=>{
    const spacer=spacerRef.current;
    if(!spacer)return;
    const next=Math.max(0,spacer.getBoundingClientRect().top+window.scrollY);
    setScrollMargin(current=>Math.abs(current-next)<1?current:next);
  },[items.length,rows.length,view]);

  const rangeExtractor=useCallback((range:Parameters<typeof defaultRangeExtractor>[0])=>{
    const indexes=defaultRangeExtractor(range);
    if(focusedBookIndex!==null){
      const focusedRow=Math.floor(focusedBookIndex/columns);
      if(focusedRow>=0&&focusedRow<rows.length&&!indexes.includes(focusedRow))indexes.push(focusedRow);
    }
    return [...new Set(indexes)].sort((a,b)=>a-b);
  },[focusedBookIndex,columns,rows.length]);
  const getItemKey=useCallback((index:number)=>rows[index]?.map(item=>item.book.id).join('\u0000')??index,[rows]);
  const virtualizer=useWindowVirtualizer({
    count:rows.length,
    estimateSize:()=>view==='grid'?Math.max(270,contentWidth/Math.max(1,columns)*4/3+125):view==='compact'?48:118,
    getItemKey,
    overscan:VIRTUAL_OVERSCAN,
    gap:view==='grid'?(window.innerWidth<=700?14:20):0,
    scrollMargin,
    rangeExtractor,
    enabled:virtualized,
  });
  const virtualRows=virtualized?virtualizer.getVirtualItems():[];

  const focusRow=(rowIndex:number,reverse:boolean)=>{
    virtualizer.scrollToIndex(rowIndex,{align:reverse?'end':'auto'});
    window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
      const row=gridRef.current?.querySelector<HTMLElement>(`[data-virtual-row-index="${rowIndex}"]`);
      const focusable=row?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
      const target=focusable?.item(reverse?focusable.length-1:0);
      target?.focus({preventScroll:true});
    }));
  };
  const onKeyDownCapture=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(event.key!=='Tab')return;
    const active=document.activeElement;
    if(!(active instanceof HTMLElement))return;
    const row=active.closest<HTMLElement>('[data-virtual-row-index]');
    const rowIndex=Number(row?.dataset.virtualRowIndex);
    if(!row||!Number.isInteger(rowIndex))return;
    const focusable=Array.from(row.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    const activeIndex=focusable.indexOf(active);
    if(event.shiftKey&&activeIndex===0&&rowIndex>0&&!gridRef.current?.querySelector(`[data-virtual-row-index="${rowIndex-1}"]`)){
      event.preventDefault();focusRow(rowIndex-1,true);return;
    }
    if(!event.shiftKey&&activeIndex===focusable.length-1&&rowIndex<rows.length-1&&!gridRef.current?.querySelector(`[data-virtual-row-index="${rowIndex+1}"]`)){
      event.preventDefault();focusRow(rowIndex+1,false);
    }
  };

  const className=`book-grid ${view==='grid'?'cover-shelf':view==='compact'?'compact-shelf':'list-shelf'}${virtualized?' virtualized-book-grid':''}`;
  if(!virtualized)return <div ref={gridRef} className={className}>{items.map((book,index)=>renderItem(book,index,false))}</div>;

  return <div
    ref={gridRef}
    className={className}
    role="list"
    aria-label="Danh sách truyện"
    style={{'--book-grid-columns':columns} as React.CSSProperties}
    onFocusCapture={event=>{
      const card=(event.target as HTMLElement).closest<HTMLElement>('[data-virtual-book-index]');
      const index=Number(card?.dataset.virtualBookIndex);
      if(Number.isInteger(index))setFocusedBookIndex(index);
    }}
    onBlurCapture={event=>{
      const next=event.relatedTarget;
      if(next instanceof Node&&!event.currentTarget.contains(next))setFocusedBookIndex(null);
    }}
    onKeyDownCapture={onKeyDownCapture}
  >
    <div ref={spacerRef} className="virtual-book-spacer" role="presentation" style={{height:virtualizer.getTotalSize()}}>
      {virtualRows.map(row=>{
        const rowItems=rows[row.index];
        if(!rowItems)return null;
        return <div
          key={row.key}
          className="virtual-book-row"
          role="presentation"
          data-index={row.index}
          data-virtual-row-index={row.index}
          data-virtual-last-row={row.index===rows.length-1||undefined}
          ref={virtualizer.measureElement}
          style={{transform:`translateY(${row.start-virtualizer.options.scrollMargin}px)`}}
        >
          {rowItems.map(({book,index})=>renderItem(book,index,true))}
        </div>;
      })}
    </div>
  </div>;
}
