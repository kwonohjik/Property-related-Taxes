"use client";

/**
 * 종합부동산세 Step 1: 기본 정보
 * — 과세연도 · 납세의무자 유형 · 1세대1주택 · 부부 공동명의 특례 (§10의2)
 *
 * 800줄 정책에 따라 page.tsx에서 분리.
 * 외부 동작 무변경: page.tsx는 `import { Step1Basic } from "./Step1Basic"` 1줄로 대체.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  COMPREHENSIVE_SUPPORTED_YEARS,
  getComprehensiveParams,
} from "@/lib/tax-engine/data/comprehensive-historical";
import {
  resolveCorporateHousingClass,
  requiredCorporateReqKey,
} from "@/lib/tax-engine/comprehensive-corporate-class";
import type {
  CorporateHousingType,
  CorporateHousingClass,
} from "@/lib/tax-engine/types/comprehensive-corporate.types";
import type { ComprehensiveFormData } from "@/lib/stores/comprehensive-wizard-store";
import { LawArticleModal } from "@/components/ui/law-article-modal";

// ============================================================
// 법인 세부 유형 (시행령 §4의4) — Select 옵션·조건 요건 라벨·도출 배지
// ============================================================

const CORP_TYPE_OPTIONS: { value: CorporateHousingType; label: string }[] = [
  { value: "public_housing_operator", label: "공공주택사업자 (시행령 §4의4①1호)" },
  { value: "housing_association", label: "주택조합 (시행령 §4의4①3호)" },
  { value: "redevelopment_operator", label: "정비사업시행자 (시행령 §4의4①4호)" },
  { value: "private_rental_operator", label: "민간건설임대사업자 2호 이상 (시행령 §4의4①5호)" },
  { value: "urban_dev_operator", label: "도시개발·재정비 시행자 (시행령 §4의4①5의2호)" },
  { value: "social_enterprise", label: "사회적기업·사회적협동조합 (시행령 §4의4①6호)" },
  { value: "clan", label: "종중 (시행령 §4의4①7호)" },
  { value: "public_interest_corp", label: "공익법인등 (상속세 및 증여세법 §16)" },
  { value: "general_corp", label: "그 외 일반법인 (§9②3호)" },
];

/** 조건부 유형의 요건 질문·결과 라벨 (reqKey별) */
const CORP_REQ_LABEL: Record<string, { question: string; met: string; unmet: string }> = {
  corpHoldsQualifyingRentalHousingOnly: {
    question: "민간건설임대주택 2호 이상 + 적격 주택만 보유 (시행령 §4의4①5·5의2호 가·나·다목)",
    met: "충족 → §9②1호 일반 누진세율",
    unmet: "미충족 → §9②3호 단일세율",
  },
  corpMeetsSocialEnterpriseRequirements: {
    question: "설립목적(구성원 공동사용·주거지원) + 적격 주택만 보유 (시행령 §4의4①6호 가·나목)",
    met: "충족 → §9②1호 일반 누진세율",
    unmet: "미충족 → §9②3호 단일세율",
  },
  corpHoldsOnlyPublicPurposeHousing: {
    question: "직접 공익목적사업에 사용하는 주택만 보유 (§9②1호)",
    met: "충족 → §9②1호 일반 누진세율",
    unmet: "미충족 → §9②2호 주택 수 분기",
  },
};

/** 도출 §9② class 배지 라벨 */
const CORP_CLASS_BADGE: Record<CorporateHousingClass, { ho: string; desc: string }> = {
  corporate_general: {
    ho: "§9②1호",
    desc: "일반 누진세율(주택 수 무관·2주택 이하 표) · 기본공제 9억 · 세부담상한 적용",
  },
  corporate_public: {
    ho: "§9②2호",
    desc: "§9① 각호(주택 수 분기) · 기본공제 9억 · 세부담상한 적용",
  },
  corporate_special: {
    ho: "§9②3호",
    desc: "단일 비례세율 · 기본공제 0 · 세부담상한 미적용 (§10 단서)",
  },
};

// ============================================================
// 연도별 세법 요약 힌트 카드
// ============================================================

function YearLawHintCard({ year }: { year: number }) {
  const currentYear = new Date().getFullYear();
  const params = getComprehensiveParams(year);
  const hasMultiHouseCap = year < 2023;
  const isPreUnified = year < 2023;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 space-y-1">
      <p className="font-semibold">
        {year} 귀속 적용 기준{isPreUnified ? " (개정 전 구법)" : ""}
        {year === currentYear ? (
          <span className="ml-1.5 rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
            현재
          </span>
        ) : null}
      </p>
      <p>
        기본공제: 일반 {formatKRW(params.basicDeductionGeneral)} / 1세대1주택{" "}
        {formatKRW(params.basicDeductionOneHouse)}
      </p>
      <p>
        공정시장가액비율 (주택분): {(params.fairMarketRatioHousing * 100).toFixed(0)}%
      </p>
      {isPreUnified ? (
        <p>
          세율: 일반(2주택 이하) 0.6%~3.0% / 다주택(조정2주택·3주택+) 1.2%~6.0%
          (종합부동산세법 §9① 구법)
        </p>
      ) : (
        <p>
          세율: 2주택 이하 0.5%~2.7% / 3주택 이상 12억 초과 중과 2.0%~5.0% (
          <LawArticleModal legalBasis="종합부동산세법 §9" label="§9①2호" /> — 주택 수
          자동 적용)
        </p>
      )}
      {hasMultiHouseCap ? (
        <p>
          세부담 상한: 일반 150% / 조정대상지역 2주택+ 또는 3주택+ 300%
          (§10② 구법)
        </p>
      ) : (
        <p>
          세부담 상한: 전년도 세액의 150% (
          <LawArticleModal legalBasis="종합부동산세법 §10" label="§10" />)
        </p>
      )}
    </div>
  );
}

// ============================================================
// Step 1: 기본 정보
// ============================================================

export function Step1Basic() {
  const { formData, updateFormData, reset, setResult } = useComprehensiveWizardStore();
  const currentYear = new Date().getFullYear();
  const selectedYear = parseInt(formData.assessmentYear) || currentYear;
  // 지원 연도 상수(2021~2025)에 현재연도가 없으면 보강 — 매년 상수 갱신 없이 현재연도 선택 가능
  const supportedYears = (
    COMPREHENSIVE_SUPPORTED_YEARS as readonly number[]
  ).includes(currentYear)
    ? [...COMPREHENSIVE_SUPPORTED_YEARS]
    : [...COMPREHENSIVE_SUPPORTED_YEARS, currentYear];

  const params = getComprehensiveParams(selectedYear);
  // 법인 여부 파생 (dual-truth 금지 — 별도 isCorporate store 필드 없음)
  const isCorporate = formData.taxpayerType !== "individual";
  // §9② class 도출 (엔진 헬퍼 단일 진실) — 세부유형+조건 → corporate_general/public/special
  const corporateClass: CorporateHousingClass | undefined = isCorporate
    ? resolveCorporateHousingClass(formData.corporateHousingType, {
        corpHoldsOnlyPublicPurposeHousing: formData.corpHoldsOnlyPublicPurposeHousing,
        corpHoldsQualifyingRentalHousingOnly: formData.corpHoldsQualifyingRentalHousingOnly,
        corpMeetsSocialEnterpriseRequirements: formData.corpMeetsSocialEnterpriseRequirements,
      })
    : undefined;
  const corpReqKey = isCorporate ? requiredCorporateReqKey(formData.corporateHousingType) : null;
  const corpReqValue = corpReqKey ? formData[corpReqKey] : undefined;
  // §8④ 의제 지정 주택 존재 여부 (Step2에서 지정 — 개인 전용). 1세대1주택·부부특례 미선택이어도 의제로 공제 적용.
  const hasSection8para4 =
    !isCorporate &&
    formData.properties.some(
      (p) => (p.section8para4Type ?? "none") !== "none" && p.exclusionType === "none",
    );
  const showSection8para4CreditInput =
    hasSection8para4 && !formData.isOneHouseOwner && !formData.isJointOwnershipSpecialCase;

  function handleYearChange(year: string) {
    updateFormData({ assessmentYear: year });
    setResult(null); // 과세연도 변경 시 기존 결과 무효화
  }

  function handleTaxpayerTypeToggle(v: string) {
    // 법인 선택 → taxpayerType "corporate" (세부유형은 store 기본 general_corp 유지, Select에서 변경)
    updateFormData({ taxpayerType: v === "corporate" ? "corporate" : "individual" });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
        <ResetButton onReset={reset} />
      </div>
      {/* 과세연도 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">
          과세연도 <span className="text-destructive">*</span>
        </label>
        <RadioCardGroup
          name="assessmentYear"
          tone="sky"
          layout="inline"
          value={formData.assessmentYear as (typeof COMPREHENSIVE_SUPPORTED_YEARS)[number] extends number ? string : string}
          onChange={handleYearChange}
          options={supportedYears.map((y) => ({
            value: String(y),
            label: String(y),
            trailing:
              y === currentYear ? (
                <span className="rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                  현재
                </span>
              ) : undefined,
          }))}
        />
        <YearLawHintCard year={selectedYear} />
        <p className="text-xs text-muted-foreground">
          과세기준일: {formData.assessmentYear}-06-01 (
          <LawArticleModal legalBasis="종합부동산세법 §3" label="§3" />)
        </p>
      </div>

      {/* 납세의무자 유형 — [개인] [법인] */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">납세의무자 유형</label>
        <RadioCardGroup
          name="taxpayerTypeMain"
          tone="sky"
          layout="inline"
          value={isCorporate ? "corporate" : "individual"}
          onChange={handleTaxpayerTypeToggle}
          options={[
            { value: "individual", label: "개인" },
            { value: "corporate", label: "법인" },
          ]}
        />
      </div>

      {/* 법인 선택 시: 세부 유형 Select + 조건 요건 + 도출 배지 (시행령 §4의4 자동판정) */}
      {isCorporate && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-violet-800">
              법인 세부 유형 <span className="text-destructive">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <LawArticleModal
                legalBasis="종합부동산세법 시행령 §4의4"
                label="시행령 §4의4 법인유형"
              />
              <LawArticleModal legalBasis="종합부동산세법 §9" label="§9② 법인세율" />
            </div>
            <select
              aria-label="법인 세부 유형"
              value={formData.corporateHousingType}
              onChange={(e) =>
                updateFormData({ corporateHousingType: e.target.value as CorporateHousingType })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {CORP_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* 조건부 요건 (충족/미충족) — 해당 유형만 노출, 무기본(미선택 시 계산 차단) */}
          {corpReqKey && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-violet-800">
                {CORP_REQ_LABEL[corpReqKey].question} <span className="text-destructive">*</span>
              </label>
              <RadioCardGroup
                name="corpReq"
                tone="violet"
                layout="inline"
                value={corpReqValue === undefined ? "" : corpReqValue ? "met" : "unmet"}
                onChange={(v) =>
                  updateFormData({ [corpReqKey]: v === "met" } as Partial<ComprehensiveFormData>)
                }
                options={[
                  { value: "met", label: "충족", description: CORP_REQ_LABEL[corpReqKey].met },
                  { value: "unmet", label: "미충족", description: CORP_REQ_LABEL[corpReqKey].unmet },
                ]}
              />
            </div>
          )}

          {/* 도출 결과 배지 + §4의4② 안내 (조건부 유형 미응답 시 안내 우선) */}
          {corpReqKey && corpReqValue === undefined ? (
            <div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              요건 충족 여부를 선택하면 적용 세율 특례(§9② 호)가 결정됩니다.
            </div>
          ) : corporateClass ? (
            <div className="rounded-md bg-violet-100/60 border border-violet-200 px-3 py-2 text-xs text-violet-900 space-y-1">
              <p className="font-semibold">
                적용: {CORP_CLASS_BADGE[corporateClass].ho} 법인 주택분 특례
              </p>
              <p>{CORP_CLASS_BADGE[corporateClass].desc}</p>
              {corporateClass === "corporate_special" && (
                <p>
                  세율: 2주택 이하 {(params.corporateRate2HouseOrLess * 100).toFixed(1)}% / 3주택 이상{" "}
                  {(params.corporateRate3HouseOrMore * 100).toFixed(1)}%
                  {selectedYear <= 2022 ? " (≤2022 조정 2주택 포함)" : ""}
                </p>
              )}
              {(corporateClass === "corporate_general" ||
                corporateClass === "corporate_public") && (
                <p className="text-violet-700">
                  ⓘ 시행령 §4의4② — 보유현황 신고기간(§8③)에 관할세무서장에게 서류 제출이 필요합니다.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* 개인 선택 시만 — 1세대1주택 여부 */}
      {!isCorporate && (
        <ToggleCard
          tone="sky"
          title="1세대 1주택자"
          description="기본공제 12억 적용 + 고령자·장기보유 세액공제 적용 (§8①1호, §9②)"
          checked={formData.isOneHouseOwner}
          onCheckedChange={(v) => updateFormData({ isOneHouseOwner: v })}
          disabled={formData.isJointOwnershipSpecialCase ?? false}
          disabledReason="부부 공동명의 특례(§10의2)와 동시 적용 불가 — §10의2 특례는 1세대1주택자로 보는 의제입니다"
        >
          {/* 1세대1주택자 추가 정보 (ON 시 펼침) */}
          <p className="text-xs text-sky-700 font-medium">
            1세대1주택자 세액공제 적용을 위한 추가 정보
          </p>

          {/* 생년월일 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              생년월일 (고령자 세액공제용)
            </label>
            <DateInput
              value={formData.birthDate}
              onChange={(v) => updateFormData({ birthDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              만 60세 이상: 20%, 65세: 30%, 70세: 40% (최대 80% 합산)
            </p>
          </div>

          {/* 최초 취득일 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              최초 취득일 (장기보유 세액공제용)
            </label>
            <DateInput
              value={formData.acquisitionDate}
              onChange={(v) => updateFormData({ acquisitionDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              5년 이상: 20%, 10년: 40%, 15년: 50% (고령자공제 합산 최대 80%)
            </p>
          </div>
        </ToggleCard>
      )}

      {/* 개인 선택 시만 — 부부 공동명의 1주택자 특례 (§10의2) */}
      {!isCorporate && (
        <ToggleCard
          tone="sky"
          title="부부 공동명의 1주택자 특례 (§10의2)"
          description="기본공제 12억 + 납세의무자(신청인) 기준 고령자·장기보유 세액공제 의제 적용"
          checked={formData.isJointOwnershipSpecialCase ?? false}
          onCheckedChange={(v) =>
            updateFormData({ isJointOwnershipSpecialCase: v })
          }
          disabled={formData.isOneHouseOwner}
          disabledReason="1세대1주택자와 동시 적용 불가 — §10의2 특례는 1세대1주택자로 보는 의제입니다"
        >
          {/* 안내 — 공시가격 입력 주의 · 납세의무자 안내 · 부속토지 제외 */}
          <div className="rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs text-sky-900 space-y-1">
            <p>
              <span className="font-semibold">주택 공시가격 입력:</span>{" "}
              지분 안분 없이{" "}
              <span className="font-semibold">전체 금액</span>으로 입력하세요
              (배우자 지분 합산 — 령 §5의2⑥)
            </p>
            <p>
              <span className="font-semibold">납세의무자:</span>{" "}
              공동 소유자간{" "}
              <span className="font-semibold">합의로 정한 사람</span>입니다
              (령 §5의2③). 신청 기한: 해당 연도 9월 16일 ~ 30일
            </p>
            <p>
              배우자가 다른 주택의 부속토지를 소유한 경우 특례 대상에서 제외됩니다
              (령 §5의2② 단서)
            </p>
          </div>

          {/* 납세의무자(신청인) 생년월일 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              납세의무자(신청인) 생년월일 (고령자 세액공제용)
            </label>
            <DateInput
              value={formData.birthDate}
              onChange={(v) => updateFormData({ birthDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              만 60세 이상: 20%, 65세: 30%, 70세: 40% (최대 80% 합산)
            </p>
          </div>

          {/* 납세의무자(신청인) 최초 취득일 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              납세의무자(신청인) 최초 취득일 (장기보유 세액공제용)
            </label>
            <DateInput
              value={formData.acquisitionDate}
              onChange={(v) => updateFormData({ acquisitionDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              5년 이상: 20%, 10년: 40%, 15년: 50% (고령자공제 합산 최대 80%)
            </p>
          </div>
        </ToggleCard>
      )}

      {/* §8④ 의제 단독 적용 시(1세대1주택·부부특례 미선택) — 세액공제 입력 */}
      {showSection8para4CreditInput && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-violet-800">
              §8④ 1세대1주택자 의제 적용 — 자동으로 1세대1주택자로 계산
            </p>
            <p className="text-xs text-violet-900">
              2단계에서 §8④ 특례주택을 지정하셨습니다(일반주택 1채와 함께 보유 시 의제 성립).
              고령자·장기보유 세액공제를 위해 본인(신청인)의 생년월일·취득일을 입력하세요. 산출세액은 일반주택 공시가격으로 안분됩니다.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">생년월일 (고령자 세액공제용)</label>
            <DateInput
              value={formData.birthDate}
              onChange={(v) => updateFormData({ birthDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              만 60세 이상: 20%, 65세: 30%, 70세: 40% (최대 80% 합산)
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">최초 취득일 (장기보유 세액공제용)</label>
            <DateInput
              value={formData.acquisitionDate}
              onChange={(v) => updateFormData({ acquisitionDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              5년 이상: 20%, 10년: 40%, 15년: 50% (고령자공제 합산 최대 80%)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
