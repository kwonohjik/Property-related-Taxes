/**
 * 가업상속공제 자산 양도 — §97의2④ 의제 취득가액 헬퍼
 *
 * 소법 §97의2④: 가업상속공제를 받은 상속인이 가업용 자산을 양도하는 경우,
 *   취득가액 = 피상속인 취득가액 × 가업상속공제적용률
 *            + 상속개시일 현재 해당 자산가액 × (1 - 가업상속공제적용률)
 *
 * 소령 §163의2③: 가업상속공제적용률 산정
 *   1호(개인가업): 공제금액 / 가업상속 재산가액
 *   2호(법인가업): 사업관련자산가액 / 총자산가액
 *
 * 상증법 §18의2⑩: 가업상속공제를 받은 자가 양도세를 납부하는 경우
 *   상증세 상당액 공제. 공제액 = max(0, 의제 양도세 − 일반 양도세).
 *   단서: 공제액이 음수이면 0 (음수 가드).
 *
 * 설계 근거: docs/02-design/features/transfer-fb-cgt-credit-integration/engine.design.md
 *
 * 800줄 정책: sibling 파일로 격리 (transfer-tax.ts 800줄 초과 방지)
 * DB 직접 호출 없음 — 순수 함수
 */

import { applyRate } from "./tax-utils";
import type { TransferTaxInput, TransferTaxResult } from "./types/transfer.types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
import { calcFamilyBusinessCgtCredit } from "./credits/family-business-cgt-credit";
import { INH } from "./legal-codes";

/** calculateTransferTax 함수 시그니처 (재귀 주입용 — 순환 import 차단) */
type CalcFn = (
  input: TransferTaxInput,
  rates: TaxRatesMap,
  options?: TransferTaxAcquisitionOptions,
) => TransferTaxResult;

// ─── 공개 입력 타입 ───────────────────────────────────────────

/**
 * 가업상속공제 자산 양도 시 의제 취득가액 계산 입력
 *
 * 소법 §97의2④ + 소령 §163의2③
 */
export interface FamilyBusinessInheritanceTransferInput {
  /**
   * 피상속인 원취득가액 (원, 정수)
   * 소법 §97의2④1호: "피상속인이 그 자산을 취득하기 위하여 지출한 금액"
   */
  decedentAcquisitionPrice: number;
  /**
   * 상속개시일 현재 해당 자산가액 (원, 정수)
   * 소법 §97의2④2호: "상속개시일 현재 상증법 §60·§63에 따라 평가한 가액"
   * 보충적 평가액(기준시가 등) — 시가 우선
   */
  inheritanceMarketValue: number;
  /**
   * 가업상속공제적용률 (0~1)
   * 소령 §163의2③1호(개인가업): 공제금액 / 가업상속 재산가액
   * 소령 §163의2③2호(법인가업): 사업관련자산가액 / 총자산가액
   * 적용률 = 0이면 의제 취득가 = 상속개시일 평가액 (공제 0%)
   * 적용률 = 1이면 의제 취득가 = 피상속인 원취득가 (공제 100%)
   */
  fbDeductionAppliedRate: number;
  /**
   * 상속개시일 (YYYY-MM-DD 문자열 또는 ISO 8601)
   * 의제 취득가액 계산 근거 일자. 현재 엔진 분기 판정용 보관.
   */
  inheritanceDate: string;
  /**
   * 피상속인 자본적 지출액 (원, 정수, 선택)
   * 소법 §97의2④ 단서: 피상속인이 지출한 자본적 지출도 의제 취득가 산식에 포함하는지 여부.
   * 현행 조문에 명시적 규정이 없으므로 optional — 후속 법령 해석 시 반영.
   */
  decedentCapitalExpenditure?: number;
  /**
   * 상속인(납세자) 자본적 지출액 (원, 정수, 선택)
   * 소법 §97①2호 가목: 상속 취득 후 지출한 자본적 지출 — 일반 §97 경로에서 필요경비로 차감.
   */
  heirCapitalExpenditure?: number;
}

/**
 * 가업상속공제 자산 양도 상세 결과
 * TransferTaxResult.familyBusinessDetail에 optional로 첨부
 */
export interface FamilyBusinessCgtDetail {
  /**
   * §97의2④ 의제 취득가액 (원)
   * = 피상속인 취득가 × 적용률 + 상속개시일 평가액 × (1 - 적용률)
   */
  imputedAcquisitionPrice: number;
  /**
   * §97의2④ 의제 산식 적용 결정세액 (원)
   * 의제 취득가액을 기준으로 재계산한 양도세 결정세액 (reductionAmount 차감 후)
   */
  cgtUnderSection97_2_4: number;
  /**
   * §97 일반 산식 적용 결정세액 (원)
   * 피상속인 원취득가액을 기준으로 계산한 양도세 결정세액
   */
  cgtUnderSection97: number;
  /**
   * §18의2⑩ 상속세 상당액 공제액 (원)
   * = max(0, 의제 산식 결정세액 − 일반 산식 결정세액)
   * 의제 산식이 일반보다 낮으면 0 (음수 가드)
   */
  creditAmount: number;
  /**
   * 적용된 가업상속공제적용률
   * 소령 §163의2③ 산출값 (UI 산식 표시용)
   */
  appliedRate: number;
  /**
   * 피상속인 원취득가액 echo (UI 산식 표시용)
   */
  decedentAcquisitionPrice: number;
  /**
   * 상속개시일 현재 자산 평가액 echo (UI 산식 표시용)
   */
  inheritanceMarketValue: number;
  /**
   * §18의2⑩ 공제 산식 breakdown (single-source: credits/calcFamilyBusinessCgtCredit).
   * 의제세액·일반세액·공제액 3행. UI 결과 카드 표시용.
   */
  creditBreakdown?: Array<{ label: string; amount: number; lawRef?: string }>;
}

// ─── 핵심 헬퍼 함수 ──────────────────────────────────────────

/**
 * 소법 §97의2④ 의제 취득가액 산출
 *
 * 산식:
 *   피상속인 취득가 × 적용률 + 상속개시일 평가액 × (1 - 적용률)
 *
 * 정수 연산:
 *   applyRate(amount, rate) = Math.floor(amount * rate)
 *   두 항을 각각 floor 후 합산 → ±1원 오차 허용 (정책: 1원 tolerance)
 *   단, rate + (1-rate) = 1.0이 아닌 부동소수점 오차 케이스는 허용.
 *
 * @param decedentAcquisitionPrice 피상속인 원취득가액 (원)
 * @param inheritanceMarketValue 상속개시일 현재 자산가액 (원)
 * @param fbDeductionAppliedRate 가업상속공제적용률 (0~1)
 * @returns 의제 취득가액 (원, Math.floor 적용)
 */
export function calcFamilyBusinessImputedAcquisitionPrice(
  decedentAcquisitionPrice: number,
  inheritanceMarketValue: number,
  fbDeductionAppliedRate: number,
): number {
  // 잔액 흡수 패턴 (feedback_floor_residual_absorption):
  //   1 - rate 부동소수점 오차 방지.
  //   term1 = Math.floor(decedent × rate)
  //   term2 = Math.floor(market × rate) 별도 계산 → 각각 floor로 ±1원 오차 허용
  //
  // §97의2④ 산식:
  //   의제취득가 = 피상속인 취득가 × 적용률 + 상속개시일 평가액 × (1 - 적용률)
  // 두 항을 독립 applyRate로 계산 (1원 tolerance 정책 — pre-Do anchor FB-CGT-LAW-1).
  const term1 = applyRate(decedentAcquisitionPrice, fbDeductionAppliedRate);
  // (1 - fbDeductionAppliedRate) 부동소수점 오차 방지: 보완률을 분리 계산
  // applyRate(market, 1 - rate) 대신 market - applyRate(market, rate) 패턴 사용.
  const term2 = inheritanceMarketValue - applyRate(inheritanceMarketValue, fbDeductionAppliedRate);
  return term1 + term2;
}

/**
 * 가업상속공제 자산 양도세 분기 처리
 *
 * 소법 §97의2④: 의제 취득가액으로 2회 계산 후 §18의2⑩ 공제액 산출.
 * - STEP 0.42에서 호출 (transfer-tax.ts 진입점)
 * - 재귀 호출 시 familyBusinessInheritance를 제거하여 무한루프 차단
 *
 * @param fb 가업상속공제 입력
 * @param imputedCgt 의제 취득가액 기준 calculateTransferTax 결과의 결정세액
 * @param regularCgt 피상속인 원취득가액 기준 calculateTransferTax 결과의 결정세액
 * @param imputedAcquisitionPrice 산출된 의제 취득가액
 * @returns FamilyBusinessCgtDetail
 */
export function buildFamilyBusinessCgtDetail(
  fb: FamilyBusinessInheritanceTransferInput,
  imputedCgt: number,
  regularCgt: number,
  imputedAcquisitionPrice: number,
): FamilyBusinessCgtDetail {
  // §18의2⑩ single-source — credits/calcFamilyBusinessCgtCredit (산식·음수0 가드·breakdown 단일 진실).
  //   creditAmount = max(0, 의제 §97의2④ − 일반 §97). transfer·inheritance 도메인 동일 헬퍼 공유.
  const cgtCredit = calcFamilyBusinessCgtCredit(
    { cgtUnderSection97_2_4: imputedCgt, cgtUnderSection97: regularCgt },
    INH.FAMILY_BUSINESS_CGT_CREDIT,
  );

  return {
    imputedAcquisitionPrice,
    cgtUnderSection97_2_4: imputedCgt,
    cgtUnderSection97: regularCgt,
    creditAmount: cgtCredit.creditAmount,
    appliedRate: fb.fbDeductionAppliedRate,
    decedentAcquisitionPrice: fb.decedentAcquisitionPrice,
    inheritanceMarketValue: fb.inheritanceMarketValue,
    creditBreakdown: cgtCredit.breakdown,
  };
}

// ─── STEP 0.42 오케스트레이션 ────────────────────────────────

/**
 * STEP 0.42: 가업상속공제 §97의2④ 의제 취득가액 분기
 *
 * familyBusinessInheritance 미제공 시 즉시 null 반환 → skip (회귀 0건 보장).
 * 제공 시:
 *   1. 의제 취득가액 산출 (calcFamilyBusinessImputedAcquisitionPrice)
 *   2. 의제 취득가액으로 calculateTransferTax 재귀 호출 (familyBusinessInheritance 제거 — 무한루프 차단)
 *   3. 원취득가액으로 calculateTransferTax 재귀 호출 (일반 §97 산식)
 *   4. §18의2⑩ creditAmount = max(0, 의제 결정세액 − 일반 결정세액)
 *   5. 최종 결과: 의제 산식 결과 + familyBusinessDetail 첨부
 *
 * §97의2④ 본문 강제: selectedFormula enum 없음 — 의제 산식 그대로 적용.
 * 결과의 calculatedTax/determinedTax/totalTax = 의제 산식 기준.
 *
 * @param rawInput 원본 엔진 입력 (STEP 0~0.475 전처리 전)
 * @param processedInput STEP 0.45 이후 전처리 완료된 입력 (의제 취득가 override 기준점)
 * @param rates TaxRatesMap (세율 그대로 전달)
 * @param calcFn calculateTransferTax 주입 (순환 import 차단)
 * @returns 의제 산식 TransferTaxResult + familyBusinessDetail, 또는 null(미제공 시)
 */
export function applyFamilyBusinessCgtStep(
  rawInput: TransferTaxInput,
  processedInput: TransferTaxInput,
  rates: TaxRatesMap,
  calcFn: CalcFn,
): TransferTaxResult | null {
  const fb = rawInput.familyBusinessInheritance;
  if (!fb) return null;

  // 1. 의제 취득가액 산출 (소법 §97의2④)
  const imputedAcquisitionPrice = calcFamilyBusinessImputedAcquisitionPrice(
    fb.decedentAcquisitionPrice,
    fb.inheritanceMarketValue,
    fb.fbDeductionAppliedRate,
  );

  // 2. 의제 취득가액으로 재귀 호출 — familyBusinessInheritance 제거하여 무한루프 차단
  const inputWithoutFb: TransferTaxInput = { ...processedInput, familyBusinessInheritance: undefined };
  const imputedResult = calcFn(
    inputWithoutFb,
    rates,
    { acquisitionOverride: imputedAcquisitionPrice },
  );

  // 3. 상속개시일 평가액으로 재귀 호출 (일반 §97 산식)
  //    소득세법 시행령 §163⑨: 상속받은 자산의 §97①1호 취득가액 = 상속개시일 현재 평가액.
  //    (피상속인 원취득가액은 §97의2④의 의제취득가 산식 구성요소일 뿐 §97 기준가액이 아니다.)
  const regularResult = calcFn(
    inputWithoutFb,
    rates,
    { acquisitionOverride: fb.inheritanceMarketValue },
  );

  // 4. §18의2⑩ creditAmount 산출 + FamilyBusinessCgtDetail 조립
  const detail = buildFamilyBusinessCgtDetail(
    fb,
    imputedResult.determinedTax,
    regularResult.determinedTax,
    imputedAcquisitionPrice,
  );

  // 5. 의제 산식 결과에 familyBusinessDetail 첨부하여 반환
  return { ...imputedResult, familyBusinessDetail: detail };
}
