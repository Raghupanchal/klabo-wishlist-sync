/**
 * Server-Authoritative Wishlist Merge & Reconciliation Engine for KLABO.
 * Guarantees cross-device eventual consistency for customer wishlists,
 * handles duplicate prevention, and manages guest-to-customer migration.
 */

/**
 * Server-Authoritative Two-Way Wishlist Set Union Merge
 * @param {Array} remoteProducts Products currently stored in Supabase wishlist table for customer
 * @param {Array} incomingProducts Products sent from client
 * @returns {Array} Deterministically merged wishlist products array
 */
export function mergeWishlistProducts(remoteProducts = [], incomingProducts = []) {
  const mergedMap = new Map();

  // 1. Add remote products
  if (Array.isArray(remoteProducts)) {
    for (const p of remoteProducts) {
      if (!p) continue;
      const id = String(p.product_id || p.id || '');
      if (!id) continue;

      mergedMap.set(id, {
        id: id,
        product_id: id,
        variantId: String(p.variant_id || p.variantId || ''),
        title: String(p.title || ''),
        price: String(p.price || ''),
        image: p.image || null,
        url: p.url || null
      });
    }
  }

  // 2. Union merge incoming products
  if (Array.isArray(incomingProducts)) {
    for (const p of incomingProducts) {
      if (!p) continue;
      const id = String(p.id || p.product_id || '');
      if (!id) continue;

      const existing = mergedMap.get(id);
      mergedMap.set(id, {
        id: id,
        product_id: id,
        variantId: String(p.variantId || p.variant_id || existing?.variantId || ''),
        title: String(p.title || existing?.title || ''),
        price: String(p.price || existing?.price || ''),
        image: p.image || existing?.image || null,
        url: p.url || existing?.url || null
      });
    }
  }

  return Array.from(mergedMap.values());
}
