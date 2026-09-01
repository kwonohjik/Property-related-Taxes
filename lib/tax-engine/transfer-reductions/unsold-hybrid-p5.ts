/**
 * P5 — §98 (세율 20% 선택) + 모드 2 N-way 주택수 제외 (2026-06-12)
 *
 * - §98 (모드 1): 거주자 · 미분양 국민주택 (국민주택규모 이하 + 서울 밖 + 시장 확인 + 최초 분양 +
 *   완공 후 타인 입주사실 없음 — 령 §98①·⑤) · 취득 ① 1995.11.1~1997.12.31 / ③ 1998.3.1~12.31
 *   (계약+계약금 포함, 2-트랙 자동) · 5년 이상 보유·임대 후 양도.
 *   효과 = ①1호 선택: 양도소득세 세율 20% 단일 (§104① 불구 — 누진·단기·중과 대체).
 *   ①2호 종합소득 합산은 범위 외 (UI 안내). 농특세 대상 아님 (농특세법 §2①2호 비열거).
 *   중과 배제 근거 = 소령 §167의3①**3호** (감면대상장기임대주택 — 5호 아님).
 * - 모드 2: 7개 조문 ②항(§98의2④·§98의3③·§98의5②·§98의6②·§98의7②·§98의8②·§99의2②) +
 *   §98 령②·⑥ + §99② — 감면주택 보유 중 다른 주택 양도 시 §89①3호 적용에서 감면주택을
 *   소유주택으로 보지 않음. 비과세 판정 주택수만 제외 — 중과 주택수 불변 (R-D 선례).
 *   §99②만 "다른 주택을 2007.12.31까지 양도"하는 경우 한정.
 */

import { addYears } from "date-fns";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import {
  ineligibleHybrid,
  toHybridDate,
  type HybridEvalContext,
  type ReductionLike,
  type UnsoldHybridIneligibleReason,
  type UnsoldHybridResult,
} from "./unsold-hybrid";

// UTC 자정 파싱
export const UNSOLD_98_TRACK1_FROM = new Date("1995-11-01");
export const UNSOLD_98_TRACK1_TO = new Date("1997-12-31");
export const UNSOLD_98_TRACK3_FROM = new Date("1998-03-01");
export const UNSOLD_98_TRACK3_TO = new Date("1998-12-31");
/** 법 §98①1호 — 양도소득세 세율 (§104① 불구) */
export const UNSOLD_98_FLAT_RATE = 0.2;
/** 5년 이상 보유·임대 */
export const UNSOLD_98_HOLDING_YEARS_MS = 5;

// ─────────────────────────────────────────────────────────────────
// §98 모드 1 evaluator
// ─────────────────────────────────────────────────────────────────

export interface Unsold98Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 매매계약일 (선택 — 계약+계약금 케이스) */
  contractDate?: Date;
  /** 거주자 (법①). 기본 true */
  isResident?: boolean;
  /** 국민주택규모 이하 확인 */
  isNationalScale?: boolean;
  /** 서울특별시 외 지역 소재 확인 (령①·⑤) */
  isOutsideSeoul?: boolean;
  /** 시장·군수·구청장 미분양 확인 (1995.10.31 / 1998.2.28 현재 — 령①1호·⑤1호) */
  isUnsoldConfirmed?: boolean;
  /**
   * 민간임대주택·공공임대주택이 아님 (령 §98①1호 괄호).
   *
   * 「사업계획승인을 얻어 건설하는 주택(「민간임대주택에 관한 특별법」 제2조에 따른
   * 민간임대주택과 「공공주택 특별법」 제2조제1호가목에 따른 공공임대주택을 제외한다.
   * **이하 이 조에서 같다**)」 — 괄호의 「이하 이 조에서 같다」가 조 전체에 미치므로
   * ⑤1호(1998.3.1~12.31 트랙)에도 동일하게 적용된다.
   */
  isNotRentalHousing?: boolean;
  /** 주택건설사업자로부터 최초 분양 + 완공 후 타인 입주사실 없음 (령①2호·⑤2호) */
  isFirstBuyerNoOccupancy?: boolean;
  /** 5년 이상 보유하면서 임대한 사실 확인 (법① — 임대 사실은 확인 토글, 보유는 일자 검증) */
  rentedFor5Years?: boolean;
}

function withinTrack(d: Date | undefined): boolean {
  if (d === undefined) return false;
  const t = d.getTime();
  return (
    (t >= UNSOLD_98_TRACK1_FROM.getTime() && t <= UNSOLD_98_TRACK1_TO.getTime()) ||
    (t >= UNSOLD_98_TRACK3_FROM.getTime() && t <= UNSOLD_98_TRACK3_TO.getTime())
  );
}

/** 만 5년 보유 여부 — 취득일 + 5년 당일 포함 (§99의3 isWithin5YearsCheck 경계 해석과 정합) */
function heldAtLeast5Years(acquisitionDate: Date, transferDate: Date): boolean {
  // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): `setFullYear`는 2/29 취득일에서
  //   존재하지 않는 날짜(2001-02-29)를 만들어 **3/1로 롤오버**시킨다. 그 결과 만료일이
  //   하루 뒤로 밀려 2001-02-28 양도가 부당하게 5년 미달로 거부됐다.
  //   민법 §160③ — 응당일이 없는 달은 **그 달의 말일**에 만료한다.
  //   date-fns `addYears`가 이 규칙대로 1996-02-29 + 5년 = 2001-02-28을 준다
  //   (코드베이스 관례 — `new-99-3`의 5년 판정도 date-fns를 쓴다).
  return transferDate.getTime() >= addYears(acquisitionDate, 5).getTime();
}

export function evaluateUnsold98(input: Unsold98Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98;
  const reasons: UnsoldHybridIneligibleReason[] = [];

  if (input.isResident === false) {
    reasons.push({
      code: "NOT_RESIDENT",
      message: "거주자가 아닌 경우 §98이 적용되지 않습니다 (법 ① 본문).",
      legalBasis,
    });
  }
  if (!withinTrack(input.acquisitionDate) && !withinTrack(input.contractDate)) {
    reasons.push({
      code: "OUT_OF_CONTRACT_PERIOD",
      message: "취득일(또는 시한 내 매매계약일)이 1995.11.1~1997.12.31 또는 1998.3.1~1998.12.31 취득기간 외입니다 (법 §98①·③).",
      legalBasis,
    });
  }
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "미분양 국민주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98①).",
      legalBasis,
    });
  } else if (!heldAtLeast5Years(input.acquisitionDate, input.transferDate)) {
    reasons.push({
      code: "HOLDING_PERIOD_SHORT",
      message: "5년 이상 보유·임대한 후 양도하는 경우에만 적용됩니다 — 보유기간이 5년 미만입니다 (법 §98①).",
      legalBasis,
    });
  }
  if (input.isNationalScale !== true) {
    reasons.push({
      code: "NOT_NATIONAL_SCALE",
      message: "국민주택규모 이하의 주택임이 확인되지 않았습니다 (조특령 §98①·⑤).",
      legalBasis: "조특령 §98①",
    });
  }
  if (input.isOutsideSeoul !== true) {
    reasons.push({
      code: "NOT_OUTSIDE_SEOUL",
      message: "서울특별시 외의 지역에 소재하는 주택임이 확인되지 않았습니다 (조특령 §98①·⑤).",
      legalBasis: "조특령 §98①",
    });
  }
  if (input.isUnsoldConfirmed !== true) {
    reasons.push({
      code: "NOT_UNSOLD_CONFIRMED",
      message: "시장·군수·구청장이 1995.10.31(1998.3.1 이후 취득분은 1998.2.28) 현재 미분양주택임을 확인한 주택이 아닙니다 (조특령 §98①1호·⑤1호).",
      legalBasis: "조특령 §98①1호",
    });
  }
  if (input.isNotRentalHousing !== true) {
    reasons.push({
      code: "RENTAL_HOUSING_EXCLUDED",
      message:
        "민간임대주택(민간임대주택에 관한 특별법 §2)·공공임대주택(공공주택 특별법 §2 1호 가목)이 아님이 확인되지 않았습니다 (조특령 §98①1호 괄호 — 이하 이 조에서 같다).",
      legalBasis: "조특령 §98①1호",
    });
  }
  if (input.isFirstBuyerNoOccupancy !== true) {
    reasons.push({
      code: "NOT_FIRST_BUYER",
      message: "주택건설사업자로부터 최초로 분양받고 완공 후 다른 자가 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98①2호·⑤2호).",
      legalBasis: "조특령 §98①2호",
    });
  }
  if (input.rentedFor5Years !== true) {
    reasons.push({
      code: "RENTAL_NOT_CONFIRMED",
      message: "5년 이상 보유하면서 임대한 사실이 확인되지 않았습니다 (법 §98① — 보유·임대 요건).",
      legalBasis,
    });
  }

  if (reasons.length > 0) return ineligibleHybrid("unsold_98", reasons, legalBasis, UNSOLD_98_FLAT_RATE, true);

  return {
    id: "unsold_98",
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years: false,
    effectCategory: "flat_rate_20",
    taxReductionRate: UNSOLD_98_FLAT_RATE,
    reductionAmount: 0,
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "within_5_years",
    formulaSteps: [
      {
        label: "세율 특례 — 양도소득세 세율 20% (§104① 불구)",
        value: 0,
        formula: "과세표준 × 20% 단일세율 (누진·단기·중과세율 대체 — 법 §98①1호). 종합소득 합산 방식(①2호) 선택은 종합소득세 신고에서 별도 검토",
      },
    ],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    ruralSurtaxExempt: true, // 감면세액 부재 — 농특세 미발생
    legalBasis,
  };
}

export function evaluateP5FromReduction(
  r: ReductionLike,
  ctx: HybridEvalContext,
): UnsoldHybridResult | undefined {
  if (r.type === "unsold_98") {
    return evaluateUnsold98({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: toHybridDate(r.contractDate98) ?? ctx.assetContractDate,
      isResident: (r.isResident98 as boolean | undefined) ?? true,
      isNationalScale: r.isNationalScale98 as boolean | undefined,
      isOutsideSeoul: r.isOutsideSeoul98 as boolean | undefined,
      isUnsoldConfirmed: r.isUnsoldConfirmed98 as boolean | undefined,
      isNotRentalHousing: r.isNotRentalHousing98 as boolean | undefined,
      isFirstBuyerNoOccupancy: r.isFirstBuyerNoOccupancy98 as boolean | undefined,
      rentedFor5Years: r.rentedFor5Years98 as boolean | undefined,
    });
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────
// 모드 2 N-way — 감면주택 보유 시 §89①3호 주택수 제외
// ─────────────────────────────────────────────────────────────────

export type SpecialHouseExclusionArticle =
  | "unsold_98"
  | "unsold_98_2"
  | "unsold_98_3"
  | "unsold_98_5"
  | "unsold_98_6"
  | "unsold_98_7"
  | "unsold_98_8"
  | "unsold_99_2"
  | "new_99";

export interface SpecialHouseExclusionInput {
  article: SpecialHouseExclusionArticle;
  /** 감면주택 취득일 (시한 판정 — D-1' 패턴: 양도 자산이 아닌 보유 감면주택 기준) */
  houseAcquisitionDate?: Date;
  /** 감면주택 매매계약일 (계약 기준 조문 — 계약+계약금 케이스) */
  houseContractDate?: Date;
  /** 해당 조문 본 요건 충족 확인 (상세 판정은 그 주택 양도 시 모드 1 입력) */
  requirementsConfirmed: boolean;
}

interface ExclusionWindow {
  label: string;
  windows: Array<[Date, Date]>;
  legalBasis: string;
  /** §99② — 다른 주택 양도시한 */
  transferDeadline?: Date;
}

const D = (s: string) => new Date(s);

export const SPECIAL_HOUSE_EXCLUSION_WINDOWS: Record<SpecialHouseExclusionArticle, ExclusionWindow> = {
  unsold_98: {
    label: "§98 미분양 국민주택",
    windows: [[D("1995-11-01"), D("1997-12-31")], [D("1998-03-01"), D("1998-12-31")]],
    legalBasis: "조특령 §98②·⑥",
  },
  unsold_98_2: {
    label: "§98의2 지방 미분양주택",
    windows: [[D("2008-11-03"), D("2010-12-31")]],
    legalBasis: "조특법 §98의2④",
  },
  unsold_98_3: {
    label: "§98의3 미분양주택",
    windows: [[D("2009-02-12"), D("2010-02-11")]],
    legalBasis: "조특법 §98의3③",
  },
  unsold_98_5: {
    label: "§98의5 수도권 밖 미분양주택",
    windows: [[D("2010-02-12"), D("2011-04-30")]],
    legalBasis: "조특법 §98의5②",
  },
  unsold_98_6: {
    label: "§98의6 준공후미분양주택",
    windows: [[D("2011-03-29"), D("2011-12-31")]],
    legalBasis: "조특법 §98의6②",
  },
  unsold_98_7: {
    label: "§98의7 미분양주택 (9억 이하)",
    windows: [[D("2012-09-24"), D("2012-12-31")]],
    legalBasis: "조특법 §98의7②",
  },
  unsold_98_8: {
    label: "§98의8 준공후미분양주택",
    windows: [[D("2015-01-01"), D("2015-12-31")]],
    legalBasis: "조특법 §98의8②",
  },
  unsold_99_2: {
    label: "§99의2 신축주택등",
    windows: [[D("2013-04-01"), D("2013-12-31")]],
    legalBasis: "조특법 §99의2②",
  },
  new_99: {
    label: "§99 신축주택 (IMF 1차)",
    windows: [[D("1998-05-22"), D("1999-12-31")]],
    legalBasis: "조특법 §99②",
    transferDeadline: D("2007-12-31"), // 다른 주택을 2007.12.31까지 양도하는 경우만
  },
};

export interface SpecialHouseExclusionEntryResult {
  article: SpecialHouseExclusionArticle;
  articleLabel: string;
  eligible: boolean;
  reason?: string;
  legalBasis: string;
}

export interface SpecialHouseExclusionResolution {
  entries: SpecialHouseExclusionEntryResult[];
  /** 적격 감면주택 수 — 비과세(§89①3호) 판정 주택수에서 차감 */
  excludedCount: number;
}

/**
 * 모드 2 — 보유 감면주택 N건 일괄 판정 (STEP 0.9 합류).
 * 비과세 판정 주택수만 제외 — 다주택 중과 주택수는 불변 (소령 §167의3 별개, R-D 선례).
 */
export function resolveSpecialHouseExclusions(
  exclusions: SpecialHouseExclusionInput[] | undefined,
  transferDate: Date,
): SpecialHouseExclusionResolution {
  if (!exclusions || exclusions.length === 0) return { entries: [], excludedCount: 0 };

  const entries: SpecialHouseExclusionEntryResult[] = exclusions.map((e) => {
    const w = SPECIAL_HOUSE_EXCLUSION_WINDOWS[e.article];
    const inWindow = (d: Date | undefined) =>
      d !== undefined && w.windows.some(([from, to]) => d.getTime() >= from.getTime() && d.getTime() <= to.getTime());

    if (w.transferDeadline && transferDate.getTime() > w.transferDeadline.getTime()) {
      return {
        article: e.article,
        articleLabel: w.label,
        eligible: false,
        reason: "§99②는 다른 주택을 2007.12.31까지 양도하는 경우에만 감면주택을 소유주택으로 보지 않습니다 — 양도일이 시한 이후입니다.",
        legalBasis: w.legalBasis,
      };
    }
    if (!e.houseAcquisitionDate && !e.houseContractDate) {
      return {
        article: e.article,
        articleLabel: w.label,
        eligible: false,
        reason: "감면주택의 취득일 또는 매매계약일이 입력되지 않았습니다 (취득기간 판정에 필요).",
        legalBasis: w.legalBasis,
      };
    }
    if (!inWindow(e.houseAcquisitionDate) && !inWindow(e.houseContractDate)) {
      return {
        article: e.article,
        articleLabel: w.label,
        eligible: false,
        reason: "감면주택의 취득일·매매계약일이 해당 조문의 취득기간 외입니다.",
        legalBasis: w.legalBasis,
      };
    }
    if (e.requirementsConfirmed !== true) {
      return {
        article: e.article,
        articleLabel: w.label,
        eligible: false,
        reason: "해당 조문의 본 요건(미분양 확인·최초계약·가액·면적 등) 충족이 확인되지 않았습니다.",
        legalBasis: w.legalBasis,
      };
    }
    return { article: e.article, articleLabel: w.label, eligible: true, legalBasis: w.legalBasis };
  });

  return { entries, excludedCount: entries.filter((x) => x.eligible).length };
}
