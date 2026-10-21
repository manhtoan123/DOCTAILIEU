import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {startSharedStateSync,syncSharedState} from '../src/features/sync-cloud/services/shared-state-sync';
import {captureSharedRecords} from '../src/features/sync-cloud/services/shared-state-local';
import type {SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';

const observed=vi.hoisted(()=>({records:undefined as SharedRecord[]|undefined}));
vi.mock('../src/features/sync-cloud/services/shared-state-local',async original=>{
 const actual=await original<typeof import('../src/features/sync-cloud/services/shared-state-local')>();
 return {...actual,captureSharedRecords:vi.fn(async()=>{const records=await actual.captureSharedRecords();observed.records=records;return records;})};
});
const capture=vi.mocked(captureSharedRecords);
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let hidden=false,documentEvents:EventTarget,windowEvents:EventTarget,stop:(()=>void)|undefined;
function visibility(value:boolean){hidden=value;documentEvents.dispatchEvent(new Event('visibilitychange'));}
beforeEach(async()=>{
 hidden=false;documentEvents=new EventTarget();windowEvents=new EventTarget();
 Object.defineProperty(documentEvents,'hidden',{get:()=>hidden});
 vi.stubGlobal('document',documentEvents);vi.stubGlobal('window',windowEvents);vi.stubGlobal('location',{origin:'https://visibility.example'});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 await db.delete();await db.open();capture.mockClear();observed.records=undefined;
});
afterEach(()=>{stop?.();stop=undefined;vi.unstubAllGlobals();vi.restoreAllMocks();});

it('suspends library observation and queued automatic sync while hidden, then captures unseen edits',async()=>{
 stop=startSharedStateSync();await syncSharedState();await vi.waitFor(()=>expect(capture).toHaveBeenCalled());
 await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:true}});
 await vi.waitFor(()=>expect(capture.mock.calls.length).toBeGreaterThan(1));
 await wait(80);visibility(true);
 const count=capture.mock.calls.length,network=vi.mocked(fetch).mock.calls.length;
 for(let i=0;i<5;i++)await db.settings.put({key:'reader-options',value:{preloadAi:true,autoNext:!!(i%2)}});
 windowEvents.dispatchEvent(new Event('focus'));windowEvents.dispatchEvent(new Event('online'));windowEvents.dispatchEvent(new Event('shared-state-changed'));
 await wait(1300);expect(capture).toHaveBeenCalledTimes(count);expect(fetch).toHaveBeenCalledTimes(network);
 visibility(false);await syncSharedState();await vi.waitFor(()=>expect(capture.mock.calls.length).toBeGreaterThan(count));
 await vi.waitFor(()=>expect(observed.records?.find(row=>row.kind==='reader-options')?.value).toMatchObject({preloadAi:true,autoNext:false}));
 expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(network);
});

it('starts hidden without scanning and observes the current database when shown',async()=>{
 hidden=true;stop=startSharedStateSync();await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:true}});await wait(80);
 expect(capture).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 visibility(false);await syncSharedState();await vi.waitFor(()=>expect(capture).toHaveBeenCalled());
 await vi.waitFor(()=>expect(observed.records?.find(row=>row.kind==='reader-options')?.value).toMatchObject({preloadAi:false}));
});

it('repeated visibility events retain one observer and cleanup cannot restart it',async()=>{
 stop=startSharedStateSync();await syncSharedState();await vi.waitFor(()=>expect(capture).toHaveBeenCalled());await wait(80);
 visibility(true);visibility(true);visibility(false);visibility(false);
 await syncSharedState();await wait(80);const count=capture.mock.calls.length;
 await db.settings.put({key:'reader-options',value:{preloadAi:true,autoNext:false}});await vi.waitFor(()=>expect(capture).toHaveBeenCalledTimes(count+1));
 stop();stop=undefined;const stopped=capture.mock.calls.length;
 visibility(true);visibility(false);windowEvents.dispatchEvent(new Event('shared-state-changed'));
 await db.settings.put({key:'reader-options',value:{preloadAi:true,autoNext:true}});await wait(100);
 expect(capture).toHaveBeenCalledTimes(stopped);
});
