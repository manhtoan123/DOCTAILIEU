import {isTransientAiFailure,mayRetryAiModel} from '../services/ai-recovery';
/** Per-job limits shared by all recovery layers. Never persisted or logged. */
export class AiRequestAttempts {
  private failures=new Map<string,{count:number;limit:number;error?:unknown}>();
  async send<T>(identity:string,operation:()=>Promise<T>):Promise<T>{
    let row=this.failures.get(identity);
    if(row&&row.count>=row.limit)throw row.error??new Error('Phần dịch đang phục hồi.');
    if(!row){
      let limit=3;
      try{const model=JSON.parse(identity)?.model;if(typeof model==='string')limit=mayRetryAiModel(model)?3:1;}catch{/* Non-request identities retain their existing bound. */}
      this.failures.set(identity,row={count:0,limit});
    }
    row.count++;
    try{const result=await operation();this.failures.delete(identity);return result;}
    catch(error){row.error=error;if(error&&typeof error==='object'&&'answerStarted' in error&&error.answerStarted===true)row.limit=Math.min(row.limit,row.count+1);if(!isTransientAiFailure(error))this.failures.delete(identity);throw error;}
  }
}
