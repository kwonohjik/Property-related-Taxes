"use client";

/**
 * DeductionLimitDetailCard — ⑥ §24 종합한도 펼침
 * 소비: result.deductionDetail.deductionLimitDetail
 * - 항상 표시 (공제>0 시), wasCapped=true 시 한도초과 강조
 * - 기존 DeductionLimitNoticeCard 통합 (wasCapped=false 시도 산식 표시)
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { DeductionLimitCeilingDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

interface Props {
  detail?: DeductionLimitCeilingDetail;
  rawTotalDeduction?: number;
  /** Row 트리거 없이 단독 섹션으로 사용 시 true */
  standalone?: boolean;
}

export function DeductionLimitDetailCard({ detail, rawTotalDeduction, standalone }: Props) {
  const [open, setOpen] = useState(false);

  if (!detail) return null;

  const raw = rawTotalDeduction ?? detail.rawTotalDeduction;

  if (standalone) {
    // 단독 카드 모드 (헤더 행 없이 바로 표)
    return (
      <DeductionLimitContent detail={detail} raw={raw} />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">§24 종합한도</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">
            {formatKRW(detail.limitedDeduction)}
          </span>
          <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
        </span>
      </div>

      {open && <DeductionLimitContent detail={detail} raw={raw} />}
    </>
  );
}

function DeductionLimitContent({
  detail,
  raw,
}: {
  detail: DeductionLimitCeilingDetail;
  raw: number | undefined;
}) {
  return (
    <DetailTable>
      {/* ㉯ 한도 산정 4행 */}
      <div className="px-3 py-1 text-caption font-semibold text-muted-foreground bg-muted/30">
        ㉯ §24 한도 산정
      </div>
      <DetailRow
        label="상속세 과세가액"
        value={formatKRW(detail.taxableEstateValue)}
      />
      {detail.legateeAmountNonHeir > 0 && (
        <DetailRow
          label="(−) 상속인 외 유증액 (§24 ①1호)"
          value={`− ${formatKRW(detail.legateeAmountNonHeir)}`}
          indent
          muted
          deduction
        />
      )}
      {detail.heirWaiverAmount > 0 && (
        <DetailRow
          label="(−) 선순위 상속포기 후순위 상속액 (§24 ②2호)"
          value={`− ${formatKRW(detail.heirWaiverAmount)}`}
          indent
          muted
          deduction
        />
      )}
      {detail.heirWaiverAmount > 0 && (
        <DetailRow
          label="(−) 상속포기 후순위 상속인액 (§24 ①2호)"
          value={`− ${formatKRW(detail.heirWaiverAmount)}`}
          indent
          muted
          deduction
        />
      )}
      {detail.totalPriorGiftAmount > 0 && (
        <>
          <DetailRow
            label="사전증여 합산가액 (§24 ①3호)"
            value={formatKRW(detail.totalPriorGiftAmount)}
            indent
            muted
          />
          {detail.priorGiftDeductionTotal > 0 && (
            <DetailRow
              label="(−) 증여재산공제"
              value={`− ${formatKRW(detail.priorGiftDeductionTotal)}`}
              indent
              muted
              deduction
            />
          )}
          {detail.disasterLossDeduction > 0 && (
            <DetailRow
              label="(−) 재해손실공제"
              value={`− ${formatKRW(detail.disasterLossDeduction)}`}
              indent
              muted
              deduction
            />
          )}
          <DetailRow
            label="사전증여 순 차감액"
            value={`− ${formatKRW(detail.netPriorGiftDeducted)}`}
            indent
            muted
            deduction
          />
        </>
      )}
      <SubTotalRow
        label="§24 한도 (ceiling)"
        value={formatKRW(detail.ceiling)}
      />

      {/* ㉮ 한도 적용 */}
      <div className="px-3 py-1 text-caption font-semibold text-muted-foreground bg-muted/30">
        ㉮ 한도 적용
      </div>
      {raw !== undefined && (
        <DetailRow
          label="공제 신청 합계"
          value={formatKRW(raw)}
        />
      )}
      <DetailRow
        label="§24 한도"
        value={formatKRW(detail.ceiling)}
        muted
      />
      <SubTotalRow
        label={`Min(공제합계, §24 한도)${detail.wasCapped ? " — 한도 초과 적용" : ""}`}
        value={formatKRW(detail.limitedDeduction)}
        tone={detail.wasCapped ? "amber" : "blue"}
      />

      {/* 한도 초과 강조 */}
      {detail.wasCapped && (
        <div className="px-3 py-2 text-caption text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          한도 초과 — 공제 제한: 신청액 {formatKRW(raw ?? 0)} 중{" "}
          {formatKRW((raw ?? 0) - detail.limitedDeduction)} 미적용
        </div>
      )}
    </DetailTable>
  );
}
