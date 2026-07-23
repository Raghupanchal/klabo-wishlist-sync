/**
 * Server-Authoritative Cart Merge & Reconciliation Engine for KLABO.
 * Guarantees cross-device eventual consistency, eliminates destructive whole-cart overwrites,
 * and handles deterministic multi-device union merging and guest migration.
 */

/**
 * Generates a deterministic signature string for an array of cart items.
 * @param {Array} items
 * @returns {string}
 */
export function generateCartSignature(items) {
  if (!items || items.length === 0) {
    return '';
  }

  const sorted = [...items]
    .map((item) => ({
      variant_id: String(item.variant_id || item.id || ''),
      quantity: Number(item.quantity || 0)
    }))
    .filter((item) => item.variant_id && item.quantity > 0)
    .sort((a, b) => a.variant_id.localeCompare(b.variant_id));

  return sorted.map((item) => `${item.variant_id}:${item.quantity}`).join('|');
}

/**
 * Server-Authoritative Two-Way Cart Union Merge Algorithm with Intent-Aware Conflict Resolution
 * @param {Array} remoteItems Items currently stored in Supabase for the customer
 * @param {Array} incomingItems Items sent from the client's local Shopify cart
 * @param {Object} [options]
 * @param {boolean} [options.isGuestMigration] If true, sums quantities (guest + account)
 * @param {boolean} [options.isExplicitMutation] If true, client explicitly edited cart (preserves quantity reductions)
 * @param {Array<string>} [options.deletedVariantIds] List of variant IDs intentionally deleted by user
 * @param {boolean} [options.clearCart] If true, user explicitly cleared cart
 * @returns {Array} Deterministically merged cart items array
 */
export function mergeCartItems(remoteItems = [], incomingItems = [], options = {}) {
  if (options.clearCart) {
    return [];
  }

  const isGuestMigration = Boolean(options.isGuestMigration);
  const isExplicitMutation = Boolean(options.isExplicitMutation);
  const deletedVariantIds = new Set((options.deletedVariantIds || []).map(String));
  const mergedMap = new Map();

  // 1. Index remote items currently in Supabase
  if (Array.isArray(remoteItems)) {
    for (const item of remoteItems) {
      if (!item) continue;
      const variantId = String(item.variant_id || item.id || '');
      if (!variantId || deletedVariantIds.has(variantId)) continue;

      const qty = Math.max(1, Number(item.quantity || 1));
      mergedMap.set(variantId, {
        variant_id: variantId,
        product_id: String(item.product_id || ''),
        title: String(item.title || item.product_title || ''),
        unit_price: Number(item.unit_price || item.final_price || item.price || 0),
        image: item.image || item.featured_image?.url || null,
        url: item.url || (item.handle ? `/products/${item.handle}` : null),
        quantity: qty,
        updated_at: item.updated_at || new Date().toISOString()
      });
    }
  }

  // 2. Perform set union with incoming device items
  if (Array.isArray(incomingItems)) {
    for (const item of incomingItems) {
      if (!item) continue;
      const variantId = String(item.variant_id || item.id || '');
      if (!variantId || deletedVariantIds.has(variantId)) continue;

      const incomingQty = Number(item.quantity);
      // Explicit removal flag if client sends 0
      if (incomingQty <= 0) {
        mergedMap.delete(variantId);
        continue;
      }

      const existing = mergedMap.get(variantId);
      const sanitizedIncoming = {
        variant_id: variantId,
        product_id: String(item.product_id || existing?.product_id || ''),
        title: String(item.product_title || item.title || existing?.title || ''),
        unit_price: Number(item.final_price || item.unit_price || item.price || existing?.unit_price || 0) / (item.final_price || item.price ? 100 : 1) || existing?.unit_price || 0,
        image: item.featured_image?.url || item.image || existing?.image || null,
        url: item.url || (item.handle ? `/products/${item.handle}` : existing?.url || null),
        quantity: incomingQty,
        updated_at: new Date().toISOString()
      };

      if (!existing) {
        mergedMap.set(variantId, sanitizedIncoming);
      } else {
        // Deterministic Intent-Aware Conflict Resolution:
        // 1. Guest Migration -> SUM quantities (guest + existing account)
        // 2. Explicit User Mutation -> Accept incoming intentional quantity (e.g. 5 reduced to 1)
        // 3. Hydration / Passive Reconcile -> PRESERVE MAX to protect cross-device additions
        let finalQty;
        if (isGuestMigration) {
          finalQty = existing.quantity + incomingQty;
        } else if (isExplicitMutation) {
          finalQty = incomingQty;
        } else {
          finalQty = Math.max(existing.quantity, incomingQty);
        }

        mergedMap.set(variantId, {
          ...existing,
          ...sanitizedIncoming,
          quantity: finalQty,
          updated_at: new Date().toISOString()
        });
      }
    }
  }

  // 3. Purge any explicitly deleted variant IDs
  for (const deletedId of deletedVariantIds) {
    mergedMap.delete(deletedId);
  }

  return Array.from(mergedMap.values());
}
