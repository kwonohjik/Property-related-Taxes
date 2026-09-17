/**
 * cross-102-2-loss-offset.ts — **부동산 ↔ 기타자산 §102② 크로스 차손 통산** (순수 계산)
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` §4 · §11 PR-3
 *
 * ## 왜 필요한가
 *
 * 「소득세법」 §102①**1호**는 §94①**1호·2호 및 4호**를 **한 호**에 담는다 — 부동산과 기타자산은
 * 같은 통산 그룹이다. §102②은 「각 호별로 **해당 자산 외의 다른 자산**에서 발생한 양도소득금액에서
 * 그 양도차손을 공제한다」고 하는데, 두 마법사가 분리돼 **그 「다른 자산」에 닿지 못했다**.
 * 실측 **86,845,000원 과대**(계획서 §3).
 *
 * ## 무엇을 하고 무엇을 하지 않나
 *
 * - **한다**: 두 엔진의 자산을 한 배열로 모아 `offsetLossesCore`를 **한 번** 돌린다.
 *   영 §167의2①(1호 같은 세율 → 2호 다른 세율 안분)은 코어가 이미 정확하다.
 * - **하지 않는다**: 기본공제 배분·세율 적용·§104⑤ 비교. 그것들은 크로스 통산 **뒤** 단계다.
 *
 * 🔑 **각 엔진이 자기 안에서 한 통산을 «덮어쓴다»** — 증분이 아니라 **전체 재계산**이다.
 *   `income`은 부동산·주식 모두 **통산 «전»** 값을 쓰므로(PR-2의 echo), 한 배열로 다시 돌리면
 *   엔진 내부 통산까지 포함한 올바른 답이 한 번에 나온다.
 *
 * ## ⛔ 호 간 통산은 차단한다
 *
 * 법 §102① 본문 후단: 「… 결손금은 **다른 호의 소득금액과 합산하지 아니한다**」.
 * 주식 그룹(§102①2호 = §94①3호) 자산은 **행 자체를 만들지 않는다** —
 * `crossLossOffsetRateKey`가 `null`을 돌려주는 것이 그 신호다.
 */
import { offsetLossesCore } from "@/lib/tax-engine/loss-offset-core";
import { crossLossOffsetRateKey } from "@/lib/tax-engine/cross-loss-offset-rate-key";
import { resolveStockRateKey } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 크로스 통산에 참여하는 자산 1건 */
export interface CrossLossAsset {
  source: "real_estate" | "other_asset";
  /** 표시·대조용 식별자 — 부동산은 `propertyId`, 기타자산은 고정 `"other-asset"` */
  id: string;
  label: string;
  /** **통산 «전»** 양도소득금액 (음수 가능) */
  income: number;
  /** 크로스 축으로 번역된 세율 키 */
  rateKey: string;
  exempt: boolean;
}

export type CrossLossRows =
  | { ok: true; rows: CrossLossAsset[] }
  | { ok: false; reason: string };

/**
 * 두 엔진 결과에서 크로스 통산 행을 만든다.
 *
 * 🔒 **자산별 데이터가 없으면 `ok: false`다 — throw 하지 않는다.**
 *   호출자는 통산을 **건너뛰고 현행 결과를 그대로** 쓴다(계획서 V-2 (b) · anchor C-9).
 *   같은 층의 선례가 `extractRealEstateSide`의 `{ ok, reason }`이다.
 */
export function buildCrossLossRows(
  realEstate: Pick<AggregateTransferResult, "properties"> | null | undefined,
  otherAsset: StockTransferResult | null | undefined,
): CrossLossRows {
  const props = realEstate?.properties;
  if (!Array.isArray(props) || props.length === 0) {
    return { ok: false, reason: "부동산 계산에 자산별 내역이 없어 크로스 통산을 건너뜁니다." };
  }
  if (!otherAsset) {
    return { ok: false, reason: "기타자산 계산 결과가 없어 크로스 통산을 건너뜁니다." };
  }
  // 기타자산(§94①4호)만 §102①1호 그룹이다. 주식 그룹이면 애초에 통산 대상이 아니다.
  if (otherAsset.basicDeductionGroup !== "real_estate_and_other_asset") {
    return {
      ok: false,
      reason: "주식(§94①3호)은 §102①2호라 부동산과 통산하지 않습니다(법 §102① 본문 후단).",
    };
  }

  const rows: CrossLossAsset[] = props.map((p) => ({
    source: "real_estate" as const,
    id: p.propertyId,
    label: p.propertyLabel,
    // 🔑 `income`은 **통산 전**이다(`transfer-aggregate.types.ts:175`). `incomeAfterOffset`을
    //    쓰면 엔진 내부 통산이 **두 번** 반영된다.
    income: p.income,
    rateKey: crossLossOffsetRateKey("real_estate", p.lossOffsetRateKey) ?? `x:re:${p.propertyId}`,
    exempt: p.isExempt,
  }));

  /**
   * 기타자산은 크로스 §104⑤ 경로가 **단건**으로 돌린다(`recalcOtherAsset` → 단건 API).
   * 그래서 행이 하나이고 `transferIncome`이 곧 통산 전 값이다(내부 통산이 없다).
   *
   * ⚠️ `resolveStockRateKey`의 2·3번 인자(중소기업·단기보유)는 **기타자산 분기에서 무시된다** —
   *   `other_asset_*` 4개 `case`가 그 둘을 보지 않는다. anchor C-5b가 그 사실을 고정한다.
   */
  const oaKey = crossLossOffsetRateKey(
    "other_asset",
    resolveStockRateKey(otherAsset.taxCategory, false, otherAsset.isShortTermHolding),
  );
  if (oaKey === null) {
    return { ok: false, reason: "기타자산의 세율축을 §102①1호 그룹으로 판정할 수 없습니다." };
  }
  rows.push({
    source: "other_asset",
    id: "other-asset",
    label: "기타자산",
    income: otherAsset.transferIncome,
    rateKey: oaKey,
    exempt: otherAsset.isExempt === true,
  });

  return { ok: true, rows };
}

export interface CrossLossAssetOutcome {
  id: string;
  source: CrossLossAsset["source"];
  label: string;
  /** 통산 전 */
  income: number;
  /** 이 자산이 흡수한 차손 (양수) */
  absorbed: number;
  /** 통산 후 (≥ 0) */
  incomeAfterOffset: number;
}

export interface CrossLossOutcome {
  /** **다른 엔진의 차손을 실제로 흡수했는가** — 하나라도 있으면 true */
  appliedAcrossEngines: boolean;
  assets: CrossLossAssetOutcome[];
  /** 공제하지 못하고 남은 차손 (양수) */
  unusedLoss: number;
}

/**
 * 한 배열로 모아 `offsetLossesCore`를 **한 번** 돌린다.
 *
 * `appliedAcrossEngines`는 「**출처가 다른** 자산 사이에 흡수가 있었는가」다 —
 * 부동산끼리만 통산된 경우는 각 엔진이 이미 하던 일이라 크로스로 볼 것이 없다.
 */
export function computeCrossLossOffset(rows: CrossLossAsset[]): CrossLossOutcome {
  const core = offsetLossesCore(
    rows.map((r) => ({ income: r.income, rateKey: r.rateKey, exempt: r.exempt })),
  );

  const assets: CrossLossAssetOutcome[] = rows.map((r, i) => ({
    id: r.id,
    source: r.source,
    label: r.label,
    income: r.income,
    absorbed: (core.fromSame[i] ?? 0) + (core.fromOther[i] ?? 0),
    incomeAfterOffset: core.incomeAfterOffset[i] ?? 0,
  }));

  // 코어의 행 단위 내역에서 「차손 자산」과 「흡수 자산」의 출처가 갈리는 건이 있는가.
  const sourceOf = new Map(rows.map((r, i) => [i, r.source]));
  const appliedAcrossEngines = core.rows.some(
    (row) => sourceOf.get(row.from) !== sourceOf.get(row.to),
  );

  return { appliedAcrossEngines, assets, unusedLoss: core.unusedLoss };
}
