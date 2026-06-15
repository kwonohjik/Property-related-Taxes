"use client";

/**
 * 가업상속공제 자격 입력 (FB-ELIG) — 오케스트레이터
 *
 * 법령: 상증법 §18의2 + 상증령 §15
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - 상증법 §18의2 mst=276123 (시행 2026-01-02)
 *   - 상증령 §15 mst=283637 (시행 2026-02-27)
 *
 * 800줄 정책 분리 (2026-06-02):
 *   - family-business/FamilyBusinessHeirSelector.tsx  (섹션③ ~80줄)
 *   - family-business/FbHeirRequirementsSection.tsx   (섹션④ ~230줄)
 *   - family-business/FbAutoCheckPreviewCard.tsx      (미리보기 공통 ~100줄)
 *
 * 정책:
 *   - feedback_three_state_optional_mode_toggle (3-state)
 *   - feedback_dialog_data_discard_confirm (OFF 시 데이터 폐기 확인)
 *   - mirror-pattern (useEffect → store 미러링 금지)
 *   - single-source-engine-helper (evaluateFamilyBusinessEligibility·familyBusinessCap 엔진 헬퍼)
 *   - feedback_useeffect_store_mirror_forbidden
 *   - feedback_toggle_card_visibility (ToggleCard·RadioCardGroup 강제)
 *   - feedback_tailwind_static_tone_mapping (dynamic class 금지)
 *   - feedback_800line_split_export_preservation (re-export 보존)
 */

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";
import {
  evaluateFamilyBusinessEligibility,
  familyBusinessCap,
  resolveFamilyBusinessHeirId,
  suggestFBOperatingYears,
} from "@/lib/tax-engine/deductions/family-business";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-family-business.types";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { FamilyBusinessHeirSelector } from "./family-business/FamilyBusinessHeirSelector";
import { FbHeirRequirementsSection } from "./family-business/FbHeirRequirementsSection";
import { FbDecedentRequirementsSection } from "./family-business/FbDecedentRequirementsSection";
import { FbAdditionalBusinessesSection } from "./family-business/FbAdditionalBusinessesSection";

// 빈 FamilyBusinessInheritanceInput — ON 토글 시 초기화
const EMPTY_FB: FamilyBusinessInheritanceInput = {
  businessType: "individual",
  operatingYears: 0,
  enterpriseSize: "sme",
  isEligibleIndustry: false,
  decedentCEORequirementMet: false,
  heirIsAdult: false,
  heirTwoYearEngagement: false,
  heirOfficerByFilingDeadline: false,
  heirCEOWithinTwoYears: false,
  unrelatedAssetsAcknowledged: false,
  postManagementAcknowledged: false,
};

function isEmptyFb(f: FamilyBusinessInheritanceInput): boolean {
  return (
    f.operatingYears === 0 &&
    !f.isEligibleIndustry &&
    !f.decedentCEORequirementMet &&
    !f.heirIsAdult &&
    !f.heirTwoYearEngagement &&
    !f.heirOfficerByFilingDeadline &&
    !f.heirCEOWithinTwoYears &&
    !f.unrelatedAssetsAcknowledged &&
    !f.postManagementAcknowledged &&
    !f.spouseFulfillsRequirements &&
    !f.decedentMajorShareholdingMet &&
    !f.isListedOnExchange &&
    !f.decedentEarlyDeath &&
    !f.hasTaxFraudConviction &&
    f.totalAssets == null &&
    f.averageRevenue3Y == null &&
    f.heirOtherEstateValue == null &&
    f.heirDebt == null
  );
}

const INELIGIBLE_REASON_LABELS: Record<string, string> = {
  operating_years_below_10: "영위 기간 10년 미만 (§18의2①)",
  enterprise_size_exceeded: "자산/매출 5천억 이상 (상증령 §15①3·②3)",
  industry_not_eligible: "별표 업종 미해당 (상증령 §15①1·②1)",
  decedent_ceo_requirement_failed: "피상속인 대표이사 요건 미충족 (상증령 §15③1호 나)",
  decedent_majority_share_failed: "피상속인 지분 40%(상장20%) 미충족 (상증령 §15③1호 가)",
  heir_not_adult: "상속인 18세 미만 (상증령 §15③2호 가)",
  heir_engagement_short: "상속인 2년 종사 미충족 (상증령 §15③2호 나)",
  heir_officer_not_appointed: "신고기한 내 임원 미취임 (상증령 §15③2호 다)",
  heir_ceo_not_scheduled: "2년 내 대표이사 미취임 (상증령 §15③2호 라)",
  medium_other_estate_exceeds_200pct: "가업외 상속재산 200% 초과 (§18의2② + 상증령 §15⑥⑦)",
  tax_fraud_conviction: "조세포탈·회계부정 형 확정 (§18의2⑧1호)",
};

/** 신고서 표시 정보 — 짧은 텍스트 입력 (계산 미사용) */
function FbTextField({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-amber-700 dark:text-amber-300">
        {label}
      </label>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={placeholder}
        className={`w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs ${mono ? "font-mono" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      />
    </div>
  );
}

export interface FamilyBusinessEligibilitySectionProps {
  familyBusiness: FamilyBusinessInheritanceInput | undefined;
  onChange: (fb: FamilyBusinessInheritanceInput | undefined) => void;
  /** 상속개시일 — 영위연수 제안·신고기한·18세 useMemo 계산용 */
  deathDate?: string;
  /** 상속인 목록 — 가업상속인 선택 RadioCardGroup용 */
  heirs?: Heir[];
  /** 주 가업 가업상속재산가액 (원) — 복수가업 순차공제 미리보기용 (form.familyBusinessValue) */
  mainBusinessValue?: number;
}

export function FamilyBusinessEligibilitySection({
  familyBusiness,
  onChange,
  deathDate,
  heirs,
  mainBusinessValue,
}: FamilyBusinessEligibilitySectionProps) {
  const isActive = familyBusiness !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  // 엔진 단일 소스 — 자격 판정 (single-source-engine-helper)
  const evalResult = useMemo(
    () =>
      familyBusiness ? evaluateFamilyBusinessEligibility(familyBusiness) : null,
    [familyBusiness],
  );

  // 한도 미리보기 (엔진 단일 소스)
  const capPreview = useMemo(
    () =>
      familyBusiness
        ? familyBusinessCap(familyBusiness.operatingYears)
        : null,
    [familyBusiness],
  );

  // 영위연수 제안값 (useMemo — store 미러링 없음, 제안만)
  const suggestedYears = useMemo(() => {
    if (!familyBusiness?.openingDate || !deathDate) return null;
    try {
      return suggestFBOperatingYears(familyBusiness.openingDate, deathDate);
    } catch {
      return null;
    }
  }, [familyBusiness, deathDate]);

  // 선택된 Heir의 birthDate (섹션④에 전달)
  // H-3 fix: heirId=undefined 시 자연인 1명이면 resolveFamilyBusinessHeirId로 fallback (UI display fallback 3중 패턴)
  const selectedHeirBirthDate = useMemo(() => {
    if (!heirs) return undefined;
    const resolvedHeirId = resolveFamilyBusinessHeirId(heirs, familyBusiness?.heirId);
    if (!resolvedHeirId) return undefined;
    return heirs.find((h) => h.id === resolvedHeirId)?.birthDate;
  }, [familyBusiness, heirs]);

  const handleToggleOn = () => onChange({ ...EMPTY_FB });
  const handleToggleOff = () => {
    if (!familyBusiness || isEmptyFb(familyBusiness)) {
      onChange(undefined);
      return;
    }
    setDiscardOpen(true);
  };

  const update = (patch: Partial<FamilyBusinessInheritanceInput>) => {
    if (!familyBusiness) return;
    onChange({ ...familyBusiness, ...patch });
  };

  const isCorporate = familyBusiness?.businessType === "corporate";
  const isMedium = familyBusiness?.enterpriseSize === "medium";

  return (
    <div className="space-y-3">
      <ToggleCard
        tone="amber"
        title="가업상속공제 요건 입력 (§18의2 + 상증령 §15)"
        description={
          isActive
            ? "활성화됨 — 아래 요건을 정확히 체크해야 공제가 적용됩니다."
            : "체크하면 자격 요건을 정확히 평가합니다. 미체크 시 가업재산가액·영위연수 수동 입력값을 그대로 한도까지 공제 (legacy)."
        }
        checked={isActive}
        onCheckedChange={(v) => (v ? handleToggleOn() : handleToggleOff())}
      />

      <div className="flex flex-wrap gap-1.5 px-1">
        <LawArticleModal legalBasis="상증법 §18의2" label="§18의2 가업상속공제" />
        <LawArticleModal legalBasis="상증령 §15" label="상증령 §15 요건" />
      </div>

      {familyBusiness && (
        <div className="rounded-md border border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800 p-3 space-y-4">

          {/* ── 신고서 표시 정보 (별지 제1호서식 가·다·라 식별정보, 계산 미사용) ── */}
          <div className="space-y-2 rounded border border-amber-200 bg-amber-100/40 dark:bg-amber-900/20 p-2">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              별지 제1호서식 표시 정보 (선택 — 계산에는 사용되지 않음)
            </p>
            {/* 가. 가업현황 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FbTextField label="사업자등록번호" mono value={familyBusiness.businessRegistrationNumber} onChange={(v) => update({ businessRegistrationNumber: v })} />
              <FbTextField label="업종" value={familyBusiness.industryName} onChange={(v) => update({ industryName: v })} />
              <FbTextField label="대표자 성명" value={familyBusiness.representativeName} onChange={(v) => update({ representativeName: v })} />
              <FbTextField label="대표자 주민등록번호" mono value={familyBusiness.representativeResidentNumber} onChange={(v) => update({ representativeResidentNumber: v })} />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-amber-700 dark:text-amber-300">개업연월일</label>
              <DateInput value={familyBusiness.openingDate ?? ""} onChange={(v) => update({ openingDate: v || undefined })} />
            </div>
            {/* 다. 피상속인 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FbTextField label="대표이사 재직기간" placeholder="예: 20년" value={familyBusiness.decedentCeoTenure} onChange={(v) => update({ decedentCeoTenure: v })} />
              <FbTextField label="특수관계인포함 지분율" placeholder="예: 60%" value={familyBusiness.decedentShareRatio} onChange={(v) => update({ decedentShareRatio: v })} />
            </div>
            {/* 라. 가업상속인 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FbTextField label="가업종사기간" value={familyBusiness.heirEngagementPeriod} onChange={(v) => update({ heirEngagementPeriod: v })} />
            </div>
          </div>

          {/* ── 섹션① 가업 기본 (amber) ── */}
          <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">1</span>
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">가업 기본 정보</p>
            </div>

            {/* 사업 유형 */}
            <RadioCardGroup<"individual" | "corporate">
              name="fb-business-type"
              layout="inline"
              tone="amber"
              value={familyBusiness.businessType}
              options={[
                { value: "individual", label: "개인사업 (소득세법)", description: "지분 요건 미적용" },
                { value: "corporate", label: "법인 (법인세법)", description: "지분 40%·상장 20% 요건 적용" },
              ]}
              onChange={(v) => update({ businessType: v })}
            />

            {/* 영위 연수 + 제안 */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">가업 영위 연수</p>
              <DecimalInput
                value={familyBusiness.operatingYears > 0 ? String(familyBusiness.operatingYears) : ""}
                onChange={(v) => update({ operatingYears: parseDecimal(v) ?? 0 })}
                placeholder="영위 연수 입력 (년)"
              />
              {/* 영위연수 제안 (자동 덮어쓰기 금지 — 버튼 클릭으로만 채움) */}
              {suggestedYears !== null && familyBusiness.operatingYears === 0 && (
                <div className="rounded bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                  <span>
                    개업일~상속개시일 기준 제안값: <strong>{suggestedYears}년</strong>
                    <span className="ml-1 opacity-70">(확인 후 적용 — 자동 덮어쓰기 아님)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => update({ operatingYears: suggestedYears })}
                    className="shrink-0 px-2 py-0.5 text-[10px] rounded border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800"
                  >
                    적용
                  </button>
                </div>
              )}
              {capPreview !== null && (
                <div className="rounded bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                  {capPreview === 0
                    ? "⚠️ 10년 미만 — 공제 자격 미충족"
                    : capPreview === 30_000_000_000
                      ? "✓ 10년 이상 (1호) — 한도 300억"
                      : capPreview === 40_000_000_000
                        ? "✓ 20년 이상 (2호) — 한도 400억"
                        : "✓ 30년 이상 (3호) — 한도 600억"}
                </div>
              )}
            </div>

            {/* 기업 규모 */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">기업 규모 (상증령 §15①②)</p>
              <RadioCardGroup<"sme" | "medium">
                name="fb-enterprise-size"
                layout="inline"
                tone="amber"
                value={familyBusiness.enterpriseSize}
                options={[
                  { value: "sme", label: "중소기업", description: "자산총액 5천억 미만" },
                  { value: "medium", label: "중견기업", description: "평균매출 5천억 미만 + 200% 가드 적용" },
                ]}
                onChange={(v) => update({ enterpriseSize: v })}
              />
              {familyBusiness.enterpriseSize === "sme" ? (
                <CurrencyInput
                  label="자산총액 (원)"
                  value={familyBusiness.totalAssets != null ? String(familyBusiness.totalAssets) : ""}
                  onChange={(v) => update({ totalAssets: parseAmount(v) || undefined })}
                  hint="중소기업 기준 5천억 이하 확인용 — 미입력 시 기준 미충족으로 처리"
                  placeholder="없으면 빈칸"
                />
              ) : (
                <CurrencyInput
                  label="직전 3개 과세기간 평균 매출액 (원)"
                  value={familyBusiness.averageRevenue3Y != null ? String(familyBusiness.averageRevenue3Y) : ""}
                  onChange={(v) => update({ averageRevenue3Y: parseAmount(v) || undefined })}
                  hint="중견기업 기준 5천억 이하 확인용 — 미입력 시 기준 미충족으로 처리"
                  placeholder="없으면 빈칸"
                />
              )}
            </div>

            {/* 별표 업종 */}
            <ToggleCard
              tone="sky"
              title="별표 업종 해당 (상증령 §15①1·②1)"
              description="상증령 별표에 열거된 업종 영위 자기 확인"
              checked={familyBusiness.isEligibleIndustry}
              onCheckedChange={(v) => update({ isEligibleIndustry: v })}
            />
          </div>

          {/* ── 섹션② 피상속인 요건 (amber) ── */}
          {isCorporate && deathDate ? (
            <FbDecedentRequirementsSection
              familyBusiness={familyBusiness}
              deathDate={deathDate}
              onChange={update}
            />
          ) : isCorporate ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-[11px] text-amber-700 dark:text-amber-300">
              상속개시일을 입력하면 피상속인 요건 자동판정이 활성화됩니다.
            </div>
          ) : (
            /* 개인사업 — 지분 요건 없음, 대표이사 요건만 레거시 토글 */
            <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">2</span>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">피상속인 요건 (상증령 §15③1호)</p>
              </div>
              <ToggleCard
                tone="amber"
                size="sm"
                title="대표이사 종사 요건 충족 (상증령 §15③1호 나)"
                description="50% 이상 재임 / 상속인 승계 후 10년 계속 / 10년 중 5년 이상 재임 중 1 충족"
                checked={familyBusiness.decedentCEORequirementMet}
                onCheckedChange={(v) => update({ decedentCEORequirementMet: v })}
              />
            </div>
          )}

          {/* ── 섹션③ 가업상속인 지정 (sky) ── */}
          <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">3</span>
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-200">가업상속인 지정 (§15③2호)</p>
            </div>
            {heirs && heirs.length > 0 && deathDate ? (
              <FamilyBusinessHeirSelector
                heirs={heirs}
                heirId={familyBusiness.heirId}
                heirBirthDate={familyBusiness.heirBirthDate}
                deathDate={deathDate}
                onChange={update}
              />
            ) : (
              <p className="text-[11px] text-sky-600 dark:text-sky-400">
                상속인을 먼저 등록하면 가업상속인을 선택할 수 있습니다.
              </p>
            )}
          </div>

          {/* ── 섹션④ 상속인 요건 — FbHeirRequirementsSection (sky) ── */}
          {deathDate ? (
            <FbHeirRequirementsSection
              familyBusiness={familyBusiness}
              heirBirthDate={selectedHeirBirthDate}
              deathDate={deathDate}
              onChange={update}
            />
          ) : (
            <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 p-3 text-[11px] text-sky-700 dark:text-sky-300">
              상속개시일을 입력하면 상속인 요건 자동판정이 활성화됩니다.
            </div>
          )}

          {/* ── 섹션⑤ 안내·동의 (amber) ── */}

          {/* 200% 가드 (중견기업 한정) */}
          {isMedium && (
            <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                §18의2② 200% 가드 산정 (중견기업 한정)
              </p>
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                가업상속인의 가업외 상속재산(채무 차감)이 납부세액의 200%를 초과하면 공제 배제됩니다.
                미입력 시 가드 미계산 (적용 불명확).
              </p>
              <CurrencyInput
                label="가업외 상속재산가액 (원)"
                value={familyBusiness.heirOtherEstateValue != null ? String(familyBusiness.heirOtherEstateValue) : ""}
                onChange={(v) => update({ heirOtherEstateValue: parseAmount(v) || undefined })}
                hint="가업상속인이 받는 가업 외 상속재산 가액"
                placeholder="없으면 빈칸"
              />
              <CurrencyInput
                label="가업상속인 부담 채무 (원)"
                value={familyBusiness.heirDebt != null ? String(familyBusiness.heirDebt) : ""}
                onChange={(v) => update({ heirDebt: parseAmount(v) || undefined })}
                hint="가업상속인이 승계하는 채무 (상증령 §15⑥1호 차감)"
                placeholder="없으면 빈칸"
              />
            </div>
          )}

          {/* 사업무관자산 안내 (sky tone) */}
          <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">
              ⓘ 사업무관자산 차감 안내 (§15⑤2호)
            </p>
            <p className="text-[10px] text-sky-700 dark:text-sky-300">
              법인 주식(corporate_stock)은 §15⑤2호에 따라 사업무관자산 가액을 차감한 후 가업상속재산에 포함됩니다.
              Step1 자산 카드에서 familyBusinessCategory 선택 시, 사업무관자산 차감 후 평가액을 직접 입력하세요.
            </p>
            <ToggleCard
              tone="sky"
              size="sm"
              title="사업무관자산 차감 후 가액 입력 완료 자기 확인"
              description="체크 시 계산 진행. 미체크 시 결과에 경고 표시"
              checked={familyBusiness.unrelatedAssetsAcknowledged}
              onCheckedChange={(v) => update({ unrelatedAssetsAcknowledged: v })}
            />
          </div>

          {/* 사후관리 안내 (amber tone) */}
          <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              ⓘ 사후관리 의무 안내 (§18의2⑤)
            </p>
            <p className="text-[10px] text-amber-700 dark:text-amber-300">
              가업상속공제 수혜 후 5년(기존 7년) 이내 폐업·지분 처분·가업 무관 업종 전환 시 공제액 전부 또는 일부가 추징됩니다.
            </p>
            <ToggleCard
              tone="amber"
              size="sm"
              title="5년 사후관리 의무 인지·동의"
              description="체크 시 계산 진행. 미체크 시 결과에 경고 표시"
              checked={familyBusiness.postManagementAcknowledged}
              onCheckedChange={(v) => update({ postManagementAcknowledged: v })}
            />
          </div>

          {/* 기회발전특구 특례 (상증령 §15㉕ — emerald tone) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              기회발전특구 특례 (상증령 §15㉕)
            </p>
            <p className="text-[11px] text-muted-foreground">
              두 요건 모두 충족 시 신고기한 후 2년 내 대표이사 취임(라목) 요건 면제
            </p>
            <ToggleCard
              tone="emerald"
              size="sm"
              title="본사 기회발전특구 소재·이전 (§15㉕1호)"
              description="조특법 §99의4①1호 가목 1)~5) 외 기회발전특구로 이전 또는 본사 소재"
              checked={familyBusiness.isInOpportunityDevelopmentZone ?? false}
              onCheckedChange={(v) => update({ isInOpportunityDevelopmentZone: v ? true : undefined })}
            />
            <ToggleCard
              tone="emerald"
              size="sm"
              title="특구 상시근무인원 50% 이상 (§15㉕2호)"
              description="기회발전특구 사업장 상시근무인원 연평균이 전체 연평균의 100분의 50 이상"
              checked={familyBusiness.ofzWorkforceRatio50PlusMet ?? false}
              onCheckedChange={(v) => update({ ofzWorkforceRatio50PlusMet: v ? true : undefined })}
            />
          </div>

          {/* 조세포탈 (rose tone) */}
          <ToggleCard
            tone="rose"
            size="sm"
            title="조세포탈·회계부정 형 확정 (§18의2⑧1호) — 공제 배제"
            description="§15⑲1호 조세범처벌법 §3① 벌금 / §15⑲2호 외부감사법 §39① (자산 5% 이상)"
            checked={familyBusiness.hasTaxFraudConviction ?? false}
            onCheckedChange={(v) => update({ hasTaxFraudConviction: v ? true : undefined })}
          />

          {/* 실시간 자격 미리보기 */}
          {evalResult && (
            evalResult.eligible ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-2">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  ✓ 모든 요건 충족 — 가업상속공제 적용 가능
                  {capPreview !== null && capPreview > 0 && (
                    <span className="ml-1 font-normal">
                      (한도 {(capPreview / 100_000_000).toLocaleString("ko-KR")}억)
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-2 space-y-1">
                <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                  ✗ 자격 미충족
                </p>
                <ul className="space-y-0.5 text-[10px] text-rose-700 dark:text-rose-300 list-disc pl-4">
                  {evalResult.reasons.map((r, i) => (
                    <li key={i}>
                      {INELIGIBLE_REASON_LABELS[r] ?? r}
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}

          {/* 복수가업 순차공제 (상증령 §15④ · 상증칙 §5 — PR-4) */}
          <FbAdditionalBusinessesSection
            value={familyBusiness.additionalFamilyBusinesses}
            onChange={(v) => update({ additionalFamilyBusinesses: v })}
            mainOperatingYears={familyBusiness.operatingYears}
            mainValue={mainBusinessValue ?? 0}
            deathDate={deathDate}
          />
        </div>
      )}

      {/* Dialog 데이터 폐기 확인 (feedback_dialog_data_discard_confirm) */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>가업상속공제 요건 입력을 끄시겠습니까?</DialogTitle>
            <DialogDescription>
              입력한 요건 데이터가 모두 삭제되고 legacy 모드로 전환됩니다.
              가업재산가액·영위연수 수동 입력값을 그대로 한도까지 공제합니다.
              이 동작은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="px-3 py-1.5 text-sm rounded border border-border bg-background hover:bg-muted"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setDiscardOpen(false);
              }}
              className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
            >
              삭제하고 끄기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
