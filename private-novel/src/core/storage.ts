export interface StorageEstimate { usage?:number; quota?:number }
export function assertStorageBudget(estimate:StorageEstimate|undefined,extraBytes:number,safetyRatio=0.9) {
  if(!Number.isFinite(extraBytes)||extraBytes<0)throw new Error('Kích thước dữ liệu không hợp lệ.');
  if(!estimate?.quota||!Number.isFinite(estimate.quota)||estimate.quota<=0)return;
  const usage=Number.isFinite(estimate.usage)?estimate.usage!:0;
  if(usage+extraBytes>estimate.quota*safetyRatio)throw new Error('Không đủ dung lượng lưu trữ an toàn. Hãy sao lưu hoặc xóa dữ liệu không cần thiết rồi thử lại.');
}