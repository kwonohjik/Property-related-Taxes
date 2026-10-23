/**
 * 묶음(함께 양도·축 B) 부담부증여 명세 — 카드별 §159①1호 취득가액 행 (PR-7b-5 · 사용자 결정 Q-33).
 *
 * 엔진 M-0.5(`transfer-tax-aggregate-burdened-gift.ts`)는 의제취득일(1985.1.1.) 전 카드가 있으면 `cards`(카드별 §159 결과)를 싣고
 * 취득가액 합계를 그 합으로 바꾼다. 종전에는 물건 전체 재계산값(시가 평가면 0 · 기준시가 평가면 등급 환산 전 칸 값)을 그렸다.
 * 카드마다 산정 기준이 다를 수 있어(의제 3자 max · 의제취득일 기준시가 · 일반 방식) 카드별로 그린다 — 의제 3자 max 카드는 단건과 같은 행.
 */
import { Fragment } from "react";
import { BgPreDeemedThreeWayRows } from "@/components/calc/results/transfer/BgPreDeemedAcqRows";
import { BgPreDeemedPartsRows } from "@/components/calc/results/transfer/BgPreDeemedAcqRows";
import type {
  TransferBurdenedGiftAcquisitionMethodUsed,
  TransferBurdenedGiftBreakdown,
} from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const acqOf = (b: TransferBurdenedGiftBreakdown) => b.perAsset.land.acquisitionPrice + b.perAsset.building.acquisitionPrice;

export function BgBundleCardAcqRows({
  bg,
  methodLabels,
}: {
  bg: TransferBurdenedGiftBreakdown;
  methodLabels: Record<TransferBurdenedGiftAcquisitionMethodUsed, string>;
}) {
  const cards = bg.cards;
  if (!cards || cards.length === 0) return null;
  return (
    <>
      {cards.map((c, i) => {
        const b = c.breakdown;
        const rate = `${(b.debtRatio * 100).toFixed(4)}%`;
        const title = `자산 ${i + 1}${c.label ? ` (${c.label})` : ""}`;
        return (
          <Fragment key={c.propertyId}>
            <tr data-testid="bg-bundle-card" data-basis={b.preDeemed?.basis ?? b.acquisitionMethodUsed}>
              <td colSpan={2} className="py-1 pr-2 pl-3 text-caption font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                {title} —{" "}
                {b.preDeemed?.basis === "three_way"
                  ? "의제취득일 전 취득 · ①②③ 중 큰 금액"
                  : b.preDeemed?.basis === "three_way_parts"
                  ? "토지·건물별 — 의제취득일 전 파트는 ①②③ 중 큰 금액"
                  : b.preDeemed?.basis === "deemed_std"
                    ? "의제취득일 기준시가"
                    : methodLabels[b.acquisitionMethodUsed]}
              </td>
            </tr>
            {b.preDeemed?.basis === "three_way" ? (
              <BgPreDeemedThreeWayRows bg={b} />
            ) : b.preDeemed?.basis === "three_way_parts" ? (
              <BgPreDeemedPartsRows bg={b} methodLabels={methodLabels} />
            ) : (
              <tr data-testid="bg-bundle-card-acquisition">
                <td className="py-1 pr-2 pl-3">
                  {b.preDeemed?.basis === "deemed_std"
                    ? // 카드의 취득시 기준시가 슬롯 = 의제취득일 기준시가(지분 카드는 지분분 — echo `stdAtDeemed`는 물건 전체라 쓰지 않는다)
                      `취득가액 = 의제취득일(1985.1.1.) 기준시가 ${fmt(b.perAsset.land.stdPriceAtAcquisition + b.perAsset.building.stdPriceAtAcquisition)} × 채무비율 ${rate}`
                    : `취득가액 (채무비율 ${rate})`}
                </td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(acqOf(b))}</td>
              </tr>
            )}
          </Fragment>
        );
      })}
      <tr className="border-t border-fuchsia-300 font-semibold" data-testid="bg-bundle-acquisition-total">
        <td className="py-1 pr-2 pl-3">취득가액 합계 (카드별 계산 결과 — 세액에 쓰인 값)</td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(acqOf(bg))}</td>
      </tr>
    </>
  );
}
