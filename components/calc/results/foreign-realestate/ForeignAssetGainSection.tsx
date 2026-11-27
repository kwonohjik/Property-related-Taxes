"use client";

/**
 * 자산별 «원화 환산 → 양도차익 → 양도소득금액» 카드 (소득세법 §118의3·§118의4·§118의8 · 영 §178의5①).
 *
 * 환산 순서 = 엔진 순서(`convert.ts`): 양도가액 → 취득가액 → 자본적지출 → 양도비 → (필요경비 산입 외국납부세액) → 양도차익 → 장기보유특별공제 «배제» → 양도소득금액.
 * 각 환산 단계는 «외화 × 기준환율(일자) = 원». 장기보유특별공제는 0 행을 만들지 않고 «배제» 한 줄만 둔다(§118의8 단서).
 * 접힘은 CSS-only(`hidden print:block`) — 인쇄 시 자동 펼침(skill `print-only-css-toggle`).
 */
import { useState } from "react";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { TRANSFER_FOREIGN_RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import type { ForeignRealEstateAssetRow } from "@/lib/tax-engine/foreign-realestate";
import { AmountRow, FxRow, NoteRow, fmt } from "./foreign-result-parts";

const KIND_LABEL: Record<ForeignRealEstateAssetRow["kind"], string> = { land: "토지", building: "건물" };

/** 양도차익 산식 — 0인 항은 적지 않는다(자본적지출·양도비·산입 외국납부세액) */
function gainFormula(r: ForeignRealEstateAssetRow): string {
  const parts = [`양도가액 ${fmt(r.transferValueKrw)} − 취득가액 ${fmt(r.acquisitionValueKrw)}`];
  if (r.capitalExpenditureKrw > 0) parts.push(`− 자본적지출 ${fmt(r.capitalExpenditureKrw)}`);
  if (r.transferCostKrw > 0) parts.push(`− 양도비 ${fmt(r.transferCostKrw)}`);
  if (r.foreignTax.expenseKrw > 0) parts.push(`− 필요경비 산입 외국납부세액 ${fmt(r.foreignTax.expenseKrw)}`);
  return parts.join(" ");
}

/** 기본공제 §118의7② 순서 — 먼저 양도한 자산부터(같은 날은 입력 순서). 엔진 `allocateBasicDeduction`과 같은 정렬. */
export function transferOrderOf(rows: readonly ForeignRealEstateAssetRow[]): number[] {
  const sorted = rows
    .map((r, i) => ({ date: r.transferDate, i }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
  const order = new Array<number>(rows.length).fill(0);
  sorted.forEach((s, rank) => {
    order[s.i] = rank + 1;
  });
  return order;
}

export function ForeignAssetGainSection({
  row,
  index,
  total,
  order,
  liable,
  defaultOpen,
}: {
  row: ForeignRealEstateAssetRow;
  index: number;
  total: number;
  /** 양도일 순서(1부터) */
  order: number;
  liable: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isLoss = row.capitalGain < 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid={`foreign-asset-gain-${index}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {row.id} <span className="font-normal text-muted-foreground">· {KIND_LABEL[row.kind]} · 양도일 {row.transferDate}</span>
        </p>
        <ExpandToggleButton open={open} onClick={() => setOpen((v) => !v)} tone="slate" />
      </div>
      <div className={open ? "mt-2 block" : "hidden print:mt-2 print:block"}>
        <FxRow label="양도가액" item={row.transfer} testId={`foreign-gain-${index}-transfer`} />
        <FxRow label="취득가액" item={row.acquisition} testId={`foreign-gain-${index}-acquisition`} />
        {row.capitalExpenditures.map((it, j) => (
          <FxRow key={`c${j}`} label={`자본적지출 ${j + 1}`} item={it} testId={`foreign-gain-${index}-capex-${j}`} />
        ))}
        {row.transferCosts.map((it, j) => (
          <FxRow key={`t${j}`} label={`양도비 ${j + 1}`} item={it} testId={`foreign-gain-${index}-cost-${j}`} />
        ))}
        {row.foreignTax.expenseKrw > 0 &&
          row.foreignTax.items.map((it, j) => (
            <FxRow key={`x${j}`} label={`필요경비 산입 외국납부세액 ${j + 1} (${TRANSFER_FOREIGN_RE.SECTION_118_6_FOREIGN_TAX})`} item={it} testId={`foreign-gain-${index}-fttax-${j}`} />
          ))}
        <AmountRow
          label={isLoss ? "양도차손" : "양도차익"}
          formula={gainFormula(row)}
          amount={row.capitalGain}
          strong
          testId={`foreign-gain-${index}-gain`}
        />
        <NoteRow label="장기보유특별공제" testId={`foreign-gain-${index}-lthd`}>
          적용 배제 — {TRANSFER_FOREIGN_RE.SECTION_118_8_MUTATIS_NO_LTHD} 단서
        </NoteRow>
        <AmountRow
          label={liable ? "양도소득금액" : "양도소득금액 (참고)"}
          formula={liable ? (isLoss ? "양도차손이라 0으로 봅니다" : undefined) : "납세의무가 없어 세액에 반영하지 않는 참고 값입니다"}
          amount={row.incomeAmount}
          strong
          testId={`foreign-gain-${index}-income`}
        />
        {liable && total >= 2 && (
          <>
            <AmountRow
              label={`기본공제 배분 (${TRANSFER_FOREIGN_RE.SECTION_118_7_DEDUCTION_ORDER} — 먼저 양도한 자산부터, 양도일 ${order}번째)`}
              amount={row.basicDeductionAllocated}
              testId={`foreign-gain-${index}-bd`}
            />
            <AmountRow label="이 자산 몫의 과세표준" formula={`양도소득금액 ${fmt(row.incomeAmount)} − 배분된 기본공제 ${fmt(row.basicDeductionAllocated)}`} amount={row.taxBaseAllocated} testId={`foreign-gain-${index}-tb`} />
          </>
        )}
      </div>
    </div>
  );
}
