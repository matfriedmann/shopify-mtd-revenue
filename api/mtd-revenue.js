export default async function handler(req, res) {
  const STORE = "0yi1hx-jw.myshopify.com";
  const TOKEN = process.env.SHOPIFY_API_TOKEN;

  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end   = now.toISOString();

    // initial URL with filters
    let url =
      `https://${STORE}/admin/api/2025-04/orders.json` +
      `?status=any` +
      `&created_at_min=${start}` +
      `&created_at_max=${end}` +
      `&limit=250`;

    let revenue = 0;

    while (url) {
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
      if (!orders || orders.length === 0) break;

      for (const o of orders) {
        if (["paid","partially_paid","authorized"].includes(o.financial_status)) {
          const subtotal  = parseFloat(o.subtotal_price)   || 0;
          const tax       = parseFloat(o.total_tax)        || 0;
          const shipping  = (o.shipping_lines || [])
                             .reduce((sum, x) => sum + parseFloat(x.price || 0), 0);
          const discounts = parseFloat(o.total_discounts)  || 0;
          revenue += subtotal + tax + shipping - discounts;
        }
      }

      // parse the Link header for next page URL
      const link = resp.headers.get("link") || "";
      const nextPart = link
        .split(",")
        .find(part => part.includes('rel="next"'));
      if (nextPart) {
        const match = nextPart.match(/<([^>]+)>/);
        url = match ? match[1] : null;
      } else {
        url = null;
      }
    }

    res.setHeader("Content-Type","application/json");
    res.status(200).json({ number: Math.round(revenue) });
  } catch (err) {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.toString() });
  }
}
