# Lov2JK store catalog

A mobile-first static catalog for **Lov2JK**, a JK Chennai brand. It is designed for GitHub Pages: no database, server, monthly hosting bill or complex checkout backend.

## Recommended setup

- **Hosting:** GitHub Pages with the included automatic publishing workflow.
- **Storefront:** plain HTML, CSS and JavaScript. No build step is needed.
- **Catalog:** `content/products.json`.
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

Open `https://YOUR-DOMAIN/admin/` after Decap authentication is configured. Select **Product catalog → Products**. From there you can add, reorder, edit or delete products and publish changes.

Each product includes:

- name, URL slug and description
- regular price and offer price
- SKU and stock quantity
- dresses/toys category
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

Each visible product also receives a permanent `products/product-name.html` page with social preview information. Share that page from the browser so WhatsApp, Facebook and other services can show the product name, description, price and main photo.

## Update stock and prices

Use **Quick stock update** for stock and **Quick price update** for regular and offer prices. Set stock to `0` to mark a product sold out automatically. Use **Show or hide products** when preparing a product or temporarily removing it from the shop. New products are connected to these simple lists automatically after the Product catalog is saved. The **Product checklist** reports missing essential information.

Use **Homepage & promotions** for hero images, homepage copy, category images and the advertisement popup. Use **Order status messages** for the editable order journey shown on the tracking page.

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
content/products.json     all products
content/settings.json     contact, payment and social settings
.github/workflows/        automatic GitHub Pages publishing
*.html                    storefront pages
```
