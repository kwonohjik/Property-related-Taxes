/**
 * 증여세 결과 — 부담부증여 양도세 카드의 의제취득일(1985.1.1.) 전 상속 자산 취득가액 산정 (PR-7b-3 · S-1).
 *
 * 엔진 echo `preDeemed`를 문단으로 그린다(양도세 결과의 `BgPreDeemedAcqRows`는 표 행이라 이 카드에 못 끼운다 — 같은 값·같은 문구 축).
 * 종전에는 `acquisitionMethodUsed`만 보고 ② 채택도 「실지취득가액 (K-4)」로 표시했다.
 */
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function BurdenedTransferPreDeemedLines({ brkd }: { brkd: TransferBurdenedGiftBreakdown }) {
  const p = brkd.preDeemed;
  // 일반건물 파트별 3자 max(`three_way_parts`)는 양도세 일반건물 경로만 낸다 — 증여세 계산기는 일반건물을 보내지 않는다(PR-7b-6)
  if (!p || p.basis === "three_way_parts") return null;
  const rate = `${(brkd.debtRatio * 100).toFixed(4)}%`;
  if (p.basis === "deemed_std") {
    return (
      <p className="mt-1" data-testid="gift-bg-pre-deemed-std">
        ※ 취득가액 산정: 의제취득일(1985.1.1.) 기준시가 {fmt(p.stdAtDeemed)} × 채무비율 {rate} — 1984.12.31. 이전 상속분은 취득시기가 1985.1.1.로
        의제됩니다 (소득세법 부칙 법률 제4803호 §8 · 시행령 §159①1호 괄호)
      </p>
    );
  }
  const mark = (key: "reported" | "sec164" | "converted") => (p.selected === key ? " ← 채택" : "");
  const swap = brkd.necessaryExpenseSwap;
  const direct = p.selected === "converted" && swap?.chosen === "direct";
  // §97②2호 단서(③ 채택 · 실비가 더 크다)면 엔진이 취득가액 슬롯을 0으로 두고 스왑 전 값을 따로 남긴다 — 그 값을 보인다(리뷰 F1)
  const before = brkd.convertedAcquisitionBeforeSwap;
  const acquisition = direct && before
    ? before.land + before.building
    : brkd.perAsset.land.acquisitionPrice + brkd.perAsset.building.acquisitionPrice;
  const expense = (brkd.perAsset.land.estimatedDeduction ?? 0) + (brkd.perAsset.building.estimatedDeduction ?? 0);
  return (
    <div className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-300" data-testid="gift-bg-pre-deemed-three-way">
      <p>※ 취득가액 산정 — 의제취득일(1985.1.1.) 전 상속: ①②③ 중 큰 금액 × 채무비율 (소득세법 시행령 §159①1호 · §163⑨ · §176조의2④)</p>
      {p.reported != null && <p data-candidate="reported">① 상속개시일 현재 상증법 평가액 {fmt(p.reported)}{mark("reported")}</p>}
      {p.sec164 != null && <p data-candidate="sec164">② §164④~⑦ 취득당시 기준시가(의제취득일) {fmt(p.sec164)}{mark("sec164")}</p>}
      <p data-candidate="converted">
        ③ 환산취득가액 = 증여가액 {fmt(brkd.giftValuation.max)} × <Frac top={`의제취득일 기준시가 ${fmt(p.stdAtDeemed)}`} bottom="양도시 기준시가" /> ={" "}
        {fmt(p.converted ?? 0)}
        {mark("converted")}
      </p>
      <p>
        취득가액 = {fmt(p.wholeAcquisition ?? 0)} × 채무비율 {rate} = {fmt(acquisition)}
      </p>
      <p data-testid="gift-bg-pre-deemed-expense">
        {direct && swap
          ? `③ 채택 — ③ + 개산공제 ${fmt(swap.estimatedSide)}보다 자본적지출·양도비 ${fmt(swap.directSide)}가 커서 그 금액을 필요경비로 대신 씁니다. 이때 취득가액은 따로 빼지 않습니다 (소득세법 §97②2호 단서).`
          : p.selected === "converted"
            ? `③ 채택 — 추계라 개산공제 ${fmt(expense)}(의제취득일 기준시가 × 채무비율 × 율, 소득세법 시행령 §163⑥)를 필요경비로 적용합니다.`
            : `①·② 채택 — 실지거래가액 의제(소득세법 시행령 §163⑨)라 자본적지출·양도비에 채무비율을 곱한 ${fmt(expense)}를 필요경비로 공제합니다.`}
      </p>
    </div>
  );
}
