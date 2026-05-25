export interface SiloItemMaster {
  id: string | number;
  sku_code: string | null;
  upc: string | null;
  plu: string | null;
  description: string;
  group?: string | null;
  location?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
}

export async function fetchProducts(limit: number = 500): Promise<{ products: SiloItemMaster[] }> {
  // TODO: Implement actual Silo API fetch
  console.log(`[silo/client] fetchProducts called with limit ${limit}`);
  return { products: [] };
}
