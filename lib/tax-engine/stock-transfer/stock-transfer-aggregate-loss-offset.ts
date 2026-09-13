/**
 * 다종목 합산 — **§102② 양도차손 통산** (영 §167의2①)
 *
 * §92②2호 「양도소득금액」 단계라 기본공제(§103)보다 **먼저** 온다. 이 파일은 STEP 1
 * (종목별 순수 소득금액 파악)과 STEP 1.5(통산)를 함께 들고 있다 — 통산의 입력이
 * STEP 1 의 `rawItems` 라 둘을 가르면 중간 산물만 오가게 된다.
 *
 * [800줄 정책] `stock-transfer-aggregate.ts`(777줄)에서 추출. 반환값은 호출부가
 * **구조분해로 받아** 하류 참조가 하나도 바뀌지 않는다([[feedback_800line_split_playbook]]).
 */

import type { StockTransferResult } from "./types/stock-transfer.types";
import {
  smeFlag,
  type AggregateStockItemInput,
} from "./foreign-stock-aggregate-adapter";
import { offsetLossesCore } from "@/lib/tax-engine/loss-offset-core";
import { resolveStockRateKey } from "./stock-transfer-rate-calc";
import { BASIC_DEDUCTION_LIMIT } from "./stock-transfer-aggregate-deduction";
import type { CalcOneFn } from "./stock-transfer-aggregate-each-item";

/** 그룹 코어 결과의 흡수 총액 — `lossOffset` echo 가 네 자리에서 쓴다. */
export const sumOffset = (o: ReturnType<typeof offsetLossesCore>) =>
  o.rows.reduce((s, row) => s + row.amount, 0);

export function runStockLossOffset(inputs: AggregateStockItemInput[], calcOne: CalcOneFn) {
  // STEP 1: 각 종목 기본공제 최대 소진으로 단건 계산 (순수 소득금액 파악)
  const rawItems = inputs.map((input) =>
    // 부동산 그룹은 이미 소진됨으로 처리 → 실질적 기본공제 0 (국외주식엔 해당 축이 없다)
    calcOne(input, { realEstateGroupBasicDeductionUsed: BASIC_DEDUCTION_LIMIT }),
  );

  // STEP 1.5: §102② 양도차손 통산 (영 §167의2①) — **§92②2호 「양도소득금액」 단계**라
  //           기본공제(§103)보다 **먼저** 온다.
  //
  // 🔑 통산은 **§102① 각 호별로만** 한다. 주식(2호)과 기타자산(1호)은 서로 통산하지 못하므로
  //    코어를 **그룹마다 따로** 돌린다. 하나로 합쳐 돌리면 영 §167의2①2호의 「다른 세율 pro-rata」가
  //    호 경계를 넘어버린다(§102①후단 「다른 호의 소득금액과 합산하지 아니한다」 위반).
  //
  // 🔑 **두 그룹을 각각 돌린다** (2026-09-12 — 종전에는 주식 그룹만 돌렸다).
  //    기타자산(§94①4호)은 §102①**1호** 그룹이고 주식(§94①3호)은 **2호** 그룹이다.
  //    §102②의 경계는 「각 호별로」 **하나뿐**이고 건수·자산종류에 관한 추가 조건이 없으므로,
  //    같은 호 안의 기타자산끼리도 통산은 **명문상 강제**다.
  //
  //    종전에 기타자산이 빠져 있던 것은 아래 `processItem`의 기타자산 분기가
  //    `calculateStockTransferTaxInternal`을 입력에서 다시 돌리는 구조라 통산 소득을 주입할
  //    자리가 없었기 때문이다. 그 분기를 주식과 **같은 패치 규약**으로 바꿔 함께 해소했다.
  //    ⚠️ **둘 중 하나만 고치면 아무것도 바뀌지 않는다** — 실측으로 확인했다(계획서 §3 M1).
  //
  //    범위 밖으로 남는 것: **부동산 ↔ 기타자산 크로스 통산**. 둘 다 §102①1호지만 엔진이
  //    분리돼 경로가 없다(`cross-engine-104-5-real-estate-other-asset.plan.md` §8).
  //
  // 계획서: docs/00-pm/stock-multi-asset-filing-loss-offset.plan.md §2 G-2 · §4.2
  const groupIdx = (g: StockTransferResult["basicDeductionGroup"]): number[] =>
    rawItems.map((r, i) => ({ r, i })).filter((x) => x.r.basicDeductionGroup === g).map((x) => x.i);

  /**
   * 「같은 세율을 적용받는 자산」(영 §167의2①1호) 축은 **호출자가 정한다**.
   * `resolveStockRateKey`가 주식 4축 + 기타자산 2축(§104①1호 `other_asset_progressive` /
   * §104①9호 `other_asset_progressive_nbl`)을 모두 준다 — 기타자산 2축은 §104⑤ 버킷
   * (`"104-1-1"` / `"104-1-9"`)과 **1:1**이다.
   *
   * 🔑 「같은 세율」은 **세율 «표»** 축이지 과세표준별 marginal rate가 아니다 — 부동산 정본
   * `RateGroup`이 `"progressive"`(6~45% 누진)를 한 그룹으로 두는 것과 같은 규약이다.
   */
  const runOffset = (idx: number[]) =>
    offsetLossesCore(
      idx.map((i) => ({
        income: rawItems[i].transferIncome,
        rateKey: resolveStockRateKey(
          rawItems[i].taxCategory,
          smeFlag(inputs[i]),
          rawItems[i].isShortTermHolding,
        ),
        exempt: rawItems[i].isExempt,
      })),
    );

  const stockIdx = groupIdx("stock");
  const otherAssetIdx = groupIdx("real_estate_and_other_asset");
  const stockOffset = runOffset(stockIdx);
  const otherAssetOffset = runOffset(otherAssetIdx);

  /** 통산 후 양도소득금액 — 그룹별 코어 결과로 갈아끼운다. */
  const offsetIncome: number[] = rawItems.map((r) => r.transferIncome);
  /**
   * 종목별 **흡수한 차손** — 영 §167의2①1호(같은 세율군) / 2호(다른 세율군 안분).
   *
   * 코어는 이 둘을 늘 계산하는데 종전에는 **총액만 쓰고 버렸다**. 그러면 결과 화면이
   * 「내 3번 종목이 얼마를 흡수했는가」를 설명하지 못한다 — 부동산 정본은 자산별로 보여준다
   * (`PerPropertyBreakdown.lossOffsetFromSameGroup` / `…FromOtherGroup`).
   *
   * ⚠️ **통산이 실제로 일어난 종목에만 싣는다**(`undefined` 유지). 0을 채우면 결과 화면이
   *   「0원 흡수」 행을 만들어 「통산 자체가 없음」과 구분되지 않는다.
   */
  const offsetFromSame: (number | undefined)[] = rawItems.map(() => undefined);
  const offsetFromOther: (number | undefined)[] = rawItems.map(() => undefined);

  const applyOffset = (idx: number[], core: ReturnType<typeof offsetLossesCore>) => {
    const touched = core.rows.length > 0;
    idx.forEach((globalIdx, localIdx) => {
      offsetIncome[globalIdx] = core.incomeAfterOffset[localIdx];
      if (!touched) return;
      offsetFromSame[globalIdx] = core.fromSame[localIdx];
      offsetFromOther[globalIdx] = core.fromOther[localIdx];
    });
  };
  applyOffset(stockIdx, stockOffset);
  applyOffset(otherAssetIdx, otherAssetOffset);

  /** 종목별 흡수액 echo — 통산이 없던 그룹이면 아무것도 싣지 않는다. */
  const lossOffsetEcho = (i: number) =>
    offsetFromSame[i] === undefined
      ? {}
      : {
          lossOffsetFromSameGroup: offsetFromSame[i],
          lossOffsetFromOtherGroup: offsetFromOther[i],
        };


  return {
    rawItems,
    stockIdx,
    stockOffset,
    otherAssetOffset,
    offsetIncome,
    lossOffsetEcho,
  };
}
