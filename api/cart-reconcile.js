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
    const remoteSig = generateCartSignature(remoteItems || []);
    const mergedSig = generateCartSignature(mergedItems);

    // Calculate decision
    let decision = "NOOP";
    if (shopifyItems.length > 0 && (remoteItems.length === 0 || remoteSig !== mergedSig)) {
      decision = "UPLOAD";
    } else if (remoteItems.length > 0 && shopifyItems.length === 0 && !clearCart) {
      decision = "DOWNLOAD";
    } else if (shopifySig !== mergedSig) {
      decision = "DOWNLOAD";
    }

    const isSame = shopifySig === mergedSig && !isGuestMigration && !isExplicitMutation && !clearCart;

    console.log(`[CartReconcile] Metrics -> Shopify: ${shopifyItems.length} items | Supabase: ${remoteItems.length} items | Merged: ${mergedItems.length} items | Decision: ${decision}`);

    // If Supabase remote state differs from merged result, persist merged result to DB
    if (remoteSig !== mergedSig || !isSame || isGuestMigration) {
      const newVersion = currentVersion + 1;
      await supabase.from("cart").delete().eq("customer_id", customerId);

      const validRowsToInsert = mergedItems
        .filter((item) => String(item.variant_id || '').trim() && String(item.product_id || '').trim() && String(item.title || '').trim())
        .map((item) => ({
          customer_id: customerId,
          product_id: String(item.product_id).trim(),
          variant_id: String(item.variant_id).trim(),
          title: String(item.title).trim(),
          unit_price: Number(item.unit_price || 0),
          image: item.image || null,
          url: item.url || null,
          quantity: Math.max(1, Number(item.quantity || 1)),
          cart_version: newVersion,
          updated_at: new Date().toISOString()
        }));

      if (validRowsToInsert.length > 0) {
        await supabase.from("cart").insert(validRowsToInsert);
      }
    }

    return res.json({
      success: true,
      same: isSame,
      decision: decision,
      metrics: {
        shopifyItemCount: shopifyItems.length,
        supabaseItemCount: remoteItems.length,
        mergedItemCount: mergedItems.length
      },
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