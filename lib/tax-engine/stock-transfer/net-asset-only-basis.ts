/**
 * 순자산가치 **단독** 평가의 근거 — 단일 소스
 *
 * 영 §165④1호 가중평균(3:2 · 다목 2:3 · 80% 하한)을 비켜 순자산가치(같은 호 나목)만으로 평가하는 근거는 둘이다.
 *
 *  1. 영 §165④3호 각 목 — 사용자가 고르는 사유(`netAssetOnlyReason`). **양도일 연혁**이 있다
 *     (`isNetAssetOnlyReasonInEra` — ⑤ 선택지 · ⑧·⑫ 차단이 같은 술어를 부른다):
 *
 *     | 양도일 | 사유 | 근거(시행본 본문 — 법제처 DRF eflaw 전수 대조) |
 *     |---|---|---|
 *     | ~2007.2.27. | 없음 — §165④3호는 순손익액·순자산가액 정의 규정 | 2001.1.1.~2007.2.27. 시행본 |
 *     | 2007.2.28.~2023.2.27. | 가 · 나 · 다(3년 연속 결손) | 대통령령 제19890호 부칙 제3조 |
 *     | 2023.2.28.~ | 가 · 나 · 다(주식등 80% 이상) · 라(잔여 존속기한 3년 이내) | 제33267호 부칙 제9조 · 제23조(종전 다목 유지) |
 *
 *  2. **영 §165⑧1호 후단** — 「법 제94조제1항제4호라목에 따른 주식등이 법 제99조제1항제4호의 주식등에 해당하는
 *     경우에는 이 조 제4항제1호나목의 계산식에 따라 평가한 가액으로 한다」. 대통령령 제33267호(2023.2.28.) 신설,
 *     부칙 제9조 「이 영 시행일 이후 주식등을 양도하는 경우부터 적용」 ⇒ **양도일 2023-02-28 이후**.
 *
 * 2는 사용자가 따로 고르지 않는다 — 라목 토글(`isHeavyRealEstateForRate`)과 양도일만으로 정해지는 사실이다.
 * 엔진(양측·단측 평가 4곳)·④ 결산서 어댑터·⑤ 순손익 칸 노출·⑧·⑫ 순손익 필수 여부가 **이 함수 하나**를 부른다.
 * 한 층만 손으로 `netAssetOnlyReason`을 보면 «칸은 숨겼는데 검증이 요구하는»·«입력은 받았는데 엔진이 버리는»
 * 결함이 된다.
 *
 * 호출 범위: 이 함수는 §165④ 보충평가를 **하는 경로 안에서만** 부른다(비상장·기타자산·코스닥/코넥스 거래정지 —
 * 모두 법 §99①4의 주식등). 그래서 시장 구분을 다시 보지 않는다.
 *
 * 다목·라목 동시 성립(Q-2): 라목이 켜져 있으면 단독이다 — 후단이 「라목에 해당하는 경우」를 따로 정한 특칙이라
 * §165④1호 괄호(다목 2:3)보다 앞선다고 본다. 명문·해석례는 없다(계획서 §10-4).
 *
 * 계획서: docs/00-pm/stock-165-8-1-ra-net-asset-only.plan.md
 */

import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { WEIGHTED_MODEL_EFFECTIVE } from "./valuation-165-4-basis";
import type { StockTransferInput } from "./types/stock-transfer.types";

/**
 * 영 §165⑧1호 후단 적용 개시 양도일 — 대통령령 제33267호 부칙 제9조.
 * 같은 조가 §165④3호 다목(개정)·라목(신설)의 개시일이기도 하다(`isNetAssetOnlyReasonInEra`).
 */
export const RA_MOK_NET_ASSET_ONLY_EFFECTIVE = new Date("2023-02-28");

type NetAssetOnlyReason = NonNullable<StockTransferInput["netAssetOnlyReason"]>;

/**
 * 영 §165④3호 사유가 **양도일에** 있던 사유인가. 사유 없음·양도일 미상이면 판정하지 않는다(true) —
 * 날짜 오류는 다른 검증이 내고, 임의 기준일로 판정하면 잘못된 시기의 법을 적용한다.
 *
 * - 사유 신설(가·나·구 다목): 대통령령 제19890호(2007.2.28.) 부칙 제3조 — 그 전(max 산식 구간)에는 사유가 없다.
 * - 다목 개정·라목 신설: 제33267호 부칙 제9조. 그 전 양도분은 부칙 제23조로 **종전 다목(3년 연속 결손)**.
 */
export function isNetAssetOnlyReasonInEra(reason: NetAssetOnlyReason | undefined, transferDate: Date | undefined): boolean {
  if (!reason || !transferDate || Number.isNaN(transferDate.getTime())) return true;
  const ts = transferDate.getTime();
  if (ts < WEIGHTED_MODEL_EFFECTIVE.getTime()) return false;
  const post2023 = ts >= RA_MOK_NET_ASSET_ONLY_EFFECTIVE.getTime();
  switch (reason) {
    case "liquidation_or_owner_death":
    case "no_business_or_short_or_closed":
      return true;
    case "consecutive_loss_3y":
      return !post2023;
    case "stock_holding_company":
    case "remaining_term_under_3y":
      return post2023;
  }
}

export type NetAssetOnlyBasis =
  | NonNullable<StockTransferInput["netAssetOnlyReason"]>
  | "ra_mok_heavy_real_estate";

export interface NetAssetOnlyFacts {
  netAssetOnlyReason?: StockTransferInput["netAssetOnlyReason"];
  /** 법 §94①4 라목 (부동산과다보유법인) */
  isHeavyRealEstateForRate?: boolean;
  transferDate?: Date;
}

/** 영 §165⑧1호 후단이 적용되는가 — 라목 ∧ 양도일 2023-02-28 이후 */
export function isRaMokNetAssetOnly(f: Pick<NetAssetOnlyFacts, "isHeavyRealEstateForRate" | "transferDate">): boolean {
  if (f.isHeavyRealEstateForRate !== true) return false;
  if (!f.transferDate || Number.isNaN(f.transferDate.getTime())) return false;
  return f.transferDate.getTime() >= RA_MOK_NET_ASSET_ONLY_EFFECTIVE.getTime();
}

/**
 * 순자산 단독의 근거 — 없으면 `undefined`(가중평균).
 * 사용자가 고른 §165④3 사유가 있으면 그것을 echo한다(값은 같은 단독이다).
 */
export function resolveNetAssetOnlyBasis(f: NetAssetOnlyFacts): NetAssetOnlyBasis | undefined {
  if (f.netAssetOnlyReason) return f.netAssetOnlyReason;
  return isRaMokNetAssetOnly(f) ? "ra_mok_heavy_real_estate" : undefined;
}

/** 근거별 법령 인용 */
export function netAssetOnlyRuleRef(basis: NetAssetOnlyBasis): string {
  switch (basis) {
    case "liquidation_or_owner_death":
      return STOCK.ENFORCEMENT_DECREE_165_4_3_GA_LIQUIDATION;
    case "no_business_or_short_or_closed":
      return STOCK.ENFORCEMENT_DECREE_165_4_3_NA_PRE_BUSINESS;
    case "consecutive_loss_3y":
      return STOCK.ENFORCEMENT_DECREE_165_4_3_DA_CONSECUTIVE_LOSS_PRE2023;
    case "stock_holding_company":
      return STOCK.ENFORCEMENT_DECREE_165_4_3_DA_HOLDING_CO;
    case "remaining_term_under_3y":
      return STOCK.ENFORCEMENT_DECREE_165_4_3_RA_REMAINING_3Y;
    case "ra_mok_heavy_real_estate":
      return STOCK.ENFORCEMENT_DECREE_165_8_1_RA_NET_ASSET_ONLY;
  }
}

/**
 * 화면·결과뷰 표기용 근거 라벨. echo 값(`valuationDetail.netAssetOnlyReason`)을 그대로 받는다.
 * 라목 후단만 따로 표기하고 나머지는 종전 표기(§165④3)다.
 */
export function netAssetOnlyCitationLabel(basis: string | undefined): string {
  return basis === "ra_mok_heavy_real_estate" ? "§165⑧1호 후단" : "§165④3";
}
