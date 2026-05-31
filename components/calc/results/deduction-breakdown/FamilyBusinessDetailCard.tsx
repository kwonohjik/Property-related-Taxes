"use client";

/**
 * FamilyBusinessDetailCard — ② 가업상속공제 펼침 (§18의2)
 * 기존 FamilyBusinessDeductionDetailRow 로직 흡수 + 한도표 3행 추가
 * 소비: result.deductionDetail.familyBusinessDetail
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type {
  FamilyBusinessDeductionDetail,
  FamilyBusinessIneligibleReason,
} from "@/lib/tax-engine/types/inheritance-family-business.types";
import { formatBillion, DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

const FamilyBusinessIneligibleReasonLabels: Record<FamilyBusinessIneligibleReason, string> = {
  operating_years_below_10: "영위 10년 미만 (§18의2① 가업 정의 미충족)",
  enterprise_size_exceeded: "기업 규모 초과 (자산 5천억 / 매출 5천억 미만 요건 위반)",
  industry_not_eligible: "별표 업종 외 사업 (상증령 §15①1·②1)",
  decedent_ceo_requirement_failed: "피상속인 대표이사 종사 요건 미충족 (상증령 §15③1호 나)",
  decedent_majority_share_failed: "피상속인 지분 요건 미충족 — 40% (상장 20%) × 10년 (상증령 §15③1호 가)",
  heir_not_adult: "상속인 18세 미만 (상증령 §15③2호 가)",
  heir_engagement_short: "상속인 2년 가업 종사 요건 미충족 (상증령 §15③2호 나)",
  heir_officer_not_appointed: "신고기한 내 임원 미취임 (상증령 §15③2호 다)",
  heir_ceo_not_scheduled: "신고기한 후 2년 내 대표이사 미취임 예정 (상증령 §15③2호 라)",
  medium_other_estate_exceeds_200pct: "중견기업 — 가업외 상속재산이 미공제 산출세액의 200% 초과 (§18의2②)",
  tax_fraud_conviction: "조세포탈·회계부정 형 확정 (§18의2⑧1호)",
};

// 한도표 — 영위 연수별 (§18의2 ①)
const FAMILY_BUSINESS_CAP_TABLE = [
  { label: "10년 이상~20년 미만", cap: 30_000_000_000 },
  { label: "20년 이상~30년 미만", cap: 40_000_000_000 },
  { label: "30년 이상", cap: 60_000_000_000 },
];

interface Props {
  detail?: FamilyBusinessDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
}

export function FamilyBusinessDetailCard({ detail, triggerLabel, triggerValue }: Props) {
  const [open, setOpen] = useState(false);

  const hasExpandable = detail !== undefined;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">{triggerValue}</span>
          {hasExpandable && (
            <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
          )}
        </span>
      </div>

      {open && detail && (
        <>
          {/* 직접 입력 모드 */}
          {detail.usedDirectInput && (
            <div className="mx-4 mb-2 rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-2">
              <p className="text-[11px] text-violet-700 dark:text-violet-300">
                ⓘ 가업상속공제 직접 입력 모드 — 요건 판정 우회 (한도 600억). 사후관리 위반 시 추징 (별도 Phase F).
              </p>
            </div>
          )}

          {/* 자격 미충족 */}
          {!detail.eligible && detail.ineligibleReasons && detail.ineligibleReasons.length > 0 && (
            <div className="mx-4 mb-2 rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 p-2 space-y-1">
              <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                가업상속공제 자격 미충족 — 공제 적용 불가
              </p>
              <ul className="space-y-0.5 text-[10px] text-rose-700 dark:text-rose-300 list-disc pl-4">
                {detail.ineligibleReasons.map((r, i) => (
                  <li key={i}>{FamilyBusinessIneligibleReasonLabels[r] ?? r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 자격 충족 — 한도표 + 공제액 */}
          {detail.eligible && !detail.usedDirectInput && (
            <DetailTable>
              <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground bg-muted/30">
                영위 연수별 한도 (§18의2 ①)
              </div>
              {FAMILY_BUSINESS_CAP_TABLE.map((row) => (
                <DetailRow
                  key={row.label}
                  label={row.label}
                  value={formatBillion(row.cap)}
                  muted
                />
              ))}
              <DetailRow
                label={`영위 ${detail.operatingYears}년 → 적용한도`}
                value={formatBillion(detail.appliedCap)}
              />
              {detail.autoDerivedValue !== undefined && detail.autoDerivedValue > 0 && (
                <DetailRow
                  label="자산 자동합산"
                  value={formatKRW(detail.autoDerivedValue)}
                  indent
                  muted
                />
              )}
              {detail.manualValue !== undefined && (
                <DetailRow
                  label="사용자 입력"
                  value={formatKRW(detail.manualValue)}
                  indent
                  muted
                />
              )}
              <SubTotalRow
                label="가업상속공제액"
                value={formatKRW(detail.deduction)}
                tone="blue"
              />
            </DetailTable>
          )}

          {/* 기회발전특구 특례 */}
          {detail.ofzExemptionActive && (
            <div className="mx-4 mb-2 rounded-md border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800 p-2 text-[10px] text-emerald-800 dark:text-emerald-300">
              <p className="font-semibold">기회발전특구 특례 적용 (상증령 §15㉕)</p>
              <p>본사 특구 소재·이전 + 상시근무인원 50% 이상 → 2년 내 대표이사 취임 요건 면제</p>
            </div>
          )}

          {/* 중견기업 200% 가드 */}
          {detail.mediumGuard && (
            <div className="mx-4 mb-2 rounded-md border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-800 p-2 text-[10px] text-sky-800 dark:text-sky-300">
              <p className="font-semibold mb-1">§18의2② 200% 가드 (중견기업)</p>
              <ul className="space-y-0.5 list-disc pl-4">
                <li>미공제 산출세액: {formatKRW(detail.mediumGuard.taxIfNoFBD)}</li>
                <li>200% 상한: {formatKRW(detail.mediumGuard.cap200pct)}</li>
                <li>가업외 상속재산 net: {formatKRW(detail.mediumGuard.otherEstateNet)}</li>
                <li>판정: {detail.mediumGuard.exceeded ? "초과 → 공제 배제" : "통과"}</li>
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
