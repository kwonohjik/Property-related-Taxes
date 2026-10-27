/**
 * 묶음(함께 양도·축 B) 부담부증여 명세 — 카드별 §159①1호 취득가액 행 (PR-7b-5 · 사용자 결정 Q-33).
 *
 * 엔진 M-0.5(`transfer-tax-aggregate-burdened-gift.ts`)는 의제취득일(1985.1.1.) 전 카드가 있으면 `cards`(카드별 §159 결과)를 싣고
 * 취득가액 합계를 그 합으로 바꾼다. 종전에는 물건 전체 재계산값(시가 평가면 0 · 기준시가 평가면 등급 환산 전 칸 값)을 그렸다.
 * 카드마다 산정 기준이 다를 수 있어(의제 3자 max · 의제취득일 기준시가 · 일반 방식) 카드별로 그린다 — 의제 3자 max 카드는 단건과 같은 행.
 *
 * 축 B(같은 물건 지분 분할)는 늘 카드별이다(계획서 `bg-axis-b-card-acquisition-sum.plan.md` Q-1 a · Q-3 a).
 *  · 일반 방식 카드는 근거 값 × 채무비율로 적는다. 카드 echo는 지분율을 곱한 값이라 지분 카드면 「(지분분)」을 붙인다.
 *  · 개산공제가 있으면 그 카드 아래 한 줄 — 물건 전체 한 줄 산식이 보이던 개산공제가 카드별 행으로 바뀌며 사라지지 않게 한다.
 *  · §166 카드(원조합원 입주권 등)의 §159 칸은 인가 전 분뿐이다 — 행 이름을 그렇게 부르고 신고서 취득가액을 따로 적는다(Q-2 a).
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
const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** 일반 방식 카드의 근거 값 이름과 금액(토지 + 건물) — 환산은 산식이 달라 근거를 적지 않는다. */
function basisOf(b: TransferBurdenedGiftBreakdown): { name: string; value: number } | undefined {
  const { land, building } = b.perAsset;
  switch (b.acquisitionMethodUsed) {
    case "actual":
      return { name: "실지취득가", value: (land.actualAcquisition ?? 0) + (building.actualAcquisition ?? 0) };
    case "appraisal":
      return { name: "감정가액", value: (land.presumedAcquisition ?? 0) + (building.presumedAcquisition ?? 0) };
    case "salesCase":
      return { name: "매매사례가액", value: (land.presumedAcquisition ?? 0) + (building.presumedAcquisition ?? 0) };
    case "standard_price":
      return { name: "취득시 기준시가", value: land.stdPriceAtAcquisition + building.stdPriceAtAcquisition };
    default:
      return undefined;
  }
}

export function BgBundleCardAcqRows({
  bg,
  methodLabels,
}: {
  bg: TransferBurdenedGiftBreakdown;
  methodLabels: Record<TransferBurdenedGiftAcquisitionMethodUsed, string>;
}) {
  const cards = bg.cards;
  if (!cards || cards.length === 0) return null;
  const hasRedevCard = cards.some((c) => c.redevFilingAcquisition !== undefined);
  return (
    <>
      {cards.map((c, i) => {
        const b = c.breakdown;
        const rate = `${(b.debtRatio * 100).toFixed(4)}%`;
        const share = b.ownershipRatio !== undefined ? "(지분분)" : "";
        const title =
          b.ownershipRatio !== undefined ? `자산 ${i + 1} (지분 ${pct(b.ownershipRatio)})` : `자산 ${i + 1}${c.label ? ` (${c.label})` : ""}`;
        const basis = b.preDeemed ? undefined : basisOf(b);
        const acqName = c.redevFilingAcquisition !== undefined ? "종전 부동산 취득가(인가 전 분)" : "취득가액";
        const est = b.perAsset.land.estimatedDeduction + b.perAsset.building.estimatedDeduction;
        const estRate = b.perAsset.building.estimatedDeductionRate ?? b.perAsset.land.estimatedDeductionRate;
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
                    : basis
                      ? `${acqName} = ${basis.name}${share} ${fmt(basis.value)} × 채무비율 ${rate}`
                      : `${acqName} (채무비율 ${rate})`}
                </td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(acqOf(b))}</td>
              </tr>
            )}
            {!b.preDeemed && estRate !== undefined && est > 0 && (
              <tr data-testid="bg-bundle-card-estimated-deduction">
                <td className="py-1 pr-2 pl-3">
                  개산공제 = 취득시 기준시가{share} {fmt(b.perAsset.land.stdPriceAtAcquisition + b.perAsset.building.stdPriceAtAcquisition)} × 채무비율{" "}
                  {rate} × 개산공제율 {(estRate * 100).toFixed(1).replace(/\.0$/, "")}%
                </td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(est)}</td>
              </tr>
            )}
            {c.redevFilingAcquisition !== undefined && (
              <tr data-testid="bg-bundle-card-redev-filing">
                <td className="py-1 pr-2 pl-3 text-caption text-fuchsia-700 dark:text-fuchsia-400">
                  신고서 취득가액 (인가 후 분·청산금 납부분 포함 — 「소득세법 시행령」 제166조 제1항 제1호)
                </td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(c.redevFilingAcquisition)}</td>
              </tr>
            )}
          </Fragment>
        );
      })}
      <tr className="border-t border-fuchsia-300 font-semibold" data-testid="bg-bundle-acquisition-total">
        <td className="py-1 pr-2 pl-3">
          {hasRedevCard ? "취득가액 합계 (카드별 계산 결과 — 원조합원 지분은 인가 전 분)" : "취득가액 합계 (카드별 계산 결과 — 세액에 쓰인 값)"}
        </td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(acqOf(bg))}</td>
      </tr>
    </>
  );
}
