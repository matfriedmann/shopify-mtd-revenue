export default async function handler(req, res) {
  const STORE = "0yi1hx-jw.myshopify.com";
  const TOKEN = process.env.SHOPIFY_API_TOKEN;

  console.log("▶️ Starting MTD revenue calculation");

  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end   = now.toISOString();
    console.log(`Date range: ${start} → ${end}`);

    // initial URL with filters
    let url =
      `https://${STORE}/admin/api/2025-04/orders.json` +
      `?status=any` +
      `&created_at_min=${start}` +
      `&created_at_max=${end}` +
      `&limit=250`;

    let revenue = 0;
    let pageCount = 0;

    while (url) {
      pageCount++;
      console.log(`\n--- Fetching page ${pageCount}: ${url}`);

      const resp = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("Shopify API error", resp.status, text);
        return res
          .status(502)
          .json({ error: `Shopify API returned ${resp.status}`, body: text });
      }

      const { orders } = await resp.json();
      console.log(`→ Retrieved ${orders.length} orders on page ${pageCount}`);

      for (const o of orders) {
        // skip irrelevant orders
        if (!["paid","partially_paid","authorized"].includes(o.financial_status)) {
          console.log(`  • SKIP order ${o.id}: status=${o.financial_status}`);
          continue;
        }

        const subtotal  = parseFloat(o.subtotal_price)           || 0;
        const tax       = parseFloat(o.total_tax)                || 0;
        const shipping  = (o.shipping_lines || [])
                           .reduce((sum, x) => sum + parseFloat(x.price||0), 0);
        const discounts = parseFloat(o.total_discounts)          || 0;
        const refunds   = parseFloat(o.total_refunded_price)     || 0;  // if field exists

        console.log(`  • Order ${o.id}:`);
        console.log(`      subtotal_price: ${subtotal}`);
        console.log(`      total_tax:      ${tax}`);
        console.log(`      shipping:       ${shipping}`);
        console.log(`      discounts:      ${discounts}`);
        console.log(`      refunds:        ${refunds}`);

        const lineTotal = subtotal + tax + shipping - discounts - refunds;
        console.log(`      lineTotal:      ${lineTotal}`);

        revenue += lineTotal;
        console.log(`      → runningRevenue: ${revenue}`);
      }

      // figure out next page
      const link = resp.headers.get("link") || "";
      const nextPart = link.split(",").find(part => part.includes('rel="next"'));
      if (nextPart) {
        const match = nextPart.match(/<([^>]+)>/);
        url = match ? match[1] : null;
        console.log(`→ next page URL: ${url}`);
      } else {
        url = null;
        console.log("→ no more pages");
      }
    }

    console.log(`\n✅ Final Month-to-Date revenue: ${revenue}`);
    res.setHeader("Content-Type","application/json");
    res.status(200).json({ number: Math.round(revenue) });
  } catch (err) {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.toString() });
  }
}
