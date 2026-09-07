document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="assets/css/catalogues.css">');

const catalogueState={items:[],current:null,index:0,settings:{},wa:null};
const catalogueSafe=value=>String(value??'').replace(/[&"'<>]/g,char=>({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[char]));
const catalogueMoney=value=>Number(value)>0?`₹${Number(value).toLocaleString('en-IN')}`:'';
const statusLabels={available:'Available','temporarily-unavailable':'Temporarily unavailable','coming-soon':'Coming soon',archived:'Archived'};
const productStatusLabels={available:'Available','low-stock':'Low stock','sold-out':'Sold out','coming-soon':'Coming soon'};
const catalogueLink=item=>`catalogue-${encodeURIComponent(item.slug)}.html`;
const cataloguePage=item=>{const page=item?.pages?.[catalogueState.index];return typeof page==='string'?{image:page,productCode:item.code}:page||{image:item?.coverImage,productCode:item?.code}};
const catalogueIsNew=item=>{const published=Date.parse(item.publishedDate);if(!Number.isFinite(published))return false;return Date.now()-published<=Math.max(0,Number(item.newBadgeDays)||30)*86400000&&Date.now()>=published};
const enquiryKey='jkc-catalogue-enquiries';
const enquiryReference=()=>`JKC-E-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
const readEnquiries=()=>{try{return JSON.parse(localStorage.getItem(enquiryKey)||'[]')}catch{return[]}};
const saveEnquiry=enquiry=>{const list=[enquiry,...readEnquiries().filter(item=>item.reference!==enquiry.reference)].slice(0,20);localStorage.setItem(enquiryKey,JSON.stringify(list));return list};

async function loadCatalogues(){
  if(catalogueState.items.length)return catalogueState.items;
  const response=await fetch('content/catalogues.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Could not load catalogues');
  const data=await response.json();
  catalogueState.items=data.catalogues||[];
  return catalogueState.items;
}

function catalogueCard(item,compact=false){
  const price=catalogueMoney(item.startingPrice),status=statusLabels[item.status]||'Available';
  return`<article class="catalogue-card ${compact?'compact':''}"><a href="${catalogueLink(item)}" class="catalogue-cover"><img src="${catalogueSafe(item.coverImage)}" alt="${catalogueSafe(item.title)}" loading="lazy"><span class="catalogue-status status-${catalogueSafe(item.status)}">${status}</span>${catalogueIsNew(item)?'<span class="catalogue-new-badge">New</span>':''}</a><div class="catalogue-card-copy"><p class="eyebrow">${catalogueSafe(item.month)} ${catalogueSafe(item.year)}</p><h3><a href="${catalogueLink(item)}">${catalogueSafe(item.title)}</a></h3><p class="catalogue-meta">${catalogueSafe(item.category)}${item.stylesCount?` · ${Number(item.stylesCount)} styles`:''}${item.ageGroup?` · ${catalogueSafe(item.ageGroup)}`:''}</p>${price?`<b class="catalogue-price">${item.startingPrice>0?'From ':''}${price}</b>`:''}<div class="catalogue-actions"><a class="btn" href="${catalogueLink(item)}">View catalogue →</a><button class="btn secondary" type="button" onclick="shareCatalogue('${catalogueSafe(item.slug)}')" aria-label="Share ${catalogueSafe(item.title)}">Share</button></div></div></article>`;
}

window.renderCatalogueFeature=async function({settings,wa}={}){
  catalogueState.settings=settings||{};catalogueState.wa=wa;
  try{
    const items=(await loadCatalogues()).filter(item=>item.showOnWebsite&&item.showOnHomepage&&item.status!=='archived').sort((a,b)=>(a.featuredOrder||9999)-(b.featuredOrder||9999)||(a.displayOrder||9999)-(b.displayOrder||9999)).slice(0,4);
    if(!items.length)return;
    const section=document.createElement('section');
    section.className='wrap section home-catalogues';
    section.id='latest-catalogues';
    section.innerHTML=`<div class="section-head"><div><p class="eyebrow">Browse more, upload less</p><h2>Latest catalogues</h2><p>Swipe through our newest collections and order any design by Product Code.</p></div><a href="catalogues.html">View all catalogues →</a></div><div class="catalogue-rail">${items.map(item=>catalogueCard(item,true)).join('')}</div>`;
    const trust=document.querySelector('.home-trust'),categories=document.querySelector('#home-categories');
    if(trust)trust.insertAdjacentElement('afterend',section);else if(categories)categories.insertAdjacentElement('beforebegin',section);
  }catch{}
};

function catalogueList(items){
  const app=document.querySelector('#catalogue-app');
  const visible=items.filter(item=>item.showOnWebsite);
  const categories=[...new Set(visible.map(item=>item.category).filter(Boolean))].sort();
  app.innerHTML=`<header class="catalogue-page-head"><p class="eyebrow">JK Chennai collections</p><h1>Browse our latest catalogues.</h1><p>Choose a design and tap WhatsApp. Its Product Code and image link are added automatically.</p></header><div class="catalogue-filters" aria-label="Catalogue filters"><button class="selected" data-category="">All</button>${categories.map(category=>`<button data-category="${catalogueSafe(category)}">${catalogueSafe(category)}</button>`).join('')}</div><p class="catalogue-count" aria-live="polite"></p><div class="catalogue-grid"></div>`;
  const draw=category=>{
    const filtered=visible.filter(item=>!category||item.category===category);
    app.querySelector('.catalogue-grid').innerHTML=filtered.map(item=>catalogueCard(item)).join('')||'<div class="catalogue-empty"><h2>No active catalogues</h2><p>Please view another category or message JK Chennai.</p></div>';
    app.querySelector('.catalogue-count').textContent=`${filtered.length} catalogue${filtered.length===1?'':'s'}`;
  };
  app.querySelectorAll('.catalogue-filters button').forEach(button=>button.onclick=()=>{app.querySelectorAll('.catalogue-filters button').forEach(item=>item.classList.remove('selected'));button.classList.add('selected');draw(button.dataset.category)});
  draw('');
}

function unavailableCatalogue(){
  document.querySelector('#catalogue-app').innerHTML=`<div class="catalogue-unavailable"><p class="eyebrow">Collection update</p><h1>This catalogue is currently unavailable.</h1><p>Please explore our latest active collections or ask our Chennai team for a suitable alternative.</p><div class="actions"><a class="btn" href="catalogues.html">View latest catalogues</a><a class="btn secondary" href="https://wa.me/${catalogueState.settings.whatsapp||'919363529266'}?text=${encodeURIComponent('Hello JK Chennai! Please show me your latest available catalogues.')}" target="_blank" rel="noopener">Chat on WhatsApp</a></div></div>`;
}

function catalogueWhatsAppUrl(message){
  return catalogueState.wa?catalogueState.wa(message):`https://wa.me/${catalogueState.settings.whatsapp||'919363529266'}?text=${encodeURIComponent(message)}`;
}

function renderCurrentProduct(){
  const page=cataloguePage(catalogueState.current),box=document.querySelector('#catalogue-current-product');if(!box)return;
  const status=productStatusLabels[page.availability]||'Available';
  box.innerHTML=`<div><span>Product Code</span><strong>${catalogueSafe(page.productCode||catalogueState.current.code)}</strong>${page.productName?`<small>${catalogueSafe(page.productName)}</small>`:''}</div>${page.price?`<div><span>Price</span><strong>${catalogueMoney(page.price)}</strong></div>`:''}${page.sizes?`<div><span>Sizes</span><strong>${catalogueSafe(page.sizes)}</strong></div>`:''}<div><span>Availability</span><strong class="product-status status-${catalogueSafe(page.availability)}">${catalogueSafe(status)}</strong></div>`;
  const order=document.querySelector('#catalogue-product-order');if(order){order.disabled=page.availability==='sold-out';order.textContent=page.availability==='sold-out'?'Currently sold out':'WhatsApp this design'}
}

function renderEnquiryHistory(){
  const root=document.querySelector('#catalogue-enquiry-history');if(!root)return;
  const list=readEnquiries().filter(entry=>entry.catalogueSlug===catalogueState.current?.slug).slice(0,5);
  root.innerHTML=list.length?`<details><summary>My recent enquiry references (${list.length})</summary>${list.map(entry=>`<p><b>${catalogueSafe(entry.reference)}</b> · ${catalogueSafe(entry.productCode)}<br><small>${new Date(entry.createdAt).toLocaleString('en-IN')}</small></p>`).join('')}</details>`:'';
}

function catalogueDetail(item){
  if(!item||!item.showOnWebsite){unavailableCatalogue();return}
  catalogueState.current=item;
  const pages=(item.pages||[]).length?item.pages:[{image:item.coverImage,productCode:item.code}];
  const requestedPage=Math.max(0,Number(new URLSearchParams(location.search).get('page'))-1||0);catalogueState.index=Math.min(requestedPage,pages.length-1);
  const first=cataloguePage(item);
  document.title=`${item.title} | JK Chennai`;
  const app=document.querySelector('#catalogue-app');
  app.innerHTML=`<nav class="catalogue-breadcrumb"><a href="catalogues.html">All catalogues</a><span>›</span><span>${catalogueSafe(item.title)}</span></nav><header class="catalogue-detail-head"><div><p class="eyebrow">${catalogueSafe(item.category)} · ${catalogueSafe(item.month)} ${catalogueSafe(item.year)}</p><h1>${catalogueSafe(item.title)}</h1><p>${catalogueSafe(item.description)}</p><div class="catalogue-detail-meta"><span><b>${catalogueSafe(item.code)}</b> Catalogue code</span>${item.stylesCount?`<span><b>${Number(item.stylesCount)}</b> Styles</span>`:''}${item.startingPrice?`<span><b>${catalogueMoney(item.startingPrice)}</b> Starting price</span>`:''}${item.ageGroup?`<span><b>${catalogueSafe(item.ageGroup)}</b> Age</span>`:''}</div></div><div class="catalogue-title-badges"><span class="catalogue-status status-${catalogueSafe(item.status)}">${statusLabels[item.status]||'Available'}</span>${catalogueIsNew(item)?'<span class="catalogue-new-badge inline">New collection</span>':''}</div></header><section class="catalogue-viewer"><div class="catalogue-stage"><button class="catalogue-arrow previous" type="button" onclick="changeCataloguePage(-1)" aria-label="Previous image">‹</button><button class="catalogue-image-button" type="button" onclick="openCatalogueFullscreen()" aria-label="Open image full screen"><img id="catalogue-main-image" src="${catalogueSafe(first.image)}" alt="${catalogueSafe(first.productName||item.title)}"></button><button class="catalogue-arrow next" type="button" onclick="changeCataloguePage(1)" aria-label="Next image">›</button><span class="catalogue-page-count"><b id="catalogue-current-page">${catalogueState.index+1}</b> / ${pages.length}</span></div><div class="catalogue-thumbnails" aria-label="Catalogue products">${pages.map((page,index)=>{const product=typeof page==='string'?{image:page,productCode:item.code}:page;return`<button class="${index===catalogueState.index?'selected':''}" type="button" onclick="setCataloguePage(${index})" aria-label="View ${catalogueSafe(product.productCode||`design ${index+1}`)}"><img src="${catalogueSafe(product.image)}" alt="" loading="lazy"><span>${catalogueSafe(product.productCode||index+1)}</span></button>`}).join('')}</div><div id="catalogue-current-product" class="catalogue-product-info"></div></section><aside class="catalogue-order-bar"><div><b>Like this design?</b><span>The Product Code, image link and enquiry reference are prepared automatically.</span><span id="catalogue-last-reference" class="catalogue-last-reference"></span></div><div><a id="catalogue-download" class="btn secondary" href="${catalogueSafe(first.image)}" download>Download image</a><button class="btn secondary" type="button" onclick="shareCatalogueProduct()">Share this design</button><button id="catalogue-product-order" class="btn" type="button" onclick="orderCatalogueProduct()">WhatsApp this design</button></div></aside><div id="catalogue-enquiry-history" class="catalogue-enquiry-history"></div><div class="catalogue-lightbox" id="catalogue-lightbox" role="dialog" aria-modal="true" aria-label="Full-screen catalogue image"><button type="button" class="catalogue-lightbox-close" onclick="closeCatalogueFullscreen()" aria-label="Close">×</button><button class="catalogue-arrow previous" type="button" onclick="changeCataloguePage(-1)" aria-label="Previous image">‹</button><img id="catalogue-lightbox-image" src="${catalogueSafe(first.image)}" alt="${catalogueSafe(first.productName||item.title)} full screen"><button class="catalogue-arrow next" type="button" onclick="changeCataloguePage(1)" aria-label="Next image">›</button></div>`;
  renderCurrentProduct();renderEnquiryHistory();
  const stage=app.querySelector('.catalogue-stage');let startX=0;
  stage.addEventListener('touchstart',event=>startX=event.changedTouches[0].clientX,{passive:true});
  stage.addEventListener('touchend',event=>{const distance=event.changedTouches[0].clientX-startX;if(Math.abs(distance)>45)changeCataloguePage(distance<0?1:-1)},{passive:true});
}

window.setCataloguePage=function(index){
  const item=catalogueState.current;if(!item)return;
  const pages=(item.pages||[]).length?item.pages:[{image:item.coverImage,productCode:item.code}];
  catalogueState.index=(Number(index)+pages.length)%pages.length;
  const page=cataloguePage(item),image=page.image,main=document.querySelector('#catalogue-main-image'),lightbox=document.querySelector('#catalogue-lightbox-image');
  if(main){main.src=image;main.alt=page.productName||`${item.title} design ${catalogueState.index+1}`}
  if(lightbox){lightbox.src=image;lightbox.alt=`${page.productName||item.title} full screen`}
  const count=document.querySelector('#catalogue-current-page');if(count)count.textContent=catalogueState.index+1;
  const download=document.querySelector('#catalogue-download');if(download)download.href=image;
  document.querySelectorAll('.catalogue-thumbnails button').forEach((button,i)=>button.classList.toggle('selected',i===catalogueState.index));
  document.querySelectorAll('.catalogue-thumbnails button')[catalogueState.index]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  renderCurrentProduct();
  const url=new URL(location.href);url.searchParams.set('page',catalogueState.index+1);history.replaceState(null,'',url);
};
window.changeCataloguePage=direction=>setCataloguePage(catalogueState.index+Number(direction));
window.openCatalogueFullscreen=()=>document.querySelector('#catalogue-lightbox')?.classList.add('open');
window.closeCatalogueFullscreen=()=>document.querySelector('#catalogue-lightbox')?.classList.remove('open');
window.orderCatalogueProduct=function(){
  const item=catalogueState.current,page=cataloguePage(item);if(!item||!page.image||page.availability==='sold-out')return;
  const reference=enquiryReference(),imageUrl=new URL(page.image,location.href).href;
  saveEnquiry({reference,catalogueSlug:item.slug,catalogueTitle:item.title,productCode:page.productCode||item.code,image:imageUrl,createdAt:new Date().toISOString(),status:'WhatsApp opened'});
  const message=[item.whatsappMessage||'Hello JK Chennai! I am interested in this design.',`Product Code: ${page.productCode||item.code}`,page.productName&&`Product: ${page.productName}`,page.price&&`Price shown: ${catalogueMoney(page.price)}`,page.sizes&&`Sizes shown: ${page.sizes}`,`Catalogue: ${item.title}`,`Image: ${imageUrl}`,`Enquiry reference: ${reference}`,'Please confirm available size, colour, quantity and final price.'].filter(Boolean).join('\n');
  const refBox=document.querySelector('#catalogue-last-reference');if(refBox)refBox.textContent=`Your enquiry reference: ${reference}`;
  renderEnquiryHistory();
  if(typeof window.gtag==='function')window.gtag('event','catalogue_enquiry',{catalogue:item.slug,product_code:page.productCode||item.code});
  window.open(catalogueWhatsAppUrl(message),'_blank','noopener');
};
window.shareCatalogueProduct=async function(){
  const item=catalogueState.current,page=cataloguePage(item);if(!item)return;
  const url=new URL(catalogueLink(item),location.href);url.searchParams.set('page',catalogueState.index+1);
  const text=[page.productName||'JK Chennai design',`Product Code: ${page.productCode||item.code}`,page.price&&catalogueMoney(page.price),new URL(page.image,location.href).href].filter(Boolean).join(' · ');
  try{if(navigator.share)await navigator.share({title:page.productName||item.title,text,url:url.href});else{await navigator.clipboard.writeText(`${text}\n${url.href}`);alert('Product link copied.')}}catch{}
};
window.shareCatalogue=async function(slug){
  const item=catalogueState.items.find(entry=>entry.slug===slug);if(!item)return;
  const url=new URL(catalogueLink(item),location.href).href;
  try{if(navigator.share)await navigator.share({title:item.title,text:`View ${item.title} from JK Chennai`,url});else{await navigator.clipboard.writeText(url);alert('Catalogue link copied.')}}catch{}
};

window.renderCataloguePage=async function({settings,wa}={}){
  catalogueState.settings=settings||{};catalogueState.wa=wa;
  try{
    const items=await loadCatalogues();
    if(document.body.dataset.page==='catalogues')catalogueList(items);
    else{const slug=document.body.dataset.catalogueSlug||new URLSearchParams(location.search).get('collection');catalogueDetail(items.find(item=>item.slug===slug))}
  }catch{document.querySelector('#catalogue-app').innerHTML='<div class="catalogue-unavailable"><h1>Catalogues are unavailable right now.</h1><p>Please refresh or contact JK Chennai on WhatsApp.</p></div>'}
};

document.addEventListener('keydown',event=>{if(event.key==='Escape')closeCatalogueFullscreen();if(document.querySelector('#catalogue-lightbox.open')){if(event.key==='ArrowRight')changeCataloguePage(1);if(event.key==='ArrowLeft')changeCataloguePage(-1)}});
