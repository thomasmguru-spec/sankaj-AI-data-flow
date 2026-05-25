export interface ExtractFromFilenameResult {
  invoiceNumber?: string | null;
  invoiceDate?: string | null; // format: 'YYYY-MM-DD'
  customerName?: string | null;
}

export function extractFromFilename(filename: string): ExtractFromFilenameResult {
  // TODO: Implement actual filename parsing
  return {};
}

export interface ExtractOrderFieldsResult {
  lineItems?: Array<{
    lineNumber?: number;
    description?: string;
    skuRaw?: string;
    quantity?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
}

export function extractOrderFields(ocrRawText: string): ExtractOrderFieldsResult {
  // TODO: Implement OCR text parsing
  return { lineItems: [] };
}
