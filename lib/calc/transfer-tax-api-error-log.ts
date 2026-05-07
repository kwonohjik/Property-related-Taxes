/**
 * transfer-tax-api 에러 응답 진단 로깅 헬퍼.
 * 800줄 정책 준수를 위해 분리.
 */

export function logFieldErrorsResponse(
  fieldErrors: Record<string, string[]>,
  json: unknown,
  body: unknown,
): void {
  console.error("[transfer-tax API] fieldErrors:", JSON.stringify(fieldErrors, null, 2));
  console.error("[transfer-tax API] error response:", json);
  const b = body as Record<string, unknown>;
  console.error(
    "[transfer-tax API] request body (top-level keys with values):",
    JSON.stringify(
      {
        propertyType: b.propertyType,
        transferPrice: b.transferPrice,
        transferDate: b.transferDate,
        acquisitionPrice: b.acquisitionPrice,
        acquisitionDate: b.acquisitionDate,
        acquisitionCause: b.acquisitionCause,
        assetContractDate: b.assetContractDate,
        useEstimatedAcquisition: b.useEstimatedAcquisition,
        totalSalePrice: b.totalSalePrice,
        totalPropertyTransferPrice: b.totalPropertyTransferPrice,
        bundledSaleMode: b.bundledSaleMode,
        primaryActualSalePrice: b.primaryActualSalePrice,
        standardPriceAtTransferForApportion: b.standardPriceAtTransferForApportion,
        companionAssetsCount: Array.isArray(b.companionAssets) ? (b.companionAssets as unknown[]).length : 0,
      },
      null,
      2,
    ),
  );
  console.error("[transfer-tax API] full request body:", JSON.stringify(body, null, 2));
}

export function logNoFieldErrorsResponse(
  json: { error?: { message?: string; stack?: string } } | null | undefined,
  res: { status: number; statusText: string },
  body: unknown,
): string | undefined {
  console.error("[transfer-tax API] error response (no fieldErrors):", JSON.stringify(json, null, 2));
  console.error("[transfer-tax API] HTTP status:", res.status, res.statusText);
  if (json?.error?.stack) {
    console.error("[transfer-tax API] server stack:", json.error.stack);
  }
  const b = body as Record<string, unknown>;
  console.error(
    "[transfer-tax API] request body (top-level keys, 500 path):",
    JSON.stringify(
      {
        propertyType: b.propertyType,
        transferPrice: b.transferPrice,
        acquisitionDate: b.acquisitionDate,
        totalSalePrice: b.totalSalePrice,
        totalPropertyTransferPrice: b.totalPropertyTransferPrice,
        bundledSaleMode: b.bundledSaleMode,
        companionAssetsCount: Array.isArray(b.companionAssets) ? (b.companionAssets as unknown[]).length : 0,
      },
      null,
      2,
    ),
  );
  return json?.error?.message;
}
