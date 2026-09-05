import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=path.join(root,'content','catalogues');
const outputPath=path.join(root,'content','catalogues.json');
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clean=value=>String(value??'').trim();
const files=fs.existsSync(sourceDir)?fs.readdirSync(sourceDir).filter(file=>file.endsWith('.json')).sort():[];
const catalogues=[],slugs=new Set(),codes=new Set();

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
  item.pages=(item.pages||[]).map(clean).filter(Boolean);
  item.coverImage=clean(item.coverImage)||item.pages[0]||'';
  if(!item.coverImage)throw new Error(`${file}: add a cover image or at least one catalogue JPG.`);
  item.startingPrice=Math.max(0,Number(item.startingPrice)||0);
  item.stylesCount=Math.max(0,Number(item.stylesCount)||0);
  item.year=Math.max(0,Number(item.year)||0);
  item.displayOrder=Number(item.displayOrder)||9999;
  item.showOnWebsite=item.showOnWebsite===true;
  item.showOnHomepage=item.showOnHomepage===true;
  item.status=['available','temporarily-unavailable','coming-soon','archived'].includes(item.status)?item.status:'available';
  catalogues.push(item);
}

catalogues.sort((a,b)=>a.displayOrder-b.displayOrder||b.year-a.year||a.title.localeCompare(b.title));
fs.writeFileSync(outputPath,JSON.stringify({catalogues},null,2)+'\n');
console.log(`Built catalogue index with ${catalogues.length} catalogue(s).`);
