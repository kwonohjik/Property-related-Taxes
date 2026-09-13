/**
 * §94①4 다목 — **과점주주 특정주식 요건 게이트** (단일 소스)
 *
 * 법 §94①4 다목 + 영 §158①② 의 요건 셋을 한 곳에서 판정한다. ⑤ UI 배지·⑧ validate·
 * ⑫ Zod refine 이 **전부 이 함수를 부른다** — 손으로 쓴 사본을 한 곳이라도 남기면 판정이
 * 갈린다([[feedback_leaf_unification_leaves_one_handwritten_predicate]] ·
 * [[feedback_shared_predicate_argument_parity]]).
 *
 * ## 법령 — 요건은 셋이고 모두 AND 다
 *
 * > 법 §94①4 다목: 「법인의 자산총액 중 다음의 합계액이 차지하는 비율이 **100분의 50 이상**인
 * > 법인의 **과점주주**(…)가 그 법인의 주식등의 **100분의 50 이상**을 **해당 과점주주 외의
 * > 자에게 양도**하는 경우 … 에 해당 주식등」
 *
 * > 영 §158①: 「주주 1인과 주권상장법인기타주주 또는 주권비상장법인기타주주가 소유하고 있는
 * > 주식등의 합계액이 **해당 법인의 주식등의 합계액**의 100분의 50을 **초과**하는 경우」
 *
 * > 영 §158②: 「… 과점주주 외의 자에게 **여러 번에 걸쳐 양도**하는 경우로서 … **소급해 3년 내**에
 * > 과점주주가 양도한 주식등을 **합산해** 해당 법인의 주식등의 **100분의 50 이상**을 양도하는
 * > 경우에도 적용한다. 이 경우 … **합산하는 기간 중 최초로 양도하는 날 현재**의 해당 법인의
 * > 주식등의 합계액 또는 자산총액을 **기준으로** 한다.」
 *
 * | | 요건 | 임계 |
 * |---|---|---|
 * | ① | 자산총액 중 **부동산등** 비율 | `>= 0.5` (시기 불변) |
 * | ② | **과점주주** 소유비율 | **양도일 종속** — 아래 |
 * | ③ | **과점주주 외의 자**에게 양도한 누적 비율 + **소급 3년 창** | `>= 0.5` + 창 (시기 불변) |
 *
 * ## 🔴 요건②의 임계는 양도일로 갈린다
 *
 * - 양도일 `< 2020-02-11` → 「100분의 50 **이상**」(`>= 0.5`)
 * - 양도일 `>= 2020-02-11` → 「100분의 50을 **초과**」(`> 0.5`)
 *
 * 근거는 **대통령령 제30395호**(2020.2.11. 공포·시행) 부칙이다:
 *
 * > **§2(일반적 적용례)** ② 이 영 중 양도소득세에 관한 개정규정은 **이 영 시행 이후 양도하는
 * > 분**부터 적용한다.
 * > **§41(과점주주의 범위 등에 관한 경과조치)** 이 영 시행 **전에 주식을 양도한 분**에 대해서는
 * > **제158조제1항**의 개정규정에도 불구하고 **종전의 규정**에 따른다.
 *
 * ⇒ 행 선택 인자는 **양도일**이다 — `getMajorShareholderThreshold`(§157)와 같은 규약이고
 *   그쪽도 같은 개정령(§2②)을 근거로 쓴다([[feedback_transfer_year_tax_rate]]).
 * ⚠️ **요건①③은 바뀌지 않았다**(2018년본~현행 「이상」 동일) — 분기는 ②에만 건다.
 *
 * ## 단위·책임 경계
 *
 * 인자는 **0~1 소수**만 받는다. 폼은 `%` 문자열이라 **변환은 호출부 책임**이다 —
 * leaf 가 두 단위를 다 받으면 그 안에서 다시 갈라져 단일 소스가 무너진다.
 */

import type {
  BlockShareholderGateEcho,
  BlockShareholderRequirement,
} from "./types/stock-transfer.types";

/**
 * 영 §158① 요건② 임계가 「초과」로 바뀐 시행일 — 대통령령 제30395호.
 * 이 날 **당일 양도**는 「시행 이후」라 **신법(초과)** 이다(부칙 §41 은 「시행 **전에**」만 구법).
 */
export const BLOCK_SHAREHOLDER_OWNERSHIP_EXCLUSIVE_FROM = new Date("2020-02-11");

/** 요건①③ 임계 — 「100분의 50 **이상**」. 시기 불변. */
export const BLOCK_SHAREHOLDER_RATIO_THRESHOLD = 0.5;

/** 영 §158② — 합산 창 「소급해 **3년** 내」. */
export const BLOCK_SHAREHOLDER_AGGREGATION_YEARS = 3;

export interface BlockShareholderGateInput {
  /** 요건① — 자산총액 중 부동산등 비율 (0~1) */
  realEstateRatio?: number;
  /** 요건② — 주주1인 + 기타주주 소유비율 (0~1) */
  ownershipRatio?: number;
  /** 요건③ — 소급 3년 누적 양도비율 (0~1) */
  cumulativeTransferRatio?: number;
  /** 영 §158② — 합산기간 중 최초 양도일 */
  firstTransferDate?: Date;
  /** 최종 양도일 — 요건② 임계 행 선택 + 3년 창 기산점 */
  transferDate: Date;
}

/**
 * 요건② 임계가 **배타적(`> 0.5`)** 인가 — 양도일로 정한다.
 *
 * 🔑 UI·validate 도 이 함수를 불러 **문구**를 고른다(「50% 초과」 ↔ 「50% 이상」).
 *    문구를 손으로 적으면 시행일 경계에서 화면과 판정이 어긋난다.
 */
export function isOwnershipThresholdExclusive(transferDate: Date): boolean {
  return transferDate.getTime() >= BLOCK_SHAREHOLDER_OWNERSHIP_EXCLUSIVE_FROM.getTime();
}

/** 영 §158② 3년 창 안인가. 최초 양도일 미입력이면 **판정 불가**로 보고 false. */
export function isWithinAggregationWindow(
  firstTransferDate: Date | undefined,
  transferDate: Date,
): boolean {
  if (!firstTransferDate) return false;
  // 「**최초로** 양도하는 날」이 최종 양도일보다 뒤일 수는 없다 — 입력 오류를 통과시키지 않는다.
  if (firstTransferDate.getTime() > transferDate.getTime()) return false;
  const limit = new Date(transferDate);
  limit.setFullYear(limit.getFullYear() - BLOCK_SHAREHOLDER_AGGREGATION_YEARS);
  // 「소급해 3년 내」 — 정확히 3년 전 당일은 창 **안**이다(경계 포함).
  return firstTransferDate.getTime() >= limit.getTime();
}

/**
 * 법 §94①4다 + 영 §158①② — 세 요건 AND 판정.
 *
 * **미입력은 통과시키지 않는다.** 다목 토글 ON 은 사용자의 적극적 선언이므로, 요건 수치를
 * 요구하는 것이 맞다(⑧ validate·⑫ Zod 가 차단한다). 조용히 기타자산(불리)으로도,
 * 조용히 일반주식(유리)으로도 가면 안 된다([[feedback_no_silent_apportion_fallback]]).
 */
export function judgeBlockShareholderGate(
  input: BlockShareholderGateInput,
): BlockShareholderGateEcho {
  const failed: BlockShareholderRequirement[] = [];
  const exclusive = isOwnershipThresholdExclusive(input.transferDate);

  // 요건① — 부동산등 비율 50% 이상
  if (!(typeof input.realEstateRatio === "number" &&
        input.realEstateRatio >= BLOCK_SHAREHOLDER_RATIO_THRESHOLD)) {
    failed.push("real_estate_ratio");
  }

  // 요건② — 과점주주 소유비율. 임계가 양도일로 갈린다.
  const own = input.ownershipRatio;
  const ownOk =
    typeof own === "number" &&
    (exclusive
      ? own > BLOCK_SHAREHOLDER_RATIO_THRESHOLD
      : own >= BLOCK_SHAREHOLDER_RATIO_THRESHOLD);
  if (!ownOk) failed.push("ownership_ratio");

  // 요건③-a — 누적 양도비율 50% 이상
  if (!(typeof input.cumulativeTransferRatio === "number" &&
        input.cumulativeTransferRatio >= BLOCK_SHAREHOLDER_RATIO_THRESHOLD)) {
    failed.push("transfer_ratio");
  }

  // 요건③-b — 소급 3년 창. 비율과 **한 요건**이라 따로 통과시키지 않는다.
  if (!isWithinAggregationWindow(input.firstTransferDate, input.transferDate)) {
    failed.push("transfer_window");
  }

  const windowDays = input.firstTransferDate
    ? Math.round(
        (input.transferDate.getTime() - input.firstTransferDate.getTime()) / 86_400_000,
      )
    : undefined;

  return {
    passed: failed.length === 0,
    failed,
    measured: {
      realEstateRatio: input.realEstateRatio,
      ownershipRatio: input.ownershipRatio,
      cumulativeTransferRatio: input.cumulativeTransferRatio,
      ...(windowDays !== undefined ? { windowDays } : {}),
    },
    ownershipThresholdIsExclusive: exclusive,
  };
}

/** 요건별 한국어 라벨 — ⑧ validate 메시지·⑤ 배지 공용(문구 단일 소스). */
export const BLOCK_SHAREHOLDER_REQUIREMENT_LABEL: Record<
  BlockShareholderRequirement,
  string
> = {
  real_estate_ratio: "법인 자산총액 중 부동산등 비율 50% 이상 (법 §94①4 다목)",
  ownership_ratio: "과점주주 소유비율 (영 §158①)",
  transfer_ratio: "소급 3년 누적 양도비율 50% 이상 (영 §158②)",
  transfer_window: "합산기간 최초 양도일이 양도일로부터 소급 3년 내 (영 §158②)",
};
