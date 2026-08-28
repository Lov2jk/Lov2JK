import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=process.argv[2]||path.join(root,'imports','products-bulk.json');
const productDir=process.env.JKC_PRODUCT_DIR||path.join(root,'content','products');
const split=value=>String(value||'').split('|').map(x=>x.trim()).filter(Boolean);
const truth=value=>/^(true|yes|1|publish|published)$/i.test(String(value||''));
const slugify=value=>String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const parse=text=>{const out=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell);cell=''}else if(/[\r\n]/.test(c)&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))out.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(x=>x.trim()))out.push(row);return out};

if(!fs.existsSync(input))throw new Error(`Bulk product file not found: ${input}`);
fs.mkdirSync(productDir,{recursive:true});
const sourceText=fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'');
let table,headers;
if(path.extname(input).toLowerCase()==='.json'){
  const data=JSON.parse(sourceText);
  const records=Array.isArray(data)?data:data.products;
  if(!Array.isArray(records))throw new Error('The bulk product file must contain a products list.');
  headers=['Product Name','SKU','Slug','Category','Regular Price','Offer Price','Stock','Colours','Sizes','Age Group','Image Filenames','Description','Publish','Featured'];
  table=records.map(record=>[
    record.name,record.sku,record.slug,record.category,record.price,record.offerPrice,record.stock,
    Array.isArray(record.colors)?record.colors.join('|'):record.colors,
    Array.isArray(record.sizes)?record.sizes.join('|'):record.sizes,
    record.ageGroup,
    Array.isArray(record.imageFilenames)?record.imageFilenames.join('|'):record.imageFilenames,
    record.description,record.publish===true?'Yes':'No',record.featured===true?'Yes':'No'
  ].map(value=>value==null?'':String(value)));
}else{
  table=parse(sourceText);
  headers=(table.shift()||[]).map(x=>x.trim());
}
if(!headers.length)throw new Error('The bulk product file has no column names.');
const get=(row,...names)=>{for(const name of names){const index=headers.indexOf(name);if(index>=0&&row[index]?.trim())return row[index].trim()}return''};
const existing=fs.readdirSync(productDir).filter(file=>file.endsWith('.json')).map(file=>JSON.parse(fs.readFileSync(path.join(productDir,file),'utf8')));
const bySku=new Map(existing.map(product=>[String(product.sku||'').toUpperCase(),product]));
const usedSlugs=new Map(existing.map(product=>[product.slug,String(product.sku||'').toUpperCase()]));
const seen=new Set(),preview=[];

for(const [index,row] of table.entries()){
  const line=index+2,name=get(row,'Product Name','Name'),sku=get(row,'Main SKU','SKU').toUpperCase(),category=get(row,'Category Slug','Category');
  const slug=(get(row,'Slug','URL Slug')||slugify(name)).toLowerCase();
  if(!name||!sku||!category)throw new Error(`Row ${line}: Product Name, SKU and Category are required.`);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error(`Row ${line}: invalid URL slug ${slug}.`);
  if(!/^[A-Z0-9][A-Z0-9._-]*$/.test(sku))throw new Error(`Row ${line}: invalid SKU ${sku}.`);
  if(seen.has(sku))throw new Error(`Row ${line}: duplicate SKU ${sku} in the spreadsheet.`);
  if(usedSlugs.has(slug)&&usedSlugs.get(slug)!==sku)throw new Error(`Row ${line}: URL slug ${slug} belongs to another product.`);
  seen.add(sku);
  const previous=bySku.get(sku)||{},next={...previous,name,sku,slug,category};
  const textFields=[['description','Description'],['ageGroup','Age Group'],['material','Material'],['care','Care'],['measurements','Measurements'],['included','Included'],['deliveryInfo','Delivery Info'],['returnInfo','Return Info'],['safetyInfo','Safety Info']];
  for(const [key,label] of textFields){const value=get(row,label);if(value)next[key]=value}
  const price=get(row,'Regular Price','Price'),offer=get(row,'Offer Price'),stock=get(row,'Main Stock','Stock');
  if(price)next.price=Number(price);if(offer)next.offerPrice=Number(offer);if(stock)next.stock=Math.max(0,Number(stock)||0);
  const colors=split(get(row,'Colours','Colors')),sizes=split(get(row,'Sizes')),images=split(get(row,'Image URLs or Paths','Images','Image Filenames'));
  if(colors.length)next.colors=colors;if(sizes.length)next.sizes=sizes;if(images.length)next.images=images.map(image=>/^https?:|^assets\//i.test(image)?image:`assets/images/products/${image}`);
  const featured=get(row,'Featured'),visible=get(row,'Visible','Publish');
  if(featured)next.featured=truth(featured);if(visible)next.visible=truth(visible);else if(!bySku.has(sku))next.visible=false;
  if(!(Number(next.price)>0))throw new Error(`Row ${line}: Regular Price is required for a new product.`);
  if(!next.description)throw new Error(`Row ${line}: Description is required for a new product.`);
  next.stock=Math.max(0,Number(next.stock)||0);next.available=next.stock>0;
  const variantSkus=split(get(row,'Variant SKUs')),variantStocks=split(get(row,'Variant Stocks'));
  if(variantSkus.length||variantStocks.length){
    const combos=[];for(const color of next.colors?.length?next.colors:[''])for(const size of next.sizes?.length?next.sizes:[''])combos.push({color,size});
    if(variantSkus.length!==variantStocks.length||variantSkus.length!==combos.length)throw new Error(`Row ${line}: provide one Variant SKU and stock quantity for every colour-size combination.`);
    next.variants=variantSkus.map((variantSku,i)=>({sku:variantSku.toUpperCase(),color:combos[i].color,size:combos[i].size,stock:Math.max(0,Number(variantStocks[i])||0)}));
  }
  fs.writeFileSync(path.join(productDir,`${slug}.json`),JSON.stringify(next,null,2)+'\n');
  if(previous.slug&&previous.slug!==slug)fs.rmSync(path.join(productDir,`${previous.slug}.json`),{force:true});
  preview.push(`${bySku.has(sku)?'UPDATED':'NEW DRAFT'}: ${name} (${sku})`);
}

console.log(preview.join('\n'));
console.log(`Validated and imported ${table.length} bulk product rows.`);
