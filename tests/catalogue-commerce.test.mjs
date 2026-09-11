import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCatalogues,validateLine,buildMessage,quantityOf} from '../assets/js/catalogue-commerce.mjs';
const source=[{slug:'kids',showOnWebsite:true,status:'available',pages:[{productCode:'A',managedProduct:true,image:'a.jpg',price:250}]}];
const products=[{sku:'A',slug:'a',price:499,offerPrice:349,stock:3,sizes:['3Y','4Y'],colors:['Blue'],visible:true}];
const items=resolveCatalogues(source,products);
const line={catalogueSlug:'kids',productCode:'A',size:'3Y',color:'Blue',qty:2};
test('shop price is authoritative, including quick-price overrides',()=>{
  assert.equal(items[0].pages[0].price,349);
  assert.equal(resolveCatalogues(source,products,{prices:[{slug:'a',price:300,offerPrice:275} ]})[0].startingPrice,275);
});
test('removed, hidden and individually hidden products do not reappear',()=>{
  assert.equal(resolveCatalogues(source,[])[0].pages.length,0);
  assert.equal(resolveCatalogues(source,[{...products[0],visible:false}])[0].pages.length,0);
  assert.equal(resolveCatalogues([{...source[0],pages:[{...source[0].pages[0],showOnWebsite:false}]}],products)[0].pages.length,0);
});
test('valid selections and current prices are used; saved prices are ignored',()=>{
  assert.equal(validateLine({...line,price:1},items).total,698);
  assert.match(buildMessage([line],items,'JKC-E-TEST','https://jkchennai.in/'),/INR 698/);
});
test('invalid sizes, colours, quantities and stock are rejected',()=>{
  for(const change of [{size:''},{size:'9Y'},{color:'Red'},{qty:0},{qty:1.5},{qty:4},{qty:Infinity}])assert.ok(validateLine({...line,...change},items).error);
  assert.equal(quantityOf('2'),2);
});
test('hidden collections and unavailable variants cannot be ordered',()=>{
  assert.ok(validateLine(line,[{...items[0],status:'coming-soon'}]).error);
  assert.ok(validateLine(line,[{...items[0],showOnWebsite:false}]).error);
  const withVariants=resolveCatalogues(source,[{...products[0],variants:[{size:'3Y',color:'Blue',stock:0}]}]);
  assert.ok(validateLine(line,withVariants).error);
});
test('catalogue-only designs and multiple photos remain supported',()=>{
  const standalone=resolveCatalogues([{...source[0],pages:[{productCode:'B',image:'b.jpg',price:250,sizes:'3Y, 4Y'}]}],[]);
  assert.equal(validateLine({...line,productCode:'B',color:''},standalone).total,500);
  assert.equal(resolveCatalogues([{...source[0],pages:[...source[0].pages,...source[0].pages]}],products)[0].stylesCount,1);
});
