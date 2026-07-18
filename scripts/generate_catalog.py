"""Generate GitHub Pages discovery files from the owner-edited JSON catalog."""
from datetime import date
from html import escape
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
products = json.loads((ROOT / "content/products.json").read_text(encoding="utf-8"))["products"]
settings = json.loads((ROOT / "content/settings.json").read_text(encoding="utf-8"))
def optional_products(filename):
    path = ROOT / "content" / filename
    return json.loads(path.read_text(encoding="utf-8")).get("products", []) if path.exists() else []

stock_by_slug = {item.get("slug"): item for item in optional_products("stock.json")}
price_by_slug = {item.get("slug"): item for item in optional_products("prices.json")}
visibility_by_slug = {item.get("slug"): item for item in optional_products("visibility.json")}
for product in products:
    slug = product.get("slug")
    if slug in stock_by_slug:
        product["stock"] = max(0, int(stock_by_slug[slug].get("stock") or 0))
        product["available"] = product["stock"] > 0
    if slug in price_by_slug:
        product["price"] = price_by_slug[slug].get("price") or product.get("price")
        product["offerPrice"] = price_by_slug[slug].get("offerPrice")
    product["visible"] = visibility_by_slug.get(slug, {}).get("visible", product.get("visible", True)) is not False
products = [product for product in products if product.get("visible")]
base = settings.get("siteUrl") or "https://lov2jk.github.io/Lov2JK/"
base = base.rstrip("/") + "/"
today = date.today().isoformat()

homepage_image = (settings.get("heroImages") or [settings.get("heroImage") or "assets/images/lov2jk-logo.webp"])[0]
if not str(homepage_image).startswith(("http://", "https://")):
    homepage_image = base + quote(str(homepage_image).lstrip("/"), safe="/")
index_path = ROOT / "index.html"
index_html = index_path.read_text(encoding="utf-8")
index_html = re.sub(r'(<link rel="canonical" href=")[^"]+("\s*/?>)', rf'\g<1>{base}\2', index_html)
index_html = re.sub(r'(<meta property="og:url" content=")[^"]+("\s*/?>)', rf'\g<1>{base}\2', index_html)
index_html = re.sub(r'(<meta property="og:image" content=")[^"]+("\s*/?>)', rf'\g<1>{homepage_image}\2', index_html)
index_html = re.sub(r'(<meta name="twitter:image" content=")[^"]+("\s*/?>)', rf'\g<1>{homepage_image}\2', index_html)
index_path.write_text(index_html, encoding="utf-8")

static_pages = ["", "shop.html", "about.html", "contact.html", "faq.html", "policies.html", "tracking.html"]
urls = [base + page for page in static_pages]
urls += [base + "products/" + quote(str(p["slug"])) + ".html" for p in products]
sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
sitemap += "\n".join(f"  <url><loc>{escape(url)}</loc><lastmod>{today}</lastmod></url>" for url in urls)
sitemap += "\n</urlset>\n"
(ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n", encoding="utf-8")

items = []
for p in products:
    link = base + "products/" + quote(str(p["slug"])) + ".html"
    image = (p.get("images") or [""])[0]
    if image and not image.startswith(("http://", "https://")):
        image = base + image.lstrip("/")
    regular_price = p.get("price") or 0
    offer_price = p.get("offerPrice") or 0
    category = "Apparel & Accessories > Clothing > Dresses" if p.get("category") == "Dresses" else "Toys & Games > Toys"
    fields = [
        ("g:id", p.get("sku") or p.get("slug")),
        ("title", p.get("name")),
        ("description", p.get("description")),
        ("link", link),
        ("g:availability", "in_stock" if p.get("available") and int(p.get("stock") or 0) > 0 else "out_of_stock"),
        ("g:price", f"{regular_price} INR"),
        ("g:condition", "new"),
        ("g:brand", "Lov2JK"),
        ("g:product_type", category),
        ("g:identifier_exists", "no"),
    ]
    if image:
        fields.append(("g:image_link", image))
    for extra_image in (p.get("images") or [])[1:11]:
        if extra_image and not extra_image.startswith(("http://", "https://")):
            extra_image = base + extra_image.lstrip("/")
        if extra_image:
            fields.append(("g:additional_image_link", extra_image))
    if offer_price and float(offer_price) < float(regular_price):
        fields.append(("g:sale_price", f"{offer_price} INR"))
    if p.get("colors"):
        fields.append(("g:color", "/".join(p["colors"])))
    if p.get("sizes"):
        fields.append(("g:size", "/".join(p["sizes"])))
    body = "".join(f"<{tag}>{escape(str(value or ''))}</{tag}>" for tag, value in fields)
    items.append(f"<item>{body}</item>")

feed = '<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel>'
feed += f"<title>{escape(settings.get('storeName', 'Lov2JK'))}</title><link>{escape(base)}</link><description>{escape(settings.get('tagline', 'Lov2JK product catalog'))}</description>"
feed += "".join(items) + "</channel></rss>\n"
(ROOT / "merchant-feed.xml").write_text(feed, encoding="utf-8")

product_pages = ROOT / "products"
product_pages.mkdir(exist_ok=True)
for old_page in product_pages.glob("*.html"):
    old_page.unlink()
for p in products:
    slug = str(p["slug"])
    link = base + "products/" + quote(slug) + ".html"
    image = (p.get("images") or ["assets/images/lov2jk-logo.webp"])[0]
    if not image.startswith(("http://", "https://")):
        image = base + image.lstrip("/")
    title = f"{p.get('name', 'Product')} | Lov2JK"
    description = str(p.get("description") or settings.get("tagline") or "Lov2JK dresses and toys")
    price = p.get("offerPrice") or p.get("price") or 0
    document = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="../"><title>{escape(title)}</title><meta name="description" content="{escape(description, quote=True)}"><link rel="canonical" href="{escape(link, quote=True)}"><meta property="og:type" content="product"><meta property="og:site_name" content="Lov2JK"><meta property="og:title" content="{escape(title, quote=True)}"><meta property="og:description" content="{escape(description, quote=True)}"><meta property="og:url" content="{escape(link, quote=True)}"><meta property="og:image" content="{escape(image, quote=True)}"><meta property="product:price:amount" content="{escape(str(price), quote=True)}"><meta property="product:price:currency" content="INR"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title, quote=True)}"><meta name="twitter:description" content="{escape(description, quote=True)}"><meta name="twitter:image" content="{escape(image, quote=True)}"><link rel="stylesheet" href="assets/css/styles.css"></head><body data-page="product" data-product-slug="{escape(slug, quote=True)}"><div id="app"></div><script src="assets/js/app.js" defer></script></body></html>'''
    (product_pages / f"{slug}.html").write_text(document, encoding="utf-8")

print(f"Generated sitemap, Merchant feed and {len(products)} social-ready product pages")
