import { supabase } from "../lib/supabase.js";
import { handleCors } from "../lib/cors.js";
import { verifyShopifyAppProxy } from "../lib/shopify-auth.js";

export default async function handler(req, res) {
  if (!handleCors(req, res, { allowedMethods: ["GET", "POST", "DELETE", "OPTIONS"] })) {
    return;
  }

  const auth = verifyShopifyAppProxy(req);
  if (!auth.isValid) {
    return res.status(401).json({
      success: false,
      error: auth.error
    });
  }

  const customerId = auth.customerId;

  if (req.method === "GET") {
    if (auth.isGuest) {
      return res.json({
        success: true,
        products: []
      });
    }

    const { data, error } = await supabase
      .from("wishlist")
      .select("*")
      .eq("customer_id", customerId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true,
      products: data
    });
  }

  if (req.method === "POST") {
    if (auth.isGuest) {
      return res.json({ success: true, products: [] });
    }

    const { product, products: incomingProducts } = req.body || {};
    const itemsToMerge = incomingProducts || (product ? [product] : []);

    if (itemsToMerge.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing product or products payload"
      });
    }

    // Fetch existing remote wishlist items
    const { data: remoteProducts } = await supabase
      .from("wishlist")
      .select("*")
      .eq("customer_id", customerId);

    const { mergeWishlistProducts } = await import("../lib/wishlist-engine.js");
    const mergedList = mergeWishlistProducts(remoteProducts || [], itemsToMerge);

    // Upsert merged list into Supabase
    for (const p of mergedList) {
      await supabase
        .from("wishlist")
        .upsert({
          customer_id: customerId,
          product_id: String(p.id || p.product_id),
          variant_id: String(p.variantId || p.variant_id || ''),
          title: String(p.title || ''),
          price: String(p.price || ''),
          image: p.image || null,
          url: p.url || null
        });
    }

    return res.json({
      success: true,
      products: mergedList
    });
  }

  if (req.method === "DELETE") {
    if (auth.isGuest) {
      return res.json({ success: true, deleted: [] });
    }

    const { productId } = req.body || {};

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Missing productId"
      });
    }

    const { data, error } = await supabase
      .from("wishlist")
      .delete()
      .eq("customer_id", customerId)
      .eq("product_id", productId)
      .select();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true,
      deleted: data
    });
  }

  return res.status(405).json({
    success: false,
    error: "Method Not Allowed"
  });
}