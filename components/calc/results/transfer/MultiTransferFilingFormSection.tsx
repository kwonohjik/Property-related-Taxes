"use client";

import { useMemo } from "react";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * 다건 결과탭 상단 합산 신고서 양식 (합계 + 자산별 컬럼).
 *
 * 단건 FilingFormTable aggregate 모드를 그대로 재사용한다(합계 열 + 자산별 열, 32행).
 * detailed-statement가 이미 동일 어댑터를 호출하지만 그쪽은 건드리지 않고
 * 여기서 독립 계산한다 — aggregateToFilingResult는 경량 순수함수라 이중호출 무해(surgical).
 *
 * ownershipMap/landNatureMap: multi는 N개 개별 filing이라 각 property가 자기 form을 가진다.
 * BundledAllocationCard의 "primary" 하드코딩 + 단일 formData 패턴을 그대로 쓰면 매칭 실패로
 * 라벨이 침묵 소실되므로(memory feedback_bundled_primary_assetid_hardcoded), propertyId로 순회한다.
 */
export function MultiTransferFilingFormSection({
  result,
  properties,
}: {
  result: AggregateTransferResult;
  properties: PropertyItem[];
}) {
  const { adapted, aggregateMeta } = useMemo(() => {
    const adapted = aggregateToFilingResult(result);
    const ownershipMap = new Map<string, { numerator: number; denominator: number }>();
    const landNatureMap = new Map<string, "appurtenant" | "standalone">();
    // propertyId → form (자산별 양도일·취득일·거주기간 파생 — buildAggregateRows가 컬럼별로 읽음)
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
      adapted,
      aggregateMeta: {
        properties: result.properties,
        aggregated: result,
        ownershipMap: ownershipMap.size > 0 ? ownershipMap : undefined,
        landNatureMap: landNatureMap.size > 0 ? landNatureMap : undefined,
        propertyFormMap: propertyFormMap.size > 0 ? propertyFormMap : undefined,
      },
    };
  }, [result, properties]);

  return (
    <FilingFormTable
      result={adapted}
      aggregate={aggregateMeta}
      formData={properties[0]?.form}
      title="신고서 양식 (합산)"
    />
  );
}
