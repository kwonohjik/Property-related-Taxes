/**
 * 거주요건 판정 입력 빌드 — Step4 거주요건 안내 메시지(②)가 엔진 meetsOneHouseResidenceRequirement
 * 호출에 사용. API 변환과 동일 도출(deriveResidencePeriodMonths·proviso 조립)로 단일 진실.
 * 호출 전 form.transferDate·primary.acquisitionDate 존재 보장 필요(toDate는 필수값 미입력 시 throw).
 * transfer-tax-api.ts에서 격리 (800줄 정책).
 */
import { sellingHousePreviousDateOverride } from "@/lib/calc/selling-house-origin-scope";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { clampResidenceToHousingPeriod } from "@/lib/stores/calc-wizard-asset-residence";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { toEngineRental4ho } from "@/lib/api/rental-4ho-coerce";
import { buildRental4hoPayload } from "./rental-4ho-proviso";
import { buildFinalHouseRestartPayload, calcFinalHouseRestartInScope } from "./final-house-restart";
import { toEngineFinalHouseRestart } from "@/lib/api/final-house-restart-coerce";
import type { ResidenceReqInput } from "@/lib/tax-engine/transfer-tax-exemption";
import { provisoGate, effectiveProvisoReason, buildSameHouseholdInheritancePayload } from "./transfer-tax-api-helpers";
import { unconfirmedTempTwoHouseProviso5 } from "./exemption-proviso-payload";
import { resolveHouseholdHousingCount, temporaryTwoHouseApplies } from "@/lib/calc/household-house-count";
import { resolveExemptionHousingCount } from "@/lib/calc/exemption-house-count";
import { toWinWinRentalHouseFact } from "./one-house-extra-facts-payload";
import { calcEffectiveWasRegulatedAtAcquisition, calcGiftHouseholdBasis } from "./effective-regulated-at-acquisition";
import { isOneHouseExemptionAsset } from "./housing-like-asset";
import { temporaryTwoHouseCandidateExcludedIds } from "./temp-two-house-candidate-exclusion";
import { rentalResidenceCandidateHouseIds } from "./temp-two-house-candidate-exclusion";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";
import { mergeContextOf } from "@/lib/calc/merge-house-origin";
import { departureOnlyHousePayload, rentalLeaseResidencePayload } from "@/lib/calc/exemption-proviso-payload";

export function buildResidenceReqInput(
  form: TransferFormData,
): ResidenceReqInput {
  const primary = form.assets?.[0];
  const giftScope = { isPrimary: true };
  const conversionOn = isUsageConversionActive(primary);
  // ⚠️ **API 변환(`transfer-tax-api.ts`)과 같은 클램프를 써야 한다.**
  // §95⑤2호 클램프로 거주가 2년 미만이 되면 비과세가 탈락한다(계획 C-10c — 세액이 바뀌는
  // 유일한 케이스). 여기서 클램프 전 원값을 쓰면 **화면은 "요건 충족"인데 엔진은 차단**하는
  // dual truth가 된다. Phase D verify("Step4 안내 ↔ 엔진 판정 일치")의 불변식이다.
  const residence = primary
    ? clampResidenceToHousingPeriod(
        primary,
        form.transferDate,
        form.residencePeriodMonths,
        conversionOn ? primary.residentialUseStartDate : undefined,
      )
    : { months: 0, trimmed: 0 };
  /**
   * §154① 단서 사유 — ④ 전송과 **같은 게이트**를 통과한 값만 쓴다 (2026-09-07 UI 리뷰).
   *
   * 🔴 종전에는 `form.provisoReason`을 **정규화 없이** 그대로 넣었다. 반면 ④
   *   (`transfer-tax-api.ts:516~533`)는 `provisoGate` → `effectiveProvisoReason`으로
   *   **카드 숨김(mode=null)·일시적 2주택 화이트리스트 밖 사유를 버린다**.
   *
   *   ⇒ 3주택 이상 등으로 카드가 숨겨졌는데 사유가 남아 있으면, Step4 안내는
   *     `proviso === "both"` 단락으로 「거주요건 충족」이라 판단해 경고를 띄우지 않는데
   *     실제 계산은 그 사유를 **버린 채** 거주 2년을 요구한다. 사용자는 경고 없이 계산 후
   *     비과세 탈락 결과를 본다.
   */
  const provisoMode = provisoGate({
    isOneHousehold: form.isOneHousehold,
    // OH-20 — 재개발 완공APT도 §154① 단서 대상(⑤ Step4 · ⑧과 같은 술어).
      isHousing: isOneHouseExemptionAsset(primary?.assetKind),
    // §154① 단서는 제외 **후** 주택 수로 본다 — ④·⑤·⑧과 같은 leaf(S03-4).
    householdHousingCount: resolveExemptionHousingCount(form),
    temporaryTwoHouseApplies: temporaryTwoHouseApplies({
      primaryKind: form.assets?.[0]?.assetKind,
      primaryAcquisitionDate: sellingHousePreviousDateOverride(form.assets?.[0], form.houses?.length) ?? primaryAcquisitionDateOf(form.assets?.[0]),
      houses: form.houses,
      transferDate: form.transferDate,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
      declaredSpecial: form.temporaryTwoHouseSpecial === true,
      declaredNewHouseDate: form.newHouseAcquisitionDate,
      mergeContext: mergeContextOf(form), // D8 — 합가 세대는 같은 쪽 안에서 짝을 고른다
      excludedHouseIds: temporaryTwoHouseCandidateExcludedIds(form),
      rentalResidenceHouseIds: rentalResidenceCandidateHouseIds(form),
    }),
  }).mode;
  const provisoCandidate = effectiveProvisoReason(provisoMode, form.provisoReason);
  // F-2 — ④가 버리는 무주택 미확인 5호(일시적 2주택 맥락)는 여기서도 버린다 — 안내와 계산이 같은 사유를 본다.
  const effectiveReason = (
    unconfirmedTempTwoHouseProviso5(provisoMode, provisoCandidate, form.provisoPreContractNoHouse) ? "" : provisoCandidate
  ) as NonNullable<ResidenceReqInput["oneHouseExemptionProviso"]>["reason"] | "";
  // §154⑧3호 동일세대 상속 사실 — ④(`transfer-tax-api.ts`)·판정 메뉴 ④와 **같은 leaf**다(OH-18).
  // 보유 개시일(`decedentCohabitationHoldingStartDate`)까지 같이 싣는다 — 빠지면 거주요건의 「취득 당시」·보유 기산일이
  // 취득일로 남아 엔진 결론과 갈린다(재검증 S12-5 [B]·F252).
  const sameHouseholdInheritance = primary ? buildSameHouseholdInheritancePayload(primary) : undefined;
  return {
    acquisitionDate: toDate(primary?.acquisitionDate, "acquisitionDate"),
    transferDate: toDate(form.transferDate, "transferDate"),
    residencePeriodMonths: residence.months,
    regionCode: primary?.regionCode || form.regionCode || undefined,
    // ④와 같은 식 — 자산 코드에 붙은 「지정 지구 안인가」 선언(폼-전역 코드 폴백에는 선언이 없다). 빠지면 지구 밖 선언이
    // 무시되어 엔진은 비조정인데 Step4만 「거주요건 불충족」을 띄운다(재검증 S12-5 [A]).
    regionInDesignatedDistrict: primary?.regionCode ? primary.regionInDesignatedDistrict : undefined,
    // 결정 #5(G7-6) — 주소가 있으면 주소 판정값(④와 같은 leaf). 이 빌더는 Step4 안내가 엔진과 같은 값을 보게 한다.
    wasRegulatedAtAcquisition: primary
      ? calcEffectiveWasRegulatedAtAcquisition(primary, form.wasRegulatedAtAcquisition, form.regionCode, giftScope)
      : form.wasRegulatedAtAcquisition,
    // 결정 #38-10 — 증여받은 주택의 세대 사실. 엔진(④)이 실어 보내는 것과 같은 basis라야 Step4 거주요건 안내가 엔진과 같은 「취득 당시」를 읽는다.
    giftHouseholdBasis: primary ? calcGiftHouseholdBasis(primary, giftScope) : undefined,
    // §154⑧3호 동일세대 상속 거주 통산 — meetsOneHouseResidenceRequirement가 소비하므로
    // Step4 거주요건 안내(이 빌더 소비)도 엔진과 동일 필드 전달 필수 (UI↔엔진 dual-truth 방지).
    acquisitionCause: primary?.acquisitionCause,
    decedentSameHouseholdBeforeInheritance: sameHouseholdInheritance?.decedentSameHouseholdBeforeInheritance,
    decedentCohabitationHoldingStartDate: toOptionalDate(sameHouseholdInheritance?.decedentCohabitationHoldingStartDate),
    decedentCohabitationResidenceMonths: sameHouseholdInheritance?.decedentCohabitationResidenceMonths,
    // §154⑤ 단서·§154① 거주요건 판정 기준일 — 용도변경 시 주거용 사용일이 「주택 취득일」이다.
    // Step4 안내가 엔진과 같은 기준일을 보게 하려면 이 빌더도 같은 술어로 조립해야 한다.
    nonHousingToHousingConversion: conversionOn
      ? {
          residentialUseStartDate: toDate(
            primary!.residentialUseStartDate,
            "residentialUseStartDate",
          ),
          residenceMonthsTrimmed: residence.trimmed,
        }
      : undefined,
    // OH-58 — §155의3① 상생임대주택이면 §154① 거주요건 면제(`meetsOneHouseResidenceRequirement`가
    // `qualifiesWinWinRental`로 소비). ④가 운반 상자에서 보내는 것과 **같은 사실**을 싣는다 — 빠뜨리면
    // 계산은 비과세인데 Step4만 「거주요건 불충족」을 띄운다.
    winWinRentalHouse: toWinWinRentalHouseFact(form.importedOneHouseFacts),
    // OH-22 — §154⑤ 단서 재기산이면 거주도 재기산일 이후만 센다(재산세제과-1058). ④·⑭와 같은 빌더·같은 변환.
    finalOneHouseRestart: toEngineFinalHouseRestart(
      buildFinalHouseRestartPayload(form, calcFinalHouseRestartInScope(form)).finalOneHouseRestart,
    ),
    householdHousingCount: resolveHouseholdHousingCount({
      primaryKind: primary?.assetKind,
      declared: parseInt(form.householdHousingCount || "1", 10) || 0,
      houses: form.houses,
      transferDate: form.transferDate,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
    }),
    // 사유는 ④와 같은 게이트를 통과한 값이다 — 근거는 `effectiveReason` 선언부 참조.
    oneHouseExemptionProviso: effectiveReason
      ? {
          reason: effectiveReason,
          ...(form.provisoDepartureDate
            ? { departureDate: toDate(form.provisoDepartureDate, "provisoDepartureDate") }
            : {}),
          ...(form.provisoExpropriationDate
            ? { expropriationDate: toDate(form.provisoExpropriationDate, "provisoExpropriationDate") }
            : {}),
          ...(form.provisoBusinessApprovalDate
            ? { businessApprovalDate: toDate(form.provisoBusinessApprovalDate, "provisoBusinessApprovalDate") }
            : {}),
          // 2호 나·다목 「출국일 현재 1주택」 — ④와 같은 조각(빠지면 「예」라고 답해도 단서가 불성립으로 읽힌다 · S12-5 [C])
          ...departureOnlyHousePayload(effectiveReason, form.provisoDepartureOnlyHouse),
          ...rentalLeaseResidencePayload(effectiveReason, form.provisoRentalLeaseResidenceMonths),
          // OH-38 — Step4 거주요건 안내도 ④·⑭와 같은 조립·같은 변환(단일 진실)
          ...(effectiveReason === "rental_registration_4ho"
            ? { rentalRegistration4ho: toEngineRental4ho(buildRental4hoPayload(form)) }
            : {}),
        }
      : undefined,
  };
}
