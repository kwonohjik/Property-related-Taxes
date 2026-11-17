"use client";

/**
 * 겸용주택 × 부담부증여 × **함께 양도 묶음** — 자산별 4부분 명세 카드 (계획서 `bg-mixed-use-m2-bundle-share.plan.md` Q-3 ①·Q-7).
 *
 * 단건 카드(`MixedUseBurdenedGiftDetailCard`)와 다른 점 — **증여세 행이 없다.** 증여세는 증여계약 전체로 한 번 계산해 묶음 결과의
 * 부담부증여 명세(`aggregated.burdenedGift`)에 있다. 채무는 신고 단위 합계를 자산가액 비율로 재배분한 몫이고 전부 「구분 불분명」이다.
 *
 * 엔진 echo(`mixedUseBgDetailsByAsset[자산 id]`)만 읽는다 — 증여가액·채무·부분별 금액을 다시 계산하지 않는다(양도차익 한 칸만 echo 세 값의 뺄셈).
 * 표기: 한국어 풀어쓰기 · 각 숫자 옆 변수명 라벨 · 금액 칸은 font-mono tabular-nums 우측정렬 · 화면 리터럴 `÷` 금지(`Frac`).
 */
import type { MixedUseBurdenedGiftBreakdown, MixedUsePartKey } from "@/lib/tax-engine/types/mixed-use-burdened-gift.types";
import type { BurdenedGiftValuationMode } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { MIXED_BG_PART_LABEL } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { MixedUseBgAcqRows, mixedBgPartGainFormula } from "@/components/calc/results/mixed-use/MixedUseBurdenedGiftSection";
import { Frac, FLine, fmtPct, fmtPlain } from "@/components/calc/results/mixed-use/MixedUseResultCardParts";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const PART_ORDER: readonly MixedUsePartKey[] = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"];
const AMOUNT = "py-1 pl-2 text-right font-mono tabular-nums whitespace-nowrap";

interface Props {
  bg: MixedUseBurdenedGiftBreakdown;
  /** 안분 표 행 라벨 — 「주 자산」·「자산 2」 */
  assetLabel: string;
  /** testid 키 — 자산 id(주 자산 `primary`) */
  assetKey: string;
  /** 입력 폼의 평가 모드 — 증여가액 라벨만 가른다(값은 전부 엔진 echo) */
  valuationMode?: BurdenedGiftValuationMode | "";
}

export function MixedUseBgBundleAssetCard({ bg, assetLabel, assetKey, valuationMode }: Props) {
  const d = bg.debtAttribution;
  const whole = d.housingGiftValue + d.commercialGiftValue;
  const sel = bg.sangjeungbeopValuation?.selectedMode;
  const valueLabel =
    sel === "mortgage"
      ? "증여가액 = 담보채권액 평가 (상증법 §66)"
      : sel === "rental"
        ? "증여가액 = 임대료 환산 평가 (상증법 §61⑤)"
        : valuationMode === "sangjeungbeop_market"
          ? "증여가액 = 양도시 시가 (상증법 §60②)"
          : "증여가액 = 보충적평가 (상증법 §61)";
  const ratioFrac = (side: "housing" | "commercial") => {
    const label = side === "housing" ? "주택" : "상가";
    return (
      <Frac
        top={`${label}분 양도로 보는 채무액 ${fmtPlain(side === "housing" ? d.housingDebt : d.commercialDebt)}`}
        bottom={`${label}분 증여가액 ${fmtPlain(side === "housing" ? d.housingGiftValue : d.commercialGiftValue)}`}
      />
    );
  };
  return (
    <div
      className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4 space-y-3 print:break-inside-avoid dark:bg-fuchsia-950/40"
      data-testid={`bg-mixed-bundle-card-${assetKey}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">
          부담부증여 명세 — 겸용주택 ({assetLabel}) · 소득세법 시행령 §159
        </p>
        <span className="text-xs text-fuchsia-700 px-2 py-0.5 rounded-full bg-fuchsia-100 border border-fuchsia-300">양도세 납세의무자: 증여자</span>
      </div>

      <table className="w-full text-xs border-collapse">
        <tbody>
          <tr>
            <td className="py-1 pr-2">{valueLabel}</td>
            <td className={AMOUNT} data-testid={`bg-mixed-bundle-gift-value-${assetKey}`}>{fmt(whole)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 pl-3">└ 주택분 증여가액</td>
            <td className={AMOUNT}>{fmt(d.housingGiftValue)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 pl-3">└ 상가분 증여가액</td>
            <td className={AMOUNT}>{fmt(d.commercialGiftValue)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">
              인수 채무액 — 신고 단위 채무를 자산별 증여가액 비율로 재배분한 이 겸용주택의 몫 (귀속: 구분 불분명)
            </td>
            <td className={AMOUNT} data-testid={`bg-mixed-bundle-debt-${assetKey}`}>{fmt(bg.assumedDebtAmount)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 pl-3">
              └ 주택 몫 = 구분 불분명 채무 {fmtPlain(d.unallocated)} × <Frac top={`주택분 증여가액 ${fmtPlain(d.housingGiftValue)}`} bottom={`증여가액 ${fmtPlain(whole)}`} />
            </td>
            <td className={AMOUNT} data-testid={`bg-mixed-bundle-debt-housing-${assetKey}`}>{fmt(d.unallocatedToHousing)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 pl-3">└ 상가 몫 = 구분 불분명 채무 {fmtPlain(d.unallocated)} - 주택 몫 {fmtPlain(d.unallocatedToHousing)}</td>
            <td className={AMOUNT}>{fmt(d.unallocatedToCommercial)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">주택분 채무비율 = {ratioFrac("housing")}</td>
            <td className={AMOUNT}>{d.housingDebt > 0 ? fmtPct(d.housingRatio) : "-"}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">상가분 채무비율 = {ratioFrac("commercial")}</td>
            <td className={AMOUNT}>{d.commercialDebt > 0 ? fmtPct(d.commercialRatio) : "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* 취득가액·필요경비 산식 — 단건 카드와 같은 컴포넌트(양도 없는 쪽은 그리지 않는다) */}
      <div className="space-y-2">
        <MixedUseBgAcqRows bg={bg} side="housing" />
        <MixedUseBgAcqRows bg={bg} side="commercial" />
      </div>

      {/* 4부분 양도가액·취득가액·필요경비·양도차익 */}
      <table className="w-full text-xs border-collapse" data-testid={`bg-mixed-bundle-parts-${assetKey}`}>
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-1 pr-2 text-left font-normal">부분</th>
            <th className="py-1 pl-2 text-right font-normal">양도가액</th>
            <th className="py-1 pl-2 text-right font-normal">취득가액</th>
            <th className="py-1 pl-2 text-right font-normal">개산공제 · 필요경비</th>
            <th className="py-1 pl-2 text-right font-normal">양도차익</th>
          </tr>
        </thead>
        <tbody>
          {PART_ORDER.map((k) => {
            const p = bg.perPart[k];
            return (
              <tr key={k} data-part={k} className="border-b last:border-0 align-top">
                <td className="py-1 pr-2">
                  {MIXED_BG_PART_LABEL[k]}
                  <FLine>{mixedBgPartGainFormula(bg, k)}</FLine>
                </td>
                {p.transferred ? (
                  <>
                    <td className={AMOUNT}>{fmt(p.transferPrice)}</td>
                    <td className={AMOUNT}>{fmt(p.acquisitionPrice)}</td>
                    <td className={AMOUNT}>{fmt(p.estimatedDeduction)}</td>
                    <td className={`${AMOUNT} font-semibold`}>{fmt(p.transferPrice - p.acquisitionPrice - p.estimatedDeduction)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="py-1 pl-2 text-right text-muted-foreground">양도 없음</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-xs text-fuchsia-700 dark:text-fuchsia-400">
        ※ 증여세는 증여계약 전체를 한 번 계산합니다 — 무상이전분·증여세는 위 「부담부증여 평가 명세」에 있고 이 카드에는 없습니다.
        채무 재배분과 구분 불분명 안분은 해석례가 직접 답하지 않아 확인이 필요합니다.
      </p>
    </div>
  );
}
