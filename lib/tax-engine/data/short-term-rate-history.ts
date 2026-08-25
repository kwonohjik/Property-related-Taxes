/**
 * 단기보유·분양권 특례세율 — 시행일별 역사 데이터 (소득세법 §104①1호·2호·3호·4호).
 *
 * 🔴 **왜 필요한가** — 종전 `transfer-tax-rate-calc.ts`의 `shortTermFlatRate`는
 *    `input.transferDate`를 **한 번도 읽지 않고** 현행(2021-06-01 시행) 세율만 적용했다.
 *    같은 저장소가 §104⑦ 가산율은 `resolveSurchargeAddonRate`(`multi-house-surcharge-rate-history.ts`)로,
 *    §55① 누진표는 `loadFallbackTransferRates(targetDate)`로 **이미 양도일 축을 타는데**
 *    단기·분양권 세율만 축이 빠져 있었다. 수정신고·경정청구 화면과 다건 `taxYear`(min 2000)가
 *    과거 양도일을 정면으로 지원하므로 도달 가능한 결함이었다.
 *
 * ## 본문 실독 확인 (법제처 DRF `target=eflaw` + `MST` + `efYd`, 2026-08-25)
 *
 * | 시행일 | MST | 공포 | §104①1호 | 2호(1~2년) | 3호(1년 미만) | 4호 |
 * |---|---|---|---|---|---|---|
 * | 2005-01-01 | 66275 | 제7319호 | 누진표 직접 규정 | 40% | **2의2호** 50% | 2의3호 1세대3주택 60% |
 * | 2009-01-01 | 90470 | 제9270호 | §55① | 40% | **2의2호** 50% | 2의3호 1세대3주택 60% |
 * | 2010-01-01 | 98343 | 제9924호 | §55① | 40% | 50% | 1세대3주택 60% |
 * | 2012-01-01 | 115188 | 제10900호 | §55① | 40% | 50% | 1세대3주택 60% |
 * | 2014-01-01 | 149361 | 제12169호 | §55① | 40%[**주택·조합원입주권 제외**] | 50%(**주택·입주권 40%**) | 삭제 |
 * | 2016-01-01 | 165310 | 제12852호 | §55① | 〃 | 〃 | 삭제 |
 * | 2017-01-01 | 188354 | 제14389호 | §55① | 〃 | 〃 | 삭제 |
 * | 2018-01-01 | 199742 | 제15225호 | §55① | 〃 | 〃 | **조정대상지역 주택분양권 50%**(신설) |
 * | 2019-01-01 | 206312 | 제16104호 | §55① | 〃 | 〃 | 〃(단서 1종 추가) |
 * | 2020-01-01 | 212777 | 제16834호 | §55① | 〃 | 〃 | 〃 |
 * | 2021-01-01 | 224801 | 제17757호 | §55① | 〃 | 〃 | 〃 |
 * | 2021-06-01 | 224801 | 제17757호 | §55①(**분양권 60%**) | 40%[주택·입주권·**분양권 60%**] | 50%(주택·입주권·**분양권 70%**) | **삭제**\<2020.8.18\> |
 *
 * ⚠️ **경계는 2021-06-01이다** — 2021-01-01 시행본에는 분양권 60%/70% 문언이 **없다**(실독 확인).
 *    법률 제17477호(2020-08-18 공포)의 §104①1~3호 개정규정 시행일이 2021-06-01이기 때문이다.
 *    MST만으로 조회하면 그 MST의 **최신 시행일** 본문이 나와 2021-01-01을 2021-06-01로 오독한다 —
 *    반드시 `efYd`를 함께 넘길 것.
 *
 * ⚠️ **검증 구간은 2005-01-01 이후다.** 그 이전 양도분은 가장 오래된 tier(50%/40%)를 적용하되
 *    본문을 실독하지 않았다. 과거 양도 사안을 실제로 다루게 되면 그 시점 본문을 먼저 확인할 것.
 *
 * ## 범위 밖 (여기서 다루지 않는다)
 * - 2013-12-31 이전 「1세대 3주택 이상 60%」(구 2의3호·4호) — 다주택 중과의 전신이며
 *   현행 §104⑦ 축(`multi-house-surcharge-rate-history.ts`)과 별개 규정이다. 구현하려면
 *   그 시점 시행령의 주택 수 산정까지 함께 봐야 하므로 본 데이터에 넣지 않는다.
 * - §104①4호 단서 중 「조정대상지역 공고가 있은 날 이전에 매매계약 체결 + 계약금 수령」 —
 *   엔진 입력에 해당 사실이 없다. 「1세대가 보유한 주택이 없는 경우」 단서만 반영한다.
 */

/** 자산 분류 — §104①2호·3호의 괄호가 가르는 축. */
export type ShortTermAssetClass =
  /** 주택·조합원입주권 (§104①2호 괄호·3호 괄호의 「주택, 조합원입주권」) */
  | "housing_or_right"
  /** 분양권 (§88 10호). 2021-06-01 이후에만 주택·입주권과 같은 괄호에 들어간다. */
  | "presale_right"
  /** 그 밖의 §94①1호·2호 자산 (토지·건물·부동산에 관한 권리 등) */
  | "other";

/** 한 시행 구간의 세율 규칙. `null` = 특례세율 없음(§104①1호 §55① 누진). */
interface ShortTermRateTier {
  /** 시행일 (이 날짜 이상의 양도분에 적용) */
  from: string;
  /** 보유기간 1년 미만 (§104①3호) */
  under12: Record<ShortTermAssetClass, number | null>;
  /** 보유기간 1년 이상 2년 미만 (§104①2호) */
  under24: Record<ShortTermAssetClass, number | null>;
  /** 보유기간 2년 이상 (§104①1호 괄호 — 분양권 단일세율) */
  over24: Record<ShortTermAssetClass, number | null>;
  /**
   * §104①4호 — 조정대상지역 주택분양권 단일세율.
   * `null`이면 그 구간에 4호가 없다(삭제 또는 다른 내용).
   */
  regulatedPresaleRight: number | null;
}

/** 시행일 **내림차순** — 첫 매칭(transferDate >= from) 적용. */
export const SHORT_TERM_RATE_HISTORY: readonly ShortTermRateTier[] = [
  {
    // 법률 제17477호(2020-08-18 공포) §104①1~3호 개정규정 시행
    from: "2021-06-01",
    under12: { housing_or_right: 0.7, presale_right: 0.7, other: 0.5 },
    under24: { housing_or_right: 0.6, presale_right: 0.6, other: 0.4 },
    over24: { housing_or_right: null, presale_right: 0.6, other: null },
    regulatedPresaleRight: null, // 4호 삭제<2020.8.18>
  },
  {
    // 법률 제15225호(2017-12-19 공포) — §104①4호 신설(조정대상지역 주택분양권 50%)
    from: "2018-01-01",
    under12: { housing_or_right: 0.4, presale_right: 0.5, other: 0.5 },
    under24: { housing_or_right: null, presale_right: 0.4, other: 0.4 },
    over24: { housing_or_right: null, presale_right: null, other: null },
    regulatedPresaleRight: 0.5,
  },
  {
    // 법률 제12169호(2014-01-01 공포) — 2호에서 주택·조합원입주권 제외, 3호 괄호 40% 신설
    from: "2014-01-01",
    under12: { housing_or_right: 0.4, presale_right: 0.5, other: 0.5 },
    under24: { housing_or_right: null, presale_right: 0.4, other: 0.4 },
    over24: { housing_or_right: null, presale_right: null, other: null },
    regulatedPresaleRight: null, // 4호 삭제<2014.1.1>
  },
  {
    // 2005-01-01 ~ 2013-12-31 실독 구간 (2005·2009·2010·2012 시행본 동일 구조).
    // ⚠️ 2005-01-01 이전 양도분도 이 tier가 적용되나 본문 미검증 — 상단 주석 참조.
    from: "1990-01-01",
    under12: { housing_or_right: 0.5, presale_right: 0.5, other: 0.5 },
    under24: { housing_or_right: 0.4, presale_right: 0.4, other: 0.4 },
    over24: { housing_or_right: null, presale_right: null, other: null },
    regulatedPresaleRight: null,
  },
];

/** 분양권·단기 세율에 양도일 축이 도입된 개정의 시행일. 경계 테스트·주석에서 참조. */
export const PRESALE_RIGHT_60_PERCENT_START_DATE = "2021-06-01";

/** 본문 실독으로 확인한 가장 이른 시행일. 이보다 이른 양도분은 최고(最古) tier로 처리된다. */
export const SHORT_TERM_RATE_VERIFIED_FROM = "2005-01-01";

export interface ShortTermRateResolution {
  /** 적용 세율. `null` = 특례세율 없음 → §104①1호 §55① 누진세율. */
  rate: number | null;
  /** 적용 호 — 결과 표시·`RateClause` 매핑용. */
  clause: "104-1-1" | "104-1-2" | "104-1-3" | "104-1-4" | null;
  /** 적용 tier의 시행일 (디버깅·표시용) */
  tierFrom: string;
}

/**
 * 양도일·보유기간·자산분류에 해당하는 §104① 특례세율을 반환한다.
 *
 * 🔑 **`transferDate`가 유일한 시행일 축이다.** 취득일이 아니다 —
 *    §104①은 양도소득세 세율 규정이고 부칙도 「이 법 시행 후 양도하는 분부터 적용」 형식이다.
 *
 * @param transferDate 양도일
 * @param holdingMonthsTotal 보유기간(월). §104② 기산 특례가 반영된 값을 넘길 것.
 * @param assetClass 자산 분류
 * @param opts.isRegulatedArea 양도 당시 조정대상지역 여부 (§104①4호 판정용)
 * @param opts.householdHasNoHouse 1세대가 보유한 주택이 없는지 (§104①4호 단서)
 */
export function resolveShortTermRate(
  transferDate: Date,
  holdingMonthsTotal: number,
  assetClass: ShortTermAssetClass,
  opts?: { isRegulatedArea?: boolean; householdHasNoHouse?: boolean },
): ShortTermRateResolution {
  const tier =
    SHORT_TERM_RATE_HISTORY.find((t) => transferDate >= new Date(t.from)) ??
    SHORT_TERM_RATE_HISTORY[SHORT_TERM_RATE_HISTORY.length - 1];

  if (holdingMonthsTotal < 12) {
    return { rate: tier.under12[assetClass], clause: tier.under12[assetClass] === null ? null : "104-1-3", tierFrom: tier.from };
  }
  if (holdingMonthsTotal < 24) {
    return { rate: tier.under24[assetClass], clause: tier.under24[assetClass] === null ? null : "104-1-2", tierFrom: tier.from };
  }

  // 보유 2년 이상 — 1호 괄호(분양권 단일세율)가 먼저다.
  const over = tier.over24[assetClass];
  if (over !== null) return { rate: over, clause: "104-1-1", tierFrom: tier.from };

  // §104①4호 — 조정대상지역 주택분양권. 「1세대가 보유하고 있는 주택이 없는 경우」는 제외(단서).
  if (
    assetClass === "presale_right" &&
    tier.regulatedPresaleRight !== null &&
    opts?.isRegulatedArea === true &&
    opts?.householdHasNoHouse !== true
  ) {
    return { rate: tier.regulatedPresaleRight, clause: "104-1-4", tierFrom: tier.from };
  }

  return { rate: null, clause: null, tierFrom: tier.from };
}
