/**
 * 묶음(함께 양도·축 B) × 부담부증여 — 결과 명세 카드·증여세 신고서용 물건 전체 §159 (M-0.5 · 표시 전용).
 *
 * `transfer-tax-aggregate.ts`(760줄 — 800줄 정책 위험구간)에서 분리했다.
 *
 * 카드는 채무가 지분·자산가액 비율로 안분된 info를 갖는다(§159의 B/C 보존). 그래서 카드별 breakdown을 합치면
 * **증여세가 쪼개져** 증여재산공제가 N번 차감되고 누진이 갈라진다(−19,400,000원 실측) — 증여세 쪽은 물건 전체로 1회 계산한다.
 * 세액에는 영향이 없다 — 양도세는 카드별 결과의 합이다.
 *
 * 다만 이 물건 전체 재계산은 의제취득일(1985.1.1.) 전 상속·증여 자산의 §159①1호 A(3자 max · 의제취득일 기준시가)를 모른다 —
 * STEP 0.45 결과는 카드마다 있다. 그런 카드가 있으면 취득가액 쪽은 **카드별 계산 결과의 합**으로 바꾸고 카드별 명세를 싣는다
 * (사용자 결정 Q-33 · 계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` D-1). 종전에는 시가 평가면 취득가액 0, 기준시가 평가면
 * 칸 값(등급 환산 전)으로 그렸다.
 */
import { buildBurdenedGiftBreakdown } from "./burdened-gift-apportionment";
import type { AggregateTransferInput } from "./types/transfer-aggregate.types";
import type { TransferTaxItemInput } from "./types/transfer-aggregate.types";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { TransferTaxResult } from "./types/transfer.types";

export function buildBundleBurdenedGiftWhole(input: AggregateTransferInput): TransferBurdenedGiftBreakdown | undefined {
  const info = input.burdenedGiftWholeInfo;
  if (!info) return undefined;
  return buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: info.landStdPriceAtTransfer,
    buildingStdPriceAtTransfer: info.buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition: info.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition: info.buildingStdPriceAtAcquisition,
    info,
    giftDate: input.burdenedGiftDate,
    // ⚠️ `ownershipRatio`를 **주지 않는다** — 물건 전체 기준이 이 계산의 존재 이유다.
  });
}

/**
 * 의제취득일 전 카드가 있으면 취득가액·개산공제를 카드별 결과 합으로 바꾸고 카드별 명세(`cards`)를 싣는다. 없으면 그대로.
 * 일반건물 부담부증여 × 이월과세에서 A(당초 증여자 기준)가 채택된 자산이 있어도 같이 바꾼다 — 물건 전체 재계산은 양도인 기준(B) 값이라
 * 결정세액(A)과 명세가 어긋난다(PR-1 · `gb-bg-carryover-share-bundled.plan.md` Q-4 a). 일반건물 파트 카드는 자산 명세(`gbAssetBurdenedGift`)를 자산당 1회 센다.
 * 카드 명세가 세액에 쓰인 값을 다 담을 때만 바꾼다 — 그렇지 않으면 「합 = 세액에 쓰인 값」이 거짓이 되므로 종전 그대로 둔다(기존 한계):
 *  · 명세가 없는 카드(자산 명세가 붙지 않은 일반건물 파트 카드 — 상세 산식 `DetailedStatementGbFormulas`도 물건 전체 명세의 슬롯을 읽는다)
 *  · 재개발·재건축 카드(§166 경로가 인가 후 분·청산금·§166③을 따로 계산해 §159 슬롯과 세액 취득가액이 다르다)
 */
export function withCardAcquisitions(
  whole: TransferBurdenedGiftBreakdown | undefined,
  records: ReadonlyArray<{
    item: Pick<TransferTaxItemInput, "propertyId" | "propertyLabel" | "gbAssetBurdenedGift">;
    result: Pick<TransferTaxResult, "transferBurdenedGiftBreakdown" | "redevelopmentDetail">;
  }>,
): TransferBurdenedGiftBreakdown | undefined {
  if (!whole) return whole;
  const counted = new Set<string>();
  const cards = records.flatMap((r) => {
    const gb = r.item.gbAssetBurdenedGift;
    if (gb) {
      if (counted.has(gb.assetId)) return [];
      counted.add(gb.assetId);
      return [{ propertyId: gb.assetId, label: gb.label, breakdown: gb.breakdown }];
    }
    return r.result.transferBurdenedGiftBreakdown
      ? [{ propertyId: r.item.propertyId, label: r.item.propertyLabel, breakdown: r.result.transferBurdenedGiftBreakdown }]
      : [];
  });
  if (!cards.some((c) => c.breakdown.preDeemed) && !records.some((r) => r.item.gbAssetBurdenedGift?.carryoverApplied)) return whole;
  if (
    records.some((r) => !r.item.gbAssetBurdenedGift && !r.result.transferBurdenedGiftBreakdown) ||
    records.some((r) => r.result.redevelopmentDetail !== undefined)
  )
    return whole;
  const sum = (pick: (b: TransferBurdenedGiftBreakdown) => number) => cards.reduce((s, c) => s + pick(c.breakdown), 0);
  return {
    ...whole,
    perAsset: {
      land: {
        ...whole.perAsset.land,
        acquisitionPrice: sum((b) => b.perAsset.land.acquisitionPrice),
        estimatedDeduction: sum((b) => b.perAsset.land.estimatedDeduction),
      },
      building: {
        ...whole.perAsset.building,
        acquisitionPrice: sum((b) => b.perAsset.building.acquisitionPrice),
        estimatedDeduction: sum((b) => b.perAsset.building.estimatedDeduction),
      },
    },
    cards,
  };
}
