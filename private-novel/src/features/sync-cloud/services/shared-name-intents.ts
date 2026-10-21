export const SHARED_NAME_TOMBS='shared-name-deleted:';
export const SHARED_CONVERT_TOMBS='shared-convert-deleted:';
export const nameTombKey=(bookId:string,key:string)=>SHARED_NAME_TOMBS+bookId+':'+encodeURIComponent(key);
export const convertTombKey=(key:string)=>SHARED_CONVERT_TOMBS+encodeURIComponent(key);
