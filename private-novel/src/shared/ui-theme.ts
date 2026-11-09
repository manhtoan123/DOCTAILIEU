export type UiTheme='light'|'sepia'|'dark';
export const uiThemes:readonly {value:UiTheme;label:string}[]=[
  {value:'light',label:'Trắng'},
  {value:'sepia',label:'Giấy'},
  {value:'dark',label:'Tối'},
];
const cacheKey='reader-ui-theme';

export function normalizeUiTheme(value:unknown):UiTheme{
  if(value==='light')return 'light';
  if(value==='dark'||value==='gray')return 'dark';
  return 'sepia';
}
export function cachedUiTheme():UiTheme{
  try{return normalizeUiTheme(localStorage.getItem(cacheKey));}catch{return 'sepia';}
}
export function applyUiTheme(theme:UiTheme){
  if(typeof document!=='undefined'&&document.documentElement.dataset.uiTheme!==theme)document.documentElement.dataset.uiTheme=theme;
  try{if(localStorage.getItem(cacheKey)!==theme)localStorage.setItem(cacheKey,theme);}catch{/* IndexedDB remains authoritative when this cache is unavailable. */}
}
export function bootstrapUiTheme(){applyUiTheme(cachedUiTheme());}
