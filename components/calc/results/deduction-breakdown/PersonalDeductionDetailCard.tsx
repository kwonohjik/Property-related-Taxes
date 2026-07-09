"use client";

/**
 * PersonalDeductionDetailCard — ② 그 밖의 인적공제 4종 펼침 (상증법 §20)
 * 소비: result.deductionDetail.personalDeductionDetail (echo — 신규 계산 0)
 * 패턴: CohabitDeductionDetailCard 동일 구조.
 * 이름 표시: detail.name?.trim() 우선, 없으면 관계 라벨 (id 직접 노출 금지).
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { PersonalDeductionDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

interface Props {
  detail?: PersonalDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
}

export function PersonalDeductionDetailCard({
  detail,
  triggerLabel,
  triggerValue,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">{triggerValue}</span>
          {detail && (
            <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
          )}
        </span>
      </div>

      {open && detail && (
        <DetailTable>
          {/* ① 자녀공제 (§20①1호) */}
          {detail.childCount > 0 && (
            <DetailRow
              label={`자녀공제 ${detail.childCount}명 × 5,000만원`}
              value={formatKRW(detail.childDeduction)}
            />
          )}

          {/* ② 미성년자공제 (§20①2호) — per-heir */}
          {detail.minorPerHeir.map((r, i) => {
            const who = r.name?.trim()
              ? `${r.name.trim()}${r.isCohabitant ? " (동거가족)" : ""}`
              : r.isCohabitant
                ? "동거가족"
                : "미성년 상속인";
            return (
              <DetailRow
                key={`minor-${i}`}
                indent
                label={`${who} (만 ${r.age}세): (19 − ${r.age})년 × 1,000만원`}
                value={formatKRW(r.deduction)}
              />
            );
          })}
          {detail.minorPerHeir.length > 0 && (
            <SubTotalRow
              label="미성년자공제 합계"
              value={formatKRW(detail.minorDeduction)}
            />
          )}

          {/* ③ 연로자공제 (§20①3호) */}
          {detail.elderCount > 0 && (
            <DetailRow
              label={`연로자공제 ${detail.elderCount}명 × 5,000만원 (65세 이상, 배우자·자녀 제외)`}
              value={formatKRW(detail.elderDeduction)}
            />
          )}

          {/* ④ 장애인공제 (§20①4호) — per-heir */}
          {detail.disabledPerHeir.map((r, i) => {
            const who = r.name?.trim()
              ? `${r.name.trim()}${r.isCohabitant ? " (동거가족)" : ""}`
              : r.isCohabitant
                ? "동거가족"
                : "장애인 상속인";
            const genderLabel =
              r.gender === "male"
                ? "남성"
                : r.gender === "female"
                  ? "여성"
                  : "성별 미입력";
            return (
              <DetailRow
                key={`disabled-${i}`}
                indent
                label={`${who}: ${genderLabel} 만 ${r.age}세 기대여명 ${r.lifeExpectancy}년 × 1,000만원`}
                value={formatKRW(r.deduction)}
              />
            );
          })}
          {detail.disabledPerHeir.length > 0 && (
            <SubTotalRow
              label="장애인공제 합계"
              value={formatKRW(detail.disabledDeduction)}
            />
          )}

          {/* 합계 */}
          <SubTotalRow
            tone="blue"
            label="인적공제 합계 (§20)"
            value={formatKRW(detail.total)}
          />

          {/* §20③ 안내 */}
          <div className="px-3 py-1.5 text-caption text-muted-foreground">
            ※ 미성년자·장애인 연수는 1년 미만을 1년으로 올림 (상증법 §20③)
          </div>
        </DetailTable>
      )}
    </>
  );
}
