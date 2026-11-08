import test from 'node:test';
import assert from 'node:assert/strict';
import {priceObservation} from '../src/price-observation.js';
const now='2026-11-08T10:00:00.000Z';
test('equivalent formatted prices do not create false changes',()=>assert.equal(priceObservation('₹1,200',1200,now,'amazon'),null));
test('a decrease retains numeric baseline and exact time',()=>assert.deepEqual(priceObservation('₹1,200',900,now,'amazon'),{date:'2026-11-08',price:900,old_price:1200,timestamp:now,marketplace:'amazon'}));
test('first observations have no comparison price',()=>assert.equal(priceObservation(undefined,100,now,'nykaa').old_price,null));
test('invalid current prices are ignored',()=>{for(const price of [0,null,undefined,'Unavailable'])assert.equal(priceObservation(200,price,now,'nykaa'),null);});
