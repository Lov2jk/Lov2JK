document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="assets/css/catalogues.css">');

const catalogueState={items:[],current:null,index:0,settings:{},wa:null};
const catalogueSafe=value=>String(value??'').replace(/[&"'<>]/g,char=>({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[char]));
const catalogueMoney=value=>Number(value)>0?`₹${Number(value).toLocaleString('en-IN')}`:'';
const statusLabels={available:'Available','temporarily-unavailable':'Temporarily unavailable','coming-soon':'Coming soon',archived:'Archived'};
const catalogueLink=item=>`catalogue.html?collection=${encodeURIComponent(item.slug)}`;

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
  return`<article class="catalogue-card ${compact?'compact':''}"><a href="${catalogueLink(item)}" class="catalogue-cover"><img src="${catalogueSafe(item.coverImage)}" alt="${catalogueSafe(item.title)}" loading="lazy"><span class="catalogue-status status-${catalogueSafe(item.status)}">${status}</span></a><div class="catalogue-card-copy"><p class="eyebrow">${catalogueSafe(item.month)} ${catalogueSafe(item.year)}</p><h3><a href="${catalogueLink(item)}">${catalogueSafe(item.title)}</a></h3><p class="catalogue-meta">${catalogueSafe(item.category)}${item.stylesCount?` · ${Number(item.stylesCount)} styles`:''}${item.ageGroup?` · ${catalogueSafe(item.ageGroup)}`:''}</p>${price?`<b class="catalogue-price">${item.startingPrice>0?'From ':''}${price}</b>`:''}<div class="catalogue-actions"><a class="btn" href="${catalogueLink(item)}">View catalogue →</a><button class="btn secondary" type="button" onclick="shareCatalogue('${catalogueSafe(item.slug)}')" aria-label="Share ${catalogueSafe(item.title)}">Share</button></div></div></article>`;
}

window.renderCatalogueFeature=async function({settings,wa}={}){
  catalogueState.settings=settings||{};catalogueState.wa=wa;
  try{
    const items=(await loadCatalogues()).filter(item=>item.showOnWebsite&&item.showOnHomepage&&item.status!=='archived').slice(0,4);
    if(!items.length)return;
    const section=document.createElement('section');
    section.className='wrap section home-catalogues';
    section.id='latest-catalogues';
    section.innerHTML=`<div class="section-head"><div><p class="eyebrow">Browse more, upload less</p><h2>Latest catalogues</h2><p>Swipe through our newest collections and order any style by SKU.</p></div><a href="catalogues.html">View all catalogues →</a></div><div class="catalogue-rail">${items.map(item=>catalogueCard(item,true)).join('')}</div>`;
    const categories=document.querySelector('#home-categories');
    if(categories)categories.insertAdjacentElement('afterend',section);
  }catch{}
};

function catalogueList(items){
  const app=document.querySelector('#catalogue-app');
  const visible=items.filter(item=>item.showOnWebsite);
  const categories=[...new Set(visible.map(item=>item.category).filter(Boolean))].sort();
  app.innerHTML=`<header class="catalogue-page-head"><p class="eyebrow">JK Chennai collections</p><h1>Browse our latest catalogues.</h1><p>Open a collection, note the SKU and send it to us on WhatsApp. Availability is confirmed before payment.</p></header><div class="catalogue-filters" aria-label="Catalogue filters"><button class="selected" data-category="">All</button>${categories.map(category=>`<button data-category="${catalogueSafe(category)}">${catalogueSafe(category)}</button>`).join('')}</div><p class="catalogue-count" aria-live="polite"></p><div class="catalogue-grid"></div>`;
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

function catalogueOrderUrl(item){
  const message=item.whatsappMessage||`Hello JK Chennai! I am viewing ${item.title} (${item.code}). I want to order SKU: __, Size: __, Quantity: __.`;
  return catalogueState.wa?catalogueState.wa(message):`https://wa.me/${catalogueState.settings.whatsapp||'919363529266'}?text=${encodeURIComponent(message)}`;
}

function catalogueDetail(item){
  if(!item||!item.showOnWebsite){unavailableCatalogue();return}
  catalogueState.current=item;catalogueState.index=0;
  const pages=(item.pages||[]).length?item.pages:[item.coverImage];
  const orderLabel=item.status==='available'?'Order by SKU on WhatsApp':item.status==='coming-soon'?'Ask when it launches':'Ask about availability';
  document.title=`${item.title} | JK Chennai`;
  const app=document.querySelector('#catalogue-app');
  app.innerHTML=`<nav class="catalogue-breadcrumb"><a href="catalogues.html">All catalogues</a><span>›</span><span>${catalogueSafe(item.title)}</span></nav><header class="catalogue-detail-head"><div><p class="eyebrow">${catalogueSafe(item.category)} · ${catalogueSafe(item.month)} ${catalogueSafe(item.year)}</p><h1>${catalogueSafe(item.title)}</h1><p>${catalogueSafe(item.description)}</p><div class="catalogue-detail-meta"><span><b>${catalogueSafe(item.code)}</b> Catalogue code</span>${item.stylesCount?`<span><b>${Number(item.stylesCount)}</b> Styles</span>`:''}${item.startingPrice?`<span><b>${catalogueMoney(item.startingPrice)}</b> Starting price</span>`:''}${item.ageGroup?`<span><b>${catalogueSafe(item.ageGroup)}</b> Age</span>`:''}</div></div><span class="catalogue-status status-${catalogueSafe(item.status)}">${statusLabels[item.status]||'Available'}</span></header><section class="catalogue-viewer"><div class="catalogue-stage"><button class="catalogue-arrow previous" type="button" onclick="changeCataloguePage(-1)" aria-label="Previous image">‹</button><button class="catalogue-image-button" type="button" onclick="openCatalogueFullscreen()" aria-label="Open image full screen"><img id="catalogue-main-image" src="${catalogueSafe(pages[0])}" alt="${catalogueSafe(item.title)} page 1"></button><button class="catalogue-arrow next" type="button" onclick="changeCataloguePage(1)" aria-label="Next image">›</button><span class="catalogue-page-count"><b id="catalogue-current-page">1</b> / ${pages.length}</span></div><div class="catalogue-thumbnails" aria-label="Catalogue pages">${pages.map((image,index)=>`<button class="${index===0?'selected':''}" type="button" onclick="setCataloguePage(${index})" aria-label="View image ${index+1}"><img src="${catalogueSafe(image)}" alt="" loading="lazy"></button>`).join('')}</div></section><aside class="catalogue-order-bar"><div><b>Found a style you like?</b><span>Send its SKU, size and quantity. We confirm stock before payment.</span></div><div><a id="catalogue-download" class="btn secondary" href="${catalogueSafe(pages[0])}" download>Download image</a><button class="btn secondary" type="button" onclick="shareCatalogue('${catalogueSafe(item.slug)}')">Share</button><a class="btn" href="${catalogueSafe(catalogueOrderUrl(item))}" target="_blank" rel="noopener">${orderLabel}</a></div></aside><div class="catalogue-lightbox" id="catalogue-lightbox" role="dialog" aria-modal="true" aria-label="Full-screen catalogue image"><button type="button" class="catalogue-lightbox-close" onclick="closeCatalogueFullscreen()" aria-label="Close">×</button><button class="catalogue-arrow previous" type="button" onclick="changeCataloguePage(-1)" aria-label="Previous image">‹</button><img id="catalogue-lightbox-image" src="${catalogueSafe(pages[0])}" alt="${catalogueSafe(item.title)} full screen"><button class="catalogue-arrow next" type="button" onclick="changeCataloguePage(1)" aria-label="Next image">›</button></div>`;
  const stage=app.querySelector('.catalogue-stage');let startX=0;
  stage.addEventListener('touchstart',event=>startX=event.changedTouches[0].clientX,{passive:true});
  stage.addEventListener('touchend',event=>{const distance=event.changedTouches[0].clientX-startX;if(Math.abs(distance)>45)changeCataloguePage(distance<0?1:-1)},{passive:true});
}

window.setCataloguePage=function(index){
  const item=catalogueState.current;if(!item)return;
  const pages=(item.pages||[]).length?item.pages:[item.coverImage];
  catalogueState.index=(Number(index)+pages.length)%pages.length;
  const image=pages[catalogueState.index],main=document.querySelector('#catalogue-main-image'),lightbox=document.querySelector('#catalogue-lightbox-image');
  if(main){main.src=image;main.alt=`${item.title} page ${catalogueState.index+1}`}
  if(lightbox)lightbox.src=image;
  const count=document.querySelector('#catalogue-current-page');if(count)count.textContent=catalogueState.index+1;
  const download=document.querySelector('#catalogue-download');if(download)download.href=image;
  document.querySelectorAll('.catalogue-thumbnails button').forEach((button,i)=>button.classList.toggle('selected',i===catalogueState.index));
  document.querySelectorAll('.catalogue-thumbnails button')[catalogueState.index]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
};
window.changeCataloguePage=direction=>setCataloguePage(catalogueState.index+Number(direction));
window.openCatalogueFullscreen=()=>document.querySelector('#catalogue-lightbox')?.classList.add('open');
window.closeCatalogueFullscreen=()=>document.querySelector('#catalogue-lightbox')?.classList.remove('open');
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
    else catalogueDetail(items.find(item=>item.slug===new URLSearchParams(location.search).get('collection')));
  }catch{document.querySelector('#catalogue-app').innerHTML='<div class="catalogue-unavailable"><h1>Catalogues are unavailable right now.</h1><p>Please refresh or contact JK Chennai on WhatsApp.</p></div>'}
};

document.addEventListener('keydown',event=>{if(event.key==='Escape')closeCatalogueFullscreen();if(document.querySelector('#catalogue-lightbox.open')){if(event.key==='ArrowRight')changeCataloguePage(1);if(event.key==='ArrowLeft')changeCataloguePage(-1)}});
