"""Create fast WebP copies for storefront use while preserving owner uploads."""
from pathlib import Path
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_PATH = ROOT / "content/products.json"
SETTINGS_PATH = ROOT / "content/settings.json"
SUPPORTED = {".jpg", ".jpeg", ".png"}


def optimize(relative_path):
    if not relative_path or str(relative_path).lower().startswith(("http://", "https://")):
        return relative_path
    source = ROOT / str(relative_path)
    if source.suffix.lower() not in SUPPORTED or not source.exists():
        return relative_path
    destination = source.with_name(f"{source.stem}-optimized.webp")
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.save(destination, "WEBP", quality=82, method=6)
    return destination.relative_to(ROOT).as_posix()


products_data = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
for product in products_data.get("products", []):
    product["images"] = [optimize(image) for image in product.get("images", [])]
    if product.get("videoPoster"):
        product["videoPoster"] = optimize(product["videoPoster"])
PRODUCTS_PATH.write_text(json.dumps(products_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
for key in ("heroImage", "dressesCategoryImage", "toysCategoryImage"):
    if settings.get(key):
        settings[key] = optimize(settings[key])
settings["heroImages"] = [optimize(image) for image in settings.get("heroImages", [])]
promotion = settings.get("promotion") or {}
for key in ("image", "videoPoster"):
    if promotion.get(key):
        promotion[key] = optimize(promotion[key])
SETTINGS_PATH.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("Created optimized WebP storefront images while preserving original uploads.")
