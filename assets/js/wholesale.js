window.initWholesaleQuote=function({settings}){
  const form=document.querySelector('#wholesale-quote-form'),message=document.querySelector('#wholesale-form-message'),captcha=document.querySelector('#wholesale-turnstile');
  if(!form||!message)return;
  const base=String(settings.accountApiUrl||'').replace(/\/$/,''),productCode=new URLSearchParams(location.search).get('product');
  if(productCode)form.elements.productCodes.value=productCode;
  const show=(text,type='')=>{message.textContent=text;message.className=`form-message ${type}`};
  let widgetId=null;
  const fallback=()=>{show('Online quote requests are temporarily unavailable. Please contact JK Chennai on WhatsApp or email support@jkchennai.in.','error');form.querySelector('button[type="submit"]').disabled=true};
  const turnstileReady=key=>new Promise(resolve=>{
    if(!key)return resolve(false);
    const render=()=>{try{widgetId=window.turnstile.render(captcha,{sitekey:key,theme:'light'});resolve(true)}catch{resolve(false)}};
    if(window.turnstile)return render();
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.onload=render;script.onerror=()=>resolve(false);document.head.append(script);
  });
  (async()=>{try{const response=await fetch(`${base}/api/wholesale-quote-config`),config=await response.json();if(!response.ok||!config.enabled||!(await turnstileReady(config.turnstileSiteKey)))fallback()}catch{fallback()}})();
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button[type="submit"]'),data=Object.fromEntries(new FormData(form));data.consent=form.elements.consent.checked;data.turnstileToken=window.turnstile&&widgetId!==null?window.turnstile.getResponse(widgetId):'';if(!data.turnstileToken){show('Please complete the security check before sending your request.','error');return}button.disabled=true;show('Sending your request…');try{const response=await fetch(`${base}/api/wholesale-quotes`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(!response.ok)throw Error(result.error||'We could not send your request.');form.reset();if(window.turnstile&&widgetId!==null)window.turnstile.reset(widgetId);show(`Thank you. Your wholesale enquiry reference is ${result.reference}. Our team will contact you shortly.`,'ok');window.gtag?.('event','wholesale_quote_request',{reference:result.reference})}catch(error){show(error.message||'We could not send your request. Please try again or contact us on WhatsApp.','error')}finally{button.disabled=false}});
};
