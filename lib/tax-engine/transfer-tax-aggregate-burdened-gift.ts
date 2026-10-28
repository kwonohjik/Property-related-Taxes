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
import { redevSec166DisplayOf } from "@/lib/calc/redev-pre-approval-acq-mode";
import { bgRedevFiling } from "./burdened-gift-totals";
import { toTransferorBasisInfo } from "./transfer-tax-carryover-burdened-gift";

export function buildBundleBurdenedGiftWhole(input: AggregateTransferInput): TransferBurdenedGiftBreakdown | undefined {
  const given = input.burdenedGiftWholeInfo;
  if (!given) return undefined;
  /**
   * 이월과세 × 감정가액·매매사례가액: 당초 증여자 값은 `carryoverDonorBasis`에 있고 `presumed*`는 비어 있어 그대로 계산하면
   * 「감정가액을 입력해야 합니다」로 던진다(자산별 계산은 시나리오 A·B 치환을 거치지만 이 전체 재계산은 거치지 않는다).
   * 증여세 1회 계산이 목적이고 취득가액·필요경비는 `withCardAcquisitions`가 카드 합으로 덮으므로 양도인 기준(실지)으로 읽는다
   * (계획서 `bg-carryover-presumed-bundle-whole-400.plan.md` Q-1 a). 게이트 필수 — `toTransferorBasisInfo`는 이월과세 여부를 보지 않는다.
   */
  const info = given.carryoverDonorBasis ? toTransferorBasisInfo(given) : given;
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
 * 취득가액·개산공제를 카드별 결과 합으로 바꾸고 카드별 명세(`cards`)를 싣는다 — 부담부증여 묶음이면 언제나.
 * 물건 전체 재계산은 첫 지분·첫 물건의 취득 값(승계취득가액·실지·감정가액·매매사례가액·취득시 기준시가)만 알아, 지분이나 물건마다 그 값이
 * 다르면 표시가 세액과 갈린다(실측 승계 4억 + 6억 160,000,000 vs 200,000,000 · 일반건물 지분 감정가액 250,000,000 vs 290,000,000 ·
 * 함께 양도 시가 평가 125,000,000 vs 200,000,000). 의제취득일 전 상속·증여 자산의 §159①1호 A(3자 max · 의제취득일 기준시가)와 이월과세 A 채택도
 * 물건 전체 재계산이 모르는 값이다(계획서 `bg-bundle-card-acquisition-all.plan.md` Q-1 a · `bg-axis-b-card-acquisition-sum.plan.md` Q-1 a).
 * 일반건물 부담부증여 파트 카드는 자산 명세(`gbAssetBurdenedGift`)를 자산당 1회 센다.
 *
 * 재개발·재건축 지분·자산도 넣는다(Q-2 a) — 그 카드의 §159 슬롯은 인가 전 분이라 신고서 취득가액(`redevFilingAcquisition`)과
 * 신고서 필요경비의 분기별 구성(`redevFilingExpenses`)을 함께 싣고, 명세 카드가 둘을 구분해 그린다.
 *
 * 명세가 없는 카드가 하나라도 있으면 종전 그대로 둔다 — 그 카드의 값을 모르면 「합 = 세액에 쓰인 값」이 거짓이 되므로(예: 지분 결과 하나에
 * 명세가 없는 고가 지분 묶음).
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
    const filing = bgRedevFiling(r.result);
    const sec166 = redevSec166DisplayOf(r.result);
    return r.result.transferBurdenedGiftBreakdown
      ? [{
          propertyId: r.item.propertyId,
          label: r.item.propertyLabel,
          breakdown: r.result.transferBurdenedGiftBreakdown,
          ...(filing !== undefined ? { redevFilingAcquisition: filing.acquisition, redevFilingExpenses: filing.expenses } : {}),
          ...(sec166 !== undefined ? { redevSec166: sec166 } : {}),
        }]
      : [];
  });
  if (records.some((r) => !r.item.gbAssetBurdenedGift && !r.result.transferBurdenedGiftBreakdown)) return whole;
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
