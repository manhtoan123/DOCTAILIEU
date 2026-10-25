const paragraph='天空中没有一丝光亮，所有人都站在原地。';
const names=[{key:'$林儿',value:'Tiểu Lâm'}];
export const serverConvertCases=[
 {id:'short',text:'林儿打开门。',names},
 {id:'paragraph95',text:paragraph.repeat(5),names},
 {id:'near512',text:paragraph.repeat(30).slice(0,512),names},
 {id:'unicode',text:'林儿😀，打开门！'.repeat(50),names},
 {id:'names100',text:paragraph.repeat(5),names:[...names,...Array.from({length:99},(_,i)=>({key:`$合成人名${i}`,value:`Tên mẫu ${i}`}))]},
 {id:'candidateOverflow',text:Array.from({length:512},(_,i)=>String.fromCodePoint(0x4e00+i)).join(''),names:[],expectedStatus:413,expectedError:'candidate_limit'},
];
