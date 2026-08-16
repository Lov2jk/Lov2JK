import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogPath=process.env.JKC_CATALOG_PATH||path.join(root,'content','products.json');
const rawPayload=process.env.PAGES_CMS_PAYLOAD||process.argv[2]||'';

const fail=message=>{throw new Error(message)};
const clean=value=>String(value??'').trim();
const normalizeSku=value=>clean(value).toUpperCase();

if(!rawPayload)fail('Pages CMS did not provide the duplicate-product details.');
let payload;
try{payload=JSON.parse(rawPayload)}catch{fail('The duplicate-product request was not valid JSON.');}

const inputs=payload.inputs||{};
const sourceSku=normalizeSku(inputs.sourceSku);
const newName=clean(inputs.newName);
const newSku=normalizeSku(inputs.newSku);
const newSlug=clean(inputs.newSlug).toLowerCase();

if(!sourceSku||!newName||!newSku||!newSlug)fail('Existing SKU, new name, new SKU and new URL slug are required.');
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug))fail('The new URL slug must contain lowercase letters, numbers and single hyphens only.');
if(!/^[A-Z0-9][A-Z0-9._-]*$/.test(newSku))fail('The new SKU can contain letters, numbers, dots, underscores and hyphens only.');
if(!fs.existsSync(catalogPath))fail(`Product catalog not found: ${catalogPath}`);

const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8').replace(/^\uFEFF/,''));
const products=Array.isArray(catalog.products)?catalog.products:fail('The product catalog does not contain a products list.');
const source=products.find(product=>normalizeSku(product.sku)===sourceSku);
if(!source)fail(`No product was found with SKU ${sourceSku}.`);
if(products.some(product=>normalizeSku(product.sku)===newSku))fail(`The SKU ${newSku} is already used by another product.`);
if(products.some(product=>clean(product.slug).toLowerCase()===newSlug))fail(`The URL slug ${newSlug} is already used by another product.`);

const allVariantSkus=new Set(products.flatMap(product=>(product.variants||[]).map(variant=>normalizeSku(variant.sku))).filter(Boolean));
const variants=(source.variants||[]).map((variant,index)=>{
  const sku=`${newSku}-V${String(index+1).padStart(2,'0')}`;
  if(allVariantSkus.has(sku))fail(`The generated variant SKU ${sku} is already in use. Choose another main SKU.`);
  return {...variant,sku,stock:0};
});

const duplicate={
  ...structuredClone(source),
  name:newName,
  slug:newSlug,
  sku:newSku,
  stock:0,
  available:false,
  visible:false,
  featured:false,
  variants,
  reviews:[]
};

products.push(duplicate);
fs.writeFileSync(catalogPath,JSON.stringify({...catalog,products},null,2)+'\n');
console.log(`Created hidden zero-stock copy ${newName} (${newSku}) from ${source.name} (${sourceSku}).`);
