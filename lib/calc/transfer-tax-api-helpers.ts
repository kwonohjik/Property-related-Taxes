/**
 * 양도소득세 API 변환 헬퍼 — toEngineReductions + buildAssetPayload (companionAssets용)
 * transfer-tax-api.ts 800줄 정책에 따라 분리.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";

export function toEngineAssetKind(kind: AssetForm["assetKind"]): "housing" | "land" | "building" {
  if (kind === "right_to_move_in" || kind === "presale_right") return "housing";
  return kind;
}

export const isHousingLike = (kind: AssetForm["assetKind"]) =>
  kind === "housing" || kind === "right_to_move_in" || kind === "presale_right";

/** AssetReductionForm[] → 엔진 reductions payload 변환 */
export function toEngineReductions(
  formReductions: AssetReductionForm[],
  acquisitionCause: AssetForm["acquisitionCause"],
) {
  return formReductions.map((r) => {
    if (r.type === "self_farming") {
      const decedentYears = parseInt(r.decedentFarmingYears ?? "0") || 0;
      const incorpDate = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationDate ?? "") : "";
      const incorpZone = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationZone ?? "") : "";
      const incorpStdPrice = r.useSelfFarmingIncorporation
        ? parseAmount(r.selfFarmingStandardPriceAtIncorporation ?? "")
        : 0;
      return {
        type: "self_farming" as const,
        farmingYears: parseInt(r.farmingYears) || 0,
        ...(acquisitionCause === "inheritance" && decedentYears > 0
          ? { decedentFarmingYears: decedentYears }
          : {}),
        ...(incorpDate ? { incorporationDate: incorpDate } : {}),
        ...(incorpZone ? { incorporationZoneType: incorpZone } : {}),
        ...(incorpStdPrice > 0 ? { standardPriceAtIncorporation: incorpStdPrice } : {}),
      };
    }
    if (r.type === "long_term_rental") {
      return {
        type: "long_term_rental" as const,
        rentalYears: parseInt(r.rentalYears) || 0,
        rentIncreaseRate: parseFloat(r.rentIncreaseRate) / 100,
      };
    }
    if (r.type === "new_housing") {
      const region =
        r.reductionRegion === "outside_overconcentration"
          ? "metropolitan"
          : (r.reductionRegion as "metropolitan" | "non_metropolitan");
      return { type: "new_housing" as const, region };
    }
    if (r.type === "unsold_housing") {
      const region =
        r.reductionRegion === "outside_overconcentration"
          ? "metropolitan"
          : (r.reductionRegion as "metropolitan" | "non_metropolitan");
      return { type: "unsold_housing" as const, region };
    }
    if (r.type === "public_expropriation") {
      const cash = parseAmount(r.expropriationCash || "0");
      const bond = parseAmount(r.expropriationBond || "0");
      const bondHoldingYears =
        r.expropriationBondHoldingYears === "3"
          ? 3
          : r.expropriationBondHoldingYears === "5"
            ? 5
            : null;
      return {
        type: "public_expropriation" as const,
        cashCompensation: cash,
        bondCompensation: bond,
        bondHoldingYears,
        businessApprovalDate: r.expropriationApprovalDate,
      };
    }
    // ── Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본격 변환 ──
    if (r.type === "new_99_3") {
      return {
        type: "new_99_3" as const,
        contractDate993: r.contractDate993 || undefined,
        usageApprovalDate993: r.usageApprovalDate993 || undefined,
        standardPriceAt5Years: parseAmount(r.standardPriceAt5Years || "0"),
        standardPriceAtAcquisition993: parseAmount(r.standardPriceAtAcquisition993 || "0"),
        standardPriceAtTransfer993: r.standardPriceAtTransfer993
          ? parseAmount(r.standardPriceAtTransfer993)
          : undefined,
        region993: r.region993,
        acquisitionType993: r.acquisitionType993,
        hasOccupancyAtContract: r.hasOccupancyAtContract ?? false,
        isResident993: r.isResident993,
        isHousingConstructionBusiness993: r.isHousingConstructionBusiness993,
        // Round 10 (2026-05-06): PHD 환산 입력 (취득시 추정 공동주택가격 자동 산출)
        phdMode993: r.phdMode993 ?? false,
        phdFirstDisclosureDate993: r.phdFirstDisclosureDate993 || undefined,
        phdFirstDisclosurePrice993: r.phdFirstDisclosurePrice993
          ? parseAmount(r.phdFirstDisclosurePrice993)
          : undefined,
        phdLandAreaSqm993: r.phdLandAreaSqm993 ? parseFloat(r.phdLandAreaSqm993) : undefined,
        phdLandPricePerSqmAtAcq993: r.phdLandPricePerSqmAtAcq993
          ? parseAmount(r.phdLandPricePerSqmAtAcq993)
          : undefined,
        phdLandPricePerSqmAtFirst993: r.phdLandPricePerSqmAtFirst993
          ? parseAmount(r.phdLandPricePerSqmAtFirst993)
          : undefined,
        phdBuildingStdAtAcq993: r.phdBuildingStdAtAcq993
          ? parseAmount(r.phdBuildingStdAtAcq993)
          : undefined,
        phdBuildingStdAtFirst993: r.phdBuildingStdAtFirst993
          ? parseAmount(r.phdBuildingStdAtFirst993)
          : undefined,
      };
    }
    // ── Phase 1 stub 20종: 본 요건 미구현 — type만 전달 (엔진은 시한 검증만 수행) ──
    // 해당 ID들은 transfer.types.ts TransferReductionStub 정의 + Zod schema 통과 보장.
    // TypeScript narrowing이 모든 케이스를 소진해 never로 좁혀지므로 unknown 캐스트로 우회.
    const stubType = (r as unknown as { type: string }).type;
    return { type: stubType, _phase1Stub: true as const };
  });
}

/** 자산 1건 → 번들 companionAssets 배열 항목 변환 */
export function buildAssetPayload(
  asset: AssetForm,
  bundledSaleMode: "actual" | "apportioned",
  transferDate: string,
) {
  const reductions = toEngineReductions(asset.reductions ?? [], asset.acquisitionCause);

  // 감환지: acquisitionArea에 의제취득면적이 UI에서 이미 계산됨
  const effectiveLandArea = asset.acquisitionArea ? parseFloat(asset.acquisitionArea) : undefined;

  const inheritanceValuation =
    asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "auto"
      ? {
          inheritanceDate: asset.inheritanceDate || asset.acquisitionDate,
          assetKind: asset.inheritanceAssetKind,
          landAreaM2: effectiveLandArea,
          publishedValueAtInheritance: parseAmount(asset.publishedValueAtInheritance),
        }
      : undefined;

  const fixedAcquisitionPrice =
    (asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition && asset.fixedAcquisitionPrice) ||
    (asset.acquisitionCause === "gift" && asset.fixedAcquisitionPrice) ||
    (asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "manual" && asset.fixedAcquisitionPrice)
      ? parseAmount(asset.fixedAcquisitionPrice)
      : undefined;

  return {
    assetId: asset.assetId,
    assetLabel: asset.assetLabel,
    assetKind: toEngineAssetKind(asset.assetKind),
    standardPriceAtTransfer:
      parseAmount(asset.standardPriceAtTransfer) > 0
        ? parseAmount(asset.standardPriceAtTransfer)
        : undefined,
    standardPriceAtAcquisition:
      asset.acquisitionCause === "purchase" && asset.useEstimatedAcquisition && asset.standardPriceAtAcq
        ? parseAmount(asset.standardPriceAtAcq)
        : undefined,
    directExpenses: parseAmount(asset.directExpenses),
    reductions,
    inheritanceValuation,
    fixedAcquisitionPrice,
    isOneHousehold: asset.isOneHousehold,
    fixedSalePrice:
      bundledSaleMode === "actual" && asset.actualSalePrice
        ? parseAmount(asset.actualSalePrice)
        : undefined,
    acquisitionCause: asset.acquisitionCause,
    useEstimatedAcquisition:
      asset.acquisitionCause === "purchase" ? asset.useEstimatedAcquisition : undefined,
    acquisitionDate: asset.acquisitionDate || undefined,
    // Round 9 (2026-05-06): 자산-수준 매매계약일 (§99의3 등 13개 매매계약일 기준 조문)
    assetContractDate: asset.assetContractDate || undefined,
    decedentAcquisitionDate:
      asset.acquisitionCause === "inheritance" && asset.decedentAcquisitionDate
        ? asset.decedentAcquisitionDate
        : undefined,
    donorAcquisitionDate:
      asset.acquisitionCause === "gift" && asset.donorAcquisitionDate
        ? asset.donorAcquisitionDate
        : asset.acquisitionCause === "carryover_gift" && asset.carryover?.donorAcquisitionDate
        ? asset.carryover.donorAcquisitionDate
        : undefined,
    // 이월과세(증여) 전용 서브객체 — carryover_gift 시만 빌드
    // "general" 환산 모드에서 topLevelOverrides.standardPrice* 를 최상위에 주입
    ...(() => {
      const cp = buildCarryoverPayload(asset, transferDate);
      if (!cp) return {};
      return {
        carryoverTaxation: cp.carryoverTaxation,
        ...cp.topLevelOverrides,
      };
    })(),
  };
}
