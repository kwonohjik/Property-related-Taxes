/**
 * 상속 취득가액 의제(소령 §176조의2 ④ / §163 ⑨) + 상속 주택 환산(3-시점) 페이로드 빌더.
 *
 * transfer-tax-api.ts 800줄 정책 준수를 위해 분리 (2026-05-12).
 * acquisitionCause === "inheritance" + 자동(보충적평가) 모드에서만 호출.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { applyRatio } from "./transfer-tax-api-helpers";

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
    primary.inheritanceValuationMode === "auto" &&
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
        assetKind: primary.inheritanceAssetKind,
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
      assetKind: primary.inheritanceAssetKind,
      reportedValue,
      reportedMethod: "supplementary" as const,
      useSupplementaryHelper: true,
      ...(primary.acquisitionArea && parseFloat(primary.acquisitionArea) > 0 && {
        landAreaM2: parseFloat(primary.acquisitionArea),
      }),
      publishedValueAtInheritance: reportedValue,
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
  const triggerable =
    (primary.inheritanceAssetKind === "house_individual" ||
      primary.inheritanceAssetKind === "house_apart") &&
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
