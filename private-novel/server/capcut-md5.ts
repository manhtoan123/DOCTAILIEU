/** MD5 for the upstream protocol signature only; never for password/security hashing. */
export function capcutMd5(text:string):string {
  const input=new TextEncoder().encode(text),length=Math.ceil((input.length+9)/64)*64;
  const bytes=new Uint8Array(length);bytes.set(input);bytes[input.length]=0x80;
  const view=new DataView(bytes.buffer);view.setUint32(length-8,input.length*8,true);
  view.setUint32(length-4,Math.floor(input.length/0x20000000),true);
  const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  for(let offset=0;offset<length;offset+=64){
    let a=a0,b=b0,c=c0,d=d0;
    for(let i=0;i<64;i++){
      const group=Math.floor(i/16),shift=shifts[group*4+i%4];
      const f=group===0?(b&c)|(~b&d):group===1?(d&b)|(~d&c):group===2?b^c^d:c^(b|~d);
      const word=group===0?i:group===1?(5*i+1)%16:group===2?(3*i+5)%16:(7*i)%16;
      const sum=(a+f+Math.floor(Math.abs(Math.sin(i+1))*0x100000000)+view.getUint32(offset+word*4,true))|0;
      const next=(b+((sum<<shift)|(sum>>>(32-shift))))|0;
      a=d;d=c;c=b;b=next;
    }
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  const result=new DataView(new ArrayBuffer(16));[a0,b0,c0,d0].forEach((word,i)=>result.setInt32(i*4,word,true));
  return [...new Uint8Array(result.buffer)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
