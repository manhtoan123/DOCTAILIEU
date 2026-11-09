/** Groq OpenAI-compatible transport. No credential or provider response is logged. */
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function groqRequest(key:string,model:string,input:{systemPrompt:string;userContent:string;temperature:number},signal:AbortSignal,stream:boolean):[string,RequestInit]{
 return ['https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'manual',signal,
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
  body:JSON.stringify({model,messages:[{role:'system',content:input.systemPrompt},{role:'user',content:input.userContent}],temperature:input.temperature,max_completion_tokens:8192,reasoning_effort:'none',stream,...(stream?{stream_options:{include_usage:true}}:{})})}];
}
/** Normalize only the single, text-only answer; reasoning/tool calls never become translations. */
export function normalizeGroqResponse(data:unknown,stream=false):unknown{
 if(!record(data)||data.error!==undefined||!Array.isArray(data.choices)||data.choices.length>1)throw Error('Invalid Groq response');
 if(data.model!==undefined&&data.model!=='qwen/qwen3.8-27b')throw Error('Unexpected Groq model');
 let usageMetadata:Record<string,unknown>|undefined;
 if(data.usage!==undefined&&data.usage!==null){
  if(!record(data.usage))throw Error('Invalid Groq usage');
  usageMetadata={promptTokenCount:data.usage.prompt_tokens,candidatesTokenCount:data.usage.completion_tokens,totalTokenCount:data.usage.total_tokens};
  if(record(data.usage.completion_tokens_details))usageMetadata.thoughtsTokenCount=data.usage.completion_tokens_details.reasoning_tokens;
 }
 const candidates=data.choices.map(choice=>{
  if(!record(choice)||choice.index!==undefined&&choice.index!==0)throw Error('Invalid Groq choice');
  const message=stream?choice.delta:choice.message;
  if(!record(message)||message.tool_calls!==undefined||message.function_call!==undefined||message.content!==undefined&&message.content!==null&&typeof message.content!=='string')throw Error('Invalid Groq content');
  const reason=choice.finish_reason;
  if(reason!==undefined&&reason!==null&&typeof reason!=='string')throw Error('Invalid Groq finish');
  return {index:0,content:{parts:typeof message.content==='string'?[{text:message.content}]:[]},...(reason==null?{}:{finishReason:reason==='stop'?'STOP':reason==='length'?'MAX_TOKENS':reason==='content_filter'?'SAFETY':'OTHER'})};
 });
 return {candidates,...(usageMetadata?{usageMetadata}:{})};
}
