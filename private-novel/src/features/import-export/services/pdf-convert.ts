import {assembleDocumentChapters,type DocumentBlock} from './document-chapters';
import {getDocument,GlobalWorkerOptions,OPS,Util} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {rasterBlob} from '../../sync-cloud/services/shared-images';
import {xmlEscape,type ConvertedDocument} from './document-convert';
GlobalWorkerOptions.workerSrc=workerUrl;
type Matrix=[number,number,number,number,number,number];
const identity=():Matrix=>[1,0,0,1,0,0];
export async function convertPdf(file:File,signal:AbortSignal):Promise<ConvertedDocument>{
 signal.throwIfAborted();const task=getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:import.meta.env.BASE_URL+'pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:import.meta.env.BASE_URL+'pdfjs/standard_fonts/',wasmUrl:import.meta.env.BASE_URL+'pdfjs/wasm/',useSystemFonts:true,disableFontFace:true});
 const cancel=()=>{void task.destroy();};signal.addEventListener('abort',cancel,{once:true});
 const assets:Record<string,Uint8Array>={},documentBlocks:DocumentBlock[]=[];let assetBytes=0,chars=0;
 try{signal.throwIfAborted();const pdf=await task.promise;if(pdf.numPages>2000)throw Error('PDF vượt 2.000 trang.');
 for(let p=1;p<=pdf.numPages;p++){
 signal.throwIfAborted();const page=await pdf.getPage(p),viewport=page.getViewport({scale:1}),text=await page.getTextContent(),ops=await page.getOperatorList();
 const blocks:{x:number;y:number;html:string;text?:string}[]=[];let matrix=identity();const stack:Matrix[]=[];const rects:{x:number;y:number;w:number;h:number}[]=[];
 for(let i=0;i<ops.fnArray.length;i++){const op=ops.fnArray[i],args=ops.argsArray[i];if(op===OPS.save||op===OPS.paintFormXObjectBegin){stack.push([...matrix]);if(op===OPS.paintFormXObjectBegin&&args[0])matrix=Util.transform(matrix,args[0]) as Matrix;}else if(op===OPS.restore||op===OPS.paintFormXObjectEnd)matrix=stack.pop()??identity();else if(op===OPS.transform)matrix=Util.transform(matrix,args) as Matrix;
 else if([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject,OPS.paintSolidColorImageMask].includes(op)){
 const m=Util.transform(viewport.transform,matrix),pts=[[0,0],[1,0],[0,1],[1,1]].map(pt=>[pt[0]*m[0]+pt[1]*m[2]+m[4],pt[0]*m[1]+pt[1]*m[3]+m[5]]);const x=Math.max(0,Math.min(...pts.map(v=>v[0]))),y=Math.max(0,Math.min(...pts.map(v=>v[1]))),w=Math.min(viewport.width,Math.max(...pts.map(v=>v[0])))-x,h=Math.min(viewport.height,Math.max(...pts.map(v=>v[1])))-y;if(w>0&&h>0)rects.push({x,y,w,h});
 }else if([OPS.paintImageXObjectRepeat,OPS.paintImageMaskXObjectRepeat,OPS.paintImageMaskXObjectGroup,OPS.paintInlineImageXObjectGroup].includes(op))throw Error('PDF có nhóm ảnh chưa hỗ trợ; chưa nhập dữ liệu.');}
 // PDF.js may return a heading in several text runs on one baseline.
 const lines:{x:number;y:number;end:number;text:string}[]=[];
 for(const item of text.items){
  if(!('str' in item)||!item.str.trim())continue;
  chars+=item.str.length;if(chars>16*1048576)throw Error('Chữ PDF vượt 16 MiB.');
  const m=Util.transform(viewport.transform,item.transform),x=m[4],y=m[5]-Math.abs(item.height),last=lines.at(-1);
  if(last&&Math.abs(last.y-y)<1.5&&x>=last.x&&x-last.end<Math.max(12,Math.abs(item.height)*2)){
   const gap=x-last.end;last.text+=(gap>Math.abs(item.height)*.25?' ':'')+item.str;last.end=x+Math.abs(item.width);
  }else lines.push({x,y,end:x+Math.abs(item.width),text:item.str});
 }
 for(const line of lines)blocks.push({x:line.x,y:line.y,text:line.text,html:`<p>${xmlEscape(line.text)}</p>`});
 if(rects.length){if(Math.ceil(viewport.width)*Math.ceil(viewport.height)>16000000||Math.max(viewport.width,viewport.height)>16384||rects.length+Object.keys(assets).length>3000)throw Error('Trang PDF hoặc số ảnh quá lớn.');const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d')!;await page.render({canvas,canvasContext:ctx,viewport}).promise;
 for(const rect of rects){signal.throwIfAborted();const crop=document.createElement('canvas');crop.width=Math.ceil(rect.w);crop.height=Math.ceil(rect.h);crop.getContext('2d')!.drawImage(canvas,rect.x,rect.y,rect.w,rect.h,0,0,crop.width,crop.height);const blob=await new Promise<Blob>((resolve,reject)=>crop.toBlob(b=>b?resolve(b):reject(Error('Không trích được ảnh PDF.')),'image/png'));await rasterBlob(blob);assetBytes+=blob.size;if(blob.size>8*1048576||assetBytes>64*1048576)throw Error('Ảnh PDF vượt giới hạn.');const name=`image${Object.keys(assets).length+1}.png`;assets[name]=new Uint8Array(await blob.arrayBuffer());blocks.push({x:rect.x,y:rect.y,html:`<img src="${name}" alt="Ảnh trang ${p}"/>`});crop.width=crop.height=0;}canvas.width=canvas.height=0;}
 blocks.sort((a,b)=>a.y-b.y||a.x-b.x);documentBlocks.push(...blocks.map(({html,text})=>({html,text})));page.cleanup();
 }
 if(!chars)throw Error('PDF không có lớp chữ; cần OCR bên ngoài trước khi nhập.');return {sections:assembleDocumentChapters(documentBlocks),assets};
 }finally{signal.removeEventListener('abort',cancel);await task.destroy();}
}
