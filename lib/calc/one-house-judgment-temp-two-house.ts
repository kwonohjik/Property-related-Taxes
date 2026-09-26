/**
 * 판정 메뉴 ③ — §155① 요건 판정 카드의 **입력 조립 정본** (⑤ 화면 · ⑧ 검증 공용).
 *
 * `Step2.tsx`가 인라인으로 조립하던 인자를 옮겼다(OH-01 A2b). §155①2호 새 입력의 노출 게이트
 * (`regulated.relevant`·`moveInRelevant`)가 이 판정 결과에서 나오므로, ⑧이 같은 게이트로 막으려면
 * **같은 조립**을 써야 한다 — 두 벌이면 「화면엔 없는데 검증이 요구」하는 영구 차단이 난다
 * (`temporary-two-house-section-scope.ts` 머리 주석의 전례).
 */
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import { resolveTemporaryTwoHouse, type TemporaryTwoHouseDates } from "@/lib/calc/household-house-count";
import { deriveJudgmentResidenceMonths } from "@/lib/calc/one-house-exemption-api";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

/** §155① 신규 주택 — 명부에서 도출(④ 변환과 같은 정본 `resolveTemporaryTwoHouse`). */
export function judgmentDerivedNewHouse(form: OneHouseJudgmentFormData): TemporaryTwoHouseDates | undefined {
  const primary = form.assets?.[0];
  return resolveTemporaryTwoHouse({
    primaryKind: primary?.assetKind,
    primaryAcquisitionDate: primary?.acquisitionDate ?? "",
    houses: form.houses,
    legacyPrecedence: form.legacyHouseCountPrecedence === true,
    declaredSpecial: form.temporaryTwoHouseSpecial === true,
    declaredNewHouseDate: form.newHouseAcquisitionDate,
  });
}

export function judgmentTempTwoHouseVerdict(
  form: OneHouseJudgmentFormData,
  derivedNewHouse: TemporaryTwoHouseDates | undefined = judgmentDerivedNewHouse(form),
) {
  const primary = form.assets?.[0];
  return judgeTempTwoHouseFromForm({
    previousAcquisitionDate: primary?.acquisitionDate ?? "",
    newHouseAcquisitionDate: derivedNewHouse?.newAcquisitionDate ?? "",
    transferDate: form.transferDate,
    provisoReason: form.provisoReason,
    provisoDepartureDate: form.provisoDepartureDate,
    provisoExpropriationDate: form.provisoExpropriationDate,
    provisoBusinessApprovalDate: form.provisoBusinessApprovalDate,
    // 거주 개월 — ④와 같은 정본(OH-56). 폼-전역 `residencePeriodMonths`는 이 메뉴가 쓰지 않는다.
    residencePeriodMonths: String(deriveJudgmentResidenceMonths(form)),
    publicInstitutionRelocation: form.publicInstitutionRelocation,
    // §155⑯ 지역 요건 — 엔진과 같이 처분기한 5년 적용 여부를 가른다(OH-57).
    relocatedSigunguCode: form.relocatedSigunguCode,
    newHouseSigunguCode: form.newHouseSigunguCode,
    disposalDelayReason: form.disposalDelayReason,
    // §155①2호 (OH-01 A2b) — ④(`one-house-exemption-api.ts`)가 싣는 값과 같은 소스.
    regionCode: primary?.regionCode,
    isRegulatedArea: form.isRegulatedArea,
    newHouseRegionCode: derivedNewHouse?.newHouseRegionCode,
    eraFields: form,
  });
}
