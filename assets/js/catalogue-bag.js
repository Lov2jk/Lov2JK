// Loaded by catalogues.js after the catalogue and current shop data are verified.
const bagKey='jkc-catalogue-bag-v1';
let catalogueBag=[];
try{const saved=JSON.parse(localStorage.getItem(bagKey)||'[]');catalogueBag=Array.isArray(saved)?saved.filter(v=>v&&typeof v==='object').slice(0,40):[]}catch{}
function persistCatalogueBag(){try{localStorage.setItem(bagKey,JSON.stringify(catalogueBag))}catch{catalogueNotice('Your browser cannot save the bag. Keep this page open until you send your enquiry.')}}
function catalogueNotice(text){const box=document.querySelector('#catalogue-bag-notice');if(box)box.textContent=text}
function renderCataloguePurchase(){
  const page=cataloguePage(catalogueState.current),item=catalogueState.current;
  let root=document.querySelector('#catalogue-purchase');
  if(!root){root=document.createElement('section');root.id='catalogue-purchase';document.querySelector('.catalogue-viewer')?.insertAdjacentElement('afterend',root)}
  const sizes=page.sizeOptions||[],colors=page.colorOptions||[];
  const exact=sizes.length&&!(sizes.length===1&&/\d\s*(?:-|to)\s*\d/i.test(sizes[0]));
  const disabled=item.status!=='available'||['sold-out','coming-soon'].includes(page.availability);
  root.innerHTML=`<div class="purchase-heading"><p class="eyebrow">Make it yours</p><h2>${catalogueSafe(page.productName||page.productCode)}</h2><p>Select this design now and keep browsing. Send your choices together on WhatsApp.</p></div><form id="catalogue-select"><label>Size required *${exact?`<select name="size" required><option value="">Choose size</option>${sizes.map(s=>`<option>${catalogueSafe(s)}</option>`).join('')}</select>`:'<input name="size" required maxlength="40" placeholder="For example: age 4 years" autocomplete="off"><small>We will confirm measurements and fit on WhatsApp.</small>'}</label>${colors.length?`<label>Colour *<select name="color" required><option value="">Choose colour</option>${colors.map(c=>`<option>${catalogueSafe(c)}</option>`).join('')}</select></label>`:''}<label>Quantity *<input name="qty" type="number" inputmode="numeric" min="1" max="99" step="1" value="1" required></label><button class="btn" ${disabled?'disabled':''}>${disabled?'Not available to order':'Add to catalogue bag'}</button></form><p id="catalogue-selection-notice" role="status"></p><p class="purchase-reassurance">No login or payment needed. Stock and delivery charges are confirmed before payment. <a href="policies.html#returns">Exchange information</a></p>`;
  document.querySelector('#catalogue-select').onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));addCatalogueLine({...values,productCode:page.productCode,catalogueSlug:item.slug})};
  const old=document.querySelector('#catalogue-product-order');if(old){old.textContent='Choose size & add to bag';old.disabled=disabled;old.onclick=()=>root.scrollIntoView({behavior:'smooth',block:'center'})}
  mountCatalogueBag();
}
function addCatalogueLine(line){
  const notice=document.querySelector('#catalogue-selection-notice');
  const key=v=>[v.productCode,v.size,v.color].join('|');
  const existing=catalogueBag.find(v=>key(v)===key(line));
  const candidate={...line,qty:Number(line.qty)+(existing?Number(existing.qty):0)};
  const result=commerce.validateLine(candidate,catalogueState.items);
  if(result.error){notice.textContent=result.error;return}
  const overall=catalogueBag.filter(v=>v!==existing&&v.productCode===line.productCode).reduce((n,v)=>n+Number(v.qty),0)+candidate.qty;
  if(result.page.stock!=null&&overall>result.page.stock){notice.textContent='The combined quantity exceeds the listed product stock.';return}
  if(!existing&&catalogueBag.length>=40){notice.textContent='Please send this bag before adding more designs.';return}
  if(existing)Object.assign(existing,result.line);else catalogueBag.push(result.line);
  persistCatalogueBag();mountCatalogueBag();notice.textContent='Added! Keep browsing or review your catalogue bag below.';
}
function mountCatalogueBag(){
  let root=document.querySelector('#catalogue-bag');
  if(!root){root=document.createElement('section');root.id='catalogue-bag';root.setAttribute('aria-label','Catalogue shopping bag');document.querySelector('#catalogue-app')?.append(root)}
  const checked=catalogueBag.map(line=>commerce.validateLine(line,catalogueState.items));
  let total=0;checked.forEach(r=>{if(!r.error)total+=r.total});
  root.innerHTML=`<div class="bag-title"><div><p class="eyebrow">Your collection picks</p><h2>Catalogue bag (${catalogueBag.reduce((n,v)=>n+(commerce.quantityOf(v.qty)||0),0)})</h2></div><a href="catalogues.html">Browse more collections →</a></div><p>Catalogue selections are kept on this device. Shop-all purchases use the separate shop bag.</p><div class="catalogue-bag-lines">${catalogueBag.map((line,i)=>{const r=checked[i];return `<article class="catalogue-bag-line">${r.page?`<img src="${catalogueSafe(r.page.image)}" alt="${catalogueSafe(r.page.productName||line.productCode)}" loading="lazy">`:''}<div><b>${catalogueSafe(r.page?.productName||line.productCode)}</b><p>${catalogueSafe(line.productCode)} · Size ${catalogueSafe(line.size)}${line.color?` · ${catalogueSafe(line.color)}`:''}</p>${r.error?`<p class="bag-error" role="alert">${catalogueSafe(r.error)}</p>`:`<p>${catalogueMoney(r.page.price)} each · ${catalogueMoney(r.total)||'Price on request'}</p>`}<label>Quantity <input aria-label="Quantity for ${catalogueSafe(line.productCode)}" type="number" min="1" max="99" step="1" value="${commerce.quantityOf(line.qty)||1}" data-qty="${i}"></label></div><button class="btn secondary" data-remove="${i}" aria-label="Remove ${catalogueSafe(line.productCode)}">Remove</button></article>`}).join('')||'<p>Your bag is empty. Choose a design, size and quantity to get started.</p>'}</div><p class="bag-total">Items subtotal: <strong>${catalogueMoney(total)||'₹0'}</strong></p><p>Shipping is extra unless confirmed otherwise. Prices and stock are checked again before opening WhatsApp.</p><button id="catalogue-bag-send" class="btn" ${!catalogueBag.length||checked.some(r=>r.error)?'disabled':''}>Send catalogue bag on WhatsApp →</button><p id="catalogue-bag-notice" role="status" aria-live="polite"></p>`;
  root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{catalogueBag.splice(Number(b.dataset.remove),1);persistCatalogueBag();mountCatalogueBag()});
  root.querySelectorAll('[data-qty]').forEach(input=>input.onchange=()=>{const i=Number(input.dataset.qty),result=commerce.validateLine({...catalogueBag[i],qty:input.value},catalogueState.items);if(result.error){catalogueNotice(result.error);input.value=catalogueBag[i].qty;return}catalogueBag[i]=result.line;persistCatalogueBag();mountCatalogueBag()});
  root.querySelector('#catalogue-bag-send').onclick=sendCatalogueBag;
  let jump=document.querySelector('#catalogue-bag-jump');if(!jump){jump=document.createElement('a');jump.id='catalogue-bag-jump';jump.href='#catalogue-bag';document.querySelector('#catalogue-app')?.prepend(jump)}jump.textContent=`Review catalogue bag · ${catalogueBag.length} selection${catalogueBag.length===1?'':'s'}`;
}
async function sendCatalogueBag(){
  const button=document.querySelector('#catalogue-bag-send');button.disabled=true;catalogueNotice('Checking current prices and availability…');
  const previous=JSON.stringify(catalogueBag.map(l=>commerce.validateLine(l,catalogueState.items).page?.price));
  try{
    catalogueState.items=[];await loadCatalogues();
    const checked=catalogueBag.map(l=>commerce.validateLine(l,catalogueState.items));
    const stockExceeded=checked.some(r=>r.page?.stock!=null&&catalogueBag.filter(l=>l.productCode===r.page.productCode).reduce((n,l)=>n+Number(l.qty),0)>r.page.stock);
    mountCatalogueBag();
    if(stockExceeded||checked.some(r=>r.error)){catalogueNotice('Availability has changed. Reduce quantities or remove unavailable items before continuing.');return}
    if(previous!==JSON.stringify(checked.map(r=>r.page.price))){catalogueNotice('Prices have changed. Review the updated subtotal, then press Send again.');return}
    const reference=enquiryReference();
    const message=commerce.buildMessage(catalogueBag,catalogueState.items,reference,location.href);
    saveEnquiry({reference,productCode:catalogueBag.map(l=>l.productCode).join(', '),createdAt:new Date().toISOString(),status:'WhatsApp opened'});
    if(typeof window.gtag==='function')window.gtag('event','catalogue_bag_whatsapp_click',{items:catalogueBag.length});
    catalogueNotice(`Enquiry ${reference} prepared. Please press Send inside WhatsApp. Your bag is kept until you remove the items.`);
    // Same-tab navigation avoids popup blockers after asynchronous validation.
    location.href=catalogueWhatsAppUrl(message);
  }catch{catalogueNotice('We could not verify current prices and stock. Please try again when you are online.');document.querySelector('#catalogue-bag-send').disabled=false}
}
