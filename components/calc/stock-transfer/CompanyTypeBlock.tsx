"use client";

/**
 * CompanyTypeBlock — 회사 분류 (중소기업·중견기업·일반)
 *
 * Step 1 — 세율 분기 결정 (§104①11)
 * K-OTC 비과세 + 벤처기업 비과세도 여기서 관리.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface CompanyTypeBlockProps {
  form: Pick<
    StockTransferFormData,
    | "isSmallMediumEnterprise"
    | "isMidsizeEnterprise"
    | "isListedSmallShareholder"
    | "isVentureCompany"
    | "isKOTCTrading"
    // K-OTC는 비상장 전용 시장이라 상장 여부로 안내가 갈린다 (자본시장법 §286①5호)
    | "marketType"
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
  const isListedMarket =
    form.marketType === "kospi" || form.marketType === "kosdaq" || form.marketType === "konex";

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
        <div className="flex flex-wrap gap-1.5 mb-1">
          <LawArticleModal legalBasis="소득세법 §94 ① 3호 나목" label="§94①3 나목 단서" />
        </div>
        <ToggleCard
          checked={form.isKOTCTrading}
          onCheckedChange={(v) => onChange({ isKOTCTrading: v })}
          title="K-OTC 거래"
          description="§94①3 나목 단서 — 비상장 중소·중견 소액주주는 비과세"
          tone="emerald"
        />
      </div>

      {/*
        상장주식은 K-OTC 대상이 아니다 — 자본시장법 §286①5호는 협회 업무를
        「**증권시장에 상장되지 아니한 주권**의 장외매매거래」로 정의한다.
        ⚠️ 토글을 숨기지는 않는다: 조특법 §14①7호(벤처) 비과세는 「증권시장 밖에서 거래되는」
           벤처기업 주식이라 **상장주식도 포섭**하고, 지금 그 유일한 입력 경로가 이 토글이다
           ([[feedback_ui_gate_removes_sole_input_path]]).
           나목 단서 오적용은 엔진 가드가 막는다.
      */}
      {isListedMarket && form.isKOTCTrading && (
        <div className="mt-2">
          <ToneCard tone="amber" noDark>
            <p className="text-xs leading-relaxed">
              <strong>상장주식은 K-OTC 거래 대상이 아닙니다.</strong> K-OTC는{" "}
              <LawArticleModal
                legalBasis="자본시장과 금융투자업에 관한 법률 §286 ① 5호"
                label="자본시장법 §286①5호"
              />{" "}
              에 따라 <strong>증권시장에 상장되지 아니한 주권</strong>의 장외매매거래 시장입니다.
              따라서 <strong>§94①3 나목 단서(중소·중견 소액주주) 비과세는 적용되지 않습니다</strong> —
              상장 비대주주의 장외 양도는 §94①3 가목 2)로 과세됩니다.
            </p>
            <p className="text-caption mt-2 leading-relaxed text-amber-800/90">
              다만 <strong>벤처기업</strong>의 증권시장 밖 거래는 조특법 §14①7호 비과세가 상장·비상장을
              가리지 않으므로, 그 경우에만 이 토글을 켠 채로 두세요.
            </p>
          </ToneCard>
        </div>
      )}

      {/* 소액주주 여부 (K-OTC ON + 비상장 — 나목 단서 요건) */}
      {form.isKOTCTrading && !isListedMarket && (
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
        <div className="flex flex-wrap gap-1.5 mb-1">
          <LawArticleModal legalBasis="조세특례제한법 §14 ① 7호" label="조특법§14①7호" />
        </div>
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
