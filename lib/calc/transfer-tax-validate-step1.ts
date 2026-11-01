/**
 * 양도세 마법사 1단계(보유 상황) 검증 — `transfer-tax-validate.ts`에서 분리 (800줄 정책, 2026-09-30).
 *
 * 분리 계기: 필드 이동(`transfer-validation-field-jump.plan.md`)으로 본 파일이 800줄에 닿았다.
 * 감면 단계(`transfer-tax-validate-reductions.ts`)와 같은 방식 — 로직은 그대로 옮겼다.
 * 순서도 그대로다: push 순서가 곧 오류 목록 순서이고 `[0]`이 자동 이동 대상이다.
 */
import { generalHouseRightAtInheritanceVisible } from "./inheritance-general-house-scope";
import { parseAmount } from "@/lib/calc/number-parse";
import { isHousingLike } from "@/lib/calc/housing-like-asset";
import { memberOriginErrors } from "./right-member-origin-scope";
import { originalMemberFactErrors } from "./right-member-origin-scope";
import { inheritedPresaleRightFactErrors } from "./inherited-presale-right-facts";
import { provisoGate, effectiveProvisoReason } from "./transfer-tax-api-helpers";
import { temporaryTwoHouseApplies } from "@/lib/calc/household-house-count";
import { resolveExemptionHousingCount } from "@/lib/calc/exemption-house-count";
import { collectExemptionProvisoErrors } from "./exemption-proviso-validate";
import { calcFinalHouseRestartInScope, collectFinalHouseRestartErrors } from "./final-house-restart";
import { collectResidenceIntervalErrors } from "./residence-interval-validate";
import { calcGiftPriorResidenceAsked } from "./gift-household-payload";
import { directResidenceMonthsOverflowError } from "./residence-interval-validate";
import { isOneHouseExemptionAsset, usesHouseCountRoster, requiresPresaleRightsConfirmation } from "./housing-like-asset";
import { redevSplitResidenceSupersedesStep4, redevAptHoldingStartDate } from "./redev-field-scope";
import { successorAptResidenceOverflow } from "./redev-field-scope";
import { successorAptResidenceOverflowMessage } from "./redev-field-scope";
import { residenceStartWithMerge } from "./self-owns-scope";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { temporaryTwoHouseCandidateExcludedIds } from "./temp-two-house-candidate-exclusion";
import { rentalResidenceCandidateHouseIds } from "./temp-two-house-candidate-exclusion";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";
import { collectCountExclusionIssues } from "./transfer-tax-validate-count-exclusion";
import { mergeContextOf, mergeHouseSideOf } from "./merge-house-origin";
import { PARENTAL_CARE_PARENT_AGE_REQUIRED_MESSAGE, parentalCareParentAgeMissing } from "./parental-care-age-issue";
import { temporaryTwoHouseSectionVisible } from "./temporary-two-house-section-scope";
import { spouseHoldingUnansweredIndexes } from "./spouse-holding-scope";
import { fieldError } from "./transfer-tax-validate-field";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";
import { houseRowFactIssues } from "./house-row-fact-issues";
import { declaredNewHouseOriginIssue } from "./declared-new-house-origin";
import { deriveCalcTemporaryTwoHouse } from "./transfer-tax-api-body-blocks";
import { sellingHouseOriginIssue, sellingHousePreviousDateOverride } from "./selling-house-origin-scope";
import { duplicateOwnedUnavoidableOutsideCapitalRows } from "./house-row-required-issues";
import { houseRowSurchargeAxisIssue } from "./transfer-tax-validate-surcharge-axis";
import { collectSellingHouseSurchargeIssues } from "./transfer-tax-validate-surcharge-axis";
import { collectGracePeriodIssues } from "./transfer-tax-validate-surcharge-axis";
import { deemedOneHouseContextDeclared, rentalResidenceContextDeclared } from "./deemed-one-house-context";

export function collectStep1Issues(form: TransferFormData): ValidationIssue[] {
  const step = 1;
  const issues: ValidationIssue[] = [];
  if (!form.householdHousingCount)
    issues.push({ step, field: "householdHousingCount", message: "세대 보유 주택 수를 선택하세요." });

  /**
   * ⑧ 명부 필수화(PR-1·PR-B·PR-C) — 세대 보유 주택 수를 명부에서 도출하는 자산 양도
   * (`usesHouseCountRoster` — housing·redevelopment_apt·right_to_move_in) + 명부 0행이면
   * 「다른 보유 주택이 없습니다」 확정이 있어야 통과한다. legacy 표식(OH-34 — 저장 당시
   * 스칼라가 명부와 어긋난 구 이력)이 붙은 레코드는 제외한다 — 그 레코드는 이미 유효한
   * 세액을 보존 중이라 재확인을 요구하지 않는다.
   *
   * Q-7(PR-1)·PR-B·PR-C(계획서 §4-3) — 분양권은 ①의 의미 축 자체가 없어 범위 밖(§4-4).
   * 겸용주택은 `assetKind`가 항상 `"housing"`이라 이미 포함된다(별도 판정축 아님, §4-1).
   */
  const primaryKind = form.assets?.[0]?.assetKind;
  if (
    usesHouseCountRoster(primaryKind) &&
    !form.legacyHouseCountPrecedence &&
    (form.houses?.length ?? 0) === 0 &&
    !form.householdNoOtherHousesConfirmed
  ) {
    issues.push({
      step,
      field: "householdNoOtherHousesConfirmed",
      message: "다른 보유 주택이 없는지 확인하세요.",
    });
  }

  /**
   * ⑧ 분양권·입주권 목록 필수화(PR-D, Q-17 — 계획서 §4-5·§4-6). 대상 자산(housing·
   * redevelopment_apt·right_to_move_in — `requiresPresaleRightsConfirmation`) + 목록 0행이면
   * 「세대가 보유한 분양권·입주권이 없습니다」 확정이 있어야 통과한다. legacy 예외는 두지 않는다
   * (Q-14 — 이 필드를 쓴 기존 저장 기록이 없다). 분양권 자신의 양도(`presale_right`)는 대상
   * 아님(Q-11) — `requiresPresaleRightsConfirmation`이 그 자산을 제외한다.
   */
  if (
    requiresPresaleRightsConfirmation(primaryKind) &&
    (form.presaleRights?.length ?? 0) === 0 &&
    !form.householdNoPresaleRightsConfirmed
  ) {
    issues.push({
      step,
      field: "householdNoPresaleRightsConfirmed",
      message: "세대가 보유한 분양권·입주권이 없는지 확인하세요.",
    });
  }

  // ⑧ 조특법 주택 수 제외 — 명부 행 ⑥ · 옛 선언 차단 · 게이트 밖 감면주택 섹션(D4-03)
  for (const message of collectCountExclusionIssues(form)) issues.push({ step, message });

  /**
   * ⑧ 세대 보유 주택 목록 — 행별 첫 오류 1건씩 (자동 안분 fallback 금지: 미입력=차단)
   *
   * 🔴 종전에는 `surchargeSuppressed`면 이 검증을 **건너뛰었다**. `specialHouseExclusions`가
   * D4-03에서 같은 이유로 skip을 걷어낸 것과 동일한 비대칭이 남아 있었다 —
   * `transfer-tax-api.ts:582`는 `housesPayload`를 억제 없이 전송하므로, 창 밖에서 입력한 뒤
   * 양도일을 창 안으로 옮기면 **무검증 통과**가 된다.
   *
   * 「보이지 않는 필드 차단 방지」라는 원래 취지도 더는 성립하지 않는다 — 한시배제 기간에도
   * ⑤ `HousesListSection` 입력 경로가 열려 있다(§155②③ 상속주택·§89② 분양권은 §89①3호
   * **비과세** 축이라 §104⑦ 중과 한시배제와 무관하다).
   */
  // 동거봉양 합가일을 넣었는데 직계존속 연령을 고르지 않음 — 차단(결정 #9 하위 1 가). 칸(`MergeDateSection`)과 같은 게이트.
  if (
    temporaryTwoHouseSectionVisible({
      primaryAssetKind: form.assets?.[0]?.assetKind,
      householdHousingCount: form.householdHousingCount,
    }) &&
    parentalCareParentAgeMissing(form)
  ) {
    issues.push({ step, message: fieldError("parentalCareParentAge", PARENTAL_CARE_PARENT_AGE_REQUIRED_MESSAGE) });
  }

  const houses = form.houses ?? [];
  // §155④⑤ 합가 전 소유 쪽 — 판정 메뉴와 같은 게이트·같은 분류(PR-2 2026-10-05).
  //   합가일이 없으면 undefined(묻지 않는다). 「모름」은 엔진에서 불성립이 되므로 차단한다
  //   (merge-composition-unknown-unfavorable.plan.md §3-3 · memory `feedback_unknown_fact_applies_unfavorably`).
  const mergeCtx = mergeContextOf(form);
  // §155① 신규 주택으로 도출된 행 — 그 행의 취득 경위를 답하게 한다(④ 전송·⑤ 노출과 같은 도출 `deriveCalcTemporaryTwoHouse`).
  const derivedTempTwoHouse = deriveCalcTemporaryTwoHouse(form, form.assets?.[0]);
  const newHouseRowId = derivedTempTwoHouse?.newHouseRowId;
  // 결정 #43-3 — 신규 주택 취득일을 직접 선언한 경로(명부 행 없음)의 경위 답이 앞뒤가 맞지 않으면 막는다. 미답은 막지 않는다(not_collected).
  //   게이트는 ⑤ 마운트(`Step4`: 섹션 노출 + `source === "declared"`)와 같다 — 칸이 없는 화면에서 막지 않는다.
  if (
    derivedTempTwoHouse?.source === "declared" &&
    temporaryTwoHouseSectionVisible({
      primaryAssetKind: form.assets?.[0]?.assetKind,
      householdHousingCount: form.householdHousingCount,
    })
  ) {
    const declaredIssue = declaredNewHouseOriginIssue(form, form.newHouseAcquisitionDate);
    if (declaredIssue) issues.push({ step, field: declaredIssue.field, message: declaredIssue.message });
  }
  // 결정 #47 — 응답이 필요한 배우자 쪽 행(⑤ 질문과 같은 술어). 「모름」은 응답이라 막지 않는다.
  const spouseHoldingUnanswered = new Set(spouseHoldingUnansweredIndexes(form));
  // §155⑧ 「각각 1개씩」 — 양도일 현재 보유 행 중 둘째 ⑧ 행부터 막는다(판정 메뉴 ⑧·⑫와 같은 leaf). 행의 「편집」으로 가서 끄면 풀린다.
  const uocDuplicateOf = new Map(
    duplicateOwnedUnavoidableOutsideCapitalRows(houses, form.transferDate, form.assets?.[0]?.assetKind).map((d) => [d.index, d.firstIndex]),
  );
  for (let i = 0; i < houses.length; i++) {
    const h = houses[i];
    const label = `보유 주택 ${i + 1}`;
    // 행 편집은 모달이라 입력칸이 DOM에 없다 — 행의 「편집」 버튼(`HouseTableRow`)이 앵커다. 목록이 사용자를 그 행에 데려다 준다.
    const rowKey = `houses.${i}` as const;
    const firstError = (() => {
      if (!h.acquisitionDate) return fieldError(rowKey, `${label}: 취득일을 입력하세요.`);
      if (!h.officialPrice || parseAmount(h.officialPrice) <= 0)
        return fieldError(rowKey, `${label}: 기준시가(공시가격)를 입력하세요.`);
      // 중과 축(상속 5년·장기임대·3호·⑪·부득이·4호·8호의2·3호/7호 기산·§155⑧) — 다주택 중과 판정 메뉴 ⑧과 같은 leaf.
      const surchargeIssue = houseRowSurchargeAxisIssue(h, label, form.transferDate, uocDuplicateOf.get(i));
      if (surchargeIssue) return fieldError(rowKey, surchargeIssue);
      // 명부 행 사실 답 누락 — D7 §155⑦1호 동일세대 · §155⑦2·3호 재귀농 · §155⑦3호 귀농 ⑩3·4호·⑪ · §155① 신규 주택 취득 경위(판정 메뉴 ⑧과 같은 leaf).
      const factIssue = houseRowFactIssues(h, newHouseRowId)[0];
      if (factIssue) return fieldError(rowKey, `${label}: ${factIssue.message}`);
      // §155④⑤ 합가 전 소유 쪽 — 판정 메뉴 ⑧과 같은 판정(`mergeHouseSideOf`).
      if (mergeCtx && mergeHouseSideOf(h, mergeCtx) === undefined) {
        return fieldError(
          rowKey,
          `${label}: ${mergeCtx.kind === "marriage" ? "혼인" : "합가"} 전 보유자를 고르세요 — 고르지 않으면 합가 특례를 불성립으로 판정합니다.`,
        );
      }
      // 결정 #47 §167의3⑨ — 양도일 현재도 배우자 쪽이 보유하는지(예/아니오/모름). 미응답으로 두면 차감 여부를 정할 수 없다.
      if (spouseHoldingUnanswered.has(i)) {
        return fieldError(
          rowKey,
          `${label}: 양도일 현재도 배우자 쪽이 이 주택을 보유하는지 고르세요 — 혼인 5년 안 양도라 「소득세법 시행령」 §167의3⑨에 따라 양도일 현재 배우자가 보유한 주택은 주택 수에서 뺍니다(모르면 「모름」을 고르세요).`,
        );
      }
      return null;
    })();
    if (firstError) issues.push({ step, message: firstError });
  }

  // ⑧ 양도 주택이 기존주택의 연장이면 헐기 전 주택 취득일 필수 — ⑤ `HousesListSection`·④ `deriveCalcTemporaryTwoHouse`와 같은 leaf(결정 #43 하위 2).
  const sellingOrigin = sellingHouseOriginIssue(form.assets?.[0], houses.length);
  if (sellingOrigin) issues.push({ step, field: sellingOrigin.field as "sellingHouseExistingAcquisitionDate", message: sellingOrigin.message });

  // ⑧ 양도 주택 자체 중과배제 특례·공고 전 매매계약 — 다주택 중과 판정 메뉴 ⑧과 같은 leaf.
  for (const issue of collectSellingHouseSurchargeIssues(form)) issues.push({ step, ...issue });

  // ⑧ OH-12c — 피상속인 증여분 선언이면 증여일 필수(2018-02-13 부칙 게이트). ⑤와 같은 게이트
  //    (`HouseCountExemptionInputs` — 명부에 상속주택이 있을 때만 토글·날짜 칸이 열린다).
  if (
    form.houses?.some((h) => h.isInherited) &&
    form.generalHouseGiftedFromDecedentWithin2yr &&
    !form.generalHouseGiftDate
  ) {
    issues.push({
      step,
      field: "generalHouseGiftDate",
      message:
        "피상속인으로부터 증여받은 날을 입력하세요. (2018.2.13. 이후 증여분만 상속주택 특례에서 제외됩니다)",
    });
  }
  // ⑧ OH-12 — 상속개시 후 취득한 양도 주택이면 취득 경위 선택 필수(⑤·④와 같은 술어).
  if (generalHouseRightAtInheritanceVisible(form) && !form.generalHouseRightAtInheritance) {
    issues.push({
      step,
      field: "generalHouseRightAtInheritance",
      message:
        "양도 주택을 상속개시 후 취득했습니다 — 상속개시 당시 보유한 조합원입주권·분양권으로 취득한 신축주택인지 선택하세요.",
    });
  }

  // ⑧ 세대 보유 분양권·입주권 — 각 행 취득일 필수 (자동 안분 fallback 금지)
  // 위 houses와 같은 이유로 한시배제 skip을 두지 않는다 — §89②는 비과세 축이고 ⑤도 열려 있다.
  // 🔴 단, **주택 계열 자산일 때만** 요구한다. ⑤는 `isHousingLike` 안에서만 이 위젯을 열고
  //    (`Step4.tsx:409`), ④도 같은 술어로 전송을 막는다(`presale-rights-payload.ts:62`).
  //    자산 종류를 주택→토지로 바꾸면 행은 남는데 삭제 UI가 사라져 **막다른 길**이 됐다.
  const presaleRights = isHousingLike(form.assets?.[0]?.assetKind ?? "")
    ? (form.presaleRights ?? [])
    : [];
  for (let i = 0; i < presaleRights.length; i++) {
    if (!presaleRights[i].acquisitionDate)
      issues.push({ step, field: `presaleRights.${i}.acquisitionDate`, message: `분양권·입주권 ${i + 1}: 취득일을 입력하세요.` });
  }
  // ⑧ 조합원입주권 취득 경위 — §89② 판정(주택 양도)에서만 결론을 가른다(판정 메뉴와 같은 leaf).
  if (isOneHouseExemptionAsset(form.assets?.[0]?.assetKind)) {
    for (const e of memberOriginErrors(presaleRights)) issues.push({ step, ...e });
    // 기존주택 원조합원 §155①2호 단서(기존 임차인) 모순 — ⑤와 같은 게이트(`originalMemberMoveInRelevant`)
    for (const e of originalMemberFactErrors(presaleRights, form.transferDate)) issues.push({ step, ...e });
  }
  // 상속 분양권 피상속인 취득일 — ④가 싣는 행이면 늘(§89②·§104⑦ 공용 날짜 — 위 `isHousingLike` 목록과 같은 범위).
  for (const e of inheritedPresaleRightFactErrors(presaleRights)) issues.push({ step, ...e });

  // ⑧ 다주택 중과 한시 유예(§167의3①12의2 나·다목) — 다주택 중과 판정 메뉴 ⑧과 같은 leaf.
  for (const issue of collectGracePeriodIssues(form)) issues.push({ step, ...issue });

  /**
   * 🔄 §156의2⑤ 대체주택(4필드)·§155① 일시적 2주택(2필드) 검증은 **판정 메뉴로 이관**됐다
   *    (P6-b · `one-house-exemption-validate.ts` `validateStep2`).
   *
   * 계산기 ③은 이제 `mode="calc"`로 **§155⑧ + 합가**만 그린다. 그 두 축은 중과 배제 근거가
   * 영 §167의10①4호·§167의3⑨라 §154① 충족을 요구하지 않아, 비과세를 주장할 수 없는
   * 세대도 입력이 필요하기 때문이다. 나머지 특례는 15호(§154① 2요소)를 거치므로 판정
   * 메뉴가 소유한다.
   *
   * 🔑 **값은 그대로 계산에 쓰인다.** flat 필드라 ④가 계속 읽는다 — 빠진 것은 「계산기에서
   *    편집·검증하는 것」뿐이고, 화면에는 읽기 전용 요약(`ImportedOneHouseFactsCard`)이 남는다.
   */

  /**
   * ⑧ §89② 3년 초과 예외 — 갈래를 고르면 그 갈래의 **필수값**이 있어야 한다.
   *
   * ④ 변환은 필수값이 비면 payload 키 자체를 만들지 않는다(입력 중인 상태이지 선언이 아니다).
   * 여기서 막지 않으면 「화면에서는 골랐는데 계산에는 반영되지 않는」 침묵 불일치가 된다.
   *
   * ⚠️ 미선택(`""`)은 막지 않는다 — 엔진이 예외 없이 과세로 계산하고 결과에 확인 안내가 붙는다(2026-10-08 「모름 → 혜택 불성립」).
   *    여기서 차단하면 3년 초과 세대 전체가 계산 자체를 못 하게 된다.
   */
  /**
   * §89② 3년 초과 예외의 필수 입력 검증은 **판정 메뉴로 이관됐다** (P6-a).
   *
   * 계산기는 그 섹션을 더 이상 렌더하지 않으므로(`Step4.tsx`에서 제거), 여기서 필수값을
   * 요구하면 **채울 칸도 해제할 컨트롤도 없는 영구 차단**이 된다 — 2026-09-07에 같은
   * 모양으로 한 번 났던 결함이고, 그때 만든 술어가 `rightThreeYearExceptionVisible`이다.
   * 검증은 같은 술어를 게이트로 써서 `one-house-exemption-validate.ts`로 옮겼다.
   *
   * 🔑 **값은 그대로 계산에 쓰인다.** flat 필드라 ④가 계속 읽는다(`transfer-tax-api-helpers.ts`).
   *    빠진 것은 「계산기에서 편집·검증하는 것」뿐이다.
   */

  // ⑧ §154① 단서 — 사유별 필수 입력. effectiveProvisoReason로 정규화
  // (카드 숨김·temp-two-house 무효 reason(나·다목)은 검증 skip — Part B/D mirror·데드락 차단)
  const provisoMode = provisoGate({
    isOneHousehold: form.isOneHousehold,
    // OH-20 — 재개발 완공APT도 §89①3호가목 「주택」이다(⑤ Step4 · ④와 같은 술어).
    isHousing: isOneHouseExemptionAsset(form.assets?.[0]?.assetKind),
    // §154① 단서는 제외 **후** 주택 수로 본다 — ④·⑤·Step4 안내와 같은 leaf(S03-4).
    householdHousingCount: resolveExemptionHousingCount(form),
    // V-F4 — §155 의제(합가·⑥⑦⑧) 입력이면 2주택 이상에서도 단서 카드를 연다(⑤·④·⑧ 같은 leaf)
    deemedOneHouseContextDeclared: deemedOneHouseContextDeclared(form),
    // §155⑳ 거주주택 특례 선언이면 2주택 이상에서도 단서 카드(1호·2호가목·3호)를 연다(⑤·④·⑧ 같은 leaf)
    rentalResidenceDeclared: rentalResidenceContextDeclared(form.assets?.[0]?.rentalHousingException),
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
  /**
   * ⑧ 일시적 2주택 특례 — 입력존재만 차단. 요건 미달(1년 미경과·3년 초과)은 정상 통과(특례만 미적용).
   *
   * 🔴 게이트를 **섹션 노출 조건**으로 바꿨다(2026-09-07). 종전 게이트 `provisoMode ===
   *    "temporary_two_house"`는 **§154① 단서 카드**의 맥락(1세대 + `assetKind === "housing"`
   *    + 정확히 2채)이라 이 섹션(주택 계열 4종 + 2채 **이상**)보다 좁았다. 그래서
   *    입주권·분양권·재개발APT 세대나 3주택 이상 세대에서는 토글을 켜고 신규 취득일을
   *    비워도 **경고가 0건**이었고, ④는 두 날짜가 다 있어야 `temporaryTwoHouse` 키를
   *    만들므로 §155① 특례가 **조용히 누락**됐다(실측: 메시지 0건).
   */

  /**
   * 🔑 §154① 단서 사유별 필수 입력 — 판정 메뉴와 **같은 leaf**(`exemption-proviso-validate.ts`).
   *
   * 🔴 **`one_house`·`deemed_one_house`·`rental_residence` 맥락에서만 본다.** 이 화면(Step4)이 단서 카드를 그리는 것은
   *    그 셋뿐이다(§155 의제 2주택 이상 — V-F4 · §155⑳ 거주주택) — `temporary_two_house` 맥락 카드는 판정 메뉴로 갔다(P6-b).
   *    종전에는 게이트가 없어도 무효과였다(그 맥락의 화이트리스트 1호·2호가목·3호 밖 사유만
   *    검사했으므로 — TM-7). 2호가목 **수용일**이 필수가 되면서(OH-33) 수용은 화이트리스트
   *    **안**이라, 게이트 없이는 채울 칸이 없는 이 화면에서 영구 차단이 된다.
   */
  const provisoReasonEff = effectiveProvisoReason(provisoMode, form.provisoReason);
  for (const message of collectExemptionProvisoErrors({
    reason: provisoMode === "one_house" || provisoMode === "deemed_one_house" || provisoMode === "rental_residence" ? provisoReasonEff : "",
    departureDate: form.provisoDepartureDate,
    departureOnlyHouse: form.provisoDepartureOnlyHouse,
    transferDate: form.transferDate,
    expropriationDate: form.provisoExpropriationDate,
    rentalLeaseResidenceMonths: form.provisoRentalLeaseResidenceMonths,
    preContractNoHouse: form.provisoPreContractNoHouse,
    rental4ho: form,
  }))
    issues.push({ step, message });
  // OH-22 §154⑤ 단서 처분 이력 — ⑤·④와 같은 노출 술어(범위 밖 stale 이력으로 막지 않는다)
  for (const message of collectFinalHouseRestartErrors(form, calcFinalHouseRestartInScope(form))) issues.push({ step, message });

  // 1세대1주택 + §154① 판정 자산 + interval 모드 거주 구간 검증 — 구간별 첫 오류 1건씩 + 겹침
  // (규칙은 `residence-interval-validate.ts` 한 벌 — 판정 메뉴 OH-07과 공유)
  //
  // 🔴 OH-49 — 게이트가 `assetKind === "housing"`이었다. ⑤ Step4는 재개발 완공APT에도 같은
  //    입력을 렌더하므로(`isOneHouseExemptionAsset`) 취득 전 임차·구간 겹침·퇴거일 누락이
  //    차단 없이 §154① 거주기간에 합산됐다. ⑤와 같은 술어로 맞춘다 — 분리 입력이 Step4를
  //    대신하면(OH-48) ⑤가 입력을 숨기므로 여기서도 건너뛴다.
  // 🔴 OH-50 — 승계조합원의 기산일은 준공일이다(시행령 §162①4호). 입주권 취득일과 비교하면
  //    멸실 전 종전주택 거주가 통과한다(서면-2019-부동산-4508 「멸실 전 거주기간을 통산하지 아니함」).
  const primary = form.assets?.[0];
  // 토지만 본인 × 같은 세대 합가는 합가일 이후 거주만 통산(기준-2025-법규재산-0040) — 거주 산입 기준일이 합가일로 늦춰진다. 그 밖은 취득일 그대로.
  const residenceStart = primary ? residenceStartWithMerge(redevAptHoldingStartDate(primary), primary) : undefined;
  if (form.isOneHousehold && primary && residenceStart && isOneHouseExemptionAsset(primary.assetKind)
      && !redevSplitResidenceSupersedesStep4(primary)
      && primary.residenceInputMode === "interval") {
    for (const message of collectResidenceIntervalErrors({
      periods: primary.residencePeriods ?? [],
      acquisitionDate: residenceStart.start,
      startKind: residenceStart.kind,
      transferDate: form.transferDate,
      giftPriorHint: calcGiftPriorResidenceAsked(primary),
    }))
      issues.push({ step, message });
  }
  // I-8 — 개월 수 직접 입력은 날짜가 없어 준공 전 거주를 가려낼 수 없다. 준공일~양도일보다 긴 값만
  //       막는다(⑤가 이 입력을 보이는 조건과 같다 · ⑫ `refinePrimaryAcquisitionInputs` 같은 leaf).
  if (form.isOneHousehold && primary && residenceStart && isOneHouseExemptionAsset(primary.assetKind)
      && !redevSplitResidenceSupersedesStep4(primary)
      && primary.residenceInputMode === "direct") {
    const months = deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths);
    const max = successorAptResidenceOverflow(primary, form.transferDate, months);
    if (max !== null)
      issues.push({
        step,
        message: fieldError("residencePeriodMonthsAsset", successorAptResidenceOverflowMessage("거주기간", months, max, primary.redevCompletionDate, primary.redevIsSuccessorMember === "yes" ? undefined : "토지 출자 신축주택")),
      });
    // 일반 상한 — 보유 기산일~양도일(구간 모드와 같은 기준일 · 승계조합원은 위가 더 구체적인 문구로 먼저 잡는다)
    else {
      const overflow = directResidenceMonthsOverflowError({
        months,
        acquisitionDate: residenceStart.start,
        startKind: residenceStart.kind,
        transferDate: form.transferDate,
        field: "residencePeriodMonthsAsset",
        giftPriorHint: calcGiftPriorResidenceAsked(primary),
      });
      if (overflow) issues.push({ step, message: overflow });
    }
  }
  return issues;
}
