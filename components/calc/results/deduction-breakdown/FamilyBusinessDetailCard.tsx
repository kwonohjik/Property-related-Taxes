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
import type { Heir, HeirRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatBillion, DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

/** 가업상속인명 resolve — id 직접노출 금지 (feedback_no_internal_id_in_result) */
function resolveHeirName(heirId: string | undefined, heirs: Heir[] | undefined): string {
  if (!heirId || !heirs) return "미지정";
  const heir = heirs.find((h) => h.id === heirId);
  if (!heir) return "미지정";
  if (heir.name?.trim()) return heir.name.trim();
  const RELATION_LABEL: Record<HeirRelation, string> = {
    spouse: "배우자",
    child: "자녀",
    lineal_ascendant: "직계존속",
    sibling: "형제자매",
    other: "기타",
    legatee: "수유자",
    corporate: "영리법인",
  };
  return RELATION_LABEL[heir.relation] ?? heir.relation;
}

const SOURCE_LABEL: Record<"auto" | "override" | "legacy", string> = {
  auto: "자동판정",
  override: "수동 보정",
  legacy: "기존 입력",
};

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
  /** 가업상속인명 resolve용 — heirId→name (feedback_no_internal_id_in_result) */
  heirs?: Heir[];
  /** 가업상속인 heirId — detail.resolvedRequirements와 함께 노출 */
  heirId?: string;
}

export function FamilyBusinessDetailCard({ detail, triggerLabel, triggerValue, heirs, heirId }: Props) {
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

          {/* 복수가업 순차공제 (상증령 §15④ · 상증칙 §5) */}
          {detail.eligible && !detail.usedDirectInput && detail.multipleBusinessDetail && (
            <DetailTable>
              <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground bg-muted/30">
                복수가업 순차공제 (상증령 §15④ · 상증칙 §5) — 총한도{" "}
                {formatBillion(detail.multipleBusinessDetail.totalCap)}
              </div>
              {detail.multipleBusinessDetail.lineItems.map((li) => (
                <DetailRow
                  key={li.order}
                  label={`${li.order}순위 ${li.label ?? `영위 ${li.operatingYears}년`} — Min(잔여 ${formatBillion(li.remainingTotalCapBefore)}, 가액 ${formatKRW(li.value)}, 개별한도 ${formatBillion(li.individualCap)})`}
                  value={formatKRW(li.deduction)}
                />
              ))}
              <SubTotalRow
                label="복수가업 공제 합계"
                value={formatKRW(detail.multipleBusinessDetail.totalDeduction)}
                tone="blue"
              />
            </DetailTable>
          )}

          {/* 자격 충족 — 단일 가업 한도표 + 공제액 */}
          {detail.eligible && !detail.usedDirectInput && !detail.multipleBusinessDetail && (
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
              {detail.mediumGuard.active === false ? (
                <p>
                  미공제 산출세액 미연동 — 200% 비교 보류, 공제 유지(가업외 상속재산 net{" "}
                  {formatKRW(detail.mediumGuard.otherEstateNet)}).
                </p>
              ) : (
                <ul className="space-y-0.5 list-disc pl-4">
                  <li>미공제 산출세액: {formatKRW(detail.mediumGuard.taxIfNoFBD)}</li>
                  <li>200% 상한: {formatKRW(detail.mediumGuard.cap200pct)}</li>
                  <li>가업외 상속재산 net: {formatKRW(detail.mediumGuard.otherEstateNet)}</li>
                  <li>판정: {detail.mediumGuard.exceeded ? "초과 → 공제 배제" : "통과"}</li>
                </ul>
              )}
            </div>
          )}

          {/* 요건 자동판정 메타 (Phase 1 — resolvedRequirements) */}
          {detail.resolvedRequirements && (
            <div className="mx-4 mb-2 rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-800 p-2 text-[10px] text-sky-800 dark:text-sky-300 space-y-1">
              <p className="font-semibold">요건 자동판정 근거 (상증령 §15③2호)</p>
              {/* 가업상속인명 (id 직접 노출 금지) */}
              {heirId && (
                <p>가업상속인: {resolveHeirName(heirId, heirs)}</p>
              )}
              <p>신고기한 (§67): {detail.resolvedRequirements.filingDeadline}</p>
              <ul className="space-y-0.5 list-none pl-1">
                {/* 피상속인 요건 (Phase 2 — source Partial이므로 optional) */}
                {detail.resolvedRequirements.source.decedentMajorShareholdingMet && (
                  <li>
                    피상속인 가. 지분 요건:{" "}
                    <span className={detail.resolvedRequirements.source.decedentMajorShareholdingMet === "override" ? "text-amber-700 dark:text-amber-300 font-medium" : ""}>
                      {SOURCE_LABEL[detail.resolvedRequirements.source.decedentMajorShareholdingMet]}
                    </span>
                  </li>
                )}
                {detail.resolvedRequirements.source.decedentCEORequirementMet && (
                  <li>
                    피상속인 나. 대표이사:{" "}
                    <span className={detail.resolvedRequirements.source.decedentCEORequirementMet === "override" ? "text-amber-700 dark:text-amber-300 font-medium" : ""}>
                      {SOURCE_LABEL[detail.resolvedRequirements.source.decedentCEORequirementMet]}
                    </span>
                  </li>
                )}
                {/* 상속인 요건 (Phase 1) */}
                <li>
                  가. 18세 이상:{" "}
                  <span className={detail.resolvedRequirements.source.heirIsAdult === "override" ? "text-amber-700 dark:text-amber-300 font-medium" : ""}>
                    {detail.resolvedRequirements.source.heirIsAdult
                      ? SOURCE_LABEL[detail.resolvedRequirements.source.heirIsAdult]
                      : "—"}
                  </span>
                </li>
                <li>
                  나. 2년 종사:{" "}
                  <span className={detail.resolvedRequirements.source.heirTwoYearEngagement === "override" ? "text-amber-700 dark:text-amber-300 font-medium" : ""}>
                    {detail.resolvedRequirements.source.heirTwoYearEngagement
                      ? SOURCE_LABEL[detail.resolvedRequirements.source.heirTwoYearEngagement]
                      : "—"}
                  </span>
                </li>
                <li>
                  다. 임원취임:{" "}
                  <span className={detail.resolvedRequirements.source.heirOfficerByFilingDeadline === "override" ? "text-amber-700 dark:text-amber-300 font-medium" : ""}>
                    {detail.resolvedRequirements.source.heirOfficerByFilingDeadline
                      ? SOURCE_LABEL[detail.resolvedRequirements.source.heirOfficerByFilingDeadline]
                      : "—"}
                  </span>
                </li>
                <li>
                  라. 대표이사:{" "}
                  <span className={detail.resolvedRequirements.source.heirCEOWithinTwoYears === "override" ? "text-amber-700 dark:text-amber-300 font-medium" : ""}>
                    {detail.resolvedRequirements.source.heirCEOWithinTwoYears
                      ? SOURCE_LABEL[detail.resolvedRequirements.source.heirCEOWithinTwoYears]
                      : "—"}
                  </span>
                </li>
              </ul>
              {Object.values(detail.resolvedRequirements.source).some((s) => s === "override") && (
                <p className="text-amber-700 dark:text-amber-300">
                  ⚠️ 수동 보정 항목이 있습니다. 근거서류를 보관하세요.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
