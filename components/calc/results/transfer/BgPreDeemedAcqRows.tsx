/**
 * 부담부증여 결과 — 의제취득일(1985.1.1.) 전 상속·증여 자산의 §159①1호 A 행 (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18).
 * 엔진 echo `preDeemed`를 그대로 그린다. 시가 평가(Q-24)는 ①②③ 비교와 채택값 × 채무비율, 기준시가 평가(Q-25)는 의제취득일 기준시가 안내.
 */
import { Fragment } from "react";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function BgPreDeemedThreeWayRows({
  bg,
  isRedev = false,
  redevSec166,
}: {
  bg: TransferBurdenedGiftBreakdown;
  /** 재개발·재건축 완공 아파트(원조합원) — ③이 §166③이다(PR-7b-4 · Q-8 a) */
  isRedev?: boolean;
  /** ③ 채택 시 재개발 경로가 §166③으로 실제 계산한 값(`redevSec166DisplayOf`) — §159 명세 슬롯이 아니라 이 값으로 계산된다 */
  redevSec166?: { acquisition: number; lumpDeduction: number };
}) {
  const p = bg.preDeemed;
  if (!p || p.basis !== "three_way") return null;
  const mark = (key: "reported" | "sec164" | "converted") => (p.selected === key ? " ← 채택" : " (미적용 — 더 작은 금액)");
  // ③(§166③)이 채택된 재개발은 재개발 경로가 평가액 × 채무비율로 §166③을 다시 계산한다 — §159 명세 슬롯은 쓰이지 않는다(§97②2호 단서면 0)
  const redevConverted = isRedev && p.selected === "converted" && redevSec166 !== undefined;
  const acquisition = redevConverted ? redevSec166.acquisition : bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice;
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
          {isRedev ? (
            <>
              ③ 환산취득가액 = 평가액 × <Frac top="취득일 기준시가" bottom="관리처분계획 인가일 기준시가" /> (시행령 §166③)
            </>
          ) : (
            <>
              ③ 환산취득가액 = 증여가액 {fmt(bg.giftValuation.max)} × <Frac top={`의제취득일 기준시가 ${fmt(p.stdAtDeemed)}`} bottom="양도시 기준시가" />
            </>
          )}
          {mark("converted")}
        </td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(p.converted ?? 0)}</td>
      </tr>
      <tr data-testid="bg-pre-deemed-acquisition">
        <td className="py-1 pr-2 pl-3">
          취득가액 = ①②③ 중 큰 금액 {fmt(p.wholeAcquisition ?? 0)} × 채무비율 {rate} (소득세법 시행령 §159①1호 · §163⑨ ·{" "}
          {isRedev ? "§166③" : "§176조의2④"})
        </td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(acquisition)}</td>
      </tr>
      <tr>
        <td colSpan={2} className="py-1 pr-2 pl-3 text-caption text-fuchsia-700 dark:text-fuchsia-400">
          {redevConverted
            ? `※ ③ 채택 — 재개발 경로가 평가액 × 채무비율로 §166③을 계산하고 인가전 분 개산공제 ${fmt(redevSec166.lumpDeduction)}(취득일 기준시가 × 채무비율 × 율, 소득세법 시행령 §163⑥)를 적용합니다 — 재개발·재건축 상세 참조.`
            : p.selected === "converted"
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

/**
 * 일반건물 파트별 3자 max(PR-7b-6 · 사용자 결정 Q-28 · 엔진 echo `preDeemed.basis === "three_way_parts"`) — 파트마다 ①②③ 비교·채택값 × 채무비율과 필요경비.
 * 의제취득일 전이 아닌 파트는 고른 산정방식의 결과 값만 적는다. 금액은 모두 엔진 echo(`preDeemed.parts`·`perAsset`)다 — 화면에서 다시 계산하지 않는다.
 */
export function BgPreDeemedPartsRows({
  bg,
  methodLabels,
}: {
  bg: TransferBurdenedGiftBreakdown;
  methodLabels: Record<TransferBurdenedGiftBreakdown["acquisitionMethodUsed"], string>;
}) {
  const parts = bg.preDeemed?.basis === "three_way_parts" ? bg.preDeemed.parts : undefined;
  if (!parts) return null;
  const rate = `${(bg.debtRatio * 100).toFixed(4)}%`;
  const swapped = bg.necessaryExpenseSwap?.chosen === "direct";
  return (
    <>
      {(["land", "building"] as const).map((key) => {
        const label = key === "land" ? "토지" : "건물";
        const a = bg.perAsset[key];
        const e = parts[key];
        const mark = (k: "reported" | "sec164" | "converted") => (e?.selected === k ? " ← 채택" : " (미적용 — 더 작은 금액)");
        const expenseRow =
          a.acquisitionMethod === "actual" ? (
            <tr data-testid="bg-pre-deemed-part-expense" data-part={key}>
              <td className="py-1 pr-2 pl-3">
                {label} 필요경비 = 자본적지출·양도비 × 채무비율 {rate} 중 {label} 몫 (
                {e ? "실지거래가액 의제 · 소득세법 시행령 §163⑨" : "실지거래가액 · 소득세법 §97①2호·3호"})
              </td>
              <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(a.estimatedDeduction)}</td>
            </tr>
          ) : a.acquisitionMethod === "converted" && swapped && a.acquisitionPrice === 0 ? (
            <tr data-testid="bg-pre-deemed-part-expense" data-part={key}>
              <td className="py-1 pr-2 pl-3">{label} 필요경비 = 자본적지출·양도비 중 {label} 몫 — 환산취득가액과 개산공제의 합보다 커서 이 금액을 씀 (소득세법 §97②2호 단서)</td>
              <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(a.estimatedDeduction)}</td>
            </tr>
          ) : (
            <tr data-testid="bg-pre-deemed-part-expense" data-part={key}>
              <td className="py-1 pr-2 pl-3">
                {label} 개산공제 = 취득시 기준시가 {fmt(a.stdPriceAtAcquisition)} × 채무비율 {rate} × 개산공제율{" "}
                {((a.estimatedDeductionRate ?? 0) * 100).toFixed(1).replace(/\.0$/, "")}% (소득세법 시행령 §163⑥)
              </td>
              <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(a.estimatedDeduction)}</td>
            </tr>
          );
        if (!e) {
          return (
            <Fragment key={key}>
              <tr data-testid="bg-pre-deemed-part" data-part={key} data-basis="method">
                <td className="py-1 pr-2 pl-3">{label} 취득가액 — {methodLabels[a.acquisitionMethod] ?? a.acquisitionMethod} × 채무비율 {rate} (의제취득일 전 파트 아님)</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(a.acquisitionPrice)}</td>
              </tr>
              {expenseRow}
            </Fragment>
          );
        }
        return (
          <Fragment key={key}>
            <tr data-testid="bg-pre-deemed-part" data-part={key} data-basis="three_way">
              <td colSpan={2} className="py-1 pr-2 pl-3 text-caption font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                {label} — 의제취득일(1985.1.1.) 전 상속·증여 · ①②③ 중 큰 금액
              </td>
            </tr>
            {e.reported != null && (
              <tr data-testid="bg-pre-deemed-candidate" data-part={key} data-candidate="reported">
                <td className="py-1 pr-2 pl-3">① 상증법 평가액(신고가액){mark("reported")}</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(e.reported)}</td>
              </tr>
            )}
            {e.sec164 != null && (
              <tr data-testid="bg-pre-deemed-candidate" data-part={key} data-candidate="sec164">
                <td className="py-1 pr-2 pl-3">② §164④·⑤ 취득당시 기준시가(의제취득일){mark("sec164")}</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(e.sec164)}</td>
              </tr>
            )}
            <tr data-testid="bg-pre-deemed-candidate" data-part={key} data-candidate="converted">
              <td className="py-1 pr-2 pl-3">
                ③ 환산취득가액 = 증여가액({label} 몫) {fmt(e.giftValue)} ×{" "}
                <Frac top={`의제취득일 기준시가 ${fmt(e.stdAtDeemed)}`} bottom={`양도시 기준시가 ${fmt(a.stdPriceAtTransfer)}`} />
                {mark("converted")}
              </td>
              <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(e.converted)}</td>
            </tr>
            <tr data-testid="bg-pre-deemed-acquisition" data-part={key}>
              <td className="py-1 pr-2 pl-3">
                {label} 취득가액 = ①②③ 중 큰 금액 {fmt(e.wholeAcquisition)} × 채무비율 {rate}
                {swapped && a.acquisitionMethod === "converted" && a.acquisitionPrice === 0 ? " — 아래 필요경비로 대체(§97②2호 단서)" : ""}
              </td>
              <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(a.acquisitionPrice)}</td>
            </tr>
            {expenseRow}
          </Fragment>
        );
      })}
      <tr className="border-t border-fuchsia-300 font-semibold" data-testid="bg-pre-deemed-parts-total">
        <td className="py-1 pr-2 pl-3">취득가액 합계 (토지 + 건물 · 소득세법 시행령 §159①1호 · §176조의2④)</td>
        <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice)}</td>
      </tr>
    </>
  );
}
