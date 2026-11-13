"use client";

/**
 * 종부령 §3①6호 미분양매입임대주택 입력 칸 — 묻는 조건은 `ho6Asks`(⑧ 차단·④ 전송과 같은 술어).
 * 가목 단서 1)~3)의 신청일·아파트·변경신고는 8호 나목 칸과 같은 store 필드다(6호에서는 8호 카드가 열리지 않는다).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-6ho-unsold-purchase.plan.md
 */
import { useMemo } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateField } from "@/components/calc/comprehensive/RentalExclusion8NaFields";
import { YesNoField } from "@/components/calc/comprehensive/RentalExclusion8NaFields";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";
import { na8Context } from "@/lib/calc/comprehensive-rental-8na";
import { ho6Asks } from "@/lib/calc/comprehensive-rental-6ho";
import { UNSOLD_6HO } from "@/lib/calc/comprehensive-rental-6ho";

type Kind = "short_term" | "long_term_general" | "public_support" | "other";
const KIND_OPTIONS: { value: Kind; label: string; testId: string }[] = [
  { value: "short_term", label: "단기민간임대", testId: "comprehensive-6ho-kind-short_term" },
  { value: "long_term_general", label: "장기일반민간임대", testId: "comprehensive-6ho-kind-long_term_general" },
  { value: "public_support", label: "공공지원민간임대", testId: "comprehensive-6ho-kind-public_support" },
  { value: "other", label: "그 밖(구 임대주택법 매입임대 등)", testId: "comprehensive-6ho-kind-other" },
];

function CountField({
  label,
  testId,
  value,
  onChange,
  hint,
}: {
  label: string;
  testId: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  hint: string;
}) {
  return (
    <FieldCard label={label} unit="호" required hint={hint}>
      <div data-testid={testId}>
        <IntegerInput allowEmpty ariaLabel={label} placeholder="" value={value} onChange={onChange} />
      </div>
    </FieldCard>
  );
}

export function RentalExclusion6hoFields({
  property,
  registrationType,
  onUpdate,
}: {
  property: PropertyEntry;
  registrationType: string;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  const assessmentYear = useComprehensiveWizardStore((s) => s.formData.assessmentYear);
  const taxpayerType = useComprehensiveWizardStore((s) => s.formData.taxpayerType);
  const ctx = useMemo(
    () => na8Context({ assessmentYear, taxpayerType }, registrationType),
    [assessmentYear, taxpayerType, registrationType],
  );
  if (registrationType !== UNSOLD_6HO) return null;
  const asks = ho6Asks(property, ctx);

  return (
    <ToneCard tone="slate" title="미분양매입임대주택 요건 (시행령 §3①6호)" bodyClassName="space-y-3">
      <p className="text-xs text-muted-foreground">
        수도권 밖 · 전용 149㎡ 이하 · 공시가격 3억원 이하 · 5년 이상 임대. 임대료 증가율 요건은 없습니다.
      </p>
      <DateField
        label="최초 분양계약·계약금 납부일"
        testId="comprehensive-6ho-contract-date"
        value={property.unsoldContractDate}
        onChange={(v) => onUpdate({ unsoldContractDate: v })}
        hint="2008.6.11.~2009.6.30.에 최초로 분양계약을 하고 계약금을 낸 주택만 해당합니다."
      />
      <YesNoField
        label="2008.6.10.까지 분양되지 않아 선착순으로 공급된 미분양주택"
        name="comprehensive-6ho-first-come"
        value={property.isUnsoldFirstComeSupply}
        onChange={(v) => onUpdate({ isUnsoldFirstComeSupply: v })}
        yes="해당"
        no="아님"
      />
      <CountField
        label="같은 시·도의 미분양매입임대주택"
        testId="comprehensive-6ho-unsold-units"
        value={property.unsoldUnitCount}
        onChange={(v) => onUpdate({ unsoldUnitCount: v })}
        hint="이 주택을 포함해 같은 특별시·광역시·도에 있는 6호 요건을 갖춘 주택 수(§3⑤). 5호 이상이어야 합니다."
      />
      {asks.otherUnits && (
        <>
          <p className="text-xs text-muted-foreground">
            5호 미만이면 아래 임대주택과 합산합니다(유형별로 따로 — 2호 5호 이상·3호 2호 이상·5호 5호 이상일 때). 없으면 0.
          </p>
          <CountField
            label="2호 매입임대주택"
            testId="comprehensive-6ho-2ho-units"
            value={property.purchaseRental2hoCount}
            onChange={(v) => onUpdate({ purchaseRental2hoCount: v })}
            hint="시행령 §3①2호 매입임대주택 수."
          />
          <CountField
            label="같은 시·도의 3호 임대주택"
            testId="comprehensive-6ho-3ho-units"
            value={property.existingRental3hoSameRegionCount}
            onChange={(v) => onUpdate({ existingRental3hoSameRegionCount: v })}
            hint="2005.1.5. 이전부터 임대한 주택(§3①3호) 중 이 주택과 같은 시·도에 있는 것."
          />
          <CountField
            label="5호 임대주택"
            testId="comprehensive-6ho-5ho-units"
            value={property.reitRental5hoCount}
            onChange={(v) => onUpdate({ reitRental5hoCount: v })}
            hint="부동산투자회사 등이 2008년에 취득·임대한 주택(§3①5호) 수."
          />
        </>
      )}
      <YesNoField
        label="합산배제 신고 때 미분양주택 확인서·매매계약서 사본 제출"
        name="comprehensive-6ho-docs"
        value={property.unsoldDocsSubmitted}
        onChange={(v) => onUpdate({ unsoldDocsSubmitted: v })}
        yes="제출"
        no="미제출"
      />
      {asks.kind && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            민간임대주택 등록 종류 <span className="text-destructive">*</span>
          </label>
          <RadioCardGroup<Kind>
            name="comprehensive-6ho-kind"
            data-testid="comprehensive-6ho-kind"
            tone="sky"
            columns={2}
            value={property.rentalRegistrationKind ?? ""}
            onChange={(v) => onUpdate({ rentalRegistrationKind: v })}
            options={KIND_OPTIONS}
          />
          <p className="text-xs text-muted-foreground">
            2020.7.11. 이후 단기 등록 신청·장기일반 아파트·단기에서 변경신고한 주택은 제외됩니다(가목 단서).
          </p>
        </div>
      )}
      {asks.applicationDate && (
        <DateField
          label="지자체 임대사업자 등록 신청일"
          testId="comprehensive-6ho-rental-application-date"
          value={property.rentalApplicationDate}
          onChange={(v) => onUpdate({ rentalApplicationDate: v })}
          hint="등록증의 등록일이 아니라 신청서를 낸 날입니다(임대할 주택을 추가한 변경신고 포함)."
        />
      )}
      {asks.isApartment && (
        <YesNoField
          label="아파트 (도시형 생활주택은 아니오)"
          name="comprehensive-6ho-apartment"
          value={property.isApartment}
          onChange={(v) => onUpdate({ isApartment: v })}
          yes="아파트"
          no="아파트 아님"
        />
      )}
      {asks.converted && (
        <YesNoField
          label="단기민간임대주택에서 장기일반·공공지원으로 변경신고한 주택"
          name="comprehensive-6ho-converted"
          value={property.convertedFromShortTerm}
          onChange={(v) => onUpdate({ convertedFromShortTerm: v })}
          yes="변경신고함"
          no="아님"
        />
      )}
      {asks.conversionDate && (
        <DateField
          label="변경신고일"
          testId="comprehensive-6ho-conversion-date"
          value={property.shortTermConversionDate}
          onChange={(v) => onUpdate({ shortTermConversionDate: v })}
          hint="2020.7.11. 이후 변경신고한 주택은 합산배제에서 제외됩니다."
        />
      )}
    </ToneCard>
  );
}
