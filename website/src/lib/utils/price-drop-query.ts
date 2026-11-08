import {numericExpression} from './catalog-query';

// A first observation, an MRP discount or a date-only legacy entry is not
// evidence of a precisely timed price reduction.
export function priceDropPipeline(since:Date,now=new Date()):any[]{
  return [
    {$set:{__dropEvents:{$map:{input:{$cond:[{$isArray:'$price_history'},'$price_history',[]]},as:'event',in:{
      at:{$convert:{input:'$$event.timestamp',to:'date',onError:null,onNull:null}},
      previous:numericExpression('$$event.old_price'),observed:numericExpression('$$event.price'),
    }}}}},
    {$set:{__dropEvents:{$filter:{input:'$__dropEvents',as:'event',cond:{$and:[
      {$gte:['$$event.at',since]},{$lte:['$$event.at',now]},{$gt:['$$event.observed',0]},
      {$gt:['$$event.previous','$$event.observed']},{$gt:['$price',0]},{$lte:['$price','$$event.observed']},
    ]}}}}},
    {$set:{price_drop:{$reduce:{input:'$__dropEvents',initialValue:null,in:{$cond:[{$or:[{$eq:['$$value',null]},{$gt:['$$this.at','$$value.at']}]},'$$this','$$value']}}}}},
    {$match:{price_drop:{$ne:null},in_stock:{$ne:false}}},
    {$set:{price_drop_amount:{$subtract:['$price_drop.previous','$price']},price_drop_percent:{$multiply:[{$divide:[{$subtract:['$price_drop.previous','$price']},'$price_drop.previous']},100]}}},
    {$unset:'__dropEvents'},
  ];
}
