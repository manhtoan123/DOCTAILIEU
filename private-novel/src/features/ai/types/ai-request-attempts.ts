import {isTransientAiFailure} from '../services/ai-recovery';
/** Per-job limits shared by all recovery layers. Never persisted or logged. */
export class AiRequestAttempts {
  private failures=new Map<string,{count:number;error?:unknown}>();
  async send<T>(identity:string,operation:()=>Promise<T>):Promise<T>{
    let row=this.failures.get(identity);
    if(row&&row.count>=3)throw row.error??new Error('Phần dịch đang phục hồi.');
    if(!row)this.failures.set(identity,row={count:0});
    row.count++;
    try{const result=await operation();this.failures.delete(identity);return result;}
    catch(error){row.error=error;if(!isTransientAiFailure(error))this.failures.delete(identity);throw error;}
  }
}
