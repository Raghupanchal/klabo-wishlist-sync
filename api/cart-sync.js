import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    // ===================================
    // GET CART
    // ===================================

    if (req.method === "GET") {

        const customerId = req.query.customerId;

        if (!customerId) {
            return res.status(400).json({
                success: false,
                error: "Missing customerId"
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

        if (!customerId || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                error: "Missing customerId or items"
            });
        }

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
                message: "Cart cleared"
            });
        }

        // Prepare rows
        const rows = items.map(item => ({
            customer_id: customerId,
            product_id: String(item.product_id || ""),
            variant_id: String(item.variant_id || item.id),
            title: item.product_title || item.title || "",
            price: String(item.final_price || item.price || 0),
            image: item.featured_image?.url || item.image || "",
            url: item.url || (item.handle ? `/products/${item.handle}` : ""),
            quantity: item.quantity || 1
        }));

        const { error } = await supabase
            .from("cart")
            .insert(rows);

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            count: rows.length
        });
    }

    // ===================================
    // UPDATE QUANTITY
    // ===================================

    if (req.method === "PATCH") {

        const {
            customerId,
            variantId,
            quantity
        } = req.body;

        if (!customerId || !variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing data"
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
                quantity
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

        const {
            customerId,
            variantId
        } = req.body;

        if (!customerId || !variantId) {
            return res.status(400).json({
                success: false,
                error: "Missing data"
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