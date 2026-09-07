import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogueDir=path.join(root,'content','catalogues');
const raw=process.env.PAGES_CMS_PAYLOAD||process.argv[2]||'';
const clean=value=>String(value??'').trim();
const fail=message=>{throw new Error(message)};

if(!raw)fail('Pages CMS did not provide the duplicate-catalogue details.');
let payload;
try{payload=JSON.parse(raw)}catch{fail('The duplicate-catalogue request was not valid JSON.');}
const sourcePath=clean(payload.context?.path);
const inputs=payload.inputs||{};
const newTitle=clean(inputs.newTitle),newSlug=clean(inputs.newSlug).toLowerCase(),newCode=clean(inputs.newCode).toUpperCase(),newMonth=clean(inputs.newMonth),newYear=Math.max(2000,Number(inputs.newYear)||new Date().getFullYear());
if(!sourcePath.startsWith('content/catalogues/')||!sourcePath.endsWith('.json'))fail('Open the catalogue entry you want to duplicate, then run this action.');
if(!newTitle||!newSlug||!newCode||!newMonth)fail('New title, URL name, catalogue code and month are required.');
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug))fail('The new URL name must use lowercase letters, numbers and single hyphens only.');
const target=path.join(catalogueDir,`${newSlug}.json`);
if(fs.existsSync(target))fail(`The URL name ${newSlug} already exists.`);
const all=fs.readdirSync(catalogueDir).filter(file=>file.endsWith('.json')).map(file=>JSON.parse(fs.readFileSync(path.join(catalogueDir,file),'utf8')));
if(all.some(item=>clean(item.code).toUpperCase()===newCode))fail(`The catalogue code ${newCode} already exists.`);
const absoluteSource=path.resolve(root,sourcePath);
if(!absoluteSource.startsWith(path.resolve(catalogueDir)+path.sep)||!fs.existsSync(absoluteSource))fail('The source catalogue could not be found.');
const source=JSON.parse(fs.readFileSync(absoluteSource,'utf8'));
const duplicate={...structuredClone(source),title:newTitle,slug:newSlug,code:newCode,month:newMonth,year:newYear,publishedDate:new Date().toISOString().slice(0,10),status:'coming-soon',showOnWebsite:false,showOnHomepage:false,displayOrder:10,featuredOrder:10,seoTitle:`${newTitle} | JK Chennai`};
fs.writeFileSync(target,JSON.stringify(duplicate,null,2)+'\n');
console.log(`Created hidden catalogue copy ${newTitle} (${newCode}).`);
