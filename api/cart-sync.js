import { supabase } from "../lib/supabase.js";
import { handleCors } from "../lib/cors.js";
import { verifyShopifyAppProxy } from "../lib/shopify-auth.js";
import { mergeCartItems, generateCartSignature } from "../lib/cart-engine.js";

export default async function handler(req, res) {
    if (!handleCors(req, res, { allowedMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] })) {
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

    // ===================================
    // GET CART
    // ===================================
    if (req.method === "GET") {
        if (auth.isGuest) {
            return res.json({
                success: true,
                items: []
            });
        }

        const { data, error } = await supabase
            .from("cart")
            .select("*")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            items: data
        });
    }

    // ===================================
    // SYNC ENTIRE CART (SERVER-AUTHORITATIVE UNION MERGE)
    // ===================================
    if (req.method === "POST") {
        if (auth.isGuest) {
            return res.json({
                success: true,
                cartVersion: 0,
                mergedItems: [],
                message: "Guest cart (skipping remote sync)"
            });
        }

        const { items: incomingItems, isGuestMigration, isExplicitMutation, deletedVariantIds, clearCart } = req.body || {};

        if (!Array.isArray(incomingItems) && !clearCart) {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid items array"
            });
        }

        // Fetch existing remote cart items for customer
        const { data: remoteItems, error: fetchError } = await supabase
            .from("cart")
            .select("*")
            .eq("customer_id", customerId);

        if (fetchError) {
            return res.status(500).json({
                success: false,
                error: fetchError.message
            });
        }

        let currentVersion = 0;
        if (remoteItems && remoteItems.length > 0 && remoteItems[0].cart_version !== undefined && remoteItems[0].cart_version !== null) {
            currentVersion = Number(remoteItems[0].cart_version);
        }
        const newVersion = currentVersion + 1;

        // Perform server-authoritative two-way set union merge with intent-aware conflict resolution
        const mergedItems = clearCart
            ? []
            : mergeCartItems(remoteItems || [], incomingItems || [], {
                  isGuestMigration,
                  isExplicitMutation,
                  deletedVariantIds,
                  clearCart
              });

        // Remove existing cart rows for customer and replace with authoritative merged set
        const { error: deleteError } = await supabase
            .from("cart")
            .delete()
            .eq("customer_id", customerId);

        if (deleteError) {
            return res.status(500).json({
                success: false,
                error: deleteError.message
            });
        }

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

            const { error: insertError } = await supabase
                .from("cart")
                .insert(rows);

            if (insertError) {
                return res.status(500).json({
                    success: false,
                    error: insertError.message
                });
            }
        }

        const incomingSig = generateCartSignature(incomingItems || []);
        const mergedSig = generateCartSignature(mergedItems);

        return res.json({
            success: true,
            version: newVersion,
            cartVersion: newVersion,
            updatedAt: new Date().toISOString(),
            same: incomingSig === mergedSig,
            count: mergedItems.length,
            mergedItems: mergedItems
        });
    }

    // ===================================
    // UPDATE QUANTITY
    // ===================================
    if (req.method === "PATCH") {
        if (auth.isGuest) {
            return res.json({ success: true });
        }

        const { variantId, quantity } = req.body || {};

        if (!variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing variantId"
            });
        }

        if (quantity <= 0) {
            await supabase
                .from("cart")
                .delete()
                .eq("customer_id", customerId)
                .eq("variant_id", variantId);

            return res.json({
                success: true
            });
        }

        const { error } = await supabase
            .from("cart")
            .update({
                quantity: Number(quantity)
            })
            .eq("customer_id", customerId)
            .eq("variant_id", variantId);

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true
        });
    }

    // ===================================
    // REMOVE ITEM
    // ===================================
    if (req.method === "DELETE") {
        if (auth.isGuest) {
            return res.json({ success: true });
        }

        const { variantId } = req.body || {};

        if (!variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing variantId"
            });
        }

        const { error } = await supabase
            .from("cart")
            .delete()
            .eq("customer_id", customerId)
            .eq("variant_id", variantId);

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true
        });
    }

    return res.status(405).json({
        success: false,
        error: "Method Not Allowed"
    });
}