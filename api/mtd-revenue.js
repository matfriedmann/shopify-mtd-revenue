export default async function handler(req, res) {
  const STORE = "0yi1hx-jw.myshopify.com";
  const TOKEN = process.env.SHOPIFY_API_TOKEN;

  try {
    // --- Timezone Fix: Store is in UTC-3 (e.g. São Paulo) ---
    const tzOffset = -3 * 60; // in minutes
    const localNow = new Date(Date.now() + tzOffset * 60 * 1000);

    // First day of the current month, local time
    const startOfMonth = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1));
    const isoStart = startOfMonth.toISOString();
    const isoEnd = new Date().toISOString(); // now in UTC

    let revenue = 0;
    let url = `https://${STORE}/admin/api/2025-04/orders.json?status=any&created_at_min=${isoStart}&created_at_max=${isoEnd}&limit=250`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("Shopify error:", err);
        return res.status(502).json({ error: err });
      }

      const { orders } = await response.json();

      for (const order of orders) {
        if (order.financial_status === "paid") {
          revenue += parseFloat(order.subtotal_price || 0);
        }
      }

      const link = response.headers.get("link");
      const next = link && link.includes('rel="next"')
        ? (link.match(/<([^>]+)>/) || [])[1]
        : null;
      url = next || null;
    }

    const rounded = Math.round(revenue);

    // Push to Smiirl
    const pushUrl = `http://api.smiirl.com/e08e3c3b3c0d/set-number/1efb9641f0aa06d56b82faf4c830f72d/${rounded}`;
    await fetch(pushUrl, { method: "GET" });

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ number: rounded });
  } catch (err) {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.toString() });
  }
}
