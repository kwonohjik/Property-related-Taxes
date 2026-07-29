"use client";

/**
 * FiscalYearAdjustmentTable — 별지 6쪽 ①~㉒ 가산·차감 입력 (3년치 칼럼)
 *
 * 법령: 상증령 §56 ① + ④ — 사업연도별 순손익액 산정
 *   ① 각 사업연도 소득금액
 *   가산 (②~⑦): §56④ 1호 가~마
 *   차감 (⑧~㉒): §56④ 2호 가~마
 *
 *   §17의3② 1년 미만 사업연도 연환산: 개시일(fiscalYearStartDate) 입력 시
 *   종료일까지의 개월수 < 12이면 1주당 순손익액 × 12 / 개월수 연환산.
 *   미입력 시 12개월 가정(종료일−1년+1일) — 회귀 0.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Plan(연환산): docs/00-pm/inheritance-unlisted-fiscal-year-under-1year.plan.md
 */

import { Fragment } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { getNextFocusableInput } from "@/components/providers/EnterKeyNavigationProvider";
import { fiscalYearMonths } from "@/lib/tax-engine/property-valuation/fiscal-year-annualize";
import type { FiscalYearAdjustment } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

function isValidDate(d: Date | undefined): boolean {
  return !!d && d instanceof Date && !isNaN(d.getTime());
}

function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function strToDate(s: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(s);
}

interface RowDef {
  key: keyof FiscalYearAdjustment;
  label: string;
  group: "income" | "add" | "sub";
  cellNum: string;
  description?: string;
  /** 음수(결손) 입력 허용 — §56④ 각 사업연도 소득금액(①)은 결손이 정상값(Zod z.number()). 가산·차감 항목은 nonnegative. */
  signed?: boolean;
}

const ROWS: RowDef[] = [
  { key: "taxableIncome", label: "각 사업연도 소득금액", group: "income", cellNum: "①", description: "법인세법 §14 각 사업연도 소득금액", signed: true },
  { key: "addRefundInterest", label: "국세·지방세 환급금 이자", group: "add", cellNum: "②", description: "§18 4호" },
  { key: "addLossFromDividend", label: "수입배당금 익금불산입액", group: "add", cellNum: "③", description: "§18의2·§18의4" },
  { key: "addCarriedDonation", label: "이월 기부금 손금산입액", group: "add", cellNum: "④", description: "§24⑤" },
  { key: "addCarriedCarPayment", label: "이월 업무용승용차 손금산입액", group: "add", cellNum: "⑤", description: "§27의2 ③·④" },
  { key: "addForexValuationGain", label: "외화환산이익", group: "add", cellNum: "⑥", description: "§56④ 1라" },
  { key: "addOtherByOrdinance", label: "그 밖의 가산액", group: "add", cellNum: "⑦", description: "§56④ 1마" },
  { key: "subCorporateTax", label: "법인세 총결정세액", group: "sub", cellNum: "⑧", description: "§56④ 2가" },
  { key: "subAdditionalTaxes", label: "법인세 부가세·농특세·지방소득세", group: "sub", cellNum: "⑨", description: "§56④ 2가" },
  { key: "subFines", label: "벌금·과료·과태료·체납처분비", group: "sub", cellNum: "⑩", description: "§21 3호·4호" },
  { key: "subCompulsoryPublicCharges", label: "법령상 의무 아닌 공과금 손금불산입", group: "sub", cellNum: "⑪", description: "§21의2" },
  { key: "subPunitiveDamages", label: "징벌적 손해배상금 손금불산입", group: "sub", cellNum: "⑫", description: "§21의2·§27" },
  { key: "subWithholdingPenalty", label: "징수불이행 세액", group: "sub", cellNum: "⑬", description: "§56④ 2나" },
  { key: "subExcessiveExpenses", label: "과다경비 손금불산입", group: "sub", cellNum: "⑭", description: "§24~§28" },
  { key: "subDonationExcess", label: "기부금 한도초과액", group: "sub", cellNum: "⑮", description: "§24" },
  { key: "subEntertainmentExcess", label: "접대비 한도초과액", group: "sub", cellNum: "⑯", description: "§25" },
  { key: "subNonBusinessExpenses", label: "업무무관 비용 손금불산입", group: "sub", cellNum: "⑰", description: "§27" },
  { key: "subNonBusinessCarExpenses", label: "업무용승용차 비용 손금불산입", group: "sub", cellNum: "⑱", description: "§27의2" },
  { key: "subInterestPayment", label: "지급이자 손금불산입", group: "sub", cellNum: "⑲", description: "§28" },
  { key: "subDepreciationShortage", label: "감가상각 시인부족액 손금환입", group: "sub", cellNum: "⑳", description: "§56④ 2라" },
  { key: "subForexValuationLoss", label: "외화환산손실", group: "sub", cellNum: "㉑", description: "§56④ 2마" },
  { key: "subOtherByOrdinance", label: "그 밖의 차감액", group: "sub", cellNum: "㉒", description: "§56④ 2다·§136" },
];

export interface FiscalYearAdjustmentTableProps {
  fiscalYears: [FiscalYearAdjustment, FiscalYearAdjustment, FiscalYearAdjustment];
  onChange: (next: [FiscalYearAdjustment, FiscalYearAdjustment, FiscalYearAdjustment]) => void;
  /** 섹션 번호 (부모 UnlistedStockV2Card 단일 출처 — 다-섹션 카드 패턴) */
  sectionNum?: number;
}

export function FiscalYearAdjustmentTable({
  fiscalYears,
  onChange,
  sectionNum = 3,
}: FiscalYearAdjustmentTableProps) {
  function updateField<K extends keyof FiscalYearAdjustment>(
    yearIdx: 0 | 1 | 2,
    field: K,
    value: FiscalYearAdjustment[K],
  ) {
    const next = [...fiscalYears] as [FiscalYearAdjustment, FiscalYearAdjustment, FiscalYearAdjustment];
    next[yearIdx] = { ...next[yearIdx], [field]: value };
    onChange(next);
  }

  // 사업연도별 가산 소계 · 차감 소계 · 다.순손익액 미리보기 산정
  const perYear = fiscalYears.map((fy) => {
    const add =
      (fy.addRefundInterest ?? 0) +
      (fy.addLossFromDividend ?? 0) +
      (fy.addCarriedDonation ?? 0) +
      (fy.addCarriedCarPayment ?? 0) +
      (fy.addForexValuationGain ?? 0) +
      (fy.addOtherByOrdinance ?? 0);
    const sub =
      (fy.subCorporateTax ?? 0) +
      (fy.subAdditionalTaxes ?? 0) +
      (fy.subFines ?? 0) +
      (fy.subCompulsoryPublicCharges ?? 0) +
      (fy.subPunitiveDamages ?? 0) +
      (fy.subWithholdingPenalty ?? 0) +
      (fy.subExcessiveExpenses ?? 0) +
      (fy.subDonationExcess ?? 0) +
      (fy.subEntertainmentExcess ?? 0) +
      (fy.subNonBusinessExpenses ?? 0) +
      (fy.subNonBusinessCarExpenses ?? 0) +
      (fy.subInterestPayment ?? 0) +
      (fy.subDepreciationShortage ?? 0) +
      (fy.subForexValuationLoss ?? 0) +
      (fy.subOtherByOrdinance ?? 0);
    return { add, sub, adjusted: fy.taxableIncome + add - sub };
  });
  const previewAdjustedIncomes = perYear.map((p) => p.adjusted);

  // Enter 키 → 같은 사업연도 열에서 아래 항목으로(①→…→㉒) 세로 이동.
  // 열 끝(㉒)에서 Enter → 다음 사업연도 ①, 마지막 열 ㉒ → 표 밖 다음 입력으로 복귀.
  function handleFiscalEnter(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // IME 조합 가드
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-fy-col]");
    if (!cell) return;
    const col = Number(cell.dataset.fyCol);
    const row = Number(cell.dataset.fyRow);
    if (Number.isNaN(col) || Number.isNaN(row)) return;

    e.preventDefault();
    const lastRow = ROWS.length - 1;
    const lastCol = fiscalYears.length - 1;
    let nextCol = col;
    let nextRow = row + 1;
    if (nextRow > lastRow) {
      nextCol = col + 1;
      nextRow = 0;
    }
    if (nextCol > lastCol) {
      // 마지막 열의 ㉒ → 표 밖 DOM상 다음 입력으로 복귀
      getNextFocusableInput(e.target as HTMLElement)?.focus();
      return;
    }
    e.currentTarget
      .querySelector<HTMLInputElement>(`[data-fy-col="${nextCol}"][data-fy-row="${nextRow}"] input`)
      ?.focus();
  }

  return (
    <ToneCard tone="emerald" sectionNum={sectionNum} title="사업연도별 순손익액 (별지 6쪽 ①~㉒)" bodyClassName="space-y-3" noDark>
      <p className="text-caption text-emerald-700/80">
        평가기준일 이전 1·2·3년차 사업연도. 가중치 ×3·×2·×1로 가중평균 후 ÷ 환원율(10%) = 1주당 순손익가치 ⑤
      </p>
      <p className="text-micro text-emerald-600/80">
        사업연도 변경 시: 평가기준일 이전 1·2·3년이 되는 날이 속하는 사업연도를 입력.
        1년 미만이면 자동 1년 환산(§17의3②).
        합병 후 3년 미경과 법인은 아래 &ldquo;합병 후 3년 미경과 순손익 보정&rdquo; 토글로 합병법인·피합병법인을 합산 입력하세요.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <LawArticleModal legalBasis="상증령 §56" label="상증령 §56①④ 순손익액 산정" />
        <LawArticleModal legalBasis="상증규 §17의3" label="상증규 §17의3② 1년미만 연환산" />
      </div>

      {/* 사업연도 라벨 + 개시일·종료일 헤더 (하단 입력표와 동일 grid 트랙으로 정렬) */}
      <div className="grid grid-cols-[13rem_repeat(3,minmax(0,1fr))] gap-2 border-l-2 border-transparent pl-1.5 text-caption font-semibold text-gray-700">
        <div></div>
        {fiscalYears.map((fy, idx) => {
          const months = fiscalYearMonths(fy.fiscalYearStartDate, fy.fiscalYearEndDate);
          const isShortYear = fy.fiscalYearStartDate !== undefined && months < 12;
          return (
            <div key={idx} className="space-y-1">
              <div className="text-emerald-700">
                {idx === 0 ? "1년전 ×3" : idx === 1 ? "2년전 ×2" : "3년전 ×1"}
              </div>
              <input
                type="text"
                value={fy.fiscalYearLabel}
                onChange={(e) => updateField(idx as 0 | 1 | 2, "fiscalYearLabel", e.target.value)}
                placeholder="사업연도 라벨"
                className="w-full px-2 py-1 text-caption border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
              />
              {/* 개시일 (§17의3② 연환산용 — 선택 입력) */}
              <div className="space-y-0.5">
                <p className="text-micro text-gray-500 font-normal">
                  개시일
                  <span className="ml-1 text-gray-400">(1년 미만 시 입력)</span>
                </p>
                <DateInput
                  value={fy.fiscalYearStartDate ? dateToStr(fy.fiscalYearStartDate) : ""}
                  onChange={(s) => {
                    const d = strToDate(s);
                    updateField(idx as 0 | 1 | 2, "fiscalYearStartDate", d);
                  }}
                />
              </div>
              {/* 종료일 */}
              <div className="space-y-0.5">
                <p className="text-micro text-gray-500 font-normal">
                  종료일
                  <span className="ml-1 text-rose-600 font-semibold">*</span>
                </p>
                <DateInput
                  value={isValidDate(fy.fiscalYearEndDate) ? dateToStr(fy.fiscalYearEndDate) : ""}
                  onChange={(s) => {
                    const d = strToDate(s);
                    if (d) updateField(idx as 0 | 1 | 2, "fiscalYearEndDate", d);
                  }}
                />
                {!isValidDate(fy.fiscalYearEndDate) && (
                  <p className="text-micro text-rose-600 font-semibold leading-snug">
                    종료일 필수 — §56⑤·환산주식수 계산에 필요
                  </p>
                )}
              </div>
              {/* §17의3② 연환산 amber 안내 */}
              {isShortYear && (
                <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-micro text-amber-800 font-normal">
                  사업연도 {months}개월 → 1주당 순손익액 ×12/{months} 연환산 (§17의3②)
                </div>
              )}
              {/* hint: 미입력 안내 */}
              {!fy.fiscalYearStartDate && (
                <p className="text-micro text-gray-400 font-normal leading-snug">
                  신설법인·결산기변경으로 1년 미만이면 개시일 입력. 미입력 시 12개월(연환산 없음).
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 22 row × 3 year 입력 — 상단 헤더와 동일 grid 트랙(라벨 13rem + 3년 균등)으로 세로 정렬 */}
      {/* data-enter-nav="off": 전역 가로 Enter 비활성 → handleFiscalEnter가 사업연도(열) 단위 세로 이동 전담 */}
      <div className="overflow-x-auto text-caption">
        <div role="table" data-enter-nav="off" onKeyDown={handleFiscalEnter}>
          {ROWS.map((row, rowIndex) => {
            const prevGroup = ROWS[rowIndex - 1]?.group;
            const nextGroup = ROWS[rowIndex + 1]?.group;
            const isFirstAdd = row.group === "add" && prevGroup !== "add";
            const isLastAdd = row.group === "add" && nextGroup !== "add";
            const isFirstSub = row.group === "sub" && prevGroup !== "sub";
            const isLastSub = row.group === "sub" && nextGroup !== "sub";
            const barClass =
              row.group === "income"
                ? "border-emerald-400"
                : row.group === "add"
                  ? "border-sky-300"
                  : "border-rose-300";
            return (
              <Fragment key={row.key}>
                {/* 가산항목 그룹 헤더 (②~⑦) */}
                {isFirstAdd && (
                  <div className="mt-2 mb-1 flex items-center gap-1.5 rounded border border-sky-200 bg-sky-100/70 px-2 py-1">
                    <span className="text-xs font-bold text-sky-800">＋ 가산항목</span>
                    <span className="text-micro text-sky-700/80">§56④ 1호 · ②~⑦</span>
                  </div>
                )}
                {/* 차감항목 그룹 헤더 (⑧~㉒) */}
                {isFirstSub && (
                  <div className="mt-2 mb-1 flex items-center gap-1.5 rounded border border-rose-200 bg-rose-100/70 px-2 py-1">
                    <span className="text-xs font-bold text-rose-800">－ 차감항목</span>
                    <span className="text-micro text-rose-700/80">§56④ 2호 · ⑧~㉒</span>
                  </div>
                )}
                <div
                  role="row"
                  className={`grid grid-cols-[13rem_repeat(3,minmax(0,1fr))] gap-2 items-start border-b border-emerald-100 border-l-2 ${barClass} pl-1.5 py-1`}
                >
                  <div className="pr-2">
                    <span className={`inline-block w-6 text-center font-mono ${
                      row.group === "income" ? "text-emerald-700 font-bold" :
                      row.group === "add" ? "text-sky-700" : "text-rose-700"
                    }`}>{row.cellNum}</span>
                    <span className="ml-1">{row.label}</span>
                    {row.description && (
                      <span className="text-micro text-gray-500 ml-1">({row.description})</span>
                    )}
                  </div>
                  {fiscalYears.map((fy, idx) => (
                    <div key={idx} data-fy-col={idx} data-fy-row={rowIndex}>
                      <CurrencyInput
                        label={row.label}
                        hideLabel
                        allowNegative={row.signed}
                        value={String(fy[row.key] ?? "")}
                        onChange={(v) => {
                          const n = parseAmount(v);
                          updateField(idx as 0 | 1 | 2, row.key, n as FiscalYearAdjustment[typeof row.key]);
                        }}
                        placeholder="0"
                        hideUnit
                      />
                    </div>
                  ))}
                </div>
                {/* 가산 소계 */}
                {isLastAdd && (
                  <div
                    role="row"
                    className="grid grid-cols-[13rem_repeat(3,minmax(0,1fr))] gap-2 items-center border-l-2 border-sky-400 bg-sky-50/70 pl-1.5 py-1.5"
                  >
                    <div className="pr-2 font-semibold text-sky-800">
                      <span className="inline-block w-6 text-center">＋</span>
                      <span className="ml-1">가산 소계 (②~⑦)</span>
                    </div>
                    {perYear.map((p, idx) => (
                      <div key={idx} className="text-right font-mono font-semibold text-sky-900">
                        {p.add.toLocaleString()}
                      </div>
                    ))}
                  </div>
                )}
                {/* 차감 소계 */}
                {isLastSub && (
                  <div
                    role="row"
                    className="grid grid-cols-[13rem_repeat(3,minmax(0,1fr))] gap-2 items-center border-l-2 border-rose-400 bg-rose-50/70 pl-1.5 py-1.5"
                  >
                    <div className="pr-2 font-semibold text-rose-800">
                      <span className="inline-block w-6 text-center">－</span>
                      <span className="ml-1">차감 소계 (⑧~㉒)</span>
                    </div>
                    {perYear.map((p, idx) => (
                      <div key={idx} className="text-right font-mono font-semibold text-rose-900">
                        {p.sub.toLocaleString()}
                      </div>
                    ))}
                  </div>
                )}
              </Fragment>
            );
          })}

          {/* 다.순손익액 미리보기 행 */}
          <div
            role="row"
            className="grid grid-cols-[13rem_repeat(3,minmax(0,1fr))] gap-2 items-center border-t-2 border-l-2 border-emerald-400 bg-emerald-100/60 pl-1.5 py-2"
          >
            <div className="pr-2 font-bold text-emerald-800">
              <span className="inline-block w-6 text-center">다</span>
              <span className="ml-1">순손익액 (= ① + 가산 − 차감)</span>
            </div>
            {previewAdjustedIncomes.map((val, idx) => (
              <div key={idx} className="text-right font-mono font-semibold text-emerald-900">
                {val.toLocaleString()}
                <span className="ml-1 text-micro">원</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ToneCard>
  );
}
