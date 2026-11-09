export interface ImportStatus {message:string;percent:number;etaSeconds?:number}

const phases=['encoding','headings','chapters'] as const;
type TxtPhase=typeof phases[number];
export interface TxtWorkerProgress {type:'progress';phase:TxtPhase;read:number;total:number}

const phaseLabels:Record<TxtPhase,string>={
  encoding:'Kiểm tra encoding',
  headings:'Dò mốc chương',
  chapters:'Chia chương',
};
const phaseBounds=[0,.18,.43,.98];

export const txtPhaseLabel=(phase:TxtPhase)=>phaseLabels[phase];
export function txtProgressFraction({phase,read,total}:TxtWorkerProgress){
  const index=phases.indexOf(phase);
  return phaseBounds[index]+(phaseBounds[index+1]-phaseBounds[index])*Math.max(0,Math.min(1,read/Math.max(1,total)));
}

/** An ACK wait belongs to the caller. Only a forward worker checkpoint renews its deadline. */
export function createTxtWatchdog(onStall:()=>void,timeoutMs=30_000,probe?:()=>void){
  let timer:ReturnType<typeof setTimeout>|undefined,lastPhase=-1,lastRead=-1,probing=false;
  const clear=()=>{clearTimeout(timer);probing=false;};
  const arm=()=>{
    clear();
    timer=setTimeout(()=>{
      if(!probe){onStall();return;}
      probing=true;
      timer=setTimeout(onStall,10_000);
      probe();
    },timeoutMs);
  };
  return {arm,clear,responsive(){if(probing)arm();},advance(progress:TxtWorkerProgress){
    const phase=phases.indexOf(progress.phase);
    if(phase<0||!Number.isFinite(progress.read)||progress.read<0||
        phase<lastPhase||phase===lastPhase&&progress.read<=lastRead)return;
    lastPhase=phase;lastRead=progress.read;arm();
  }};
}

/** Estimate from observed progress, with a smoothed rate and rounded output. */
export function createImportProgress(now=()=>performance.now()){
  let sampleAt=now(),sampleFraction=0,fraction=0,rate=0,samples=0;
  return (message:string,next:number):ImportStatus=>{
    fraction=Math.max(fraction,Math.min(1,next));
    const elapsed=(now()-sampleAt)/1000;
    if(elapsed>=1&&fraction>sampleFraction){
      const observed=(fraction-sampleFraction)/elapsed;
      rate=samples?rate*.8+observed*.2:observed;
      samples++;sampleAt+=elapsed*1000;sampleFraction=fraction;
    }
    const percent=Math.floor(fraction*100);
    const remaining=samples>=2&&rate>0&&percent<99?(1-fraction)/rate:undefined;
    const etaSeconds=remaining!==undefined?Math.max(5,Math.round(remaining/5)*5):undefined;
    return {message,percent,...(etaSeconds!==undefined?{etaSeconds}:{})};
  };
}
