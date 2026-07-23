import { supabase } from "../lib/supabase.js";
import { handleCors } from "../lib/cors.js";

export default async function handler(req, res) {
    if (!handleCors(req, res, { allowedMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] })) {
        return;
    }

    // ===================================
    // GET CART
    // ===================================
    if (req.method === "GET") {
        const customerId = req.query.customerId;

        if (!customerId || typeof customerId !== "string" || customerId.trim() === "") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid customerId"
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
    // SYNC ENTIRE CART
    // ===================================
    if (req.method === "POST") {
        const { customerId, items } = req.body;

        if (!customerId || typeof customerId !== "string" || customerId.trim() === "") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid customerId"
            });
        }

        if (!Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid items array"
            });
        }

        // Validate payload items to reject malformed data
        for (const item of items) {
            const variantId = item.variant_id || item.id;
            if (!variantId) {
                return res.status(400).json({
                    success: false,
                    error: "Item missing variant_id or id"
                });
            }
        }

        // Fetch current cart version
        const { data: existingCart, error: fetchError } = await supabase
            .from("cart")
            .select("cart_version")
            .eq("customer_id", customerId)
            .limit(1);

        if (fetchError) {
            return res.status(500).json({
                success: false,
                error: fetchError.message
            });
        }

        let currentVersion = 0;
        if (existingCart && existingCart.length > 0 && existingCart[0].cart_version !== undefined && existingCart[0].cart_version !== null) {
            currentVersion = Number(existingCart[0].cart_version);
        }
        const newVersion = currentVersion + 1;

        // Remove existing cart for this customer
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

        // Empty cart? Nothing else to do.
        if (items.length === 0) {
            return res.json({
                success: true,
                cartVersion: newVersion,
                message: "Cart cleared"
            });
        }

        // Prepare rows (sanitize values to prevent injection and malformed input)
        const rows = items.map(item => ({
            customer_id: customerId,
            product_id: String(item.product_id || ""),
            variant_id: String(item.variant_id || item.id),
            title: String(item.product_title || item.title || ""),
            unit_price: Number(item.final_price || item.price || 0) / 100,
            image: item.featured_image?.url || item.image || null,
            url: item.url || (item.handle ? `/products/${item.handle}` : null),
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

        return res.json({
            success: true,
            cartVersion: newVersion,
            count: rows.length
        });
    }

    // ===================================
    // UPDATE QUANTITY
    // ===================================
    if (req.method === "PATCH") {
        const { customerId, variantId, quantity } = req.body;

        if (!customerId || !variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing customerId or variantId"
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
        const { customerId, variantId } = req.body;

        if (!customerId || !variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing customerId or variantId"
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