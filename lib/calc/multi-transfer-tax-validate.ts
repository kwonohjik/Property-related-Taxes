/**
 * 다건 양도소득세 폼 검증
 */

import { parseAmount } from "@/lib/calc/number-parse";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { ALL_INCOME_DEDUCTION_IDS } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { validateStep } from "./transfer-tax-validate";
import { partCarryover } from "./transfer-land-part-cause";
import { carryoverPurchasedPartDebt } from "./carryover-gift-assumed-debt";
import { phdFlagEffective } from "./phd-toggle-scope";
import { MULTI_CARRYOVER_PART_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_CARRYOVER_DEBT_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_GB_BG_CARRYOVER_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { isGbBurdenedGift } from "./gb-bg-gift-tax-return";
import { carryoverEventForm } from "./transfer-tax-api-carryover";
import { MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_RIGHT_TO_MOVE_IN_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_MIXED_USE_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { isPreDeemedPurchaseAsset } from "./transfer-pre-deemed-purchase-form";
import { MULTI_PHD_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_COMPANION_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE } from "./multi-transfer-support-messages";
import { isMultiSupportedNewHousingReduction } from "./multi-transfer-support-messages";
import { multiRosterBlockMessage } from "./multi-roster-parity";

/**
 * 다건 합산 엔진(`calculateTransferTaxAggregate`)이 미지원하는 감면 조문 집합 (2026-06-12 리뷰 H-1).
 *
 * 🔴 **미지원 사유가 바뀌었다 — 지금 소실되는 것은 「세율 특칙」뿐이다** (D11-07, 2026-09-02).
 *
 * 도입 당시(`92e8feee`, 2026-06-12)에는 차감·세액감면이 실제로 소실됐다. 그러나 이후
 * 집계 차감 지원(`62821310`, 2026-07-27)이 들어와 지금은:
 *   - 차감형   → `transfer-tax-aggregate.ts`가 반영한다(+ 농특세 2-pass). §99의3의
 *                「단건 == 다건」 완전 일치를 `aggregate-income-deduction-993.anchor.test.ts`가 고정.
 *   - 세액감면형 → `transfer-tax-aggregate-reduction-step.ts`가 반영한다.
 *   - **세율 특칙 → 소실된다.** `forceFlatRate20`(§98①1호)·`suppressShortTermRate`
 *     (§98의3④·§98의5③·§98의6③)는 단건 `transfer-tax.ts:790-794`가 **세율 입력에만**
 *     주입한다. 집계에서는 **두 겹으로** 사라진다(`calcTax` 진입 로그로 추적):
 *       ① `transfer-tax-aggregate-helpers.ts:354`(`assetTaxOf`)가 원본
 *          `correctedSingleInput`을 세율 입력으로 써 플래그가 실리지 않는다.
 *       ② 그 자리에 플래그를 **심어 봐도** 결정세액은 그대로다 —
 *          `transfer-tax-aggregate-pickers.ts:139`의 `calculatedTaxByGeneral`(전체 누진)과의
 *          **MAX**(§104⑤ 비교과세)가 20% 결과를 덮는다. 실측: 플래그 주입 시 `calcTax`가
 *          20%로 계산(83,500,000)했지만 최종값은 누진값 141,060,000 그대로였다.
 *     ⇒ 「배선만 이으면 된다」가 아니다. 살리려면 §104⑤ 비교 대상에서 이 특칙을 어떻게
 *        다룰지부터 정해야 한다.
 *
 *     🔑 **다만 그 어려움은 `forceFlatRate20`(§98)에만 해당한다** (2026-09-02 실측 정정).
 *        MAX는 값을 **올리기만** 하므로:
 *          · §98 `forceFlatRate20` → 20%는 누진보다 **낮아** `calculatedTaxByGeneral`이 덮는다.
 *          · §98의3계 `suppressShortTermRate` → 배제 결과가 **곧 누진**이라 MAX가 바꿀 게 없다.
 *        실측(자산 1건 · §98의5 · 보유 7·18개월): `assetTaxOf`의 세율 입력에 플래그를 심으면
 *        다건 산출세액이 **215,010,000으로 단건과 원 단위까지 일치**했다(잔차 −593,752는
 *        아래 감면액 산정 축이다). ⇒ 두 플래그는 **다른 처방**이 필요하다.
 *
 * **실측으로 출처를 갈랐다** (§98 · 양도 9억·취득 3억·1996-06-01 취득·2024-08-01 양도):
 *   단건 결정세액 **83,500,000** ↔ 다건 **141,060,000**, 그런데 **과세표준은 417,500,000으로
 *   양쪽 동일**하다. 즉 차이는 100% 세율에서 나오고, 다건 값은 감면을 아예 선택하지 않은
 *   경우(141,060,000)와 **원 단위까지 같다**.
 *
 * ✅ **§98의3계(단기세율 배제) divergence도 재현했다 (2026-09-02).** 종전에는 「이 격자에서
 *    재현하지 못했다(감면 미적격으로 양쪽 다 단기 50%) — 재현 실패는 부존재의 근거가 아니다」로
 *    남아 있었다. **격자가 조문을 잘못 골랐던 것**이다:
 *
 *    | 조문 | 산출세액 | 총부담 |
 *    |---|---|---|
 *    | §98의3 (5년 내) | 93,110,000 ↔ **148,750,000** (단기 70% 소실) | **0 ↔ 0** |
 *    | §98의5 (60% 감면) | 215,010,000 ↔ **298,750,000** | 94,604,400 ↔ **130,625,000** |
 *
 *    §98의3 5년 내는 **100% 세액감면**(농특세도 비과세)이라 산출세액 차이가 결정세액에
 *    도달하지 못하고 소멸한다 — **그래서 §98의3만 보던 종전 격자가 실패했다**.
 *    감면율이 100% 미만인 §98의5에서는 남은 40%를 타고 그대로 통과한다:
 *      · 보유 7개월(단기 70%) → **+36,020,600** 과대
 *      · 보유 18개월(단기 60%) → **+9,895,600** 과대
 *    ⇒ 「구조상 같은 경로」라는 추정이 **수치로 확인**됐다. anchor
 *      `multi-rate-special-divergence.anchor.test.ts`가 고정한다.
 *
 * 📌 **부수 관측 — 장기 구간에도 별개 divergence가 있다**(세율 특칙과 무관):
 *    §98의5 보유 4년(장기)은 산출세액이 **같은데**(199,890,000) 감면액이 갈린다
 *    (119,934,000 ↔ 120,467,989 · 총부담 −587,388). 다건은 감면을 `산출세액 × k`
 *    (`k = 감면대상소득 / 과세표준`)로 내는데 **기본공제 때문에 자산 1건에서도 `k > 1`**이 된다
 *    (2,500,000 / 560,000,000 ≈ 0.446% — 관측된 비율과 일치). 단건은 산출세액 × 감면율이다.
 *    이 축은 차단 덕에 **도달 불가**라 여기서 고치지 않는다 — 차단을 푸는 작업이 함께 풀 것.
 *
 * 🔁 **2026-11 갱신 (리뷰 US-39 · Q-9 b)** — 집계 엔진은 이제 두 겹을 모두 되살린다. 단건 결과의 echo
 *    (`rateSpecialInjected`)로 세율 입력에 플래그를 복원하고(`transfer-tax-aggregate-asset-records.ts`),
 *    §98①1호 20% 자산은 §104⑤ 「전체 누진」 비교에서 빼 20%로 따로 과세한다(`transfer-tax-aggregate-pickers.ts`).
 *    그래서 **일괄양도(companionAssets)** 는 단건과 같은 세율 특칙을 쓴다. 이 다건 차단은 **연간 다건 화면**에서
 *    다른 축(감면 배분·농특세 등)이 아직 검증되지 않아 유지한다 — 차단 해제는 이 갱신의 범위가 아니다.
 *
 * 차단은 유지한다(침묵 오산보다 명시 차단이 안전). 다만 **사유 문구는 세율 특칙으로**
 * 적어야 한다 — 종전 문구 「차감·세액감면이 반영되지 않습니다」는 사실과 다르다.
 */
const MULTI_UNSUPPORTED_REDUCTION_TYPES: ReadonlySet<string> = new Set(ALL_INCOME_DEDUCTION_IDS);

/** 단건 자산의 필수 입력 완성도 검사 (0~100 정수) */
export function calcPropertyCompletion(form: PropertyItem["form"]): number {
  const primary = form.assets?.[0];
  const checks = [
    !!primary?.assetKind,
    !!(form.contractTotalPrice && parseAmount(form.contractTotalPrice) > 0),
    !!form.transferDate,
    !!primary?.acquisitionDate,
    !!(
      primary?.useEstimatedAcquisition
        ? primary.standardPriceAtAcq && primary.standardPriceAtTransfer
        : true
    ),
    !!form.householdHousingCount,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/**
 * 다건(연간 합산) 경로가 정확히 계산할 수 없는 고급 모드를 명시 차단.
 *
 * 합산 엔진(`calculateTransferTaxAggregate`)은 자산별로 단건 엔진(`calculateTransferTax`)을
 * 그대로 호출한다. 그러나 다음 모드는 단건 API route(`/api/calc/transfer`)가 **별도 dispatch**
 * (겸용주택·일반건물·부담부증여 §159 등)로 처리하거나 전용 sub-object를 요구하는데,
 * 다건 변환(`buildPropertyPayload`)이 그 sub-object를 구성하지 않아 일반 양도로 잘못 계산된다.
 * 침묵 오산보다 명시 차단이 안전하다(법령 정확성 최우선).
 *
 * @returns 차단 사유 문자열, 지원 모드면 null
 */
export function validateMultiSupportedMode(form: PropertyItem["form"]): string | null {
  const a = form.assets?.[0];
  if (!a) return null;

  if (a.assetKind === "redevelopment_apt") {
    return MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE;
  }
  // 의제취득일 전 매수 §176조의2④ — 단건과 같은 카드가 뜨지만 다건 ④·⑭는 그 입력을 옮기지 않는다(Q-11 b · 서버 `MULTI_REJECT_RULES`와 같은 문구)
  if (isPreDeemedPurchaseAsset(a)) return MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE;
  /**
   * 조합원입주권 — `redevelopment_apt`와 **같은 이유**로 차단한다 (2026-08-23).
   *
   * 종전에는 이 가드에 빠져 있었다. 다건 화면은 단건 마법사를 그대로 임베드하므로
   * (`app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx`) 입주권 자산을 만들 수 있는데,
   * 다건 변환(`multi-transfer-tax-api.ts`)은 §166 sub-object도 승계취득 필드도 만들지 않고
   * `fixedAcquisitionPrice`를 취득가액으로 쓴다 ⇒ **일반 양도로 조용히 오산**됐다.
   * 상단 축 A를 제거하면서 그 칸마저 사라지므로(취득가액 0 + 입력칸 없음) 명시 차단으로 바꾼다.
   */
  if (a.assetKind === "right_to_move_in") {
    return MULTI_RIGHT_TO_MOVE_IN_UNSUPPORTED_MESSAGE;
  }
  if (a.assetKind === "housing" && a.isMixedUseHouse) {
    return MULTI_MIXED_USE_UNSUPPORTED_MESSAGE;
  }
  // 상업용건물·오피스텔·일반건물은 막지 않는다(계획서 multi-building-valuation-support 트랙 C·G).
  //   상업용은 단건 엔진이 서브객체를 직접 읽고, 일반건물은 ⑭가 단건과 같은 토지·건물 카드로 펼친다(`multi-gb-expansion.ts`).
  //   일반건물 지분 분할 취득은 자산 2건 이상이라 아래 「한 건 내 다자산」 차단이 막는다(⑫는 `generalBuildingShares` 거부).
  // 배우자등 이월과세(§97의2) — 자산 단위 사건(`carryoverTaxation`)은 ④⑭가 단건과 같은 leaf로 옮긴다
  //   (계획서 multi-carryover-bg-gb-shares 트랙 CO). 연간 합산은 확정신고 1건이라 §97의2②3호 비교가 그 해 전체 결정세액으로 한다.
  //   계속 막는 하위 모드 — ⑫ `MULTI_REJECT_RULES`와 같은 문구:
  //   · 파트 이월과세(P3 A 토지만 · P4 B 건물만 · C 증여자 분리) — ④가 파트 키를 싣고 ⑫가 거부한다(⑧이 먼저 막는다).
  //   · 당초 증여 때 인수한 채무 부분(매입분) — 예정신고 세액 계산이 자산마다 단건 엔진을 불러 채무 키에서 멈춘다.
  const carryoverParts = partCarryover(a);
  if (carryoverParts.land || carryoverParts.building) return MULTI_CARRYOVER_PART_UNSUPPORTED_MESSAGE;
  if (carryoverPurchasedPartDebt(a) > 0) return MULTI_CARRYOVER_DEBT_UNSUPPORTED_MESSAGE;
  // 부담부증여(소령 §159) — 자산 단위 info·`transferType`은 ④⑭가 단건과 같은 leaf로 옮긴다(트랙 BG · 자산별 §159 명세 echo).
  //   일반건물 부담부증여 × 이월과세만 막는다 — 단건은 카드 세트 A·B를 신고 단위로 비교하는데 연간 합산 펼침은 그 단위를 받지 않는다(⑫ 같은 문구).
  if (isGbBurdenedGift(a) && carryoverEventForm(a)) return MULTI_GB_BG_CARRYOVER_UNSUPPORTED_MESSAGE;
  // 상속·증여 §163⑨ 취득가액(① 평가액 · ② §164 기준시가 · 의제 전 ③ 환산)은 다건도 단건과 같은 빌더로 싣는다
  //   (`buildPropertyPayload` — 계획서 multi-sec163-9-support.plan.md Q-1 a). ① 공란·② 부분 입력은 건별 ⑧(`validateStep` —
  //   `postDeemedClauseARequiredError` 등)이 단건과 같이 짚는다(Q-2 a). 종전 다건 전용 「상속 ① 공란」 가드와 #2888의 ② 입력 차단은 지웠다.
  // 비주택 → 주택 용도변경(§95⑤·⑥ · 영 §154⑤ 단서)은 **차단하지 않는다** (G2-4, 2026-10-11).
  //    종전 차단(Q26)의 사유는 다건 ④⑬이 `nonHousingToHousingConversion` 키와 §95⑤2호 거주월수 클램프를
  //    만들지 않는다는 배관 미비뿐이었다. 지금은 ④⑬(`multi-transfer-tax-api.ts`)이 단건과 같은 두 leaf
  //    (`isUsageConversionActive`·`clampResidenceToHousingPeriod`)로 싣고, ⑭(`multi/route.ts`)가 Date로 옮기며,
  //    ⑫ `MULTI_REJECT_RULES`도 이 키를 거부하지 않는다. 합산 엔진은 자산마다 단건 엔진을 그대로 부르고
  //    두 규칙 모두 자산 1건 단위(장특공제 기간 분할·보유기간 기산)라 단건 = 다건이다.
  //    고정: `__tests__/calc/multi-usage-conversion-block.anchor.test.ts`(차단하지 않음 + 단건 parity).
  if (phdFlagEffective(a)) { // D2 유효면 PHD 플래그는 무시된다(④·⑧과 같은 술어)
    return MULTI_PHD_UNSUPPORTED_MESSAGE;
  }
  if (a.parcelMode && a.assetKind === "land") {
    return "다필지 토지는 단건 계산기에서만 지원됩니다.";
  }
  if (a.familyBusinessInheritance !== undefined) {
    return MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE;
  }
  // 토지·건물 취득일 분리·소유자 분리(§166⑥·§168②)는 차단하지 않는다 — ⑬·⑭가 단건과 같은 leaf로
  // 분리 축을 옮기고, 합산 엔진은 파트 단위로 §104⑤를 판정한다(F-12, 2026-09-19).
  // 차감형·세액감면형·세율특칙 감면 (§98~§99의2 미분양·신축 시리즈) — 다건 합산 미지원 (H-1)
  // §99·§99의3은 2016.1.1. 이후 양도분만 푼다(NH-72 · Q-16 — `isMultiSupportedNewHousingReduction`). 2016 전은 사유 문구를 따로 둔다.
  const blockedReduction = (a.reductions ?? []).find(
    (r) => MULTI_UNSUPPORTED_REDUCTION_TYPES.has(r.type) && !isMultiSupportedNewHousingReduction(r.type, form.transferDate),
  );
  if (blockedReduction) {
    return blockedReduction.type === "new_99" || blockedReduction.type === "new_99_3"
      ? MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE
      : MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE;
  }
  // 모드 2 — 보유 감면주택 주택수 제외(§89①3호 의제)는 **막지 않는다**(Q4, 2026-10-04).
  //    종전 차단(`transfer-calc-count-exclusion-row-link.plan.md` Q-4)의 사유는 다건 ⑬이 싣지 않는다는 것뿐이었다.
  //    지금은 ⑬(`specialHouseExclusionsPayload`)·⑭(`mapSpecialHouseExclusionsToEngine`)가 단건과 같은 leaf로
  //    건별 전송하고, 건별 ⑧(`validateStep` — 옛 선언·행 필수값)도 단건과 같다. 단건 = 다건은
  //    `transfer.route.multi-special-act-exclusion.anchor.test.ts`가 고정한다.
  if ((form.assets?.length ?? 0) > 1) {
    return MULTI_COMPANION_UNSUPPORTED_MESSAGE;
  }
  return null;
}

/** 건별 편집이 최소 조건을 충족하는지 (다음 단계 이동 가능 여부) */
export function isPropertyReady(item: PropertyItem): boolean {
  return firstBlockingMessage(item) === null;
}

/** 건별 첫 차단 사유 — 없으면 null */
function firstBlockingMessage(item: PropertyItem): string | null {
  // Step1↔Step3 통합 후 4단계 구조: Step 0(자산·취득) ~ Step 2(감면) 검증.
  // Step 3(가산세)은 선택이므로 제외.
  for (let step = 0; step <= 2; step++) {
    const message = validateStep(step, item.form);
    if (message !== null) return message;
  }
  return null;
}

/** 전체 다건 공통 설정 검증 */
export function validateMultiSettings(form: MultiTransferFormData): string | null {
  if (form.properties.length === 0) return "양도 건을 1건 이상 추가하세요.";
  if (form.properties.length > 20) return "최대 20건까지 동시 양도 계산을 지원합니다.";
  if (!form.taxYear || form.taxYear < 2000) return "과세연도를 확인하세요.";

  // 모든 건의 양도일이 taxYear 내에 있어야 함
  for (const p of form.properties) {
    if (!p.form.transferDate) continue;
    const year = new Date(p.form.transferDate).getFullYear();
    if (year !== form.taxYear) {
      return `"${p.propertyLabel}"의 양도일(${p.form.transferDate})이 과세연도(${form.taxYear})와 다릅니다.`;
    }
  }

  // 다건 합산이 정확히 계산할 수 없는 고급 모드 명시 차단 (침묵 오산 방지)
  for (const p of form.properties) {
    const unsupported = validateMultiSupportedMode(p.form);
    if (unsupported) {
      return `"${p.propertyLabel}": ${unsupported}`;
    }
  }

  // 같은 신고의 다른 건과 명부가 명백히 모순되면 막는다 — 같은 날 양도하는 주택이 모두 1채로 계산되는 경우(§154⑨),
  // 명부가 비고 「없음」까지 확인했는데 그날 보유 중인 다른 주택 건이 있는 경우(§154①). 나머지 어긋남은 비차단 고지다(`multi-roster-parity.ts`).
  const rosterBlock = multiRosterBlockMessage(form.properties);
  if (rosterBlock) return rosterBlock;

  const used = parseAmount(form.annualBasicDeductionUsed);
  if (used > 2_500_000) return "연간 기사용 기본공제는 250만원을 초과할 수 없습니다.";

  // [B8] 신고서 단위 수정신고·경정청구 검증 (단건 transfer-tax-validate step3 amendment 블록 이식)
  if (form.amendmentMode) {
    if (parseAmount(form.originalDeterminedTax) <= 0) return "당초 결정세액을 입력하세요.";
    // 경정청구 후발적 사유 → 사유 안 날 필수 (§45의2② 3개월 기산)
    if (
      form.correctionKind === "refund_claim" &&
      form.claimReasonType === "posterior" &&
      !form.posteriorEventDate
    ) {
      return "후발적 사유를 안 날을 입력하세요.";
    }
    if (form.applyUnderReportingPenalty && form.underReductionMode === "auto_48_2") {
      if (!form.statutoryFilingDeadline) return "§48② 자동감면 산정을 위해 법정신고기한을 입력하세요.";
      if (!form.amendedFilingDate) return "§48② 자동감면 산정을 위해 수정신고일을 입력하세요.";
    }
    if (form.applyLatePaymentPenalty) {
      if (!form.statutoryFilingDeadline) return "납부지연가산세 산정을 위해 법정신고기한을 입력하세요.";
      if (!form.amendedPaymentDate)
        return "납부지연가산세 산정을 위해 수정신고 납부(예정)일을 입력하세요.";
    }
  }

  return null;
}

/** 모든 건의 최소 조건 충족 여부 */
export function areAllPropertiesReady(properties: PropertyItem[]): boolean {
  return properties.every(isPropertyReady);
}

/**
 * 필수 정보가 남은 건이 있으면 그 이름을 담은 차단 문구, 없으면 null — 「세액 계산」의 최종 관문.
 *
 * 목록의 「공통 설정으로」만 `areAllPropertiesReady`로 막고 있어서, 단계 표시 「공통 설정」 탭과
 * 편집 화면의 「공통 설정으로 →」로 들어오면 소재지·동·호 같은 클라이언트 필수 입력 없이 계산됐다(실측 200).
 * 단건 `handleSubmit`의 「최종 제출 가드」와 같은 자리다.
 * 계획서 `docs/00-pm/address-dongho-other-calcs-and-multi-gate.plan.md` M1
 */
export function notReadyPropertiesMessage(properties: PropertyItem[]): string | null {
  const lines = properties.flatMap((p) => {
    const message = firstBlockingMessage(p);
    return message === null ? [] : [`• 「${p.propertyLabel}」 ${message}`];
  });
  if (lines.length === 0) return null;
  return `필수 정보가 입력되지 않은 양도 건이 있습니다. 자산 목록에서 편집해 완성하세요.\n${lines.join("\n")}`;
}
