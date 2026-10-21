// Synthetic fixtures only. Requires isolated local Wrangler Pages/R2/D1 on 8789.
// Seed the SHA256 of 'b'.repeat(64) into local sessions; never use production tokens.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
const origin='http://127.0.0.1:8789';
const id=randomUUID();const title='Synthetic cloud 中文';
const body=JSON.stringify({format:'thu-phong-cloud',version:1,book:{id,title,author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3},chapters:[{id:randomUUID(),bookId:id,order:0,title:'第一章',text:'山门。',revision:1,sourceId:''}],names:[{key:'山门',value:'Cổng Riêng'}]});
const sha256=createHash('sha256').update(body).digest('hex');
const headers={Cookie:`__Host-session=${'b'.repeat(64)}`,Origin:origin,'Content-Type':'application/json','X-Book-Title':encodeURIComponent(title),'X-Content-SHA256':sha256};
assert.equal((await fetch(`${origin}/api/cloud/books`,{redirect:'manual'})).status,401,'anonymous list');
assert.equal((await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',body,headers:{...headers,Origin:'https://other.test'}})).status,403,'cross-origin put');
let response=await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',headers,body});assert.equal(response.status,201,await response.text());
response=await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',headers,body});assert.equal(response.status,200,'idempotent retry');
response=await fetch(`${origin}/api/cloud/books`,{headers});const list=await response.json();assert(list.books.some(book=>book.id===id&&book.sha256===sha256),'ready catalog');
response=await fetch(`${origin}/api/cloud/books/${id}`,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(await response.text(),body,'R2 roundtrip');
const other=body+' ';response=await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',headers:{...headers,'X-Content-SHA256':createHash('sha256').update(other).digest('hex')},body:other});assert.equal(response.status,409,'immutable conflict');
console.log('PASS: local workerd + D1 + R2 auth/origin/upload/retry/list/download/conflict. Synthetic fixture remains only in .wrangler/cloud-smoke.');
