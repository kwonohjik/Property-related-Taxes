/**
 * 양도세 마법사 1단계(보유 상황) 검증 — `transfer-tax-validate.ts`에서 분리 (800줄 정책, 2026-09-30).
 *
 * 분리 계기: 필드 이동(`transfer-validation-field-jump.plan.md`)으로 본 파일이 800줄에 닿았다.
 * 감면 단계(`transfer-tax-validate-reductions.ts`)와 같은 방식 — 로직은 그대로 옮겼다.
 * 순서도 그대로다: push 순서가 곧 오류 목록 순서이고 `[0]`이 자동 이동 대상이다.
 */
import { generalHouseRightAtInheritanceVisible } from "./inheritance-general-house-scope";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { gracePeriodInScope } from "@/lib/calc/grace-period-scope";
import { isHousingLike } from "@/lib/calc/housing-like-asset";
import { provisoGate, effectiveProvisoReason } from "./transfer-tax-api-helpers";
import { resolveHouseholdHousingCount, temporaryTwoHouseApplies } from "@/lib/calc/household-house-count";
import { collectExemptionProvisoErrors } from "./exemption-proviso-validate";
import { calcFinalHouseRestartInScope, collectFinalHouseRestartErrors } from "./final-house-restart";
import { collectResidenceIntervalErrors } from "./residence-interval-validate";
import { collectPreDesignationContractErrors } from "./pre-designation-contract-scope";
import { isOneHouseExemptionAsset, requiresPresaleRightsConfirmation } from "./housing-like-asset";
import { redevSplitResidenceSupersedesStep4, redevAptHoldingStartDate } from "./redev-field-scope";
import { successorAptResidenceOverflow } from "./redev-field-scope";
import { successorAptResidenceOverflowMessage } from "./redev-field-scope";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
import { collectCountExclusionIssues } from "./transfer-tax-validate-count-exclusion";
import {
  effectiveSellingTaxIncentiveRental,
  taxIncentiveAptDeadlineIncomplete,
  taxIncentiveRentalPeriodMissing,
} from "./tax-incentive-rental-scope";
import { aptDeadlineExtensionIncomplete, rentalDeclarationAptDeadlineInScope } from "./apt-deadline-extension-scope";
import { mergeContextOf, mergeHouseSideOf } from "./merge-house-origin";
import { fieldError } from "./transfer-tax-validate-field";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";
import { twoHouseExclusionStatusIssue } from "./two-house-exclusion-status";

export function collectStep1Issues(form: TransferFormData): ValidationIssue[] {
  const step = 1;
  const issues: ValidationIssue[] = [];
  if (!form.householdHousingCount)
    issues.push({ step, field: "householdHousingCount", message: "세대 보유 주택 수를 선택하세요." });

  /**
   * ⑧ 명부 필수화(PR-1·PR-B) — 주택 양도 + 명부 0행이면 「다른 보유 주택이 없습니다」 확정이
   * 있어야 통과한다. legacy 표식(OH-34 — 저장 당시 스칼라가 명부와 어긋난 구 이력)이 붙은
   * 레코드는 제외한다 — 그 레코드는 이미 유효한 세액을 보존 중이라 재확인을 요구하지 않는다.
   *
   * Q-7(PR-1)·PR-B: `isOneHouseExemptionAsset`(housing·redevelopment_apt — ①=§154① 비과세
   * 판정 축). 입주권·분양권은 ①의 의미 축이 달라 범위 밖(PR-C, 계획서
   * `docs/00-pm/roster-required-other-assets.plan.md` §4-3·§4-4). 겸용주택은 `assetKind`가
   * 항상 `"housing"`이라 이미 포함된다(별도 판정축 아님, 같은 계획서 §4-1).
   */
  const primaryKind = form.assets?.[0]?.assetKind;
  if (
    isOneHouseExemptionAsset(primaryKind) &&
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
  const houses = form.houses ?? [];
  // §155④⑤ 합가 전 소유 쪽 — 판정 메뉴와 같은 게이트·같은 분류(PR-2 2026-10-05).
  //   합가일이 없으면 undefined(묻지 않는다). 「모름」은 엔진에서 불성립이 되므로 차단한다
  //   (merge-composition-unknown-unfavorable.plan.md §3-3 · memory `feedback_unknown_fact_applies_unfavorably`).
  const mergeCtx = mergeContextOf(form);
  for (let i = 0; i < houses.length; i++) {
    const h = houses[i];
    const label = `보유 주택 ${i + 1}`;
    // 행 편집은 모달이라 입력칸이 DOM에 없다 — 행의 「편집」 버튼(`HouseTableRow`)이 앵커다. 목록이 사용자를 그 행에 데려다 준다.
    const rowKey = `houses.${i}` as const;
    const firstError = (() => {
      if (!h.acquisitionDate) return fieldError(rowKey, `${label}: 취득일을 입력하세요.`);
      if (!h.officialPrice || parseAmount(h.officialPrice) <= 0)
        return fieldError(rowKey, `${label}: 기준시가(공시가격)를 입력하세요.`);
      // 상속주택 5년 배제는 상속개시일이 있어야 기산 (소령 §167의3①7호) — 미입력 시 배제 미발동 → 차단
      if (h.isInherited && !h.inheritedDate)
        return fieldError(rowKey, `${label}: 상속주택이면 상속개시일을 입력하세요. (상속 5년 중과배제 판정 기준)`);
      // 장기임대 등록 경로: 등록사업자 선택 시 등록일 2종·임대기간 필수
      if (h.isLongTermRental && h.isRegisteredRental) {
        if (!h.rentalRegistrationDate) return fieldError(rowKey, `${label}: 임대사업자 등록일을 입력하세요.`);
        if (!h.businessRegistrationDate) return fieldError(rowKey, `${label}: 사업자 등록일을 입력하세요.`);
        if (!h.rentalPeriodYears || parseFloat(h.rentalPeriodYears) <= 0)
          return fieldError(rowKey, `${label}: 임대기간(년)을 입력하세요.`);
      }
      // 장기임대 9유형: 유형별 필수 입력값(가액·면적·날짜) — 미입력 시 엔진 오판정
      // (특히 면적 미입력 → 엔진 0 간주 → 298㎡ 이하 통과 → 과대 적용). exact 비교(.includes(t)=정확매칭).
      if (h.isLongTermRental && h.rentalType) {
        const t = h.rentalType;
        if (["A", "C", "E", "F", "H", "I"].includes(t) && !h.rentalStartOfficialPrice)
          return fieldError(rowKey, `${label}: 임대개시 당시 공시가격을 입력하세요.`);
        if (["B", "D"].includes(t) && !h.acquisitionOfficialPrice)
          return fieldError(rowKey, `${label}: 취득 당시 공시가격을 입력하세요.`);
        if (["C", "D", "F", "I"].includes(t) && (!h.rentalLandArea || !h.rentalTotalFloorArea))
          return fieldError(rowKey, `${label}: 대지면적·연면적(㎡)을 입력하세요.`);
        if (t === "D" && !h.firstSaleContractDate)
          return fieldError(rowKey, `${label}: 최초 분양계약일을 입력하세요.`);
        if (t === "G") {
          if (!h.rentalCancellationDate)
            return fieldError(rowKey, `${label}: 자진·자동 말소일을 입력하세요.`);
          // 사목 base 목(가·다·라·마) + 그 목의 "해당 목의 다른 요건"(임대기간요건 외) — 엔진 SAMOK_BASE_REQUIRED·base 게이트와 동기화
          const base = h.saMokBaseArticle;
          if (!base) return fieldError(rowKey, `${label}: 사목 — 말소 전 base 목(가·다·라·마)을 선택하세요.`);
          if ((base === "가" || base === "다" || base === "마") && !h.rentalStartOfficialPrice)
            return fieldError(rowKey, `${label}: 사목 base 목의 임대개시 당시 공시가격을 입력하세요.`);
          if (base === "라" && !h.acquisitionOfficialPrice)
            return fieldError(rowKey, `${label}: 사목 base 라목의 취득 당시 공시가격을 입력하세요.`);
          if ((base === "다" || base === "라") && (!h.rentalLandArea || !h.rentalTotalFloorArea))
            return fieldError(rowKey, `${label}: 사목 base 목의 대지면적·연면적(㎡)을 입력하세요.`);
          if (base === "라" && !h.firstSaleContractDate)
            return fieldError(rowKey, `${label}: 사목 base 라목의 최초 분양계약일을 입력하세요.`);
        }
      }
      // §167의3①3호 감면대상장기임대주택 — 「5년 이상 임대」 판정 칸. 미입력이면 엔진이 0년으로 읽어 조용히 불적용.
      if (taxIncentiveRentalPeriodMissing(h))
        return fieldError(rowKey, `${label}: 조특법 감면 임대주택이면 임대기간(년)을 입력하세요.`);
      // §167의3⑪ 「연장 사유 있음」 입력이 덜 됐다(사실 없음 · 3호 이전고시 상태 없음) — 그대로면 선택이 조용히 사라지거나
      // 3호 기한을 정할 수 없다. 2호는 ⑤·④와 같은 범위 술어 안에서만, 3호는 ⑤가 칸을 여는 후단 대상에서만.
      const ext2Issue = rentalDeclarationAptDeadlineInScope(h) ? aptDeadlineExtensionIncomplete(h.rentalAptDeadlineExtension) : null;
      if (ext2Issue) return fieldError(rowKey, `${label}: 장기임대 아파트 양도기한 연장 사유(소령 §167의3⑪) — ${ext2Issue}`);
      const ext3Issue = taxIncentiveAptDeadlineIncomplete(h);
      if (ext3Issue) return fieldError(rowKey, `${label}: 조특법 감면 임대주택 양도기한 연장 사유(소령 §167의3⑪) — ${ext3Issue}`);
      // P2 부득이한 사유: 거주기간(년) 필수 (엔진 ≥1년 판정 — 미입력 시 0 간주로 배제 미발동)
      if (h.isUnavoidableReason && (!h.unavoidableResidenceYears || parseFloat(h.unavoidableResidenceYears) <= 0))
        return fieldError(rowKey, `${label}: 부득이한 사유 주택의 거주기간(년)을 입력하세요.`);
      // 3호의 기준시가는 「취득 당시」다 — 미입력이면 엔진이 판정 불가로 두고 배제하지 않는다(F-16).
      if (h.isUnavoidableReason && !h.acquisitionOfficialPrice)
        return fieldError(rowKey, `${label}: 부득이한 사유 주택의 취득 당시 기준시가를 입력하세요.`);
      // §167의10①3호·7호 기산 상태 — 날짜 또는 「양도일 현재 미해소·진행 중」 택일(⑫ 거울 · 빈 값 = 「모름」 차단)
      const statusIssue = twoHouseExclusionStatusIssue(h);
      if (statusIssue) return fieldError(rowKey, `${label}: ${statusIssue.message}`);
      // §155④⑤ 합가 전 소유 쪽 — 판정 메뉴 ⑧과 같은 판정(`mergeHouseSideOf`).
      if (mergeCtx && mergeHouseSideOf(h, mergeCtx) === undefined) {
        return fieldError(
          rowKey,
          `${label}: ${mergeCtx.kind === "marriage" ? "혼인" : "합가"} 전 보유자를 고르세요 — 고르지 않으면 합가 특례를 불성립으로 판정합니다.`,
        );
      }
      return null;
    })();
    if (firstError) issues.push({ step, message: firstError });
  }

  // ⑧ 양도 주택 3주택+ 전용 배제 특례 — 사원주택/어린이집 선택 시 기간(년) 필수
  const se = form.sellingHouseExclusion;
  if (se?.isEmployeeHousing && (!se.freeProvisionYears || parseFloat(se.freeProvisionYears) <= 0))
    issues.push({ step, field: "sellingHouseExclusion.freeProvisionYears", message: "양도 주택 사원용 주택: 무상 제공 기간(년)을 입력하세요." });
  if (se?.isDayCareCenter && (!se.dayCareOperationYears || parseFloat(se.dayCareOperationYears) <= 0))
    issues.push({ step, field: "sellingHouseExclusion.dayCareOperationYears", message: "양도 주택 어린이집: 운영 기간(년)을 입력하세요." });

  // ⑧ 양도 주택 §167의3①3호 — 2호 선언이 켜져 있으면 그 칸의 임대기간을 함께 쓴다(⑤·④와 같은 유효 사실).
  if (taxIncentiveRentalPeriodMissing(effectiveSellingTaxIncentiveRental(se)))
    issues.push({ step, field: "sellingHouseExclusion.taxIncentiveRentalYears", message: "양도 주택 조특법 감면 임대주택: 임대기간(년)을 입력하세요." });
  // ⑧ 양도 주택 §167의3⑪ 「연장 사유 있음」 입력 미완 — 2호·3호 각자의 범위 술어(⑤·④와 같음)
  const sell2Issue = rentalDeclarationAptDeadlineInScope(se?.longTermRental)
    ? aptDeadlineExtensionIncomplete(se?.longTermRental?.rentalAptDeadlineExtension)
    : null;
  if (sell2Issue)
    issues.push({ step, message: `양도 주택 장기임대 아파트: 양도기한 연장 사유(소령 §167의3⑪) — ${sell2Issue}` });
  const sell3Issue = taxIncentiveAptDeadlineIncomplete(effectiveSellingTaxIncentiveRental(se));
  if (sell3Issue)
    issues.push({ step, message: `양도 주택 조특법 감면 임대주택: 양도기한 연장 사유(소령 §167의3⑪) — ${sell3Issue}` });

  // ⑧ 양도 주택 2주택 전용 배제 — §167의10①3호(F-16). 「다른 보유 주택」 행과 같은 요구다.
  //    3호·7호 기산 상태는 날짜 또는 「양도일 현재 미해소·진행 중」 택일이다 — 종전에는 7호 날짜 미입력을
  //    「진행 중」으로 읽어 요구하지 않았는데, 같은 빈 값에 「모름」이 겹쳤다(사용자 결정 2026-10-04).
  if (se?.isUnavoidableReason) {
    if (!se.unavoidableResidenceYears || parseFloat(se.unavoidableResidenceYears) <= 0)
      issues.push({ step, field: "sellingHouseExclusion.unavoidableResidenceYears", message: "양도 주택 부득이한 사유: 거주기간(년)을 입력하세요." });
    if (!se.acquisitionOfficialPrice)
      issues.push({ step, field: "sellingHouseExclusion.acquisitionOfficialPrice", message: "양도 주택 부득이한 사유: 취득 당시 기준시가를 입력하세요." });
  }
  const sellStatusIssue = se ? twoHouseExclusionStatusIssue(se) : null;
  if (sellStatusIssue?.field === "unavoidableReasonResolvedDate")
    issues.push({ step, field: "sellingHouseExclusion.unavoidableReasonResolvedDate", message: `양도 주택 ${sellStatusIssue.message}` });
  else if (sellStatusIssue)
    issues.push({ step, field: "sellingHouseExclusion.litigationAcquisitionDate", message: `양도 주택 ${sellStatusIssue.message}` });
  // ⑧ 공고 전 매매계약(영 §167의10①11호 등) — ⑤·④와 같은 범위 술어(`pre-designation-contract-scope.ts`).
  for (const message of collectPreDesignationContractErrors(form)) issues.push({ step, message });

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

  /**
   * ⑧ 다주택 중과 한시 유예(§167의3①12의2 나·다목) — 입력(ON) 시 목별 필수 입력.
   * houses 0건이면 엔진이 gracePeriod를 소비하지 않고 위젯도 숨김 → 검증도 houses>0 게이트(보이지 않는 필드 차단 방지).
   * 허가·계약금 증빙 미확인은 silent 차단이 아닌 "경과조치 부적용으로 계산 진행"(원문 "모두 갖춘" 요건 —
   * 엔진 checkGracePeriodExemption이 미충족 시 자동으로 suspended:false 처리·차단 대상 아님).
   *
   * ⚠️ **한시배제 창 안에서는 건너뛴다** — 위 houses·presaleRights와 달리 이 축만은 여전히
   * 중과 전용이고 창 안에서 **증명 가능한 no-op**이다(`checkGracePeriodExemption`의 가목 우선
   * 게이트가 `gracePeriod` 내용과 무관하게 `suspended: true`를 낸다). ⑤도 같은 조건으로
   * `HousesListSection hideGracePeriod`가 위젯을 닫으므로 짝이 맞는다.
   */
  // 술어는 ⑤ 위젯·④ 전송과 **같은 함수**다 (Q03). 종전에는 여기만 `houses.length > 0`이라
  // 「분양권·입주권만 있는 세대」에서 검증이 빠졌고, 그 상태로 ④가 보내 ⑫ Zod가 400을 냈다.
  if (gracePeriodInScope(form) && form.gracePeriod) {
    if (!form.gracePeriod.contractDate)
      issues.push({ step, field: "gracePeriod.contractDate", message: "중과 한시 유예: 매매계약 체결일을 입력하세요." });
    if (form.gracePeriod.isLandPermitTarget === true && !form.gracePeriod.permitApplicationDate)
      issues.push({ step, field: "gracePeriod.permitApplicationDate", message: "중과 한시 유예(나목): 토지거래허가 신청일을 입력하세요." });
  }

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
   * ⚠️ 미선택(`""`)은 막지 않는다 — 판정 불가로 남아 종전대로 계산되고 결과에 안내가 붙는다.
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
  // (카드 숨김·temp-two-house 무효 reason(나·다목·5호)은 검증 skip — Part B/D mirror·데드락 차단)
  const provisoMode = provisoGate({
    isOneHousehold: form.isOneHousehold,
    // OH-20 — 재개발 완공APT도 §89①3호가목 「주택」이다(⑤ Step4 · ④와 같은 술어).
    isHousing: isOneHouseExemptionAsset(form.assets?.[0]?.assetKind),
    householdHousingCount: resolveHouseholdHousingCount({
      primaryKind: form.assets?.[0]?.assetKind,
      declared: parseInt(form.householdHousingCount || "1", 10) || 0,
      houses: form.houses,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
    }),
    temporaryTwoHouseApplies: temporaryTwoHouseApplies({
      primaryKind: form.assets?.[0]?.assetKind,
      primaryAcquisitionDate: form.assets?.[0]?.acquisitionDate,
      houses: form.houses,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
      declaredSpecial: form.temporaryTwoHouseSpecial === true,
      declaredNewHouseDate: form.newHouseAcquisitionDate,
      excludedHouseIds: eligibleCountExcludedHouseIds(form),
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
   * 🔴 **`one_house` 맥락에서만 본다.** 이 화면(Step4)이 단서 카드를 그리는 것은
   *    `one_house`뿐이다 — `temporary_two_house` 맥락 카드는 판정 메뉴로 갔다(P6-b).
   *    종전에는 게이트가 없어도 무효과였다(그 맥락의 화이트리스트 1호·2호가목·3호 밖 사유만
   *    검사했으므로 — TM-7). 2호가목 **수용일**이 필수가 되면서(OH-33) 수용은 화이트리스트
   *    **안**이라, 게이트 없이는 채울 칸이 없는 이 화면에서 영구 차단이 된다.
   */
  const provisoReasonEff = effectiveProvisoReason(provisoMode, form.provisoReason);
  for (const message of collectExemptionProvisoErrors({
    reason: provisoMode === "one_house" ? provisoReasonEff : "",
    departureDate: form.provisoDepartureDate,
    expropriationDate: form.provisoExpropriationDate,
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
  if (form.isOneHousehold && primary && isOneHouseExemptionAsset(primary.assetKind)
      && !redevSplitResidenceSupersedesStep4(primary)
      && primary.residenceInputMode === "interval") {
    for (const message of collectResidenceIntervalErrors({
      periods: primary.residencePeriods ?? [],
      acquisitionDate: redevAptHoldingStartDate(primary),
      transferDate: form.transferDate,
    }))
      issues.push({ step, message });
  }
  // I-8 — 개월 수 직접 입력은 날짜가 없어 준공 전 거주를 가려낼 수 없다. 준공일~양도일보다 긴 값만
  //       막는다(⑤가 이 입력을 보이는 조건과 같다 · ⑫ `refinePrimaryAcquisitionInputs` 같은 leaf).
  if (form.isOneHousehold && primary && isOneHouseExemptionAsset(primary.assetKind)
      && !redevSplitResidenceSupersedesStep4(primary)
      && primary.residenceInputMode === "direct") {
    const months = deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths);
    const max = successorAptResidenceOverflow(primary, form.transferDate, months);
    if (max !== null)
      issues.push({
        step,
        message: fieldError("residencePeriodMonthsAsset", successorAptResidenceOverflowMessage("거주기간", months, max, primary.redevCompletionDate)),
      });
  }
  return issues;
}
