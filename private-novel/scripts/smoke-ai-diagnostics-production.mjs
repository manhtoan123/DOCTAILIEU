import assert from 'node:assert/strict';
const endpoint = 'https://thu-phong-private.pages.dev/api/ai/translate';
const ids = new Set();
for (const [method, body, status, error] of [
  ['GET', undefined, 405, 'method_not_allowed'],
  ['POST', {text:''}, 400, 'text_empty'],
  ['POST', {text:'林儿推开窗。',model:'synthetic-invalid'},400,'ai_invalid_model'],
]) {
  // Validation-only requests: never reach Gemini or use a production story.
  const response = await fetch(endpoint,{method,headers:{'Content-Type':'application/json','X-AI-Request-ID':'synthetic-forged'},
    ...(body ? {body:JSON.stringify(body)} : {})});
  assert.equal(response.status,status);assert.deepEqual(await response.json(),{error});
  const id = response.headers.get('x-ai-request-id');
  assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.ok(!ids.has(id));ids.add(id);
  const duration = response.headers.get('x-ai-duration-ms');assert.match(duration,/^\d{1,10}$/);
  assert.equal(response.headers.get('x-ai-failure-reason'),'request_validation');
  assert.equal(response.headers.get('server-timing'),`total;dur=${duration}`);
  console.log(JSON.stringify({method,status,error,requestIdValid:true,unique:true,reason:'request_validation',durationMs:Number(duration),geminiCalled:false}));
}
