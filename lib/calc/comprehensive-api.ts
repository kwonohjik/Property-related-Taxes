/**
 * 종합부동산세 클라이언트 ↔ API 변환 (동기화 지점 ④⑬)
 *
 * page.tsx 인라인 callComprehensiveApi를 순수 이동 (800줄 정책 — Phase B 선행 분리).
 * 폼 문자열 → 엔진 입력 숫자 변환 + fetch body 구성.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { ComprehensiveFormData, LandParcelForm } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";

/**
 * 토지 필지 모드 검증 (⑧ — API/Zod와 동기화). 통과 시 null, 오류 시 메시지.
 * Zod(서버)가 최종 차단하나, UI 통과↔차단 모순 방지를 위해 클라에서 선검증.
 */
export function validateLandParcels(formData: ComprehensiveFormData): string | null {
  const year = parseInt(formData.assessmentYear) || new Date().getFullYear();
  const checkKind = (
    enabled: boolean,
    mode: string,
    parcels: LandParcelForm[],
    priorMode: string,
    label: string,
  ): string | null => {
    if (!enabled || mode !== "parcels") return null;
    const valid = parcels.filter(
      (p) => parseDecimal(p.area) > 0 && parseAmount(p.officialPricePerSqm) > 0,
    );
    if (valid.length === 0) {
      return `${label} 필지 모드에서는 면적·당해 공시지가를 입력한 필지가 1개 이상 필요합니다.`;
    }
    for (const p of valid) {
      if (!p.jurisdiction.trim()) return `${label}: 모든 필지에 시군구를 입력하세요.`;
      const share = parseDecimal(p.shareRatio);
      if (share <= 0 || share > 100) return `${label}: 지분율은 0 초과 100 이하여야 합니다.`;
    }
    if (priorMode === "auto") {
      if (year < 2022) {
        return `${label}: 직전연도 자동 계산은 2022년 이후 귀속만 지원합니다. 직접 입력을 사용하세요.`;
      }
      const withPrior = valid.filter((p) => parseAmount(p.priorOfficialPricePerSqm) > 0).length;
      if (withPrior !== valid.length) {
        return `${label}: 직전연도 공시지가는 전 필지를 입력해야 합니다 (일부만 입력 불가).`;
      }
    }
    return null;
  };
  return (
    checkKind(
      formData.hasAggregateLand,
      formData.landAggregateMode,
      formData.landAggregateParcels,
      formData.landAggregatePriorMode,
      "종합합산 토지",
    ) ??
    checkKind(
      formData.hasSeparateLand,
      formData.landSeparateMode,
      formData.landSeparateParcels,
      formData.landSeparatePriorMode,
      "별도합산 토지",
    )
  );
}

/**
 * 사례6 건물·부속토지 소유자 분리 검증 (⑧ — API/UI 동기화). 분리 ON 시 시가표준액 필수.
 * 미입력 시 callComprehensiveApi가 appurtenantSplit를 strip → 안분 미적용 침묵 누락 → 여기서 차단
 * (UI 통과↔validate 차단 모순 방지 — API strip 게이트(>0)와 동일 조건).
 */
export function validateAppurtenantSplit(formData: ComprehensiveFormData): string | null {
  const taxpayerType = formData.taxpayerType ?? "individual";
  const capMode = formData.previousYearCapMode ?? "direct";
  const autoMode = taxpayerType !== "corporate_special" && capMode === "auto";
  for (const p of formData.properties) {
    if (!p.appurtenantSplitEnabled) continue;
    if (parseAmount(p.landStdValue) <= 0 || parseAmount(p.buildingStdValue) <= 0) {
      return "건물·부속토지 소유자 분리 시 당해연도 토지·건물 시가표준액을 모두 입력해야 합니다.";
    }
    // 직전 시가표준액은 세부담상한 자동계산 모드에서만 사용 → 그때만 필수 (자동 안분 fallback 금지)
    if (
      autoMode &&
      (parseAmount(p.priorLandStdValue) <= 0 ||
        parseAmount(p.priorBuildingStdValue) <= 0)
    ) {
      return "세부담상한 자동계산 시 직전연도 토지·건물 시가표준액을 모두 입력해야 합니다.";
    }
  }
  return null;
}

/**
 * 트랙 A 다가구주택 면적안분 검증 (⑧ — API/UI 동기화).
 * multiFamilyEnabled ON 시 유효 행(area>0) 1개 이상, 각 area>0, Σ>0 강제.
 * UI 통과↔validate 차단 모순 방지 (자동 안분 fallback 금지 정책 — CLAUDE.md §2).
 */
export function validateMultiFamily(formData: ComprehensiveFormData): string | null {
  for (const p of formData.properties) {
    if (!p.multiFamilyEnabled) continue;
    if (p.floorUnits.length === 0) {
      return "다가구주택 층별 면적 입력 시 구별(층별) 행을 1개 이상 추가해야 합니다.";
    }
    for (const u of p.floorUnits) {
      if (parseDecimal(u.area) <= 0) {
        return `다가구주택 구별 면적은 0㎡ 초과여야 합니다 (미입력 또는 0 불가). 입력란: "${u.label || "행"}".`;
      }
    }
    const totalArea = p.floorUnits.reduce((s, u) => s + parseDecimal(u.area), 0);
    if (totalArea <= 0) {
      return "다가구주택 구별 면적 합계가 0㎡입니다. 면적을 입력해 주세요.";
    }
  }
  return null;
}

// 임대주택 합산배제 유형 (rentalInfo 필드 구성에 사용)
const RENTAL_TYPES = new Set([
  "private_construction_rental",
  "private_purchase_rental_long",
  "private_purchase_rental_short",
  "public_support_rental",
  "public_construction_rental",
  "public_purchase_rental",
]);

// 기타 합산배제 유형 (otherInfo 필드 구성에 사용)
const OTHER_INFO_TYPES = new Set([
  "unsold_housing",
  "daycare_housing",
  "employee_housing",
]);

// store의 exclusionType → validator의 registrationType 매핑
// (임대주택 합산배제 신청 시 UI 선택값을 API 검증 스키마 값으로 변환)
function toRegistrationType(exclusionType: string): string {
  const map: Record<string, string> = {
    private_construction_rental: "private_construction",
    private_purchase_rental_long: "private_purchase_long",
    private_purchase_rental_short: "private_purchase_short",
    public_support_rental: "public_support",
    public_construction_rental: "public_construction",
    public_purchase_rental: "public_purchase",
  };
  return map[exclusionType] ?? "private_purchase_long";
}

export async function callComprehensiveApi(
  formData: ComprehensiveFormData,
): Promise<ComprehensiveTaxResult> {

  // ④ 법인 여부 파생 — 법인은 §8④ 의제 미적용 (3중 패턴: 엔진 1차·API strip 2차)
  const taxpayerType = formData.taxpayerType ?? "individual";
  const isCorporate = taxpayerType !== "individual";

  const properties = formData.properties.map((p) => {
    // §8④ 유형: 법인 시 strip. "none"은 undefined로 (엔진 기본값과 일치)
    const s84Type =
      !isCorporate && p.section8para4Type && p.section8para4Type !== "none"
        ? p.section8para4Type
        : undefined;
    const base = {
      propertyId: p.id,
      assessedValue: parseAmount(p.assessedValue),
      area: p.area ? parseFloat(p.area) : undefined,
      location: p.location,
      exclusionType: p.exclusionType !== "none" ? p.exclusionType : undefined,
      section8para4Type: s84Type,
      // §8④ 요건 필드 — Zod 검증 통과용 (엔진 미사용). 4호는 요건 입력 없음
      newHouseAcquisitionDate:
        s84Type === "temporary_two_house" && p.newHouseAcquisitionDate
          ? p.newHouseAcquisitionDate
          : undefined,
      inheritanceOpenDate:
        s84Type === "inherited_house" && p.inheritanceOpenDate
          ? p.inheritanceOpenDate
          : undefined,
      inheritanceShareRatio:
        s84Type === "inherited_house" && p.inheritanceShareRatio
          ? parseFloat(p.inheritanceShareRatio)
          : undefined,
      // ⑬ T-08: 지자체 조례 재산세 감면율 (0~1). UI 입력 %(0~100) → /100 변환. 미입력·빈 문자열은 undefined
      reductionRate: p.reductionRate ? parseFloat(p.reductionRate) / 100 : undefined,
      // ⑬ 공유지분율 (0~1). UI 입력 %(0~100) → /100. 미입력·빈 문자열·"100"은 undefined/1 (엔진 ??1=단독)
      ownershipRatio:
        p.ownershipRatio && parseFloat(p.ownershipRatio) !== 100
          ? parseFloat(p.ownershipRatio) / 100
          : undefined,
      // ⑬ 사례6: 건물·부속토지 시가표준액 안분 (당해). 분리 ON + 양 시가표준액 >0 시만 전송(빈값 = strip).
      appurtenantSplit:
        p.appurtenantSplitEnabled &&
        parseAmount(p.landStdValue) > 0 &&
        parseAmount(p.buildingStdValue) > 0
          ? {
              ownedPart:
                p.appurtenantOwnedPart === "building" ? "building" : "land",
              landStandardValue: parseAmount(p.landStdValue),
              buildingStandardValue: parseAmount(p.buildingStdValue),
            }
          : undefined,
      // ⑬ 사례7·8·9: 재산세 부과세액 직접입력 (비율 안분 공제 ⓐ). 빈 문자열 = strip(자동계산).
      propertyTaxAmount: p.propertyTaxAmount
        ? parseAmount(p.propertyTaxAmount)
        : undefined,
      // ⑬ 트랙 A: 다가구주택 층별 면적안분. ON + 유효 행(area>0) 1개 이상 시만 전송. 빈값 = strip.
      floorUnits:
        p.multiFamilyEnabled && p.floorUnits.some((u) => parseDecimal(u.area) > 0)
          ? p.floorUnits
              .filter((u) => parseDecimal(u.area) > 0)
              .map((u, i) => ({
                label: u.label.trim() || `구분${i + 1}`,
                area: parseDecimal(u.area),
              }))
          : undefined,
    };

    // 임대주택 합산배제 상세
    if (RENTAL_TYPES.has(p.exclusionType)) {
      const registrationType = p.rentalRegistrationType || toRegistrationType(p.exclusionType);
      return {
        ...base,
        rentalInfo: {
          registrationType,
          rentalRegistrationDate: p.rentalRegistrationDate || `${formData.assessmentYear}-01-01`,
          rentalStartDate: p.rentalStartDate || `${formData.assessmentYear}-01-01`,
          assessedValue: base.assessedValue,
          area: p.area ? parseFloat(p.area) : 60,
          location: p.location,
          previousRent: p.previousRent ? parseAmount(p.previousRent) : undefined,
          currentRent: parseAmount(p.currentRent),
          isInitialContract: p.isInitialContract,
          actualRentalYears: p.actualRentalYears ? parseDecimal(p.actualRentalYears) : undefined,
          registrationRevokedDate: p.registrationRevokedDate || undefined,
        },
      };
    }

    // 기타 합산배제 상세
    if (OTHER_INFO_TYPES.has(p.exclusionType)) {
      return {
        ...base,
        otherInfo: {
          recruitmentNoticeDate: p.recruitmentNoticeDate || undefined,
          acquisitionDate: p.acquisitionDate || undefined,
          isFirstSale: p.isFirstSale,
          hasDaycarePermit: p.hasDaycarePermit,
          isActuallyUsedAsDaycare: p.isActuallyUsedAsDaycare,
          isProvidedToEmployee: p.isProvidedToEmployee,
          rentalFeeRate: p.rentalFeeRate ? parseFloat(p.rentalFeeRate) / 100 : undefined,
        },
      };
    }

    return base;
  });

  // 토지 필지 → 엔진 LandParcelInput 변환 (지분율 % → 0~1, priorMode=auto만 직전 공시지가 전송)
  const aggParcelsMode = formData.hasAggregateLand && formData.landAggregateMode === "parcels";
  const sepParcelsMode = formData.hasSeparateLand && formData.landSeparateMode === "parcels";
  const toParcels = (form: typeof formData.landAggregateParcels, priorAuto: boolean) =>
    form
      .filter((p) => parseDecimal(p.area) > 0 && parseAmount(p.officialPricePerSqm) > 0)
      .map((p) => ({
        parcelId: p.id,
        jurisdiction: p.jurisdiction.trim(),
        name: p.name || undefined,
        area: parseDecimal(p.area),
        shareRatio: (parseDecimal(p.shareRatio) || 100) / 100, // % → 0~1
        officialPricePerSqm: parseAmount(p.officialPricePerSqm),
        priorOfficialPricePerSqm: priorAuto
          ? parseAmount(p.priorOfficialPricePerSqm) || undefined
          : undefined,
      }));

  // 종합합산 토지 — 필지 모드 우선 (집계와 상호배타)
  const landAggregateParcels = aggParcelsMode
    ? toParcels(formData.landAggregateParcels, formData.landAggregatePriorMode === "auto")
    : undefined;
  const landAggregate =
    !aggParcelsMode && formData.hasAggregateLand && parseAmount(formData.landAggregate.totalOfficialValue) > 0
      ? {
          totalOfficialValue: parseAmount(formData.landAggregate.totalOfficialValue),
          propertyTaxBase: parseAmount(formData.landAggregate.propertyTaxBase),
          propertyTaxAmount: parseAmount(formData.landAggregate.propertyTaxAmount),
          previousYearTotalTax: formData.landAggregate.previousYearTotalTax
            ? parseAmount(formData.landAggregate.previousYearTotalTax) || undefined
            : undefined,
        }
      : undefined;
  // 종합합산 필지 모드 + direct 서브모드: 직전 총세액 직접입력
  const landAggregatePreviousYearTotalTax =
    aggParcelsMode && formData.landAggregatePriorMode === "direct" && formData.landAggregate.previousYearTotalTax
      ? parseAmount(formData.landAggregate.previousYearTotalTax) || undefined
      : undefined;

  // 별도합산 토지 — 필지 모드 우선
  const landSeparateParcels = sepParcelsMode
    ? toParcels(formData.landSeparateParcels, formData.landSeparatePriorMode === "auto")
    : undefined;
  const landSeparate =
    !sepParcelsMode && formData.hasSeparateLand && formData.landSeparate.length > 0
      ? formData.landSeparate
          .filter((l) => parseAmount(l.publicPrice) > 0)
          .map((l) => ({
            landId: l.id,
            publicPrice: parseAmount(l.publicPrice),
            propertyTaxBase: parseAmount(l.propertyTaxBase),
            propertyTaxAmount: parseAmount(l.propertyTaxAmount),
          }))
      : undefined;
  const landSeparatePreviousYearTotalTax =
    sepParcelsMode && formData.landSeparatePriorMode === "direct" && formData.landSeparatePreviousYearTotalTax
      ? parseAmount(formData.landSeparatePreviousYearTotalTax) || undefined
      : undefined;

  // 세부담상한 capMode 파생 (3중 패턴)
  const capMode = formData.previousYearCapMode ?? "direct";

  // ⑬ 직전연도 주택별 공시 (당해 2주택+ 다주택 케이스) — 재산세 주택별 합산용.
  //   미입력/단일은 undefined → 엔진 [assessedValue] fallback. 입력 시 합산을 assessedValue로(단일 원천).
  const priorHouseValues =
    formData.previousYearAutoHouseValues &&
    formData.previousYearAutoHouseValues.length > 0
      ? formData.previousYearAutoHouseValues
          .map((v) => parseAmount(v))
          .filter((v) => v > 0)
      : undefined;
  const priorSum =
    priorHouseValues && priorHouseValues.length > 0
      ? priorHouseValues.reduce((a, b) => a + b, 0)
      : undefined;

  // ⑬ 직전 §8④ 안분 분자(사례5) — 당해 §8④ 주택 인덱스 ↔ 직전 주택별 공시 매핑 (UI 추가 입력 없음).
  //   ★ filter 전 원본(previousYearAutoHouseValues) 인덱싱 — priorHouseValues는 .filter(v>0)로
  //     인덱스 시프트되므로 properties[i] 대응 깨짐.
  const priorRawValues = formData.previousYearAutoHouseValues ?? [];
  const priorS84Sum = formData.properties.reduce((sum, p, i) => {
    const isS84 = (p.section8para4Type ?? "none") !== "none";
    const v = priorRawValues[i] ? parseAmount(priorRawValues[i]) : 0;
    return isS84 ? sum + v : sum;
  }, 0);

  // previousYearAuto: 자동 모드일 때만 구성 (직접 모드는 undefined — 상호배타)
  // 날짜는 문자열 그대로 전송 — route.ts Zod coerceDates가 Date 변환 담당
  const previousYearAuto =
    !isCorporate &&
    capMode === "auto" &&
    (formData.previousYearAutoAssessedValue || priorSum)
      ? {
          // priorHouseValues 있으면 합산(priorSum)을 assessedValue로(단일 원천), 없으면 단일 입력값
          assessedValue: priorSum ?? parseAmount(formData.previousYearAutoAssessedValue),
          isOneHouseOwner: formData.previousYearAutoIsOneHouse,
          // 생년월일·취득일은 기본정보에서 재사용 (중복 입력 금지)
          birthDate: formData.birthDate || undefined,
          acquisitionDate: formData.acquisitionDate || undefined,
          // ⑬ T-08: 해당연도 감면율 — 법령 원칙3 (직전연도 자동 계산 시에도 해당연도 감면율 적용)
          // properties[0].reductionRate 기준 (1주택 단일 물건 케이스 전제 — 다주택은 직접입력 모드 권장)
          // UI 입력 %(0~100) → /100 변환 (Zod .max(1) 동기)
          reductionRate: formData.properties[0]?.reductionRate
            ? parseFloat(formData.properties[0].reductionRate) / 100
            : undefined,
          // ⑬ 해당연도 지분율 — properties[0] 기준(원칙3). "100"·미입력은 단독(undefined)
          ownershipRatio:
            formData.properties[0]?.ownershipRatio &&
            parseFloat(formData.properties[0].ownershipRatio) !== 100
              ? parseFloat(formData.properties[0].ownershipRatio) / 100
              : undefined,
          // ⑬ 직전연도 다주택 중과 (사례4) — 주택별 공시·조정2주택·주택수
          priorHouseValues,
          isMultiHouseInAdjustedArea:
            formData.previousYearAutoIsMultiAdjusted || undefined,
          taxableHouseCount: priorHouseValues?.length,
          // ⑬ 직전 §8④ 안분 (사례5) — §9⑦⑨ 고령자 공제 안분 분자 도출용 (자동 도출)
          priorSection8Para4Value: priorS84Sum > 0 ? priorS84Sum : undefined,
          // ⑬ 사례6: 직전 건물·부속토지 시가표준액 안분 — properties[0] 기준(ownershipRatio collapse 패턴),
          //   ★ 직전 시가표준액에서 독립 도출(당해 0.8 ≠ 직전 0.75). 분리 ON + 직전 양 시가표준액 >0 시만.
          appurtenantSplit:
            formData.properties[0]?.appurtenantSplitEnabled &&
            parseAmount(formData.properties[0].priorLandStdValue) > 0 &&
            parseAmount(formData.properties[0].priorBuildingStdValue) > 0
              ? {
                  ownedPart:
                    formData.properties[0].appurtenantOwnedPart === "building"
                      ? "building"
                      : "land",
                  landStandardValue: parseAmount(
                    formData.properties[0].priorLandStdValue,
                  ),
                  buildingStandardValue: parseAmount(
                    formData.properties[0].priorBuildingStdValue,
                  ),
                }
              : undefined,
        }
      : undefined;

  // taxpayerType·isCorporate는 함수 상단에서 파생 (§8④ strip과 공유 — 3중 일치)
  const body = {
    assessmentYear: parseInt(formData.assessmentYear) || new Date().getFullYear(),
    taxpayerType,                                         // ⑬ body spread
    // 법인 시 명시 strip (엔진 무시가 1차 방어, API strip이 2차 — 3중 패턴)
    isOneHouseOwner: isCorporate ? false : formData.isOneHouseOwner,
    // isJointOwnershipSpecialCase: 법인 시 strip — Zod refine이 3차 차단 (상호배타: isOneHouseOwner && isJointOwnershipSpecialCase)
    isJointOwnershipSpecialCase: isCorporate
      ? false
      : (formData.isJointOwnershipSpecialCase ?? false),  // ③ normalize fallback (3중 일치)
    birthDate: isCorporate ? undefined : formData.birthDate || undefined,
    acquisitionDate: isCorporate ? undefined : formData.acquisitionDate || undefined,
    // 직접 모드 시만 previousYearTotalTax 전송, 자동 모드 시 strip (Zod 상호배타)
    previousYearTotalTax:
      capMode === "direct" && formData.previousYearTotalTax
        ? parseAmount(formData.previousYearTotalTax) || undefined
        : undefined,
    // 자동 모드 시만 previousYearAuto 전송 (⑬ body spread)
    previousYearAuto,
    properties,
    landAggregate,
    landSeparate,
    // 토지 필지 모드 (⑬ body spread — 집계와 상호배타)
    landAggregateParcels,
    landSeparateParcels,
    landAggregatePreviousYearTotalTax,
    landSeparatePreviousYearTotalTax,
    isMultiHouseInAdjustedArea: formData.isMultiHouseInAdjustedArea,
  };

  const res = await fetch("/api/calc/comprehensive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message ?? "계산 요청 실패");
  }
  return json.data as ComprehensiveTaxResult;
}
