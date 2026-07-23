import { supabase } from "../lib/supabase.js";
import { handleCors } from "../lib/cors.js";
import { verifyShopifyAppProxy } from "../lib/shopify-auth.js";
import { mergeCartItems, generateCartSignature } from "../lib/cart-engine.js";

export default async function handler(req, res) {
  if (!handleCors(req, res, { allowedMethods: ["POST", "OPTIONS"] })) {
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed",
    });
  }

  const auth = verifyShopifyAppProxy(req);
  if (!auth.isValid) {
    return res.status(401).json({
      success: false,
      error: auth.error
    });
  }

  if (auth.isGuest) {
    return res.json({
      same: true,
      mergedItems: []
    });
  }

  try {
    const { shopifyItems = [], isGuestMigration, isExplicitMutation, deletedVariantIds, clearCart } = req.body || {};
    const customerId = auth.customerId;

    const { data: remoteItems, error } = await supabase
      .from("cart")
      .select("*")
      .eq("customer_id", customerId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    let currentVersion = 0;
    if (remoteItems && remoteItems.length > 0 && remoteItems[0].cart_version !== undefined && remoteItems[0].cart_version !== null) {
      currentVersion = Number(remoteItems[0].cart_version);
    }

    // Perform two-way set union merge with intent-aware conflict resolution
    const mergedItems = clearCart
      ? []
      : mergeCartItems(remoteItems || [], shopifyItems || [], {
            isGuestMigration,
            isExplicitMutation,
            deletedVariantIds,
            clearCart
        });
    const shopifySig = generateCartSignature(shopifyItems || []);
    const mergedSig = generateCartSignature(mergedItems);
    const isSame = shopifySig === mergedSig && !isGuestMigration && !isExplicitMutation && !clearCart;

    // If local cart lacks items present on server or requires guest migration merge, persist merged result
    if (!isSame) {
      const newVersion = currentVersion + 1;
      await supabase.from("cart").delete().eq("customer_id", customerId);

      if (mergedItems.length > 0) {
        const rows = mergedItems.map((item) => ({
          customer_id: customerId,
          product_id: String(item.product_id || ""),
          variant_id: String(item.variant_id),
          title: String(item.title || ""),
          unit_price: Number(item.unit_price || 0),
          image: item.image || null,
          url: item.url || null,
          quantity: Math.max(1, Number(item.quantity || 1)),
          cart_version: newVersion,
          updated_at: new Date().toISOString()
        }));

        await supabase.from("cart").insert(rows);
      }
    }

    return res.json({
      success: true,
      same: isSame,
      version: currentVersion,
      updatedAt: new Date().toISOString(),
      serverSignature: mergedSig,
      serverItems: mergedItems,
      mergedItems: mergedItems
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}