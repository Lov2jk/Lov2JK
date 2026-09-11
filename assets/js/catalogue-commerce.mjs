// Shared by the deployment build and browser: never trust saved bag prices.
export const codeOf = value => String(value || '').trim().toUpperCase();
export const optionsOf = value => (Array.isArray(value) ? value : String(value || '').split(',')).map(v => String(v).trim()).filter(Boolean);
export const quantityOf = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 99 ? Number(value) : 0;
export function resolveCatalogues(items, products, overrides = {}) {
  const byCode = new Map(products.map(p => {
    const price = overrides.prices?.find(v => v.slug === p.slug);
    const stock = overrides.stock?.find(v => v.slug === p.slug);
    const visibility = overrides.visibility?.find(v => v.slug === p.slug);
    return [codeOf(p.sku), {...p, ...price, ...stock, visible: p.visible !== false && visibility?.visible !== false}];
  }));
  return items.map(item => {
    const pages = (item.pages || []).filter(p => p.showOnWebsite !== false).flatMap(raw => {
      const page = typeof raw === 'string' ? {image: raw} : raw;
      const product = byCode.get(codeOf(page.productCode));
      if ((page.managedProduct && !product) || product?.visible === false) return [];
      if (!product) return [{...page, sizeOptions: optionsOf(page.sizes), colorOptions: optionsOf(page.colors)}];
      const variants = (product.variants || []).map(v => ({...v, stock: overrides.variants?.find(s => s.sku === v.sku)?.stock ?? v.stock}));
      return [{...page, managedProduct: true, productCode: codeOf(product.sku),
        price: Number(product.offerPrice || product.price), stock: Number(product.stock),
        sizeOptions: optionsOf(product.sizes), colorOptions: optionsOf(product.colors), variants,
        sizes: optionsOf(product.sizes).join(', '),
        availability: Number(product.stock) <= 0 ? 'sold-out' : ['sold-out','coming-soon'].includes(page.availability) ? page.availability : 'available'}];
    });
    const prices = pages.map(p => Number(p.price)).filter(p => p > 0);
    return {...item, pages, stylesCount: new Set(pages.map(p => p.productCode)).size,
      startingPrice: prices.length ? Math.min(...prices) : 0};
  });
}
export function validateLine(line, items) {
  const item = items.find(c => c.slug === line.catalogueSlug && c.showOnWebsite && c.status === 'available');
  const page = item?.pages.find(p => codeOf(p.productCode) === codeOf(line.productCode));
  if (!page || ['sold-out','coming-soon'].includes(page.availability)) return {error:'This design is no longer available. Remove it to continue.'};
  const qty = quantityOf(line.qty);
  if (!qty) return {error:'Choose a quantity from 1 to 99.'};
  const size = String(line.size || '').trim(), color = String(line.color || '').trim();
  if (!size || size.length > 40) return {error:'Please choose or enter the required size.'};
  const sizes = page.sizeOptions || optionsOf(page.sizes), colors = page.colorOptions || [];
  // A single age range is not an exact garment size: collect the requested age/size.
  const range = sizes.length === 1 && /\d\s*(?:-|to)\s*\d/i.test(sizes[0]);
  if (sizes.length && !range && !sizes.includes(size)) return {error:'This size is no longer listed. Remove this item and select a size again.'};
  if (colors.length && !colors.includes(color)) return {error:'Please select a listed colour.'};
  if (page.stock != null && qty > Number(page.stock)) return {error:`Only ${page.stock} currently listed in stock.`};
  if (page.variants?.length) {
    const variant = page.variants.find(v => (!v.size || v.size === size) && (!v.color || v.color === color));
    if (!variant || qty > Number(variant.stock)) return {error:'This size/colour combination is unavailable in the requested quantity.'};
  }
  return {page, item, line:{catalogueSlug:item.slug, productCode:page.productCode, size, color, qty}, total:Number(page.price || 0)*qty};
}
export function buildMessage(lines, items, reference, base) {
  const checked = lines.map(line => validateLine(line, items));
  if (!lines.length || checked.some(r => r.error)) throw new Error('Please review the bag before continuing.');
  const total = checked.reduce((sum,r) => sum+r.total,0);
  const text = checked.map((r,i) => `${i+1}. ${r.page.productName || r.line.productCode}\nProduct Code: ${r.line.productCode}\nSize: ${r.line.size}${r.line.color ? ` | Colour: ${r.line.color}` : ''}\nQuantity: ${r.line.qty} | Price each: ${r.page.price ? `INR ${r.page.price}` : 'Please confirm'}\nImage: ${new URL(r.page.image,base).href}`).join('\n\n');
  return `Hello JK Chennai! Please confirm my order enquiry.\nReference: ${reference}\n\n${text}\n\n${checked.some(r=>!Number(r.page.price))?'Priced items subtotal':'Items subtotal'}: INR ${total}\nPlease confirm stock, sizes, shipping charges and final total before payment. This is an enquiry, not a paid order.`;
}
