"use client";

/**
 * §97의3 장기임대주택 — 장특공제율 70% 특례 입력 폼
 *
 * 다-섹션 색상 카드 + 번호 패턴 (①~④):
 * ① violet 등록·신분
 * ② violet 임대 개시 (기준시가·소재지)
 * ③ violet 임대료 증액 제한
 * ④ sky 공실 기간
 * + emerald 자동 표시 박스 (useMemo 파생, store 미기록)
 *
 * 정책:
 * - rentIncreaseViolationMode 기본 "" (3-state 미선택)
 * - hasVacancyOverGrace 기본 null (3-state 미선택)
 * - useEffect → store 미러링 금지
 */

import { useMemo } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { RentalCommonFields, RegistrationFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";

type Rental973Form = Extract<RentalReductionFormVariant, { type: "rental_97_3" }>;

interface Props {
  value: Rental973Form;
  onChange: (patch: Partial<Rental973Form>) => void;
  /** 자산의 양도일 — 임대기간 미리보기용 */
  transferDate?: string;
}

function diffYearsMonths(from: string, to: string): string {
  if (!from || !to) return "—";
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return "—";
  const totalMonths =
    (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (totalMonths < 0) return "—";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months > 0 ? `${years}년 ${months}개월` : `${years}년`;
}

export function Rental973InputForm({ value, onChange, transferDate }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental973Form>);
  };

  // ─ emerald 자동 표시 박스 — useMemo, store 미기록 ─
  const rentalDuration = useMemo(
    () => diffYearsMonths(value.rentalStartDate, transferDate ?? ""),
    [value.rentalStartDate, transferDate],
  );

  // 등록일별 공제율 안내 (R-1: 2022.12.31 이전 등록분 8년 50% 경과규정) — store 미기록
  const rateGuide = useMemo(() => {
    if (!value.registrationDate) return null;
    const reg = new Date(value.registrationDate);
    if (isNaN(reg.getTime())) return null;
    return reg.getTime() < new Date("2023-01-01").getTime()
      ? "2022.12.31 이전 등록 — 8년↑ 50% / 10년↑ 70%"
      : "2023.1.1 이후 등록 — 10년↑ 70%만";
  }, [value.registrationDate]);

  return (
    <div className="mt-2 ml-4 space-y-3">
      {/* ① 등록·신분 */}
      <ToneCard tone="violet" sectionNum="①" title="등록·신분" noDark>

        <RegistrationFields
          registrationDate={value.registrationDate}
          isTaxRegistered={value.isTaxRegistered}
          rentalStartDate={value.rentalStartDate}
          onRegistrationDateChange={(v) => onChange({ registrationDate: v })}
          onIsTaxRegisteredChange={(v) => onChange({ isTaxRegistered: v })}
          onRentalStartDateChange={(v) => onChange({ rentalStartDate: v })}
        />

        <div>
          <p className="mb-1 text-xs font-medium">임대주택 유형</p>
          <RadioCardGroup
            name="rentalHousingType_973"
            layout="inline"
            tone="violet"
            value={value.rentalHousingType}
            onChange={(v) => onChange({ rentalHousingType: v as Rental973Form["rentalHousingType"] })}
            options={[
              { value: "long_term_private", label: "장기일반민간임대" },
              { value: "public_support_private", label: "공공지원민간임대" },
            ]}
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium">아파트 여부</p>
          <RadioCardGroup
            name="propertyType_973"
            layout="inline"
            tone="sky"
            value={value.propertyType}
            onChange={(v) => onChange({ propertyType: v as Rental973Form["propertyType"] })}
            options={[
              { value: "apartment", label: "아파트" },
              { value: "non_apartment", label: "비아파트" },
            ]}
          />
        </div>

        <ToggleCard
          variant="chip"
          checked={value.isConvertedFromShortTerm}
          onCheckedChange={(v) => onChange({ isConvertedFromShortTerm: v })}
          title="단기→장기 변경 신고"
          description="2020.7.11 이후 변경분은 적용 제외 (§97의3① 괄호)"
          tone="amber"
        />

        <ToggleCard
          variant="chip"
          checked={value.isNationalHousingScale}
          onCheckedChange={(v) => onChange({ isNationalHousingScale: v })}
          title="국민주택규모 이하"
          description="전용 85㎡(수도권 외 읍면 100㎡) 이하 — 령 §97의3③2호"
          tone="sky"
        />
      </ToneCard>

      {/* ② 임대 개시 */}
      <ToneCard tone="violet" sectionNum="②" title="임대 개시 정보" noDark>

        <div>
          <label className="mb-1 block text-xs font-medium">임대개시 당시 기준시가 (원)</label>
          <CurrencyInput
            label=""
            value={value.officialPriceAtStart}
            onChange={(v) => onChange({ officialPriceAtStart: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            주택+부속토지 합계 — 6억(수도권 밖 3억) 이하 요건 (령 §97의3③4호)
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium">소재지</p>
          <RadioCardGroup
            name="region_973"
            layout="inline"
            tone="rose"
            value={value.region}
            onChange={(v) => onChange({ region: v as Rental973Form["region"] })}
            options={[
              { value: "capital", label: "수도권" },
              { value: "non_capital", label: "비수도권" },
            ]}
          />
        </div>
      </ToneCard>

      {/* ③④ 공통 필드 (임대료 증액·공실) */}
      <RentalCommonFields
        vacancyGraceMonths={3}
        value={value}
        onChange={patchCommon}
        sectionOffset={3}
      />

      {/* emerald 자동 표시 박스 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1">
        <p className="text-xs font-semibold text-emerald-800">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">등록일별 적용 공제율</span>
          <span className="font-mono font-medium text-emerald-900">
            {rateGuide ?? "등록일 입력 시 표시"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">양도일 기준 임대기간 (임대개시일→양도일)</span>
          <span className="font-mono font-medium text-emerald-900">{rentalDuration}</span>
        </div>
        <p className="text-micro text-emerald-700">
          ※ 2022.12.31 이전 등록분은 8년 이상 50%, 10년 이상 70%. 2023.1.1 이후 등록분은 10년 이상 70%만 적용됩니다.
          공실 차감 후 실제 유효임대기간은 엔진이 계산합니다.
        </p>
      </div>
    </div>
  );
}
