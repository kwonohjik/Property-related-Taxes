/**
 * 판정 메뉴 ③ — §155① 요건 판정 카드의 **입력 조립 정본** (⑤ 화면 · ⑧ 검증 공용).
 *
 * `Step2.tsx`가 인라인으로 조립하던 인자를 옮겼다(OH-01 A2b). §155①2호 새 입력의 노출 게이트
 * (`regulated.relevant`·`moveInRelevant`)가 이 판정 결과에서 나오므로, ⑧이 같은 게이트로 막으려면
 * **같은 조립**을 써야 한다 — 두 벌이면 「화면엔 없는데 검증이 요구」하는 영구 차단이 난다
 * (`temporary-two-house-section-scope.ts` 머리 주석의 전례).
 */
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { TemporaryTwoHouseDates } from "@/lib/calc/household-house-count";
import { deriveJudgmentResidenceMonths } from "@/lib/calc/one-house-exemption-api";
import { buildRightThreeYearExceptionPayload, buildSameHouseholdInheritancePayload } from "@/lib/calc/transfer-tax-api-helpers";
import { eraFormWithOriginDates } from "@/lib/calc/temporary-two-house-era-facts";
import type { RightThreeYearException, TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { buildOtherHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { resolveTempTwoHouseNewHouseSigunguCode } from "./temp-two-house-new-house-sigungu";
import { sellingHousePreviousDateOverride } from "@/lib/calc/selling-house-origin-scope";
import { effectiveProvisoReason } from "@/lib/calc/transfer-tax-api-helpers";
import { judgmentProvisoMode } from "./one-house-judgment-section-scope";

// 신규 주택 도출은 leaf(`one-house-judgment-new-house.ts`)가 정본이다 — 판정 메뉴 ④가 그 leaf를 부르므로 ④를 import하는 이 파일에 두지 않는다(순환 방지 · D-79).
export { judgmentDerivedNewHouse, judgmentContestedNewHouse, judgmentNewHouseOriginRowIds } from "./one-house-judgment-new-house";
import { judgmentDerivedNewHouse } from "./one-house-judgment-new-house";

export function judgmentTempTwoHouseVerdict(
  form: OneHouseJudgmentFormData,
  derivedNewHouse: TemporaryTwoHouseDates | undefined = judgmentDerivedNewHouse(form),
) {
  const primary = form.assets?.[0];
  return judgeTempTwoHouseFromForm({
    // D8 — 합가 세대에서 상대 쪽 두 주택이 짝이면 종전주택은 양도 주택이 아니다(사전-2026-법규재산-0643). ④와 같은 짝을 쓴다.
    previousAcquisitionDate:
      derivedNewHouse?.previousAcquisitionDate ?? sellingHousePreviousDateOverride(primary, form.houses?.length) ?? primary?.acquisitionDate ?? "",
    sellingAcquisitionDate: primary?.acquisitionDate,
    newHouseAcquisitionDate: derivedNewHouse?.newAcquisitionDate ?? "",
    transferDate: form.transferDate,
    // ④(`one-house-exemption-api.ts`)·⑧과 같은 유효 사유 — 단서 카드를 열지 않는 맥락(mode null)이면 ④가 사유를 버리므로 카드도
    //   1년 요건을 면제하지 않는다(2026-11-12 리뷰 C-5).
    provisoReason: effectiveProvisoReason(judgmentProvisoMode(form), form.provisoReason),
    provisoDepartureDate: form.provisoDepartureDate,
    provisoExpropriationDate: form.provisoExpropriationDate,
    provisoBusinessApprovalDate: form.provisoBusinessApprovalDate,
    provisoRentalLeaseResidenceMonths: form.provisoRentalLeaseResidenceMonths,
    // 거주 개월 — ④와 같은 정본(OH-56). 폼-전역 `residencePeriodMonths`는 이 메뉴가 쓰지 않는다.
    residencePeriodMonths: String(deriveJudgmentResidenceMonths(form)),
    // S11-6 — §154⑧3호 동일세대 상속 통산: 엔진이 ④의 같은 leaf로 받는 값을 카드도 같은 leaf로 편다.
    //   게이트도 ④와 같다 — 주택 양도 + 취득 원인이 상속일 때만 싣는다(`one-house-exemption-api.ts`).
    sameHouseholdInheritance:
      primary && judgmentSaleIsHousing(form) && primary.acquisitionCause === "inheritance"
        ? { acquisitionCause: "inheritance", ...buildSameHouseholdInheritancePayload(primary) }
        : undefined,
    publicInstitutionRelocation: form.publicInstitutionRelocation,
    // §155⑯ 지역 요건 — 엔진과 같이 처분기한 5년 적용 여부를 가른다(OH-57).
    relocatedSigunguCode: form.relocatedSigunguCode,
    // 신규 주택 소재 시·군 — 명부 행 주소가 정본, 없을 때만 ⑯ 칸(C-1 · ④와 같은 leaf).
    newHouseSigunguCode: resolveTempTwoHouseNewHouseSigunguCode(form.newHouseSigunguCode, derivedNewHouse?.newHouseRegionCode),
    disposalDelayReason: form.disposalDelayReason,
    disposalDelayDisposedByThatMethod: form.disposalDelayDisposedByThatMethod,
    // §155①2호 (OH-01 A2b) — ④(`one-house-exemption-api.ts`)가 싣는 값과 같은 소스.
    regionCode: primary?.regionCode,
    regionInDesignatedDistrict: primary?.regionInDesignatedDistrict,
    isRegulatedArea: form.isRegulatedArea,
    newHouseRegionCode: derivedNewHouse?.newHouseRegionCode,
    newHouseInDesignatedDistrict: derivedNewHouse?.newHouseInDesignatedDistrict,
    // D8 상대 쪽 짝(B → C)이면 종전의 주택은 B다 — 조정 여부를 B의 소재로 판정한다(S15-2). ④와 같은 값.
    previousHouse: derivedNewHouse?.previousHouse,
    // 권리 유래 신규 주택은 §155①1호 괄호의 「권리 취득」 시점을 행의 권리 취득일로 본다 — ④와 같은 leaf(결정 #43).
    eraFields: eraFormWithOriginDates(form, derivedNewHouse?.newHouseOrigin),
    newHouseOrigin: derivedNewHouse?.newHouseOrigin,
    rightThreeYearException: engineRightThreeYearException(form),
    hasMerge: !!(form.marriageDate || form.parentalCareMergeDate),
    newHouseRow: newHouseRowFacts(form, derivedNewHouse?.newHouseRowId),
  });
}

/** 신규 주택으로 도출된 명부 행 → 엔진 행(④ `buildOtherHousesPayload`와 같은 변환 · 상속개시일만 Date로) — D-76 동일세대 상속 판정용. */
function newHouseRowFacts(
  form: OneHouseJudgmentFormData,
  rowId: string | undefined,
): NonNullable<TransferTaxInput["houses"]>[number] | undefined {
  const row = rowId ? form.houses?.find((h) => h.id === rowId) : undefined;
  if (!row?.isInherited) return undefined;
  const payload = buildOtherHousesPayload([row])[0] as Record<string, unknown> | undefined;
  if (!payload) return undefined;
  return {
    ...payload,
    acquisitionDate: toOptionalDate(payload.acquisitionDate),
    inheritedDate: toOptionalDate(payload.inheritedDate),
  } as unknown as NonNullable<TransferTaxInput["houses"]>[number];
}

/** ④ `buildRightThreeYearExceptionPayload`가 싣는 3년 경과 예외 선언을 카드용 Date 모양으로 — 엔진 route(⑭)와 같은 변환. */
function engineRightThreeYearException(form: OneHouseJudgmentFormData): RightThreeYearException | undefined {
  const raw = (buildRightThreeYearExceptionPayload(form as never) as { rightThreeYearException?: Record<string, unknown> })
    .rightThreeYearException;
  if (!raw) return undefined;
  return {
    ...raw,
    ...(typeof raw.completionDate === "string" ? { completionDate: new Date(raw.completionDate) } : {}),
  } as unknown as RightThreeYearException;
}
