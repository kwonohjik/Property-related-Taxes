"use client";

/**
 * 감정평가수수료 공제 입력 (상속 §25①2호·§20의3 / 증여 §55①·§46의2 준용) — 상속·증여 공용.
 * ExemptionChecklist(`components/calc/exemption/`)와 동일하게 양 폼이 import.
 *
 * 3종(§20의3①): 1호 부동산(500만) / 2호 비상장(1천만×법인수×기관수) / 3호 유형재산(500만).
 * 1호는 감정가액으로 신고한 경우에만 공제(§20의3②) — hasAppraisalAsset 으로 hint 안내.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import type { AppraisalFeeFormFields } from "@/lib/calc/appraisal-fee-form";

interface AppraisalFeeSectionProps {
  taxType: "inheritance" | "gift";
  value: AppraisalFeeFormFields;
  onChange: (patch: Partial<AppraisalFeeFormFields>) => void;
  /** 감정가액("appraisal") 평가 자산 존재 여부 — 1호 §20의3② eligibility hint */
  hasAppraisalAsset: boolean;
}

const subCardClass =
  "space-y-2 rounded-md border border-sky-200 bg-sky-50/40 p-2 dark:border-sky-900 dark:bg-sky-950/20";
const subTitleClass = "text-[11px] font-semibold text-sky-700 dark:text-sky-300";

export function AppraisalFeeSection({
  taxType,
  value,
  onChange,
  hasAppraisalAsset,
}: AppraisalFeeSectionProps) {
  const lawLabel =
    taxType === "inheritance" ? "§25①2호·시행령 §20의3" : "§55①·시행령 §46의2";

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20">
      <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
        감정평가수수료 공제 ({lawLabel})
      </p>
      <p className="text-[11px] text-violet-600/80 dark:text-violet-400/80">
        재산 평가에 든 감정평가 수수료를 과세표준에서 공제합니다. 해당 항목만 입력하세요(미입력 시 0).
      </p>

      {/* 1호 부동산 등 */}
      <div className={subCardClass}>
        <p className={subTitleClass}>1호 · 부동산 등 감정평가</p>
        <CurrencyInput
          label="감정평가법인 수수료"
          value={value.appraisalRealEstateFee}
          onChange={(v) => onChange({ appraisalRealEstateFee: v })}
          hint={
            hasAppraisalAsset
              ? "「감정평가법」 감정평가법인등 수수료 (500만원 한도)."
              : "감정가액으로 신고한 경우에만 공제됩니다(시행령 §20의3②). 현재 감정가액 평가 자산이 없어 공제되지 않습니다."
          }
        />
      </div>

      {/* 2호 비상장주식 신용평가 */}
      <div className={subCardClass}>
        <p className={subTitleClass}>2호 · 비상장주식 신용평가</p>
        <CurrencyInput
          label="신용평가전문기관 수수료"
          value={value.appraisalUnlistedFee}
          onChange={(v) => onChange({ appraisalUnlistedFee: v })}
          hint="평가대상 법인 수 × 신용평가기관 수 × 1천만원 한도 (시행령 §20의3③)."
        />
        <CurrencyInput
          label="평가대상 법인 수"
          value={value.appraisalUnlistedTargetCount}
          onChange={(v) => onChange({ appraisalUnlistedTargetCount: v })}
          hint="미입력 시 1로 계산합니다."
          placeholder="미입력 시 1"
        />
        <CurrencyInput
          label="신용평가전문기관 수"
          value={value.appraisalUnlistedAgencyCount}
          onChange={(v) => onChange({ appraisalUnlistedAgencyCount: v })}
          hint="미입력 시 1로 계산합니다."
          placeholder="미입력 시 1"
        />
      </div>

      {/* 3호 유형재산 */}
      <div className={subCardClass}>
        <p className={subTitleClass}>3호 · 서화·골동품 등 유형재산</p>
        <CurrencyInput
          label="유형재산 감정수수료"
          value={value.appraisalTangibleFee}
          onChange={(v) => onChange({ appraisalTangibleFee: v })}
          hint="서화·골동품 등 유형재산 평가 감정수수료 (500만원 한도)."
        />
      </div>
    </div>
  );
}
