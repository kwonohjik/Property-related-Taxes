"use client";

/**
 * CohabitDeductionDetailCard — ⑤ 동거주택공제 펼침 (§23의2)
 * 소비: result.deductionDetail.cohabitDeductionDetail
 *
 * Phase 2 (2026-06-07): cohabitYears echo 표시 + meetsRequirement=false 경고
 * Phase 3 (2026-06-07): ancillaryLandLimitReduction 표시 (>0 차감 / =0 한도 이내)
 * Phase 4 (2026-06-07): reasonBreakdown 내역 표 + 경고 배지 3종 + usedLegacyFallback 안내
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { CohabitDeductionDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import type { CohabitReasonType } from "@/lib/tax-engine/types/inheritance-gift.types";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

// ============================================================
// 사유 유형 한국어 라벨 (결과 카드 전용 — CohabitReasonList와 동일 정의)
// ============================================================

const REASON_LABEL: Record<CohabitReasonType, string> = {
  conscription: "징집·소집",
  schooling: "취학 (고교·국내대학)",
  work: "근무상 형편",
  medical: "질병 요양 1년 이상",
  reconstruction_lease: "재건축 전세 (산입)",
  overseas_grad: "국외 대학원 (불인정)",
};

const EFFECT_LABEL: Record<"excluded" | "included" | "not_recognized", string> = {
  excluded: "제외(−)",
  included: "산입(+)",
  not_recognized: "불인정",
};


// ============================================================
// Props
// ============================================================

interface Props {
  detail?: CohabitDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
}

// ============================================================
// 메인 컴포넌트
// ============================================================

// ============================================================
// isExcluded 배지 라벨
// ============================================================

const EXCLUSION_REASON_LABEL: Record<"one_plus_one_right" | "sale_right", string> = {
  one_plus_one_right: "1+1 입주권 미적용",
  sale_right: "분양권 미적용",
};

export function CohabitDeductionDetailCard({ detail, triggerLabel, triggerValue }: Props) {
  const [open, setOpen] = useState(false);

  const cy = detail?.cohabitYears;
  const isExcluded = detail?.isExcluded === true;
  const exclusionReason = detail?.exclusionReason;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          {/* isExcluded 미적용 배지 (1+1 입주권 / 분양권) */}
          {isExcluded && exclusionReason && (
            <span
              className="text-micro font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded px-1.5 py-0.5"
              data-testid="cohabit-excluded-badge"
            >
              {EXCLUSION_REASON_LABEL[exclusionReason]}
            </span>
          )}
          {/* meetsRequirement=false 경고 배지 */}
          {!isExcluded && cy && !cy.meetsRequirement && (
            <span
              className="text-micro font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded px-1.5 py-0.5"
              data-testid="cohabit-years-warning-badge"
            >
              동거 {cy.effectiveYears}년 (10년 미달)
            </span>
          )}
          {/* hasOverseasGradWarning 배지 */}
          {!isExcluded && cy?.hasOverseasGradWarning && (
            <span
              className="text-micro font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded px-1.5 py-0.5"
              data-testid="cohabit-overseas-warning-badge"
            >
              국외대학원 불인정
            </span>
          )}
          <span className="font-mono text-sm">{triggerValue}</span>
          {detail && <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />}
        </span>
      </div>

      {/* 미적용 상세 — isExcluded=true 시 산식 대신 사유 행만 표시 */}
      {open && detail && isExcluded && (
        <DetailTable>
          <DetailRow
            label={`선택 자산 종류(${exclusionReason ? EXCLUSION_REASON_LABEL[exclusionReason] : "미적용"})는 §23의2 동거주택 상속공제 대상이 아닙니다.`}
            value="공제 0"
            muted
          />
        </DetailTable>
      )}

      {open && detail && !isExcluded && (
        <DetailTable>
          {/* Phase 2: G3 동거연수 echo */}
          {cy && (
            <>
              <DetailRow
                label="동거 시작일 기준 산입 연수"
                value={`${cy.rawYears}년`}
              />
              {cy.minorYearsDeducted > 0 && (
                <DetailRow
                  label="(−) 미성년자 기간 제외 (§23의2①1호, 2016~)"
                  value={`− ${cy.minorYearsDeducted}년`}
                  indent
                  muted
                  deduction
                />
              )}

              {/* Phase 4: reasonBreakdown 내역 표 */}
              {cy.reasonBreakdown.length > 0 && (
                <>
                  <DetailRow
                    label="§23의2② 부득이한 사유 내역"
                    value=""
                    muted
                  />
                  {cy.reasonBreakdown.map((rb, i) => {
                    const daysLabel =
                      rb.clampedDays > 0
                        ? `${rb.clampedDays}일`
                        : "동거기간 외";
                    return (
                      <DetailRow
                        key={i}
                        label={`  ${REASON_LABEL[rb.type]} (${rb.inputStartDate} ~ ${rb.inputEndDate})`}
                        value={`${EFFECT_LABEL[rb.effect]} ${daysLabel}`}
                        indent
                        muted
                      />
                    );
                  })}
                </>
              )}

              {cy.reasonExcludedYears > 0 && (
                <DetailRow
                  label={
                    cy.usedLegacyFallback
                      ? "(−) 부득이 사유 제외 (수동 입력값)"
                      : "(−) §23의2② 부득이 사유 제외 합계"
                  }
                  value={`− ${cy.reasonExcludedYears}년`}
                  indent
                  muted
                  deduction
                />
              )}

              <SubTotalRow
                label="유효 동거연수"
                value={`${cy.effectiveYears}년`}
                tone={cy.meetsRequirement ? "blue" : "amber"}
              />

              {/* 경고 3종 */}
              {!cy.meetsRequirement && (
                <DetailRow
                  label="⚠ 10년 미달 — 요건 충족 여부 확인 필요"
                  value=""
                  muted
                />
              )}
              {cy.hasOverseasGradWarning && (
                <DetailRow
                  label="⚠ 국외 대학원은 부득이한 사유 미해당 (재조세-434) — 계속성 단절 주의"
                  value=""
                  muted
                />
              )}
              {cy.hasMedicalUnder1YWarning && (
                <DetailRow
                  label="⚠ 1년 미만 질병 요양은 인정 제외 (시행규칙 §9의2①3호)"
                  value=""
                  muted
                />
              )}
              {cy.hasReconstructionLeaseNote && (
                <DetailRow
                  label="재건축 전세 기간 동거기간 산입 (국세청 재산-248)"
                  value=""
                  muted
                />
              )}
              {cy.usedLegacyFallback && (
                <DetailRow
                  label="(참고) 구 수동 입력값 사용 — 사유별 입력으로 갱신 권장"
                  value=""
                  muted
                />
              )}
            </>
          )}

          <DetailRow
            label="동거주택 공시가격 (평가액)"
            value={formatKRW(detail.housingValue)}
          />
          {/* Phase 3: G4 부수토지 면적한도 — 초과 차감 또는 한도 이내(차감 없음) */}
          {detail.ancillaryLandLimitReduction !== undefined &&
            detail.ancillaryLandLimitReduction > 0 && (
              <DetailRow
                label="(−) 주택부수토지 면적한도 초과 차감 (소득세 시행령 §154⑦)"
                value={`− ${formatKRW(detail.ancillaryLandLimitReduction)}`}
                indent
                muted
                deduction
              />
            )}
          {detail.ancillaryLandLimitReduction === 0 && (
            <DetailRow
              label="주택부수토지 면적 한도 이내 (소득세 시행령 §154⑦)"
              value="차감 없음"
              indent
              muted
            />
          )}
          {detail.securedDebt > 0 && (
            <DetailRow
              label="(−) 담보된 피상속인 채무 (§23의2 ①)"
              value={`− ${formatKRW(detail.securedDebt)}`}
              indent
              muted
              deduction
            />
          )}
          <SubTotalRow
            label="공제 기준액"
            value={formatKRW(detail.base)}
          />
          <DetailRow
            label={`공제율 ${(detail.rate * 100).toFixed(0)}%`}
            value={formatKRW(detail.rawDeduction)}
          />
          <DetailRow
            label={`${(detail.cap / 100_000_000).toFixed(0)}억 최고한도`}
            value={formatKRW(detail.cap)}
            muted
          />
          <SubTotalRow
            label={`Min(공시가격 × ${(detail.rate * 100).toFixed(0)}%, ${(detail.cap / 100_000_000).toFixed(0)}억)`}
            value={formatKRW(detail.cappedDeduction)}
            tone="blue"
          />
        </DetailTable>
      )}
    </>
  );
}
