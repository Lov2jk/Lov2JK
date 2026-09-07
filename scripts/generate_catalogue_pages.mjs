import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'content','catalogues.json'),'utf8'));
const escapeHtml=value=>String(value??'').replace(/[&"'<>]/g,char=>({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[char]));
const absolute=value=>new URL(String(value||'').replace(/^\//,''),'https://jkchennai.in/').href;

for(const item of data.catalogues||[]){
  if(!item.showOnWebsite||item.status==='archived')continue;
  const filename=`catalogue-${item.slug}.html`;
  const url=`https://jkchennai.in/${filename}`;
  const title=item.seoTitle||`${item.title} | JK Chennai`;
  const description=item.seoDescription||item.description||`Browse ${item.title} from JK Chennai.`;
  const products=(item.pages||[]).map((page,index)=>({
    '@type':'ListItem',
    position:index+1,
    item:{
      '@type':'Product',
      name:page.productName||page.productCode||`${item.title} design ${index+1}`,
      sku:page.productCode||undefined,
      image:absolute(page.image),
      url:`${url}?page=${index+1}`,
      offers:page.price?{'@type':'Offer',price:Number(page.price),priceCurrency:'INR',availability:page.availability==='sold-out'?'https://schema.org/OutOfStock':'https://schema.org/InStock'}:undefined
    }
  }));
  const schema={'@context':'https://schema.org','@type':'CollectionPage',name:item.title,description,url,image:absolute(item.coverImage),mainEntity:{'@type':'ItemList',itemListElement:products}};
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="JK Chennai"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${escapeHtml(absolute(item.coverImage))}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(absolute(item.coverImage))}"><link rel="stylesheet" href="assets/css/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head><body data-page="catalogue" data-catalogue-slug="${escapeHtml(item.slug)}"><div id="app"></div><script src="assets/js/app.js" defer></script><script src="assets/js/catalogues.js" defer></script></body></html>\n`;
  fs.writeFileSync(path.join(root,filename),html);
}

console.log(`Generated SEO pages for ${(data.catalogues||[]).filter(item=>item.showOnWebsite&&item.status!=='archived').length} catalogue(s).`);
