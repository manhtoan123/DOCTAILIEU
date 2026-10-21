export const nameCaseOptions=[
  {id:'lower',label:'Dùng chữ thường'},
  {id:'first',label:'Hoa chữ đầu'},
  {id:'firstTwo',label:'Hoa 2 chữ đầu'},
  {id:'lastLower',label:'Thường chữ cuối'},
  {id:'title',label:'Hoa toàn bộ'},
] as const;
export type NameCase=typeof nameCaseOptions[number]['id'];

/** Change word initials, preserving spacing, punctuation and Unicode characters. */
export function formatNameCase(value:string,mode:NameCase):string{
  const lower=value.toLocaleLowerCase('vi');
  const words=[...lower.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)];
  let index=0;
  return lower.replace(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu,word=>{
    const at=index++;
    const upper=mode==='title'||(mode==='first'&&at===0)||(mode==='firstTwo'&&at<2)||(mode==='lastLower'&&at<words.length-1);
    if(!upper)return word;
    const [initial,...rest]=Array.from(word);
    return initial.toLocaleUpperCase('vi')+rest.join('');
  });
}
