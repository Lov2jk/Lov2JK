import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveCatalogues} from '../assets/js/catalogue-commerce.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=path.join(root,'content','catalogues');
const outputPath=path.join(root,'content','catalogues.json');
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clean=value=>String(value??'').trim();
const productCodeFromImage=image=>path.basename(clean(image),path.extname(clean(image))).replace(/-(?:image-?)?\d+$/i,'').toUpperCase();
const files=fs.existsSync(sourceDir)?fs.readdirSync(sourceDir).filter(file=>file.endsWith('.json')).sort():[];
const catalogues=[],slugs=new Set(),codes=new Set();
const readContent=name=>JSON.parse(fs.readFileSync(path.join(root,'content',`${name}.json`),'utf8').replace(/^\uFEFF/,''));
const shop=readContent('products').products||[];

for(const file of files){
  const item=JSON.parse(fs.readFileSync(path.join(sourceDir,file),'utf8').replace(/^\uFEFF/,''));
  item.title=clean(item.title);
  item.slug=clean(item.slug).toLowerCase();
  item.code=clean(item.code).toUpperCase();
  item.category=clean(item.category);
  item.description=clean(item.description);
  if(!item.title||!item.slug||!item.code||!item.category)throw new Error(`${file}: title, URL name, catalogue code and category are required.`);
  if(!slugPattern.test(item.slug))throw new Error(`${file}: invalid URL name ${item.slug}.`);
  if(slugs.has(item.slug))throw new Error(`${file}: duplicate URL name ${item.slug}.`);
  if(codes.has(item.code))throw new Error(`${file}: duplicate catalogue code ${item.code}.`);
  slugs.add(item.slug);codes.add(item.code);
  item.pages=(item.pages||[]).map((page,index)=>{
    const source=typeof page==='string'?{image:page}:page||{};
    const image=clean(source.image);
    if(!image)return null;
    return{
      image,
      managedProduct:source.managedProduct===true||shop.some(p=>p.sku===clean(source.productCode).toUpperCase()),
      showOnWebsite:source.showOnWebsite!==false,
      colors:clean(source.colors),
      productCode:clean(source.productCode).toUpperCase()||productCodeFromImage(image)||`${item.code}-P${index+1}`,
      productName:clean(source.productName),
      price:Math.max(0,Number(source.price)||0),
      sizes:clean(source.sizes),
      availability:['available','low-stock','sold-out','coming-soon'].includes(source.availability)?source.availability:'available'
    };
  }).filter(Boolean);
  item.coverImage=clean(item.coverImage)||item.pages[0]?.image||'';
  if(!item.coverImage)throw new Error(`${file}: add a cover image or at least one catalogue JPG.`);
  item.startingPrice=Math.max(0,Number(item.startingPrice)||0);
  item.stylesCount=Math.max(0,Number(item.stylesCount)||0);
  item.year=Math.max(0,Number(item.year)||0);
  item.displayOrder=Number(item.displayOrder)||9999;
  item.featuredOrder=Number(item.featuredOrder)||9999;
  item.publishedDate=clean(item.publishedDate);
  item.newBadgeDays=Math.max(0,Number(item.newBadgeDays)||30);
  item.seoTitle=clean(item.seoTitle);
  item.seoDescription=clean(item.seoDescription)||item.description;
  item.showOnWebsite=item.showOnWebsite===true;
  item.showOnHomepage=item.showOnHomepage===true;
  item.status=['available','temporarily-unavailable','coming-soon','archived'].includes(item.status)?item.status:'available';
  catalogues.push(item);
}

catalogues.sort((a,b)=>a.displayOrder-b.displayOrder||b.year-a.year||a.title.localeCompare(b.title));
const resolved=resolveCatalogues(catalogues,shop,{prices:readContent('prices').products,stock:readContent('stock').products,visibility:readContent('visibility').products,variants:readContent('variant-stock').variants});
fs.writeFileSync(outputPath,JSON.stringify({catalogues:resolved},null,2)+'\n');
console.log(`Built catalogue index with ${catalogues.length} catalogue(s).`);
