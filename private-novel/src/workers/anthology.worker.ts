import {scanAnthology} from '../features/import-export/services/anthology';
self.onmessage=async(event:MessageEvent<{file:File;encoding:string;pattern:string}>)=>{
  try{self.postMessage({outline:await scanAnthology(event.data.file,event.data.encoding,event.data.pattern)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:'Không phân tích được tuyển tập.'});}
};
