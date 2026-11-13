"use client";

/**
 * 종부령 §3①4호(미임대 민간건설·소유)·5호(부동산투자회사 2008 매입)·9호(분양전환공공임대 만료 후·소유) 입력 칸.
 * 묻는 조건은 `ho459`(⑧ 차단·④ 전송과 같은 술어). 4호 사용승인일은 `usageApprovalDate`, 5호 호수는 `reitRental5hoCount`(6호와 같은 store 필드).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-4-5-9ho-types.plan.md
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateField } from "@/components/calc/comprehensive/RentalExclusion8NaFields";
import { YesNoField } from "@/components/calc/comprehensive/RentalExclusion8NaFields";
import { CountField } from "@/components/calc/comprehensive/RentalExclusion6hoFields";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { ho459 } from "@/lib/calc/comprehensive-rental-459ho";

type Base = "construction" | "purchase";
const BASE_OPTIONS: { value: Base; label: string; testId: string }[] = [
  { value: "construction", label: "공공건설임대 (§3①1호)", testId: "comprehensive-9ho-base-construction" },
  { value: "purchase", label: "공공매입임대 (§3①2호)", testId: "comprehensive-9ho-base-purchase" },
];

export function RentalExclusion459hoFields({
  property,
  registrationType,
  onUpdate,
}: {
  property: PropertyEntry;
  registrationType: string;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  const ho = ho459(registrationType);
  if (ho === "4") {
    return (
      <ToneCard tone="slate" title="미임대 민간건설임대주택 요건 (시행령 §3①4호)" bodyClassName="space-y-3">
        <p className="text-xs text-muted-foreground">
          임대하지 않고 소유한 민간건설임대주택 · 전용 149㎡ 이하 · 공시가격 9억원 이하(2021.2.17. 전 사용승인은 6억원). 임대를 시작했다면 1호·7호로 고르세요.
        </p>
        <DateField
          label="사용승인일(사용검사필증을 받은 날)"
          testId="comprehensive-4ho-usage-approval-date"
          value={property.usageApprovalDate}
          onChange={(v) => onUpdate({ usageApprovalDate: v })}
          hint="사용승인일부터 과세기준일까지 임대되지 않은 기간이 2년 이내여야 합니다."
        />
        <YesNoField
          label="사용승인 뒤 과세기준일까지 임대한 적이 없음"
          name="comprehensive-4ho-never-rented"
          value={property.neverRentedSinceApproval}
          onChange={(v) => onUpdate({ neverRentedSinceApproval: v })}
          yes="임대한 적 없음"
          no="임대한 적 있음"
        />
      </ToneCard>
    );
  }
  if (ho === "5") {
    return (
      <ToneCard tone="slate" title="부동산투자회사 2008년 취득 매입임대주택 요건 (시행령 §3①5호)" bodyClassName="space-y-3">
        <p className="text-xs text-muted-foreground">
          부동산투자회사·부동산간접투자기구가 2008년에 취득·임대 · 수도권 밖 · 전용 149㎡ 이하 · 10년 이상 임대. 현재 공시가격과 임대료 증가율은 보지 않습니다.
        </p>
        <DateField
          label="취득일"
          testId="comprehensive-5ho-acquisition-date"
          value={property.reitAcquisitionDate}
          onChange={(v) => onUpdate({ reitAcquisitionDate: v })}
          hint="2008.1.1.~2008.12.31.에 취득한 주택만 해당합니다."
        />
        <CountField
          label="요건을 모두 갖춘 5호 매입임대주택"
          testId="comprehensive-5ho-units"
          value={property.reitRental5hoCount}
          onChange={(v) => onUpdate({ reitRental5hoCount: v })}
          hint="이 주택을 포함한 수. 5호 이상이어야 합니다."
        />
        <YesNoField
          label="2008년도 과세기준일 공시가격 6억원 이하"
          name="comprehensive-5ho-price-2008"
          value={property.reitPrice2008Under6eok}
          onChange={(v) => onUpdate({ reitPrice2008Under6eok: v })}
          yes="6억원 이하"
          no="6억원 초과"
        />
      </ToneCard>
    );
  }
  if (ho === "9") {
    return (
      <ToneCard tone="slate" title="분양전환공공임대주택 임대의무기간 만료 후 요건 (시행령 §3①9호)" bodyClassName="space-y-3">
        <p className="text-xs text-muted-foreground">
          2023년 과세연도부터 · 만료일 다음 날부터 2년 이내 · 분양전환 전. 면적·공시가격·임대료는 공공건설(1호)·공공매입(2호) 기준으로 봅니다(확인 필요).
        </p>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            공공임대 종류 <span className="text-destructive">*</span>
          </label>
          <RadioCardGroup<Base>
            name="comprehensive-9ho-base"
            data-testid="comprehensive-9ho-base"
            tone="sky"
            columns={2}
            value={property.conversionBase ?? ""}
            onChange={(v) => onUpdate({ conversionBase: v })}
            options={BASE_OPTIONS}
          />
        </div>
        <YesNoField
          label="분양전환공공임대주택(공공주택 특별법 시행령 §2①5호)"
          name="comprehensive-9ho-conversion-type"
          value={property.isConversionPublicRental}
          onChange={(v) => onUpdate({ isConversionPublicRental: v })}
          yes="해당"
          no="아님"
        />
        <DateField
          label="임대의무기간 만료일"
          testId="comprehensive-9ho-end-date"
          value={property.mandatoryPeriodEndDate}
          onChange={(v) => onUpdate({ mandatoryPeriodEndDate: v })}
          hint="공공주택 특별법 시행령 §54의 임대의무기간(임대개시일부터)이 끝나는 날."
        />
        <YesNoField
          label="분양전환이 이루어짐"
          name="comprehensive-9ho-converted"
          value={property.conversionCompleted}
          onChange={(v) => onUpdate({ conversionCompleted: v })}
          yes="분양전환됨"
          no="분양전환 안 됨"
        />
      </ToneCard>
    );
  }
  return null;
}
