/**
 * 다건(multi) 결과탭이 **신고서 양식 카드와 상세명세서 카드에 같은 `AggregateMeta`를 넘기게**
 * 하는 공용 조립 leaf (결과탭 코드리뷰 Lane 5 — #054 · #093).
 *
 * ## 왜 leaf인가
 *
 * 종전에는 같은 화면의 두 카드가 메타를 **각각 따로** 조립했다:
 *
 * | | 신고서 양식 (`MultiTransferFilingFormSection`) | 상세명세서 (`MultiTransferTaxResultView`) |
 * |---|---|---|
 * | `properties` | ✓ | ✓ |
 * | `ownershipMap` | ✓ | ✗ |
 * | `landNatureMap` | ✓ | ✗ |
 * | **`propertyFormMap`** | ✓ | **✗** |
 *
 * `propertyFormMap`이 없으면 명세서는 자산별 취득일·양도일을 조회할 소스가 없어
 * **1번 양도건의 자산 하나**만 보게 된다. 그래서 2019년 취득 아파트와 2005년 취득 토지를
 * 같은 해에 각각 다른 날 양도해도, 신고서 표는 정확한데 바로 아래 명세서는
 * **두 자산 모두 2019년 취득일**을 찍었다 — 같은 화면 두 카드가 같은 항목에 다른 값을 냈다.
 */
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 다건 결과탭이 다루는 「양도건」 — `form`이 그 건의 폼 전체다. */
export interface AggregatePropertyItem {
  propertyId: string;
  form?: TransferFormData;
}

export function buildAggregateMeta(
  result: AggregateTransferResult,
  properties: AggregatePropertyItem[],
) {
  const ownershipMap = new Map<string, { numerator: number; denominator: number }>();
  const landNatureMap = new Map<string, "appurtenant" | "standalone">();
  // propertyId → form (자산별 양도일·취득일·거주기간 파생 — 신고서·명세서가 함께 읽는다)
  const propertyFormMap = new Map<string, TransferFormData>();

  for (const p of result.properties) {
    const prop = properties.find((x) => x.propertyId === p.propertyId);
    if (prop?.form) propertyFormMap.set(p.propertyId, prop.form);
    const asset = prop?.form?.assets[0];
    if (!asset) continue;
    const numerator = parseInt(asset.ownershipNumerator ?? "100", 10);
    const denominator = parseInt(asset.ownershipDenominator ?? "100", 10);
    if (
      Number.isFinite(numerator) &&
      Number.isFinite(denominator) &&
      denominator > 0 &&
      numerator < denominator
    ) {
      ownershipMap.set(p.propertyId, { numerator, denominator });
    }
    if (asset.assetKind === "land" && asset.landNature) {
      landNatureMap.set(p.propertyId, asset.landNature);
    }
  }

  return {
    properties: result.properties,
    aggregated: result,
    ownershipMap: ownershipMap.size > 0 ? ownershipMap : undefined,
    landNatureMap: landNatureMap.size > 0 ? landNatureMap : undefined,
    propertyFormMap: propertyFormMap.size > 0 ? propertyFormMap : undefined,
  };
}
