import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const productDir=process.env.JKC_PRODUCT_DIR||path.join(root,'content','products');
const catalogPath=process.env.JKC_CATALOG_PATH||path.join(root,'content','products.json');
const imageDir=process.env.JKC_IMAGE_DIR||path.join(root,'assets','images','products');
const migrate=process.argv.includes('--migrate');
const clean=value=>String(value??'').trim();
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skuPattern=/^[A-Z0-9][A-Z0-9._-]*$/;

fs.mkdirSync(productDir,{recursive:true});

if(migrate){
  const legacy=JSON.parse(fs.readFileSync(catalogPath,'utf8').replace(/^\uFEFF/,''));
  for(const [catalogOrder,source] of (legacy.products||[]).entries()){
    if(!slugPattern.test(clean(source.slug)))throw new Error(`Cannot migrate invalid product slug: ${source.slug}`);
    const advanced={},display={};
    for(const key of ['videoUrl','videoPoster','material','care','measurements','included','deliveryInfo','returnInfo','safetyInfo','sizeGuide']){
      if(source[key]!==undefined&&source[key]!==''&&!(Array.isArray(source[key])&&!source[key].length))advanced[key]=source[key];
    }
    const basic={...source,catalogOrder:source.catalogOrder||catalogOrder+1};
    Object.keys(advanced).forEach(key=>delete basic[key]);
    for(const key of ['imageFit','imagePosition','slideshowEnabled','slideSeconds']){
      if(source[key]!==undefined){display[key]=source[key];delete basic[key];}
    }
    if(Object.keys(display).length)basic.display=display;
    if(Object.keys(advanced).length)basic.advanced=advanced;
    fs.writeFileSync(path.join(productDir,`${source.slug}.json`),JSON.stringify(basic,null,2)+'\n');
  }
  console.log(`Migrated ${(legacy.products||[]).length} products into individual Admin entries.`);
}

const files=fs.readdirSync(productDir).filter(name=>name.endsWith('.json')).sort();
if(!files.length)throw new Error('No individual product files were found.');
const imageFiles=fs.existsSync(imageDir)?fs.readdirSync(imageDir).filter(name=>/\.(?:jpe?g|png|webp|gif)$/i.test(name)):[];
const products=[],slugs=new Set(),skus=new Set(),variantSkus=new Set();

for(const file of files){
  const source=JSON.parse(fs.readFileSync(path.join(productDir,file),'utf8').replace(/^\uFEFF/,''));
  const product={...source,...(source.display||{}),...(source.advanced||{})};
  delete product.display;
  delete product.advanced;
  product.name=clean(product.name);
  product.slug=clean(product.slug).toLowerCase();
  product.sku=clean(product.sku).toUpperCase();
  product.description=clean(product.description);
  product.category=clean(product.category);
  if(!product.name||!product.description||!product.category)throw new Error(`${file}: product name, description and category are required.`);
  if(!slugPattern.test(product.slug))throw new Error(`${file}: invalid URL slug ${product.slug}.`);
  if(!skuPattern.test(product.sku))throw new Error(`${file}: invalid SKU ${product.sku}.`);
  if(slugs.has(product.slug))throw new Error(`${file}: duplicate URL slug ${product.slug}.`);
  if(skus.has(product.sku))throw new Error(`${file}: duplicate SKU ${product.sku}.`);
  slugs.add(product.slug);skus.add(product.sku);
  product.price=Math.max(0,Number(product.price)||0);
  if(!(product.price>0))throw new Error(`${file}: regular price must be greater than zero.`);
  product.offerPrice=product.offerPrice===''||product.offerPrice==null?undefined:Math.max(0,Number(product.offerPrice)||0);
  product.stock=Math.max(0,Number(product.stock)||0);
  product.colors=(product.colors||[]).map(clean).filter(Boolean);
  product.sizes=(product.sizes||[]).map(clean).filter(Boolean);
  product.images=(product.images||[]).map(clean).filter(Boolean);
  if(!product.images.length){
    const prefix=product.sku.toLowerCase();
    product.images=imageFiles.filter(name=>name.toLowerCase().startsWith(prefix)).sort().map(name=>`assets/images/products/${name}`);
  }
  product.variants=(product.variants||[]).map((variant,index)=>{
    const sku=clean(variant.sku).toUpperCase()||`${product.sku}-V${String(index+1).padStart(2,'0')}`;
    if(variantSkus.has(sku)||skus.has(sku))throw new Error(`${file}: duplicate variant SKU ${sku}.`);
    variantSkus.add(sku);
    return{...variant,sku,color:clean(variant.color),size:clean(variant.size),stock:Math.max(0,Number(variant.stock)||0)};
  });
  product.featured=product.featured===true;
  product.visible=product.visible!==false;
  product.available=product.stock>0;
  product.slideshowEnabled=product.slideshowEnabled!==false;
  product.slideSeconds=Math.max(2,Number(product.slideSeconds)||4);
  products.push(product);
}

products.sort((a,b)=>(Number(a.catalogOrder)||999999)-(Number(b.catalogOrder)||999999)||a.name.localeCompare(b.name));

fs.writeFileSync(catalogPath,JSON.stringify({products},null,2)+'\n');
console.log(`Built customer catalog from ${products.length} individual products.`);
