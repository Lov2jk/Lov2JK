"""Generate GitHub Pages discovery files from the owner-edited JSON catalog."""
from datetime import date
from html import escape
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
products = json.loads((ROOT / "content/products.json").read_text(encoding="utf-8"))["products"]
settings = json.loads((ROOT / "content/settings.json").read_text(encoding="utf-8"))
base = settings.get("siteUrl") or "https://lov2jk.github.io/Lov2JK/"
base = base.rstrip("/") + "/"
today = date.today().isoformat()

static_pages = ["", "shop.html", "about.html", "contact.html", "faq.html", "policies.html", "tracking.html"]
urls = [base + page for page in static_pages]
urls += [base + "product.html?slug=" + quote(str(p["slug"])) for p in products]
sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
sitemap += "\n".join(f"  <url><loc>{escape(url)}</loc><lastmod>{today}</lastmod></url>" for url in urls)
sitemap += "\n</urlset>\n"
(ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n", encoding="utf-8")

items = []
for p in products:
    link = base + "product.html?slug=" + quote(str(p["slug"]))
    image = (p.get("images") or [""])[0]
    if image and not image.startswith(("http://", "https://")):
        image = base + image.lstrip("/")
    price = p.get("offerPrice") or p.get("price") or 0
    category = "Apparel & Accessories > Clothing > Dresses" if p.get("category") == "Dresses" else "Toys & Games > Toys"
    fields = [
        ("g:id", p.get("sku") or p.get("slug")),
        ("title", p.get("name")),
        ("description", p.get("description")),
        ("link", link),
        ("g:availability", "in_stock" if p.get("available") and int(p.get("stock") or 0) > 0 else "out_of_stock"),
        ("g:price", f"{price} INR"),
        ("g:condition", "new"),
        ("g:brand", "Lov2JK"),
        ("g:product_type", category),
        ("g:identifier_exists", "no"),
    ]
    if image:
        fields.append(("g:image_link", image))
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
print(f"Generated sitemap and Merchant feed for {len(products)} products")
