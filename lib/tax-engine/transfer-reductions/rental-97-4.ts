/**
 * 조특법 §97의4 — 장기임대주택 장기보유특별공제 추가율 (R-3 확정·활성)
 *
 * 효과: §95② 보유기간별 공제율에 임대기간별 추가율을 "가산" (§97의3의 대체와 다름).
 *       단, **§95② 단서**(대통령령으로 정하는 1세대1주택 = 표2) 해당 시 추가율을 가산하지
 *       않는다 (§97의4① 단서 — D2-01·D2-09 정정 2026-08-31).
 *
 *       🔴 종전 주석은 이 단서를 「§95① 단서(미등기 양도 등)」로 적었으나 **§95①에는 단서가
 *          없다**(한 문장). §97의4①의 「같은 항 단서」는 직전 지시어가 「같은 조 **제2항**」이므로
 *          §95② 단서이고, 그 내용은 미등기가 아니라 **1세대1주택 표2**다.
 *          (미등기 배제는 §95② **본문 괄호**(§104③)이고 `transfer-tax-lthd.ts`의 L-0가 처리한다.)
 *       판정·배제는 `transfer-tax-lthd.ts`의 §97의4 분기에서 `useTable2`로 수행한다.
 *
 * 요건 (law.go.kr 2026-06-11 현행 검증):
 * - ①: 민간건설·민간매입·공공건설·공공매입임대주택 중 소령 §167의3①2호가목·다목 장기임대주택을
 *       6년 이상 임대 후 양도 (비거주자 포함)
 * - 령 §97의4②: 임대기간 계산은 령 §97⑤1호·3호·5호 준용 — 사업자등록+임대사업자등록(또는
 *   공공주택사업자 지정)하고 임대하는 날부터 개시
 *
 * R-3 확정 (2026-06-11) → **원문 확보 (2026-09-14)**: 추가공제율 표는 별표가 아니라
 *   §97의4① **본문에 내장된 표**다. 「조세특례제한법」 §97의4①(MST 280409 · 시행 2026-01-01) 원문:
 *   「6년 이상 7년 미만 100분의 2 / 7년 이상 8년 미만 100분의 4 / 8년 이상 9년 미만 100분의 6 /
 *    9년 이상 10년 미만 100분의 8 / 10년 이상 100분의 10」
 *   ⇒ `RENTAL_97_4_ADDITIONAL_RATE_TABLE`과 완전 일치 — 수치 변경 0, 근거만 승격.
 *   🔴 종전 기재(「법 본문 내장 표가 법제처 API 응답 누락(별표 NOT_FOUND)으로 원문 직접 인용은
 *      추후 보강」)는 **오진**이었다. `get_law_text(jo="제97조의4")`가 표를 본문과 함께 그대로
 *      돌려준다 — 「별표 조회가 막혔다」는 이 조문에 해당하지 않는 사유였다.
 */

import { addDays, differenceInYears } from "../utc-date";
import { RENTAL_97_4_PERIOD, TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { MULTI_HOUSE, RENTAL_REGISTRATION_4HO, TRANSFER_RENTAL_HOUSING } from "../legal-codes";
import { aptDeadlineConfirmNotice } from "../rental-article/rules";
import { judgeRental974AptDeadline } from "./rental-97-4-apt-deadline";
import { checkReductionPeriod } from "./period-check";
import { toIsoDay } from "./rental-97-short-term-conversion";
import {
  calculateEffectiveRentalDays,
  rental97EffectiveStart,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  validateRentIncrease,
  validateRentIncreaseInterval,
  rentIntervalViolationsFromRuleDate,
  DEFAULT_JEONSE_CONVERSION_RATE,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result, RentalLthdEffect } from "./types";

/**
 * 임대기간별 추가공제율 표 (R-3 확정 — 사용자 제공 = 매핑 감사 기재값 일치).
 * [임대 연수 하한(이상), 추가율] — 6년 2% / 7년 4% / 8년 6% / 9년 8% / 10년 10%
 */
export const RENTAL_97_4_ADDITIONAL_RATE_TABLE: ReadonlyArray<readonly [number, number]> = [
  [10, 0.10],
  [9, 0.08],
  [8, 0.06],
  [7, 0.04],
  [6, 0.02],
] as const;

export const RENTAL_97_4_MANDATORY_YEARS = 6;

/** 임대 연수 → 추가공제율 (6년 미만 0) */
export function getRental974AdditionalRate(rentalYears: number): number {
  for (const [minYears, rate] of RENTAL_97_4_ADDITIONAL_RATE_TABLE) {
    if (rentalYears >= minYears) return rate;
  }
  return 0;
}

/** 소령 §167의3①2호 가목·다목 — 임대개시일 당시 기준시가 합계 한도 */
const STD_PRICE_CAP_DEFAULT = 600_000_000;
/** 가목 괄호 — 수도권 밖의 지역. 다목에는 이 분기가 없다. */
const STD_PRICE_CAP_NON_CAPITAL = 300_000_000;
/** 소령 §167의3①2호 가·다목 단서 — 「2018년 3월 31일까지 사업자등록등을 한 주택으로 한정」 */
const REGISTRATION_SUNSET = new Date("2018-03-31");
/** 그 단서의 시행일 (대통령령 제28637호). 이전 양도분에는 소급하지 않는다. */
const CLAUSE_SUNSET_EFFECTIVE_FROM = new Date("2018-04-01");
/**
 * 소령 §167의3①2호 가·다목 「임대보증금 또는 임대료의 연 증가율이 100분의 5를 초과하지 않는」 —
 * 대통령령 제29523호(2019.2.12)가 신설했다. 그 전 가·다목에는 임대료 요건이 없었다(2019.1.1 시행본 실독).
 * 같은 영 부칙 §6: 「이 영 시행 이후 주택 임대차계약을 체결하거나 기존 계약을 갱신하는 분부터 적용」.
 * ⇒ **비교 기준이 되는 직전 계약**이 이 날 이후 체결·갱신된 경우에만, 그 계약 대비 다음 계약의 증가율을
 *   따진다(사용자 확인 2026-11-01). 시행일 이후 첫 계약이 기준 임대료가 되며, 그 계약 자체의 증가율
 *   (시행 전 계약 대비)은 판정하지 않는다.
 *   ≠ §97의3·§97의5 — 그쪽은 처음부터 있던 요건이라 등록 당시 존속 계약이 기준이 될 수 있다
 *   (`rentViolationsFromRentalStart`).
 */
const RENT_CAP_RULE_CONTRACTS_FROM = new Date("2019-02-12");

export function evaluateRental974(input: Rental97EvaluationInput): Rental97Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.RENTAL_97_4;
  const reasons: Rental97IneligibleReason[] = [];

  // 0) 시한 — 등록 2014.1.1~
  const period = checkReductionPeriod("rental_97_4", input);
  if (!period.inPeriod) {
    reasons.push({
      code: "OUT_OF_PERIOD",
      message: period.failReason ?? "임대 등록 시한(2014.1.1~) 외",
      legalBasis,
    });
  }

  // 1) 필수 입력
  if (!input.registrationDate) {
    reasons.push({ code: "MISSING_REGISTRATION_DATE", message: "임대사업자 등록일이 입력되지 않았습니다 (조특령 §97의4②).", legalBasis });
  }
  if (!input.rentalStartDate) {
    reasons.push({ code: "MISSING_RENTAL_START", message: "임대개시일이 입력되지 않았습니다.", legalBasis });
  }
  if (!input.isTaxRegistered) {
    reasons.push({
      code: "TAX_REGISTRATION_REQUIRED",
      message: "세무서 사업자등록(소득세법 §168)이 확인되지 않았습니다 (조특령 §97의4②).",
      legalBasis: RENTAL_97_4_PERIOD.EFFECTIVE_START,
    });
  } else if (!input.taxRegistrationDate) {
    // §97의3·§97의5와 같은 축 — 사업자등록일이 늦으면 그날부터 임대 개시. 미입력을 추정하지 않는다.
    reasons.push({
      code: "MISSING_TAX_REGISTRATION_DATE",
      message:
        "세무서 사업자등록일이 입력되지 않았습니다 — 사업자등록일이 늦으면 그날부터 임대를 개시한 것으로 봅니다 (조특령 §97의4②).",
      legalBasis: RENTAL_97_4_PERIOD.EFFECTIVE_START,
    });
  }

  // 1-0) 상속받은 임대주택 — 조특령 §97의4② → 조특령 §97⑤3호 (피상속인 임대기간 합산)
  const inh = input.inheritance974;
  // 상속개시일이 양도일 뒤면 피상속인 분이 양도일까지 잘려 과대 산정된다 — 같은 사유로 막는다(독립 검토 2026-11-02).
  if (
    inh &&
    (inh.decedentRentalStartDate.getTime() >= inh.inheritanceDate.getTime() ||
      inh.decedentRegistrationDate.getTime() >= inh.inheritanceDate.getTime() ||
      inh.inheritanceDate.getTime() > input.transferDate.getTime())
  ) {
    reasons.push({
      code: "INVALID_INHERITANCE_DATES",
      message:
        "피상속인의 임대개시일·사업자등록등일은 상속개시일보다 앞서고, 상속개시일은 양도일 이전이어야 합니다 (조특령 §97⑤3호 — 피상속인 임대기간 합산).",
      legalBasis: RENTAL_97_4_PERIOD.INHERITANCE_MERGE,
    });
  }
  // 소령 §167의3①2호 가·다목 단서의 「사업자등록등」일 — 사업자등록·임대사업자등록이 **모두** 된 날(늦은 날).
  // 상속 주택은 피상속인 사업자등록등일로 본다(`inheritance974` 타입 주석 — 사용자 결정 2026-11-02).
  const sunsetBasisDate: Date | undefined = inh
    ? inh.decedentRegistrationDate
    : input.registrationDate && input.taxRegistrationDate
      ? new Date(Math.max(input.registrationDate.getTime(), input.taxRegistrationDate.getTime()))
      : input.registrationDate;

  // 1-1) 대상 요건 — 조특령 §97의4① → 소령 §167의3①2호 **가목·다목** (D2-04)
  //
  // 가목: 「민간임대주택법」 §2 3호 민간**매입**임대주택을 **1호 이상** 임대하고 있는 거주자가
  //       5년 이상 임대한 주택으로서, 주택+부수토지 기준시가 합계액이 **임대개시일 당시**
  //       **6억원(수도권 밖의 지역인 경우에는 3억원)** 을 초과하지 않을 것
  // 다목: 대지 298㎡ 이하·주택 연면적 149㎡ 이하 **건설**임대주택을 **2호 이상** 임대하는
  //       거주자가 5년 이상 임대하거나 분양전환하는 주택으로서, 같은 합계액이 임대개시일 당시
  //       **6억원**을 초과하지 않을 것 — ⚠️ 다목에는 「수도권 밖 3억」 괄호가 **없다**.
  //
  // ✅ 두 목의 단서 「2018년 3월 31일까지 사업자등록등을 한 주택으로 한정한다」 — D2-04 잔여 해소.
  //    신설 시기를 법제처 `target=eflaw` 연혁 조회로 특정했다(2026-08-31 실측):
  //    **대통령령 제28637호, 2018-04-01 시행**(부칙 §1 1호가 §167의3을 2018.4.1로 지정).
  //    같은 부칙에 §167의3 **적용례·경과조치는 없다** — 단서 자체가 시행일 전날까지를
  //    grandfathering하는 구조다.
  //    ⇒ **2018-04-01 이후 양도분**에만 적용한다. 그 전 양도는 단서가 없던 구 소령이 적용된다
  //      (행위시법 — 현행 소령을 과거 양도분에 소급하면 법 근거 없는 불리 적용).
  if (!input.rental974Category) {
    reasons.push({
      code: "MISSING_974_CATEGORY",
      message:
        "장기임대주택 유형(민간매입 1호 이상 / 건설임대 2호 이상)이 선택되지 않았습니다 " +
        "(조특령 §97의4① → 소령 §167의3①2호 가목·다목).",
      legalBasis: "소득세법 시행령 §167의3①2호",
    });
  } else {
    const isPurchase = input.rental974Category === "purchase_a";
    // 가목만 수도권 밖 3억 분기가 있다.
    const cap =
      isPurchase && input.region === "non_capital"
        ? STD_PRICE_CAP_NON_CAPITAL
        : STD_PRICE_CAP_DEFAULT;
    const std = input.officialPriceAtStart;
    if (std === undefined || std <= 0) {
      reasons.push({
        code: "MISSING_OFFICIAL_PRICE",
        message:
          "임대개시일 당시 주택+부수토지 기준시가 합계액이 입력되지 않았습니다 " +
          `(소령 §167의3①2호 ${isPurchase ? "가목" : "다목"} — 한도 판정에 필요합니다).`,
        legalBasis: "소득세법 시행령 §167의3①2호",
      });
    } else if (
      input.transferDate.getTime() >= CLAUSE_SUNSET_EFFECTIVE_FROM.getTime() &&
      sunsetBasisDate !== undefined &&
      sunsetBasisDate.getTime() > REGISTRATION_SUNSET.getTime()
    ) {
      reasons.push({
        code: "REGISTRATION_AFTER_2018_03_31",
        message:
          `${inh ? "피상속인의 " : ""}사업자등록등(세무서 사업자등록·임대사업자등록 중 늦은 날)이 2018.3.31 이후입니다 — 소령 §167의3①2호 ` +
          `${isPurchase ? "가목" : "다목"} 단서는 「2018년 3월 31일까지 사업자등록등을 한 주택」에 ` +
          "한정합니다 (대통령령 제28637호, 2018.4.1 시행).",
        legalBasis: "소득세법 시행령 §167의3①2호",
      });
    } else if (std > cap) {
      reasons.push({
        code: "OFFICIAL_PRICE_OVER_CAP",
        message:
          `임대개시일 당시 기준시가 합계 ${std.toLocaleString()}원 — ` +
          `한도 ${cap.toLocaleString()}원 초과 (소령 §167의3①2호 ${isPurchase ? "가목" : "다목"}). ` +
          "장기임대주택에 해당하지 않아 §97의4를 적용할 수 없습니다.",
        legalBasis: "소득세법 시행령 §167의3①2호",
      });
    }
  }

  // 1-2) 가목2) 아파트 양도기한 — 소령 §167의3①2호 가목2)(대통령령 제36737호, 2026.10.1. 시행): 종전 장기일반·단기
  //   민간임대주택 중 아파트(도시형 생활주택인 아파트 제외)를 임대하는 민간매입임대주택은 「제11항에 따른 기한까지
  //   양도할 것」. 기한 = 2027.12.31.과 ⑪ 각 호의 날 중 가장 늦은 날 — 판정은 중과·§155⑳와 같은 단일 함수.
  //   §97의4 가목 주택은 2018.3.31.까지 등록한 매입임대(단서 1))라 종전 장기일반(준공공 포함)·단기 중 하나다.
  //   다목(건설임대)에는 이 요건이 없다. 단서(사목 = 자진말소면 말소일부터 1년)와 ⑪1호(자동말소일) 연동은
  //   `judgeRental974AptDeadline` — ⑧과 같은 단일 판정.
  //   아파트 여부를 모르면 — 기한 안이면 결론과 무관, 기한을 넘겼으면 입력 누락으로 막는다.
  //   (아파트 여부를 모르면 ④가 ⑪ 연장 사실을 싣지 않는다 — 기한은 자동말소·자진말소 사실만으로 정해진다.)
  const voluntaryCancel =
    input.voluntaryCancelledDate974 && input.voluntaryCancelledDate974.getTime() <= input.transferDate.getTime()
      ? input.voluntaryCancelledDate974
      : undefined;
  if (input.rental974Category === "purchase_a" && input.isApartment974 !== false) {
    const verdict = judgeRental974AptDeadline(input.transferDate, {
      autoCancelledDate: input.autoCancelledDate974,
      voluntaryCancelledDate: voluntaryCancel,
      extension: input.aptDeadlineExtension974,
    });
    const saMok = verdict.saMokDeadline !== undefined;
    const deadlineLabel = saMok
      ? `${MULTI_HOUSE.LONG_TERM_RENTAL_VOLUNTARY_CANCEL_BASIS} 양도기한(자진말소일부터 1년)`
      : "소령 §167의3⑪ 기한(연장 사유가 없으면 2027.12.31.)";
    if (!verdict.within) {
      if (input.isApartment974 === undefined) {
        reasons.push({
          code: "MISSING_APARTMENT_974",
          message:
            `양도일이 ${deadlineLabel} 뒤입니다 — 아파트(도시형 생활주택 제외)인지 입력하세요. 아파트를 임대하는 민간매입임대주택은 ` +
            "소령 §167의3⑪에 따른 기한(사목에 해당하면 사목의 양도기한)까지 양도해야 가목 장기임대주택에 해당합니다 (소령 §167의3①2호 가목2)).",
          legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_167_3_11,
        });
      } else if (saMok) {
        reasons.push({
          code: "APT_TRANSFER_DEADLINE_PASSED",
          message:
            `임대사업자 등록을 자진말소(${RENTAL_REGISTRATION_4HO.VOLUNTARY_CANCELLATION})한 아파트 민간매입임대주택을 말소일부터 1년이 지난 뒤 양도했습니다 — ` +
            "소령 §167의3①2호 가목2) 단서 「해당 주택이 사목에 해당하는 경우에는 같은 목에 따른 양도기한을 적용한다」에 따라 " +
            `⑪ 기한(2027.12.31. 등) 대신 ${MULTI_HOUSE.LONG_TERM_RENTAL_VOLUNTARY_CANCEL_BASIS} 양도기한을 적용해 가목 장기임대주택에 해당하지 않는 것으로 계산했습니다(§97의4 적용 불가). ` +
            "자진말소한 주택은 1년이 지나도 ⑪ 기한으로 돌아가지 않는다고 읽었습니다 — 이 단서에 대한 정면 해석례를 찾지 못했습니다(확인 필요).",
          legalBasis: MULTI_HOUSE.LONG_TERM_RENTAL_VOLUNTARY_CANCEL_BASIS,
        });
      } else {
        reasons.push({
          code: "APT_TRANSFER_DEADLINE_PASSED",
          message:
            "아파트를 임대하는 민간매입임대주택을 소령 §167의3⑪에 따른 기한이 지난 뒤 양도했습니다 — 가목 장기임대주택에 " +
            "해당하지 않아 §97의4를 적용할 수 없습니다 (소령 §167의3①2호 가목2))." +
            verdict.pending.map((r) => " " + aptDeadlineConfirmNotice(r)).join(""),
          legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_167_3_11,
        });
      }
    }
  }

  // 2) 임대료 증액 제한 (소령 §167의3①2호 장기임대주택 요건)
  if (input.rentHistory && input.rentHistory.length >= 2) {
    // 5% 한도 — 직전(기준) 계약이 2019.2.12 이후 체결·갱신된 경우만 (RENT_CAP_RULE_CONTRACTS_FROM 주석)
    const capViolations = validateRentIncrease(
      input.rentHistory,
      input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE,
    ).violations.filter((v) => v.previousContractDate.getTime() >= RENT_CAP_RULE_CONTRACTS_FROM.getTime());
    if (capViolations.length > 0) {
      reasons.push({
        code: "RENT_INCREASE_VIOLATED",
        message:
          `임대료(환산보증금) 증액 5% 제한 위반 계약 ${capViolations.length}건 (소령 §167의3①2호). ` +
          "2019.2.12 이후 체결·갱신한 계약을 기준으로 다음 계약의 증가율을 판정합니다(대통령령 제29523호 부칙 §6).",
        legalBasis,
      });
    }
    // 소령 §167의3①2호 가·다목 괄호 — 계약·증액 후 1년 이내 재증액 금지 (§97의3·§97의5와 공용 헬퍼)
    const intervalAll = validateRentIncreaseInterval(
      input.rentHistory,
      input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE,
    ).violations;
    // 직전(기준) 계약이 2020.2.11 이후인 경우만 — 대통령령 제30395호 부칙 §16 (`RENT_INTERVAL_RULE_FROM` 주석)
    const intervalViolations = rentIntervalViolationsFromRuleDate(intervalAll);
    if (intervalViolations.length > 0) {
      reasons.push({
        code: "RENT_INCREASE_WITHIN_1_YEAR",
        message:
          `마지막 증액일(증액 전이면 첫 계약일)로부터 1년 이내에 임대료(환산보증금)를 올린 계약 ${intervalViolations.length}건 ` +
          "— 소령 §167의3①2호 「증액이 있은 후 1년 이내에는 하지 못하고」. 1년은 민법 기간 계산으로 다음 해 같은 날에 만료합니다. " +
          "2020.2.11 이후 체결·갱신한 계약을 기준으로 그 다음 증액을 판정합니다(대통령령 제30395호 부칙 §16).",
        legalBasis: "소득세법 시행령 §167의3①2호",
      });
    }
  } else if (input.rentIncreaseViolated === true) {
    reasons.push({ code: "RENT_INCREASE_VIOLATED", message: "임대료 증액 5% 제한 위반 이력이 신고되었습니다.", legalBasis });
  }

  // 3) 6년 이상 임대 + 추가율
  //
  // 기산일 — 조특령 §97의4② 「사업자등록과 … 임대사업자등록을 하거나 … 임대하는 날부터 임대를 개시한 것으로 본다」
  //   ⇒ 임대일·임대사업자 등록일·세무서 사업자등록일 중 **가장 늦은 날** (§97의3·§97의5와 같은 헬퍼).
  //   국세청 서면-2019-부동산-1090(2019.4.9.) — 「사업자등록과 … 임대사업자등록을 한 후 임대하는 날부터 계산」.
  //   종전에는 입력한 임대일을 그대로 써 등록 전 임대기간까지 셌다(리뷰 R-1 2026-11-02).
  // 종점 — 등록이 자동말소(민간임대주택에 관한 특별법 §6⑤)됐으면 그 날 (국세청 서면-2021-법규재산-1422, 2022.6.21.
  //   「임대개시일부터 자동말소일까지의 기간에 따라 산정」). 아니면 양도일. (리뷰 R-4)
  // 상속 — 조특령 §97⑤3호 준용: 피상속인 분 [피상속인 의제 개시일, 상속개시일]을 상속인 분에 일수로 더한다(리뷰 R-3).
  //   상속인 분은 상속개시일 전으로 거슬러 가지 않는다(그 전에는 상속인의 주택이 아니다).
  //   공실은 구간마다 잘라 판정한다 — 상속개시일을 걸친 공실은 두 조각으로 유예를 따로 본다(근거 조문 없음 — 구현 단순화).
  let eligibleRentalYears = 0;
  let rentalPeriod974: RentalLthdEffect["rentalPeriod974"];
  const ownStart = rental97EffectiveStart(input);
  if (ownStart) {
    // 자진말소(민특법 §6①11호)도 같은 종점 — 자동말소 해석(1422)을 유추했다(사용자 결정 2026-11-03 · 정면 해석례 없음).
    //   둘 다 오면(⑧이 막는다) 먼저 말소된 날.
    const autoCancel = input.autoCancelledDate974;
    const autoCancelApplies = autoCancel !== undefined && autoCancel.getTime() < input.transferDate.getTime();
    const voluntaryApplies =
      voluntaryCancel !== undefined &&
      voluntaryCancel.getTime() < input.transferDate.getTime() &&
      !(autoCancelApplies && autoCancel.getTime() <= voluntaryCancel.getTime());
    const endReason: "transfer" | "auto_cancel" | "voluntary_cancel" = voluntaryApplies
      ? "voluntary_cancel"
      : autoCancelApplies
        ? "auto_cancel"
        : "transfer";
    const end = voluntaryApplies ? voluntaryCancel : autoCancelApplies ? autoCancel : input.transferDate;
    const vacancies = input.vacancyPeriods ?? [];
    const heirStart = inh ? new Date(Math.max(ownStart.getTime(), inh.inheritanceDate.getTime())) : ownStart;
    let days = calculateEffectiveRentalDays(heirStart, end, vacancies, RENTAL_VACANCY_GRACE_MONTHS_97);
    let anchor = heirStart;
    let decedentSegment: { start: string; end: string } | undefined;
    if (inh) {
      const decStart = new Date(Math.max(inh.decedentRentalStartDate.getTime(), inh.decedentRegistrationDate.getTime()));
      const decEnd = new Date(Math.min(inh.inheritanceDate.getTime(), end.getTime()));
      days += calculateEffectiveRentalDays(decStart, decEnd, vacancies, RENTAL_VACANCY_GRACE_MONTHS_97);
      anchor = decStart;
      decedentSegment = { start: toIsoDay(decStart), end: toIsoDay(decEnd) };
    }
    // 일수 합 → 연수: 단일 구간이면 `calculateEffectiveRentalPeriod`와 같은 식(기산일 + 일수까지의 만 연수)이다.
    eligibleRentalYears = differenceInYears(addDays(anchor, days), anchor);
    rentalPeriod974 = {
      heir: { start: toIsoDay(heirStart), end: toIsoDay(end) },
      ...(decedentSegment ? { decedent: decedentSegment } : {}),
      endReason,
    };
    if (eligibleRentalYears < RENTAL_97_4_MANDATORY_YEARS) {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message:
          `임대기간 ${eligibleRentalYears}년 — 6년 이상 임대 요건 미달 (§97의4①). ` +
          "임대기간은 사업자등록·임대사업자등록 후 임대한 날부터 셉니다 (조특령 §97의4②)" +
          (endReason === "auto_cancel"
            ? " — 등록이 자동말소된 날까지만 셉니다."
            : endReason === "voluntary_cancel"
              ? " — 등록이 자진말소된 날까지만 셉니다(자동말소 해석 서면-2021-법규재산-1422 유추 · 확인 필요)."
              : "."),
        legalBasis,
      });
    }
  }

  if (reasons.length > 0) {
    return {
      id: "rental_97_4",
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "long_term_holding_additional",
    };
  }

  return {
    id: "rental_97_4",
    isEligible: true,
    legalBasis,
    effectCategory: "long_term_holding_additional",
    additionalRate: getRental974AdditionalRate(eligibleRentalYears),
    rentalGainRatio: 1, // §97의4는 임대기간 안분 규정 없음 — 전체 차익의 공제율에 가산
    eligibleRentalYears,
    ...(rentalPeriod974 ? { rentalPeriod974 } : {}),
  };
}
