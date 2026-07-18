import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name,fallback={products:[]})=>{try{return JSON.parse(fs.readFileSync(path.join(root,'content',name),'utf8'))}catch{return fallback}};
const write=(name,data)=>fs.writeFileSync(path.join(root,'content',name),JSON.stringify(data,null,2)+'\n');
const catalog=read('products.json').products||[];
const previousStock=new Map((read('stock.json').products||[]).map(x=>[x.slug,x]));
const previousPrices=new Map((read('prices.json').products||[]).map(x=>[x.slug,x]));
const previousVisibility=new Map((read('visibility.json').products||[]).map(x=>[x.slug,x]));
const previousReviews=new Map((read('reviews.json').products||[]).map(x=>[x.slug,x]));

const identity=p=>({name:p.name||'Unnamed product',slug:p.slug||'',sku:p.sku||''});
write('stock.json',{products:catalog.map(p=>({...identity(p),stock:Math.max(0,Number(previousStock.get(p.slug)?.stock??p.stock)||0)}))});
write('prices.json',{products:catalog.map(p=>({...identity(p),price:Math.max(0,Number(previousPrices.get(p.slug)?.price??p.price)||0),offerPrice:previousPrices.has(p.slug)?previousPrices.get(p.slug).offerPrice:(p.offerPrice??null)}))});
write('visibility.json',{products:catalog.map(p=>({...identity(p),visible:previousVisibility.has(p.slug)?previousVisibility.get(p.slug).visible!==false:p.visible!==false}))});
write('reviews.json',{products:catalog.map(p=>({...identity(p),reviews:previousReviews.has(p.slug)?previousReviews.get(p.slug).reviews||[]:p.reviews||[]}))});

const requiredIssues=p=>{
  const issues=[];
  if(!p.name)issues.push('Product name');
  if(!p.slug)issues.push('URL slug');
  if(!p.sku)issues.push('SKU');
  if(!p.description)issues.push('Description');
  if(!(Number(p.price)>0))issues.push('Regular price');
  if(!p.category)issues.push('Category');
  if(!(p.images||[]).filter(Boolean).length)issues.push('Product image');
  if(p.category==='Dresses'&&!(p.sizes||[]).filter(Boolean).length)issues.push('Sizes');
  if(!(p.colors||[]).filter(Boolean).length)issues.push('Colours');
  return issues;
};
write('checklist.json',{products:catalog.map(p=>{const issues=requiredIssues(p);return{...identity(p),status:issues.length?'Needs attention':'Ready to sell',issues:issues.length?`Missing: ${issues.join(', ')}`:'All essential product information is complete.'}})});
console.log(`Synced Admin lists for ${catalog.length} products.`);
