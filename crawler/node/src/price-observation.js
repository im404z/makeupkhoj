export function numericPrice(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>0?value:null;
  const match=String(value??'').replaceAll(',','').match(/\d+(?:\.\d+)?/);
  const number=match?Number(match[0]):0;return number>0?number:null;
}
export function priceObservation(previous,current,timestamp,marketplace){
  const price=numericPrice(current),old_price=numericPrice(previous);
  if(price===null||price===old_price)return null;
  return {date:timestamp.slice(0,10),price,old_price,timestamp,marketplace};
}
