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

import { applyRateFraction } from "./tax-utils";
import { isFamilyBusinessCgtEra } from "./data/family-business-cgt-era";
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
   *
   * 소법 §97의2④1호: "피상속인의 취득가액(**제97조제1항제1호에 따른 금액**)"
   *
   * ⚠️ §97①1호는 가목(취득에 든 **실지거래가액**)이 원칙이되, **"가목의 실지거래가액을 확인할
   *    수 없는 경우에 한정하여"** 나목(매매사례가액·감정가액·환산취득가액을 **순차** 적용)을 쓴다.
   *    ⇒ "실제 지출한 금액"으로 좁혀 읽으면 피상속인이 오래전 취득해 실거래가를 확인할 수 없는
   *    사안에서 나목 경로가 가려진다. (2026-08-11 정정 — 종전 주석이 그렇게 적혀 있었다.)
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
   *
   * **§97의2④1호의 base에 가산**되어 적용률 r이 곱해진다(계획서 Q7 = 안 B).
   * 근거: 자본적지출은 취득가액에 속하는 개념이고, §97의2**①**1호가 "취득할 **당시의**"로
   * 시점을 못박은 것과 달리 ④1호에는 시점 한정어가 없다.
   *
   * ⚠️ **해석례 미확보 상태의 채택이다**(국세법령정보시스템 실측 0건). 안 C(§97①2호 필요경비로
   *    **전액** 산입 — 적용률이 곱해지지 않는다)가 배제되지 않았다. 서면질의 회신이 C를 지지하면
   *    `calcFamilyBusinessImputedAcquisitionPrice`의 1항 base에서 빼고 필요경비 항으로 옮긴다.
   */
  decedentCapitalExpenditure?: number;
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
   *
   * **상속개시일 현재 평가액**을 취득가액으로 보고 계산한 양도세 결정세액이다
   * (「소득세법 시행령」 §163⑨ — 상속받은 자산의 취득가액). A21(2026-09-02) 정정:
   * 종전 주석의 「피상속인 원취득가액 기준」은 §97의2④1호(의제) 쪽 설명이었다.
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
   * 피상속인 자본적지출액 (원) — §97의2④1호 base에 가산되어 적용률이 곱해진다.
   *
   * A22(2026-09-02): 이 echo가 없어서 결과 카드가 「피상속인 원취득가액」·「상속개시일 자산
   * 평가액」 두 행만 찍으면서 **값은 자본적지출이 반영된 금액**을 표시했다 — 표 안의 세 숫자가
   * 서로 맞지 않았다(실측 괴리 80,000,000원 · capex 3억·r=0.6에서 180,000,000원).
   * 세액은 불변이고 표시 정합만의 문제다.
   */
  decedentCapitalExpenditure?: number;
  /**
   * §18의2⑩ 공제 산식 breakdown (single-source: credits/calcFamilyBusinessCgtCredit).
   * 의제세액·일반세액·공제액 3행. UI 결과 카드 표시용.
   */
  creditBreakdown?: Array<{ label: string; amount: number; lawRef?: string }>;
}

// ─── 핵심 헬퍼 함수 ──────────────────────────────────────────

/** 적용률 정수 basis — 소령 §163의2③ 산식은 나눗셈이라 소수 자릿수가 길 수 있다. */
const RATE_SCALE = 1_000_000;

/**
 * 소법 §97의2④ 의제 취득가액 산출
 *
 * 산식 (1호 + 2호):
 *   (피상속인 취득가액 + **피상속인 자본적지출**) × 적용률
 *   + 상속개시일 평가액 × (1 − 적용률)
 *
 * ## 피상속인 자본적지출을 1호 base에 넣는 이유 (계획서 Q7 = 안 B)
 *
 * 자본적지출은 취득가액에 속하는 개념이고(법인세법 시행령 §72), §97의2**①**1호가
 * "취득할 **당시의** §97①1호에 따른 금액"으로 시점을 못박은 것과 달리 **④1호에는 시점
 * 한정어가 없다**. ⇒ 1호 base에 가산해 **적용률이 곱해지도록** 한다.
 *
 * ⚠️ **해석례 미확보 상태의 채택이다.** 국세법령정보시스템 실측 0건이고, 안 C(§97①2호
 *    필요경비로 **전액** 산입 — 적용률이 곱해지지 않는다)를 배제할 결정적 근거는 없다.
 *    회신이 C를 지지하면 **이 가산을 여기서 빼고 필요경비 항으로 옮겨야 한다.**
 *    (anchor: `fb-lthd-95-4-latter.anchor.test.ts` M-4)
 *
 * ## 절사 — 잔액흡수가 아니라 문언대로
 *
 * 종전 구현은 2항을 `market − floor(market × r)`(잔액흡수)로 계산해 문언
 * `floor(market × (1−r))`보다 **1원 컸다**. 두 항의 base가 서로 달라 `Σ = 전체`
 * 불변식이 없으므로 잔액흡수를 쓸 자리가 아니다.
 *
 * `1 − rate`를 부동소수로 쓰면 안 된다(`1 − 0.8 = 0.19999999999999996` → 1원 과소).
 * 적용률을 **정수 basis로 정규화**한 뒤 `applyRateFraction`(BigInt overflow 가드)으로
 * 두 항을 각각 floor한다.
 *
 * @param decedentAcquisitionPrice 피상속인 원취득가액 (원) — §97①1호(실지거래가액. 확인 불가 시 매매사례·감정·환산 순차)
 * @param inheritanceMarketValue 상속개시일 현재 자산가액 (원)
 * @param fbDeductionAppliedRate 가업상속공제적용률 (0~1) — 소령 §163의2③
 * @param decedentCapitalExpenditure 피상속인 자본적지출액 (원, 기본 0)
 * @returns 의제 취득가액 (원)
 */
export function calcFamilyBusinessImputedAcquisitionPrice(
  decedentAcquisitionPrice: number,
  inheritanceMarketValue: number,
  fbDeductionAppliedRate: number,
  decedentCapitalExpenditure = 0,
): number {
  const rateNumer = Math.round(fbDeductionAppliedRate * RATE_SCALE);
  const decedentBase = decedentAcquisitionPrice + decedentCapitalExpenditure;
  const term1 = applyRateFraction(decedentBase, rateNumer, RATE_SCALE);
  const term2 = applyRateFraction(inheritanceMarketValue, RATE_SCALE - rateNumer, RATE_SCALE);
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
 * @param regularCgt 상속개시일 평가액(§163⑨) 기준 calculateTransferTax 결과의 결정세액
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
    // A22: 카드가 산식과 금액을 일치시키려면 base 구성요소가 전부 있어야 한다.
    ...(fb.decedentCapitalExpenditure
      ? { decedentCapitalExpenditure: fb.decedentCapitalExpenditure }
      : {}),
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
 * @param warnings 비차단 안내 수집 배열 — G-1 게이트 탈락 사유를 남긴다(A17)
 * @returns 의제 산식 TransferTaxResult + familyBusinessDetail, 또는 null(미제공 시)
 */
export function applyFamilyBusinessCgtStep(
  rawInput: TransferTaxInput,
  processedInput: TransferTaxInput,
  rates: TaxRatesMap,
  calcFn: CalcFn,
  warnings?: string[],
): TransferTaxResult | null {
  const fb = rawInput.familyBusinessInheritance;
  if (!fb) return null;

  // 0. G-1 시점 게이트 — 부칙 법률 제12169호 §12 "이 법 시행 후 **상속받아** 양도하는 분".
  //    기준일은 **상속개시일**이지 양도일이 아니다. 미충족 시 특례 전부 미적용(일반 §97 경로)
  //    — §95④ 후단도 함께 꺼진다(후단이 §97의2④1호의 적용률을 참조하므로).
  if (!isFamilyBusinessCgtEra(new Date(fb.inheritanceDate))) {
    /**
     * A17(2026-09-02): 게이트 결론(특례 미적용)은 법령상 옳지만 **사유가 어디에도 남지 않았다**.
     * `familyBusinessInheritance`는 이후 파이프라인에서 소비되지 않아 완전한 dead 입력이 되고,
     * ⑧도 시기를 보지 않으며 ⑤에도 G-1 안내가 없었다. 사용자는 5필드를 채우고 미리보기까지
     * 본 뒤 결과에서 그 특례가 왜 사라졌는지 알 수 없었다.
     * 같은 파일이 §95④ 후단을 `fbLthdLatter`로 따로 실어 보내는 것과 같은 층위로 처리한다.
     */
    warnings?.push(
      "가업상속공제 §97의2④ 의제 취득가액 특례 미적용 — 상속개시일이 2014.1.1. 전이라 「소득세법」 부칙(법률 제12169호) §12의 적용 대상이 아닙니다. 일반 §97 산식으로 계산되었습니다.",
    );
    return null;
  }

  // 1. 의제 취득가액 산출 (소법 §97의2④)
  const imputedAcquisitionPrice = calcFamilyBusinessImputedAcquisitionPrice(
    fb.decedentAcquisitionPrice,
    fb.inheritanceMarketValue,
    fb.fbDeductionAppliedRate,
    fb.decedentCapitalExpenditure ?? 0,
  );

  // 2. 재귀 호출용 입력 — familyBusinessInheritance 제거하여 무한루프 차단.
  //    §95④ 후단(LTHD 피상속인 기산)은 fb가 제거되므로 `fbLthdLatter`로 따로 실어 보낸다.
  //    ⚠️ **두 재귀(의제 §97의2④ · 일반 §97) 모두**에 실린다 — 상증령 §15㉑의 두 세액은
  //       다 "가업상속공제를 받고 양도하는 가업상속 재산"의 세액이고, 후단의 요건은
  //       "가업상속공제가 적용된 비율에 해당하는 자산"이지 §97의2④ 적용 여부가 아니다(계획서 Q2).
  const decedentAcqDate = processedInput.decedentAcquisitionDate;
  const inputWithoutFb: TransferTaxInput = {
    ...processedInput,
    familyBusinessInheritance: undefined,
    ...(decedentAcqDate
      ? {
          fbLthdLatter: {
            appliedRate: fb.fbDeductionAppliedRate,
            decedentAcquisitionDate: decedentAcqDate,
          },
        }
      : {}),
  };
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
