/**
 * 상속 취득가액 의제(소령 §176조의2 ④ / §163 ⑨) + 상속 주택 환산(3-시점) 페이로드 빌더.
 *
 * transfer-tax-api.ts 800줄 정책 준수를 위해 분리 (2026-05-12).
 * acquisitionCause === "inheritance" + 자동(보충적평가) 모드에서만 호출.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { applyRatio, deriveEngineInheritanceAssetKind } from "./transfer-tax-api-helpers";

/**
 * 상속 취득가액 의제 페이로드 빌드.
 * - case A (상속개시일 < 1985-01-01): pre-deemed — 환산 vs 실가×CPI max 비교
 * - case B (상속개시일 ≥ 1985-01-01): post-deemed — 상속세 신고가액(공시가격) 적용
 * 트리거 조건 미충족 또는 필수 필드 부재 시 빈 객체 반환 (spread-safe).
 */
export function buildInheritedAcquisitionPayload(
  primary: AssetForm,
  primaryRatio: number,
  primaryFractional: boolean,
): { inheritedAcquisition?: unknown } {
  const triggerable =
    primary.acquisitionCause === "inheritance" &&
    (primary.inheritanceAssetKind === "land" ||
      primary.inheritanceAssetKind === "house_individual" ||
      primary.inheritanceAssetKind === "house_apart");
  if (!triggerable) return {};

  const inheritanceStartDate = primary.inheritanceStartDate || primary.acquisitionDate || "";
  if (!inheritanceStartDate) return {};
  const isPreDeemed = inheritanceStartDate < "1985-01-01";

  if (isPreDeemed) {
    const stdAtDeemed = parseAmount(primary.standardPriceAtAcq);
    const stdAtTransfer = parseAmount(primary.standardPriceAtTransfer);
    // ① 상증법 §60~66 평가액(상속세 신고가액) — 지분 모드 시 × ratio (post-deemed와 일관)
    const reportedRaw = parseAmount(primary.publishedValueAtInheritance);
    const reportedValue =
      reportedRaw > 0
        ? primaryFractional
          ? applyRatio(reportedRaw, primaryRatio)
          : reportedRaw
        : undefined;

    return {
      inheritedAcquisition: {
        mode: "pre-deemed" as const,
        inheritanceStartDate,
        assetKind: deriveEngineInheritanceAssetKind(primary),
        ...(reportedValue && { reportedValue }),
        ...(stdAtDeemed > 0 && { standardPriceAtDeemedDate: stdAtDeemed }),
        ...(stdAtTransfer > 0 && { standardPriceAtTransfer: stdAtTransfer }),
      },
    };
  }

  // case B post-deemed — 상속세 신고가액(공시가격) 적용
  const reportedRaw = parseAmount(primary.publishedValueAtInheritance);
  if (reportedRaw <= 0) return {};
  // 지분 모드: 100% 기준 입력값에 × ratio 적용 (primaryInheritanceValuation과 일관)
  // 미적용 시 100% 송신으로 엔진에서 안분 잔여가 필요경비로 잘못 적재됨 (사례 27)
  const reportedValue = primaryFractional
    ? applyRatio(reportedRaw, primaryRatio)
    : reportedRaw;
  return {
    inheritedAcquisition: {
      mode: "post-deemed" as const,
      inheritanceStartDate,
      assetKind: deriveEngineInheritanceAssetKind(primary),
      reportedValue,
      // 사용자가 고른 평가방법을 엔진에 전달(결과 legalBasis·formula 반영). 공란("")이면 "supplementary" 강제 —
      // reportedMethod가 비면 calcPostDeemed가 신고가액 경로(inheritance-acquisition-price.ts:164)를 못 넘고
      // legacyFallback→computeSupplementary(land)로 빠져 post-deemed 총액을 단가로 오인, × 면적 폭증(C2 면적곱 지뢰).
      reportedMethod: primary.inheritanceValuationMethod || ("supplementary" as const),
      useSupplementaryHelper: true,
      ...(primary.acquisitionArea && parseFloat(primary.acquisitionArea) > 0 && {
        landAreaM2: parseFloat(primary.acquisitionArea),
      }),
      publishedValueAtInheritance: reportedValue,
    },
  };
}

/**
 * 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 페이로드 빌드 (상업용건물 + 상속개시일 < 2005-01-01).
 *
 * §163⑨2호: 상가 기준시가 최초고시(2005-01-01) 전 상속 상가는 max(상증법 평가액, §164⑥ 취득당시 기준시가).
 * opt-in — 8필드(면적 3 + 취득시·최초고시 개공지·건물기준시가·최초고시 호별고시가) 모두 입력 시에만 전송
 * (주택 buildInheritedHouseValuationPayload all-or-nothing 미러). cb* 스토어 필드 재사용(환산 섹션과 동일 물리량).
 */
export function buildCommercialInheritanceValuationPayload(
  primary: AssetForm,
): { commercialInheritanceValuation?: unknown } {
  if (primary.assetKind !== "commercial_building" || primary.acquisitionCause !== "inheritance") {
    return {};
  }
  const inheritanceDate = primary.inheritanceStartDate || primary.acquisitionDate || "";
  if (!inheritanceDate || inheritanceDate >= "2005-01-01") return {};

  const exclusiveArea = parseFloat(primary.cbExclusiveArea) || 0;
  const commonArea = parseFloat(primary.cbSharedArea) || 0;
  const landArea = parseFloat(primary.cbLandArea) || 0;
  const unitPriceAtFirstDisclosure = parseAmount(primary.cbUnitPriceAtFirstOrAcq);
  const landPriceAtAcquisition = parseAmount(primary.cbLandPricePerSqmAtAcq);
  const landPriceAtFirstDisclosure = parseAmount(primary.cbLandPricePerSqmAtFirst);
  const buildingStdPriceAtAcquisition = parseAmount(primary.cbBuildingStdPriceAtAcq);
  const buildingStdPriceAtFirstDisclosure = parseAmount(primary.cbBuildingStdPriceAtFirst);

  // all-or-nothing opt-in — 하나라도 결측이면 §164⑥ 미적용(Phase 1 상증법 평가액만).
  if (
    exclusiveArea <= 0 ||
    commonArea <= 0 ||
    landArea <= 0 ||
    unitPriceAtFirstDisclosure <= 0 ||
    landPriceAtAcquisition <= 0 ||
    landPriceAtFirstDisclosure <= 0 ||
    buildingStdPriceAtAcquisition <= 0 ||
    buildingStdPriceAtFirstDisclosure <= 0
  ) {
    return {};
  }

  return {
    commercialInheritanceValuation: {
      exclusiveArea,
      commonArea,
      landArea,
      unitPriceAtFirstDisclosure,
      landPriceAtAcquisition,
      landPriceAtFirstDisclosure,
      buildingStdPriceAtAcquisition,
      buildingStdPriceAtFirstDisclosure,
    },
  };
}

/**
 * 상속 주택 환산취득가 보조 입력 페이로드 빌드 (주택 + 상속개시일 < 2005-04-30).
 *
 * 필수 4필드(landArea·transferLandPricePerSqm·firstLandPricePerSqm·firstHousePrice)가
 * 모두 입력되었다면 사용자가 환산 보조 사용 의사 표명으로 간주 (inhHouseValEnabled 토글은 dead flag).
 */
export function buildInheritedHouseValuationPayload(
  primary: AssetForm,
  transferDate: string,
): { inheritedHouseValuation?: unknown } {
  // §164⑦ 주택 환산은 실제 주택 자산(상단 assetKind)에만 적용 — 상속 자산구분 라디오 폐지 대응.
  const isHouse =
    primary.assetKind === "housing" || primary.assetKind === "redevelopment_apt";
  const triggerable =
    isHouse &&
    primary.acquisitionCause === "inheritance" &&
    parseFloat(primary.inhHouseValLandArea) > 0 &&
    parseAmount(primary.inhHouseValLandPricePerSqmAtTransfer) > 0 &&
    parseAmount(primary.inhHouseValLandPricePerSqmAtFirst) > 0 &&
    parseAmount(primary.inhHouseValHousePriceAtFirst) > 0;
  if (!triggerable) return {};

  const inheritanceDate = primary.inheritanceStartDate || primary.acquisitionDate || "";
  const isBefore1990 = !!inheritanceDate && inheritanceDate < "1990-08-30";
  const buildGrade = (raw: string) => {
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return primary.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };

  const pre1990Payload = isBefore1990
    ? (() => {
        const gCur = buildGrade(primary.pre1990Grade_current ?? "");
        const gPrev = buildGrade(primary.pre1990Grade_prev ?? "");
        const gAcq = buildGrade(primary.pre1990Grade_atAcq ?? "");
        const p1990 = parseAmount(primary.pre1990PricePerSqm_1990 ?? "");
        if (!gCur || !gPrev || !gAcq || p1990 <= 0) return undefined;
        return {
          grade_1990_0830: gCur,
          gradePrev_1990_0830: gPrev,
          gradeAtAcquisition: gAcq,
          pricePerSqm_1990: p1990,
        };
      })()
    : undefined;

  const landPriceAtInheritance = parseAmount(primary.inhHouseValLandPricePerSqmAtInheritance);

  // 1990 이전이면 pre1990 필요, 이후이면 landPriceAtInheritance 필요
  if (isBefore1990 && !pre1990Payload && !landPriceAtInheritance) return {};
  if (!isBefore1990 && !landPriceAtInheritance) return {};

  return {
    inheritedHouseValuation: {
      inheritanceDate,
      transferDate,
      landArea: parseFloat(primary.inhHouseValLandArea),
      landPricePerSqmAtTransfer: parseAmount(primary.inhHouseValLandPricePerSqmAtTransfer),
      landPricePerSqmAtFirstDisclosure: parseAmount(primary.inhHouseValLandPricePerSqmAtFirst),
      landPricePerSqmAtInheritance: landPriceAtInheritance || undefined,
      housePriceAtTransfer: parseAmount(primary.inhHouseValHousePriceAtTransfer) || 0,
      housePriceAtFirstDisclosure: parseAmount(primary.inhHouseValHousePriceAtFirst),
      buildingStdPriceAtTransfer:
        parseAmount(primary.inhHouseValBuildingStdPriceAtTransfer) || undefined,
      buildingStdPriceAtFirstDisclosure:
        parseAmount(primary.inhHouseValBuildingStdPriceAtFirst) || undefined,
      buildingStdPriceAtInheritance:
        parseAmount(primary.inhHouseValBuildingStdPriceAtInheritance) || undefined,
      housePriceAtInheritanceOverride: primary.inhHouseValUseHousePriceOverride
        ? parseAmount(primary.inhHouseValHousePriceAtInheritanceOverride) || undefined
        : undefined,
      firstDisclosureDate: primary.inhHouseValFirstDisclosureDate || "2005-04-30",
      pre1990: pre1990Payload,
    },
  };
}
