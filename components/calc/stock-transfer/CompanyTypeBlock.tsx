"use client";

/**
 * CompanyTypeBlock — 회사 분류 (중소기업·중견기업·일반)
 *
 * Step 1 — 세율 분기 결정 (§104①11)
 * K-OTC 비과세 + 벤처기업 비과세도 여기서 관리.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface CompanyTypeBlockProps {
  form: Pick<
    StockTransferFormData,
    "isSmallMediumEnterprise" | "isMidsizeEnterprise" | "isListedSmallShareholder" | "isVentureCompany" | "isKOTCTrading"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

type CompanyType = "sme" | "midsize" | "general";

function getCompanyType(
  isSmallMediumEnterprise: boolean,
  isMidsizeEnterprise: boolean
): CompanyType {
  if (isSmallMediumEnterprise) return "sme";
  if (isMidsizeEnterprise) return "midsize";
  return "general";
}

export function CompanyTypeBlock({ form, onChange }: CompanyTypeBlockProps) {
  const companyType = getCompanyType(form.isSmallMediumEnterprise, form.isMidsizeEnterprise);

  const handleTypeChange = (t: CompanyType) => {
    onChange({
      isSmallMediumEnterprise: t === "sme",
      isMidsizeEnterprise: t === "midsize",
    });
  };

  return (
    <FieldCard label="회사 규모" hint="법인세법·조세특례제한법 기준 (중소기업·중견기업·일반 대기업)">
      <RadioCardGroup
        name="companyType"
        value={companyType}
        onChange={(v) => handleTypeChange(v as CompanyType)}
        tone="sky"
        layout="inline"
        options={[
          { value: "sme", label: "중소기업", description: "중소기업기본법 기준" },
          { value: "midsize", label: "중견기업", description: "중견기업법 기준" },
          { value: "general", label: "일반기업", description: "대기업 포함" },
        ]}
      />

      {/* K-OTC 거래 토글 (§94①3 나목 단서) */}
      <div className="mt-4">
        <ToggleCard
          checked={form.isKOTCTrading}
          onCheckedChange={(v) => onChange({ isKOTCTrading: v })}
          title="K-OTC 거래"
          description="§94①3 나목 단서 — 중소·중견 소액주주는 비과세"
          tone="emerald"
        />
      </div>

      {/* 소액주주 여부 (K-OTC ON 시) */}
      {form.isKOTCTrading && (
        <div className="mt-3">
          <ToggleCard
            checked={form.isListedSmallShareholder}
            onCheckedChange={(v) => onChange({ isListedSmallShareholder: v })}
            title="소액주주 (대주주 아님)"
            description="K-OTC 중소·중견 소액주주 비과세 요건"
            tone="emerald"
          />
        </div>
      )}

      {/* 벤처기업 토글 (조특법 §14①7호 — K-OTC 벤처 비대주주 비과세) */}
      <div className="mt-3">
        <ToggleCard
          checked={form.isVentureCompany}
          onCheckedChange={(v) => onChange({ isVentureCompany: v })}
          title="벤처기업"
          description="조특법 §14①7호 — K-OTC 거래 벤처기업 소액주주 비과세"
          tone="emerald"
        />
      </div>
    </FieldCard>
  );
}
