/**
 * 8년 이상 자경농지 양도소득세 감면 Pure Engine
 *
 * ## 두 규정은 «별개»다 — 층위가 다르다 (D7-06·D7-07·D7-08)
 *
 * **① 감면대상 토지에서 제외 — 조특령 §66④1호** (법 §69① **본문**의 「대통령령으로 정하는 토지」 위임)
 *   「**양도일 현재 특별시·광역시(광역시에 있는 군을 제외한다) 또는 시**{도농복합형태의 시의
 *    읍·면 지역 및 행정시의 읍·면 지역은 제외한다}**에 있는 농지중** … 주거지역·상업지역 및
 *    공업지역안에 있는 농지로서 이들 지역에 **편입된 날부터 3년이 지난 농지**.
 *    **다만, 다음 각 목의 어느 하나에 해당하는 경우는 제외한다.**
 *    가. 대규모개발사업지역 안에서 사업시행자의 단계적 사업시행 또는 보상지연으로 3년이 지난 경우
 *    나. 국가·지방자치단체·공공기관이 시행하는 개발사업지역 안에서 부득이한 사유에 해당하는 경우
 *    다. 편입 후 3년 이내에 대규모개발사업이 시행되고 단계적 시행·보상지연으로 3년이 지난 경우」
 *   ⇒ **소재지 요건과 단서 예외가 함께 성립해야** 배제된다. 둘 다 없이 3년만 보고 배제하면
 *     읍·면·군 소재 농지에 **법 근거 없이 불리하게** 감면을 상실시킨다.
 *
 * **② 부분감면 — 법 §69① 단서 + 조특령 §66⑦**
 *   「해당 토지가 **주거지역등에 편입**되거나 … 환지예정지 지정을 받은 경우에는 주거지역등에
 *    편입되거나, 환지예정지 지정을 받은 **날까지 발생한 소득**으로서 대통령령으로 정하는
 *    소득에 대해서만 … 감면한다」. 산식은 영 §66⑦
 *   (양도소득금액 × (편입일 기준시가 − 취득 기준시가) ÷ (양도 기준시가 − 취득 기준시가)).
 *   ⇒ 소재지 요건이 **없다**. 군 소재 농지도 편입되면 부분감면이다.
 *
 * ## 2002-01-01 기준선은 ②에만 걸린다
 *
 * §69① 단서는 **법률 제6538호**(시행 2002-01-01)로 신설됐고, 같은 법 **부칙 제28조①**이
 * 「이 법 시행 당시 … 주거지역·상업지역 또는 공업지역에 **편입**되거나 … 농지의 양도에 대한
 * 양도소득세의 면제에 관하여는 **제69조제1항 단서의 개정규정에 불구하고** 종전의 규정에
 * 의한다」로 경과조치를 뒀다 — **단서(=②)만** 배제한다.
 * ①(영 §66④1호)은 법 §69① **본문**의 위임이라 이 경과조치의 대상이 아니고, 조특령
 * 제정(대통령령 제15976호) 이후 278개 부칙 어디에도 이 3년 배제의 적용례·경과조치가 없다
 * (전수 probe). 인접 규정인 축사용지(영 §66의2③1호)·어업용 토지(§66의3③1호)·자경산지
 * (§66의4③1호)는 3년 배제 **신설 시** 「이 영 시행일을 편입된 날로 본다」 부칙을 뒀는데
 * 자경농지에는 그런 부칙이 없다 — 제정 시부터 있었다는 방향이다.
 * ⇒ **pre-2002 편입 농지에도 ①은 적용된다.** 종전에는 pre-2002 분기가 ①까지 건너뛰어
 *   전액 감면으로 조기반환했다(과다감면).
 *
 * 감면세액 자체(산출세액 × 감면대상소득/과세표준, 1억원 한도)는 호출 측에서
 * 본 함수가 반환한 `reducibleIncome`을 이용해 재계산한다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수.
 *
 * 근거 조문:
 *   - 조특법 §69① 본문 — 자경농지 100% 감면 / 단서 — 편입일까지 발생한 소득만 감면
 *   - 조특령 §66④1호 — 감면대상 토지 제외 (소재지 + 편입 후 3년 + 단서 가·나·다 예외)
 *   - 조특령 §66⑦ — 부분감면 산식
 *   - 조특법 §133 — 감면 종합한도 (1년 1억원)
 */

import { addYears } from "date-fns";
import { TRANSFER } from "./legal-codes";
import { safeMultiplyThenDivide } from "./tax-utils";

export interface SelfFarmingReductionInput {
  /**
   * 장기보유특별공제 후 양도소득금액 (원).
   * 합산 재계산의 분자 기준값. 음수·0일 경우 감면대상 0 처리.
   */
  transferIncome: number;
  /** 본인 자경기간 (년). 조특법 §69 요건(기본 8년) 미충족 시 상속 합산 경로 고려. */
  farmingYears: number;
  /** 피상속인 경작기간 (년) — 조특령 §66 ⑪ 1호 합산용. 선택. */
  decedentFarmingYears?: number;
  /** 요건 충족 최소 자경기간 (보통 8년) — rate-table의 selfFarmingRules.conditions.minFarmingYears */
  minFarmingYears: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;
  // ─── 편입 (조특령 §66④1호 배제 · 법 §69①단서 + 영 §66⑦ 부분감면) ───
  /** 주거·상업·공업지역 편입일. 미제공 시 편입 미발생 → 전액 감면 경로. */
  incorporationDate?: Date;
  /**
   * **양도일 현재** 농지 소재지 구분 — 조특령 §66④1호 본문의 소재지 요건.
   *
   * · `metro_or_city` : 특별시·광역시(광역시에 있는 군 **제외**) 또는 시
   *   (도농복합형태 시의 읍·면 지역, 행정시의 읍·면 지역은 **제외**)
   * · `gun_or_eup_myeon` : 위에 해당하지 않는 지역 — 3년 배제 **미적용**
   *
   * 편입일이 있는데 미제공이면 판정 불가로 처리한다(자동 fallback 금지 — ⑧이 선차단).
   */
  incorporationLocationType?: "metro_or_city" | "gun_or_eup_myeon";
  /**
   * 조특령 §66④1호 **단서 가·나·다목** 해당 여부 — true면 3년 배제에서 제외된다.
   * (대규모개발사업 단계적 시행·보상지연 / 국가·지자체·공공기관 시행 부득이한 사유 등)
   */
  hasIncorporationProvisoException?: boolean;
  /** 편입 지역 유형 — 현재 판정은 하지 않고 표시만. (시행령상 주거/상업/공업 3종) */
  incorporationZoneType?: "residential" | "commercial" | "industrial";
  /**
   * 취득 당시 기준시가 (원).
   * 총액 또는 ㎡당 단가 모두 허용되지만 **편입·양도시 값과 동일 단위**여야 한다.
   * 분자·분모를 함께 곱셈하므로 단위 상쇄.
   */
  standardPriceAtAcquisition?: number;
  /** 편입일 당시 기준시가 (원, 취득·양도와 동일 단위) */
  standardPriceAtIncorporation?: number;
  /** 양도 당시 기준시가 (원, 취득·편입과 동일 단위) */
  standardPriceAtTransfer?: number;
}

export interface SelfFarmingReductionResult {
  /** 감면 자격 충족 여부 (자경기간 미달이거나 3년 경과 시 false) */
  qualifies: boolean;
  /**
   * 감면대상 양도소득금액 (원).
   * 합산 재계산에서 `safeMultiplyThenDivide(calculatedTax, reducibleIncome, taxBase)`의 분자.
   */
  reducibleIncome: number;
  /** 감면비율 (0~1). 편입 없으면 1.0, 편입 부분감면이면 기준시가 증가분 비율. */
  reducibleRatio: number;
  /** 감면 불가분 양도소득금액 (= transferIncome - reducibleIncome) */
  nonReducibleIncome: number;
  /** 편입일 부분감면 발동 여부 */
  partialReductionApplied: boolean;
  /** 편입일로부터 3년 경과 후 양도로 감면 상실된 경우 true */
  incorporationGraceExpired: boolean;
  /** 법적 근거 조문 */
  legalBasis: string;
  /** 산식·판단 설명 (UI 표시·디버깅용) */
  breakdown: string[];
}

/**
 * 조특법 §69 + 시행령 §66 기반 감면대상 양도소득금액 산정.
 *
 * @param input - 양도소득금액·자경기간·편입일·기준시가 3점값
 * @returns 감면 자격·비율·감면대상소득·설명 텍스트
 *
 * 공식:
 *   if !incorporationDate || incorporationDate < 2002-01-01:
 *     reducibleIncome = transferIncome  (전액 감면 경로)
 *   elif transferDate > incorporationDate + 3년:
 *     qualifies = false, reducibleIncome = 0  (감면 상실)
 *   else:
 *     ratio = (편입시 기준시가 - 취득시 기준시가) / (양도시 기준시가 - 취득시 기준시가)
 *     reducibleIncome = transferIncome × ratio
 */
export function calculateSelfFarmingReduction(
  input: SelfFarmingReductionInput,
): SelfFarmingReductionResult {
  const breakdown: string[] = [];

  const effectiveFarmingYears =
    input.farmingYears + (input.decedentFarmingYears ?? 0);
  const meetsFarmingRequirement = effectiveFarmingYears >= input.minFarmingYears;

  if (!meetsFarmingRequirement) {
    return {
      qualifies: false,
      reducibleIncome: 0,
      reducibleRatio: 0,
      nonReducibleIncome: Math.max(0, input.transferIncome),
      partialReductionApplied: false,
      incorporationGraceExpired: false,
      legalBasis: TRANSFER.REDUCTION_SELF_FARMING,
      breakdown: [
        `자경기간 ${input.farmingYears}년` +
          (input.decedentFarmingYears
            ? ` + 피상속인 ${input.decedentFarmingYears}년 = 합계 ${effectiveFarmingYears}년`
            : "") +
          ` < 요건 ${input.minFarmingYears}년 → 감면 불가`,
      ],
    };
  }

  const transferIncome = Math.max(0, input.transferIncome);

  // 편입 미발생 → 조특령 §66④1호도 법 §69①단서도 걸리지 않는다 (전액 감면).
  if (!input.incorporationDate) {
    breakdown.push("편입일 없음 → 편입 미발생, 전액 감면");
    return {
      qualifies: true,
      reducibleIncome: transferIncome,
      reducibleRatio: 1,
      nonReducibleIncome: 0,
      partialReductionApplied: false,
      incorporationGraceExpired: false,
      legalBasis: TRANSFER.REDUCTION_SELF_FARMING,
      breakdown,
    };
  }

  const incorpISO = input.incorporationDate.toISOString().slice(0, 10);

  // ① 감면대상 토지 제외 — 조특령 §66④1호 (소재지 + 편입 후 3년 + 단서 가·나·다 예외).
  //    2002-01-01 기준선(법 §69①단서 경과조치)은 ②에만 걸리므로 이 게이트가 **앞**에 온다.
  //    3년이 지나지 않았으면 소재지·단서와 무관하게 배제가 성립하지 않으므로 묻지 않는다.
  const graceDeadline = addYears(input.incorporationDate, 3);
  if (input.transferDate > graceDeadline) {
    const graceISO = graceDeadline.toISOString().slice(0, 10);
    if (input.incorporationLocationType === undefined) {
      // 자동 fallback 금지 — 소재지를 모르면 배제 여부를 판정할 수 없다. ⑧이 선차단한다.
      breakdown.push(
        `편입일 ${incorpISO}부터 3년 경과일(${graceISO}) 이후 양도 — 양도일 현재 소재지 구분(특별시·광역시(군 제외)·시 / 그 밖의 지역)이 입력되지 않아 조특령 §66④1호 배제 여부를 판정할 수 없습니다.`,
      );
      return {
        qualifies: false,
        reducibleIncome: 0,
        reducibleRatio: 0,
        nonReducibleIncome: transferIncome,
        partialReductionApplied: false,
        incorporationGraceExpired: false,
        legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
        breakdown,
      };
    }
    if (input.incorporationLocationType !== "metro_or_city") {
      breakdown.push(
        "양도일 현재 소재지가 특별시·광역시(군 제외)·시가 아니므로 조특령 §66④1호의 3년 배제가 적용되지 않습니다.",
      );
    } else if (input.hasIncorporationProvisoException === true) {
      breakdown.push(
        "조특령 §66④1호 단서(가·나·다목 — 대규모개발사업 단계적 시행·보상지연, 공공기관 개발사업 부득이한 사유 등)에 해당하여 3년 배제에서 제외됩니다.",
      );
    } else {
      breakdown.push(
        `양도일 현재 특별시·광역시(군 제외)·시 소재 + 편입일 ${incorpISO}부터 3년 경과일(${graceISO}) 이후 양도 → 감면대상 토지에서 제외 (조특령 §66④1호)`,
      );
      return {
        qualifies: false,
        reducibleIncome: 0,
        reducibleRatio: 0,
        nonReducibleIncome: transferIncome,
        partialReductionApplied: false,
        incorporationGraceExpired: true,
        legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
        breakdown,
      };
    }
  }

  // ② 부분감면 — 법 §69①단서(법률 제6538호, 시행 2002-01-01) + 영 §66⑦.
  //    같은 법 부칙 제28조①: 시행 당시 이미 편입된 농지는 「단서의 개정규정에 불구하고
  //    종전의 규정에 의한다」 ⇒ pre-2002 편입은 부분감면 산식을 적용하지 않는다(전액 대상).
  const PROVISO_START = new Date("2002-01-01");
  if (input.incorporationDate < PROVISO_START) {
    breakdown.push(
      `편입일(${incorpISO})이 2002-01-01 이전 → 법 §69①단서 부분감면 미적용 (법률 제6538호 부칙 §28①), 전액 감면`,
    );
    return {
      qualifies: true,
      reducibleIncome: transferIncome,
      reducibleRatio: 1,
      nonReducibleIncome: 0,
      partialReductionApplied: false,
      incorporationGraceExpired: false,
      legalBasis: TRANSFER.REDUCTION_SELF_FARMING,
      breakdown,
    };
  }

  // 편입일 부분감면 — 기준시가 3점값 필요
  const stdAcq = input.standardPriceAtAcquisition ?? 0;
  const stdIncorp = input.standardPriceAtIncorporation ?? 0;
  const stdTransfer = input.standardPriceAtTransfer ?? 0;

  if (stdAcq <= 0 || stdIncorp <= 0 || stdTransfer <= 0) {
    // 기준시가 3점 중 하나라도 누락이면 재현 불가 — 보수적으로 감면 없음 처리 + 경고
    breakdown.push(
      "기준시가 3점값(취득·편입·양도) 중 누락 — 편입일 부분감면 비율 산정 불가. 전체 감면 0 처리.",
    );
    return {
      qualifies: false,
      reducibleIncome: 0,
      reducibleRatio: 0,
      nonReducibleIncome: transferIncome,
      partialReductionApplied: true,
      incorporationGraceExpired: false,
      legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
      breakdown,
    };
  }

  const denom = stdTransfer - stdAcq;
  if (denom <= 0) {
    // 양도시 기준시가 ≤ 취득시 기준시가 (기준시가 하락) → 감면대상 비율 0 처리 (가치 증가 없음)
    breakdown.push(
      `양도시 기준시가(${stdTransfer.toLocaleString()}) ≤ 취득시 기준시가(${stdAcq.toLocaleString()}) → 감면대상 비율 0`,
    );
    return {
      qualifies: true,
      reducibleIncome: 0,
      reducibleRatio: 0,
      nonReducibleIncome: transferIncome,
      partialReductionApplied: true,
      incorporationGraceExpired: false,
      legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
      breakdown,
    };
  }

  const numerator = Math.max(0, stdIncorp - stdAcq);
  const rawRatio = numerator / denom;
  // 기준시가 하락 후 회복 등 예외적 상황에서 비율 > 1이 되는 경우 1로 capping
  const ratio = Math.min(1, Math.max(0, rawRatio));

  // 감면대상 소득 (원 단위 절사)
  // 2026-07-29 정정(#591 감사 R7): `Math.floor(income × ratio)`는 중간 비율이 부동소수라
  //   곱이 정수인 입력에서도 1원 과소산정한다(379,247,040 × 7/10 = 265,472,928 정확값이
  //   float 경로에서는 265,472,927). 곱셈을 먼저 하는 `safeMultiplyThenDivide`로 정확값을 얻는다
  //   (memory `feedback_safemul_decimal_apportion_precision`).
  //   비율이 1로 capping된 경우(rawRatio > 1)에는 전액이므로 분수연산을 태우지 않는다.
  const reducibleIncome =
    ratio >= 1
      ? transferIncome
      : safeMultiplyThenDivide(transferIncome, numerator, denom);
  const nonReducibleIncome = transferIncome - reducibleIncome;

  breakdown.push(
    `편입일까지 비율 = (편입기준시가 ${stdIncorp.toLocaleString()} - 취득기준시가 ${stdAcq.toLocaleString()}) / (양도기준시가 ${stdTransfer.toLocaleString()} - 취득기준시가 ${stdAcq.toLocaleString()})`,
    `감면비율 = ${numerator.toLocaleString()} / ${denom.toLocaleString()} = ${(ratio * 100).toFixed(4)}%`,
    `감면대상 양도소득금액 = ${transferIncome.toLocaleString()} × ${(ratio * 100).toFixed(4)}% = ${reducibleIncome.toLocaleString()}`,
  );

  return {
    qualifies: true,
    reducibleIncome,
    reducibleRatio: ratio,
    nonReducibleIncome,
    partialReductionApplied: true,
    incorporationGraceExpired: false,
    legalBasis: `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
    breakdown,
  };
}
