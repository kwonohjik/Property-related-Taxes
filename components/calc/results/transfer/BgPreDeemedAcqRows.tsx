/**
 * 부담부증여 결과 — 의제취득일(1985.1.1.) 전 상속·증여 자산의 §159①1호 A 행 (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18).
 * 엔진 echo `preDeemed`를 그대로 그린다. 시가 평가(Q-24)는 ①②③ 비교와 채택값 × 채무비율, 기준시가 평가(Q-25)는 의제취득일 기준시가 안내.
 */
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function BgPreDeemedThreeWayRows({ bg }: { bg: TransferBurdenedGiftBreakdown }) {
  const p = bg.preDeemed;
  if (!p || p.basis !== "three_way") return null;
  const mark = (key: "reported" | "sec164" | "converted") => (p.selected === key ? " ← 채택" : " (미적용 — 더 작은 금액)");
  const acquisition = bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice;
  const rate = `${(bg.debtRatio * 100).toFixed(4)}%`;
  return (
    <>
      {p.reported != null && (
        <tr data-testid="bg-pre-deemed-candidate" data-candidate="reported">
          <td className="py-1 pr-2 pl-3">① 상증법 평가액(신고가액){mark("reported")}</td>
          <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(p.reported)}</td>
        </tr>
      )}
      {p.sec164 != null && (
        <tr data-testid="bg-pre-deemed-candidate" data-candidate="sec164">
          <td className="py-1 pr-2 pl-3">② §164④~⑦ 취득당시 기준시가(의제취득일){mark("sec164")}</td>
          <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(p.sec164)}</td>
        </tr>
      )}
      <tr data-testid="bg-pre-deemed-candidate" data-candidate="converted">
        <td className="py-1 pr-2 pl-3">
          ③ 환산취득가액 = 증여가액 {fmt(bg.giftValuation.max)} × <Frac top={`의제취득일 기준시가 ${fmt(p.stdAtDeemed)}`} bottom="양도시 기준시가" />
          {mark("converted")}
        </td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(p.converted ?? 0)}</td>
      </tr>
      <tr data-testid="bg-pre-deemed-acquisition">
        <td className="py-1 pr-2 pl-3">
          취득가액 = ①②③ 중 큰 금액 {fmt(p.wholeAcquisition ?? 0)} × 채무비율 {rate} (소득세법 시행령 §159①1호 · §163⑨ · §176조의2④)
        </td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(acquisition)}</td>
      </tr>
      <tr>
        <td colSpan={2} className="py-1 pr-2 pl-3 text-caption text-fuchsia-700 dark:text-fuchsia-400">
          {p.selected === "converted"
            ? bg.necessaryExpenseSwap?.chosen === "direct"
              ? "※ ③ 채택 — 자본적지출·양도비가 ③과 개산공제의 합보다 커서 그 금액을 필요경비로 썼습니다(소득세법 §97②2호 단서). 취득가액은 따로 빼지 않습니다."
              : "※ ③ 채택 — 추계라 개산공제(의제취득일 기준시가 × 채무비율 × 율, 소득세법 시행령 §163⑥)를 필요경비로 적용합니다."
            : "※ ①·② 채택 — 실지거래가액 의제(소득세법 시행령 §163⑨)라 자본적지출·양도비를 채무비율 안분해 필요경비로 공제합니다."}
        </td>
      </tr>
    </>
  );
}

export function BgPreDeemedStdCaption({ bg }: { bg: TransferBurdenedGiftBreakdown }) {
  if (bg.preDeemed?.basis !== "deemed_std") return null;
  return (
    <tr data-testid="bg-pre-deemed-std-caption">
      <td colSpan={2} className="py-1 pr-2 pl-3 text-caption text-fuchsia-700 dark:text-fuchsia-400">
        ※ 취득기준시가 = 의제취득일(1985.1.1.) 기준시가 {fmt(bg.preDeemed.stdAtDeemed)} — 1984.12.31. 이전 취득분은 취득시기가 1985.1.1.로 의제됩니다
        (소득세법 부칙 법률 제4803호 §8 · 시행령 §159①1호 괄호 · §164④~⑦).
      </td>
    </tr>
  );
}
