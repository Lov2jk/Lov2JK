# JK Chennai store catalog

A mobile-first static catalog for **JK Chennai**. It is designed for GitHub Pages: no database, server, monthly hosting bill or complex checkout backend.

## Recommended setup

- **Hosting:** GitHub Pages with the included automatic publishing workflow.
- **Storefront:** plain HTML, CSS and JavaScript. No build step is needed.
- **Catalog source:** one easy file per product in `content/products/`; the public `content/products.json` is generated automatically.
- **Owner editor:** Decap CMS at `/admin/`.
- **Orders:** client-side bag followed by a pre-filled WhatsApp order.
- **Payments:** confirm stock first, then send your UPI/GPay/WhatsApp Pay details or a trusted payment link.
- **Tracking:** reply manually on WhatsApp with the courier tracking link.

This is deliberately a catalog-and-order site, not an Amazon-style system. Prices and stock are updated manually. Customer accounts, automatic payments, automatic inventory and live tracking require outside services.

## Before publishing

1. In `content/settings.json`, replace the sample WhatsApp number, email, UPI ID and social links.
2. In `admin/config.yml`, replace `YOUR-GITHUB-USERNAME/lov2jk` with your GitHub repository.
3. Add your real custom domain in GitHub as described below.
4. Replace the sample products and add real product photos.
5. Have your shipping, returns and privacy wording reviewed for your actual business.

Never place passwords, Aadhaar numbers, banking credentials, OTPs or private identity documents in this repository. Everything committed here can become public through GitHub Pages.

## Publish on GitHub Pages

1. Create a GitHub repository named `lov2jk` and upload this folder.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Push to the `main` branch. GitHub publishes the site automatically.

## Connect a custom domain

1. In **Settings → Pages → Custom domain**, enter the exact domain you own, for example `shop.yourdomain.in`.
2. At your domain provider, create a `CNAME` record for `shop` pointing to `YOUR-GITHUB-USERNAME.github.io`.
3. For a root domain such as `yourdomain.in`, use GitHub's current four `A` records shown in its Pages documentation instead.
4. Wait for DNS checks to pass, then enable **Enforce HTTPS**.

GitHub creates the `CNAME` file when the domain is saved in Settings. Do not add a guessed domain before you know the final address.

## Product admin without coding

Open your Pages CMS dashboard and select **Products — Add or edit**. Every product now has its own searchable page, so you no longer need to open one large catalog file.

### Add one product quickly

1. Select **Products — Add or edit → Add entry**.
2. Complete the basic fields: name, SKU, URL name, category, description, price, stock, colours, sizes and age group.
3. Upload the product pictures. The first picture becomes the catalog cover.
4. Leave **Publish product on website** off while checking the entry.
5. Save. The website catalog, price, stock, visibility, checklist and product page are rebuilt automatically.
6. Reopen the product and turn on **Publish product on website** when it is ready.

Image/slideshow settings, variants and advanced details are separate optional sections. You do not need to complete them for every new product.

### Duplicate a similar product

1. Open **Products — Add or edit** and choose **Duplicate a similar product**.
2. Enter the SKU of the product to copy, followed by the new product name, unique SKU and lowercase URL slug.
3. Choose **Create safe copy** and wait for the workflow to finish.
4. Open the new product copy. Its descriptions, category, options, size guide and images are copied, while its stock is `0`, homepage feature is off and website visibility is off.
5. Replace its pictures, check the generated variant SKUs and price, then turn on **Publish product on website** when ready.

The duplicate workflow never overwrites an existing SKU or URL slug. Generated colour-size variant SKUs end in `-V01`, `-V02` and so on, with zero stock until reviewed.

### Admin access without sharing GitHub

Keep the owner GitHub account as the master and recovery login. In Pages CMS, invite each approved staff member as a collaborator using their own email address. Collaborators can edit this repository's content and media without receiving the GitHub password, but they cannot manage the CMS configuration or other collaborators. Remove access when a staff member no longer needs it. Do not put a password in the static `/admin/` HTML or JavaScript.

### Add a category or subcategory

1. Open **Categories & subcategories** and choose **Add entry**.
2. Enter the category name and a lowercase URL name such as `ladies-casual-wear`.
3. Leave **Parent category** empty for a main category, or select its parent to create a subcategory.
4. Add an optional image and description, choose the display order, and keep **Show on website** enabled.
5. Save. The navigation, homepage main categories, shop filter and parent-category results update automatically after publishing.

Use no more than three levels. Assign each product to the most specific category; it will also appear automatically under every parent category. Hide a future category instead of deleting it while products still use it.

Each product includes:

- name, URL slug and description
- regular price and offer price
- SKU and stock quantity
- admin-managed category and subcategory
- colours, sizes and age group
- one or more images
- homepage featured switch
- available/sold-out switch

Publishing in Decap commits the change to GitHub; GitHub Pages republishes the site in about a minute.

### Add Amazon or another marketplace

Open **Store settings → Contact, payment & social links → Online marketplaces**. Add a row, enter a name such as `Amazon.in`, paste the public store or product-page URL, and publish. Only entries with a URL appear on the public website. You can add Flipkart, Meesho or future platforms in exactly the same way without editing code.

### Important Decap login step

GitHub Pages cannot keep an OAuth client secret, so Decap's GitHub login needs a tiny external OAuth proxy. Configure a free Decap-compatible OAuth proxy (commonly on Cloudflare Workers or Vercel), then put its address in `admin/config.yml` under `base_url`. This proxy is only for the owner login; the public store stays on GitHub Pages.

If you want the absolute easiest owner workflow, use **Pages CMS** at `app.pagescms.org` instead. Sign in with GitHub, select the repository and edit the same JSON files in a browser. It does not provide the branded `/admin/` page, but it avoids running an OAuth proxy.

## Upload product photos

In the Admin panel, open a product, select **Product images**, and upload JPG, PNG or WebP files. The original upload is preserved. Every GitHub Pages deployment automatically creates smaller WebP storefront copies, so large owner uploads do not slow down customer browsing. Portrait images with a consistent aspect ratio, ideally 4:5, still give the neatest catalog.

For bulk products, name image files with the SKU before uploading, for example `JKC-D-101-1.jpg`, `JKC-D-101-2.jpg` and `JKC-D-101-3.jpg`. If the spreadsheet does not contain image filenames, the catalog builder automatically attaches matching SKU-prefixed images.

Each visible product also receives a permanent `products/product-name.html` page with social preview information. Share that page from the browser so WhatsApp, Facebook and other services can show the product name, description, price and main photo.

Every product page and catalog card has a **Share product** button. On supported phones it opens the normal share menu; otherwise it copies the permanent product link.

Buyers can choose 1–5 stars and send a review to the business WhatsApp number. Reviews are not published automatically. After confirming permission and, when supplied, the order reference, add the approved review under **Customer reviews** in the Admin panel and turn on **Verified purchase** when appropriate.

## Update stock and prices

Use **Quick stock update** for stock and **Quick price update** for regular and offer prices. Set stock to `0` to mark a product sold out automatically. Open the product and use **Publish product on website** when preparing it or temporarily removing it from the shop. New products are connected to the quick lists automatically after saving. The **Product checklist** reports missing essential information.

For products with colour/size combinations, first add a unique SKU and quantity for each combination under the product's **Colour and size stock — optional** section. After the automatic Admin sync finishes, everyday changes can be made under **Quick colour-size stock** without opening the full product.

The owner-only helper page at `/stock-tools.html` downloads all SKU, price and stock information as a CSV for Excel or Google Sheets. Its import button creates a replacement `stock.json`; upload that file to `content/stock.json` on GitHub. This is the safest free bulk workflow possible on static GitHub Pages.

### Add many products with simple rows

1. In Pages CMS, open **Bulk products — add rows**.
2. Select **Add item** and complete one row for each product. Colours, sizes and image filenames have their own **Add item** controls.
3. Keep **Publish product on website** off for new products, then save the rows.
4. Choose **Import saved product rows now → Start safe import**.
5. Wait about one minute, then open **Products — Add or edit** to check the new drafts and upload any missing photos.

You can also download the optional CSV template from `/admin/` for planning products in Excel. The browser downloads it instead of showing raw CSV text.

The importer matches existing products by SKU. Blank optional row fields do not erase existing information. New products are imported as hidden drafts, duplicate SKUs and URL names are rejected, and the workflow reports each new or updated product.

Use **Homepage & promotions** for hero images, homepage copy, category images and the advertisement popup. Use **Order status messages** for the editable order journey shown on the tracking page.

## New sales tools

- `/tracking.html`: customers enter their order reference. Update it from **Customer order tracking** in Pages CMS. Store only the reference, public status, customer-facing note and courier link—never addresses or payment information.
- `/catalog.html`: a clean current catalogue. Choose **Save / print PDF** to create a shareable PDF from any browser.
- `/expo.html`: fast product search, large controls and cart access for exhibitions and counter sales.
- `/saved.html`: device-only wishlist and recently viewed products; no customer account is required.
- The mobile bottom bar keeps Home, Shop, Saved, Cart and WhatsApp one tap away.
- The site is installable as a lightweight web app. On Android Chrome, use **Add to Home screen**.

The cart now collects name, mobile, PIN code, address and payment preference before preparing the WhatsApp order. It creates a `JKC-...` reference and remembers the buyer's details only on that device. Stock remains manual: WhatsApp orders cannot safely reduce a public JSON file without an outside order/inventory service.

## Google setup

The site already publishes a sitemap, robots file, Merchant Center XML feed, product structured data and local-business information. In Pages CMS, paste the Search Console verification content under **Homepage & promotions → Google Search Console verification code**, publish, and then submit `https://jkchennai.in/sitemap.xml` in Search Console. Google Business Profile and Merchant Center approval still happen in Google's dashboards; they cannot be created by website code alone.

## WhatsApp and payments

All order buttons use the number in `content/settings.json`. The bag builds a message containing product names, quantities, SKUs and subtotal. The customer sends that message to you; you confirm shipping and availability.

For safety, send payment instructions only after confirmation. Accept UPI/GPay/WhatsApp Pay using your verified business UPI ID, or send a payment link from a provider such as Razorpay. Do not place a raw `upi://` auto-pay link on the site until your legal business name and payment recipient are final and tested on Android and iPhone.

## What is and is not automatic

| Included on GitHub Pages | Needs an outside service |
|---|---|
| Product catalog and filters | Real-time inventory |
| Product detail views | Card/UPI payment gateway |
| Device-local shopping bag | Automatic invoices and taxes |
| WhatsApp order messages | Customer accounts and passwords |
| Manual stock edits | Automatic order emails/SMS |
| Manual tracking help | Live courier tracking |
| Decap product editor | Decap GitHub OAuth proxy |

Customer login is intentionally omitted. A secure login needs identity storage, password recovery and protected customer data, none of which GitHub Pages provides. Add it later only through a trusted commerce or identity service if the business truly needs it.

## Folder map

```text
admin/                    visual content editor
assets/css/               store design
assets/js/                catalog, filters, bag and WhatsApp flow
assets/images/products/   uploaded product photos
content/products/         editable individual product files
content/products.json     automatically generated public catalog
content/settings.json     contact, payment and social settings
.github/workflows/        automatic GitHub Pages publishing
*.html                    storefront pages
```
