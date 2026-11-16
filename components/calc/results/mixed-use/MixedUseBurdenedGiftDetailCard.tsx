"use client";

/**
 * 겸용주택 × 부담부증여 — **증여재산 평가·무상이전분·증여세** 카드 (UI 설계 §6.5 R-6).
 *
 * 단건 `BurdenedGiftDetailCard`는 토지/건물 2부분(`perAsset`)과 단일 `debtRatio`를 전제한다. 겸용은 4부분이고
 * 비율이 주택분·상가분 둘이라 그 카드를 쓰지 않고, 물건 단위인 증여세 행만 `BurdenedGiftGiftTaxRows`로 공유한다.
 * 채무 귀속·채무비율·양도가액은 본문 ①(`MixedUseBgApportionSection`)이 소유한다 — 여기서 중복해 그리지 않는다.
 *
 * 엔진 echo만 읽는다 — 증여가액·무상이전분·증여세를 재계산하지 않는다.
 */
import type { MixedUseBurdenedGiftBreakdown } from "@/lib/tax-engine/types/mixed-use-burdened-gift.types";
import type { BurdenedGiftValuationMode } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { BurdenedGiftGiftTaxRows } from "@/components/calc/results/transfer/BurdenedGiftGiftTaxRows";

const fmt = (n: number) => n.toLocaleString("ko-KR");

interface Props {
  bg: MixedUseBurdenedGiftBreakdown;
  /** 입력 폼의 평가 모드 — 라벨만 가른다(값은 전부 엔진 echo). 없으면 중립 라벨. */
  valuationMode?: BurdenedGiftValuationMode | "";
}

export function MixedUseBurdenedGiftDetailCard({ bg, valuationMode }: Props) {
  const d = bg.debtAttribution;
  const whole = d.housingGiftValue + d.commercialGiftValue;
  // 담보·임대 승(사용자 결정 H-1)은 평가 모드와 관계없이 엔진 승자로 라벨을 정한다
  const sel = bg.sangjeungbeopValuation?.selectedMode;
  const valueLabel =
    sel === "mortgage"
      ? "증여가액 = 담보채권액 평가 (상증법 §66 — 임대보증금 + 담보 채권액)"
      : sel === "rental"
        ? "증여가액 = 임대료 환산 평가 (상증법 §61⑤ — 임대보증금 + 연 임대료 ÷ 12%)"
        : valuationMode === "sangjeungbeop_market"
      ? "증여가액 = 양도시 시가 (상증법 §60②)"
      : valuationMode === "sangjeungbeop_standard"
        ? "증여가액 = 보충적평가 (상증법 §61 — 개별주택가격 + 상가 부수토지 + 상가건물 기준시가)"
        : "증여가액 (상증법 §60~§66 평가)";
  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4 space-y-2 print:break-inside-avoid dark:bg-fuchsia-950/40" data-testid="bg-mixed-detail-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">
          부담부증여 평가 명세 — 겸용주택 (소득세법 시행령 §159)
        </p>
        <span className="text-xs text-fuchsia-700 px-2 py-0.5 rounded-full bg-fuchsia-100 border border-fuchsia-300">
          양도세 납세의무자: 증여자
        </span>
      </div>
      <table className="w-full text-xs border-collapse">
        <tbody>
          <tr>
            <td className="py-1 pr-2">{valueLabel}</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap" data-testid="bg-mixed-gift-value">{fmt(whole)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 pl-3">{sel === "mortgage" ? "  └ 주택분 증여가액 (주택 귀속 채무 + 구분 불분명 채무의 주택 몫)" : "  └ 주택분 증여가액"}</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(d.housingGiftValue)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 pl-3">{sel === "mortgage" ? "  └ 상가분 증여가액 (상가 귀속 채무 + 구분 불분명 채무의 상가 몫)" : "  └ 상가분 증여가액"}</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(d.commercialGiftValue)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">인수 채무액 (물건 전체)</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.assumedDebtAmount)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 text-fuchsia-700 dark:text-fuchsia-300">
              무상이전분 (증여세 과세 가액) = 증여가액 {fmt(whole)} - 인수 채무액 {fmt(bg.assumedDebtAmount)}
            </td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap text-fuchsia-700 dark:text-fuchsia-300">{fmt(bg.gratuitousPortion)}</td>
          </tr>
          {bg.giftTax && <BurdenedGiftGiftTaxRows giftTax={bg.giftTax} />}
        </tbody>
      </table>
      <p className="text-xs text-fuchsia-700 mt-2 dark:text-fuchsia-400">
        ※ 양도가액은 «양도로 보는 채무액»이고 부분별 채무비율은 위 ①에 있습니다. 증여세는 무상이전분에 대해 수증자가 별도 신고·납부합니다.
      </p>
    </div>
  );
}
