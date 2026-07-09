"use client";

/**
 * §97의5 장기일반민간임대 — 산출세액 100% 감면 입력 폼
 *
 * 요건: 2018.12.31까지 취득 + 취득 후 3개월 내 등록 + 10년 임대
 * 전용면적 요건 없음 (법령상 규정 없음).
 *
 * 특이사항:
 * - 등록일 입력 직하에 3개월 검증 배지 (useMemo 파생)
 *   취득일 + 3개월 ≥ 등록일 → emerald "✓ 취득 후 3개월 내 등록"
 *   초과 → amber "취득 후 3개월 초과 — §97의5①1호 불충족"
 * - rentalHousingType·isConvertedFromShortTerm 없음
 */

import { useMemo } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RentalCommonFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";

type Rental975Form = Extract<RentalReductionFormVariant, { type: "rental_97_5" }>;

interface Props {
  value: Rental975Form;
  onChange: (patch: Partial<Rental975Form>) => void;
  /** 자산 취득일 — 3개월 검증 배지용 */
  acquisitionDate?: string;
  /** 자산의 양도일 — 임대기간 미리보기용 */
  transferDate?: string;
}

function addMonths(dateStr: string, months: number): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d;
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

export function Rental975InputForm({ value, onChange, acquisitionDate, transferDate }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental975Form>);
  };

  // 3개월 검증 배지 (useMemo — store 미기록)
  const regBadge = useMemo(() => {
    if (!acquisitionDate || !value.registrationDate) return null;
    const deadline = addMonths(acquisitionDate, 3);
    if (!deadline) return null;
    const regDate = new Date(value.registrationDate);
    if (isNaN(regDate.getTime())) return null;
    if (regDate <= deadline) {
      return { ok: true, text: "✓ 취득 후 3개월 내 등록" };
    }
    return { ok: false, text: "취득 후 3개월 초과 — §97의5①1호 불충족" };
  }, [acquisitionDate, value.registrationDate]);

  // emerald 자동 표시
  const rentalDuration = useMemo(
    () => diffYearsMonths(value.rentalStartDate, transferDate ?? ""),
    [value.rentalStartDate, transferDate],
  );

  return (
    <div className="mt-2 ml-4 space-y-3">
      {/* ① 등록·신분 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
            ①
          </span>
          <p className="text-xs font-semibold text-violet-700">등록·신분</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">지자체 임대사업자 등록일</label>
          <DateInput
            value={value.registrationDate}
            onChange={(v) => onChange({ registrationDate: v })}
          />
          {/* 3개월 검증 배지 */}
          {regBadge && (
            <div
              className={`mt-1 rounded px-2 py-1 text-micro font-medium ${
                regBadge.ok
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-amber-100 text-amber-800 border border-amber-200"
              }`}
            >
              {regBadge.text}
            </div>
          )}
          {!acquisitionDate && (
            <p className="mt-1 text-micro text-muted-foreground">
              ※ 3개월 검증 배지는 자산 카드의 취득일 입력 후 표시됩니다.
            </p>
          )}
        </div>

        <ToggleCard
          variant="chip"
          checked={value.isTaxRegistered}
          onCheckedChange={(v) => onChange({ isTaxRegistered: v })}
          title="세무서 사업자 등록"
          description="소득세법 §168 — 임대개시 인정 요건"
          tone="violet"
        />

        <div>
          <label className="mb-1 block text-xs font-medium">임대개시일</label>
          <DateInput value={value.rentalStartDate} onChange={(v) => onChange({ rentalStartDate: v })} />
        </div>
      </div>

      {/* ② 임대 개시 정보 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
            ②
          </span>
          <p className="text-xs font-semibold text-violet-700">임대 개시 정보</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">임대개시 당시 기준시가 (원)</label>
          <CurrencyInput
            label=""
            value={value.officialPriceAtStart}
            onChange={(v) => onChange({ officialPriceAtStart: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            주택+부속토지 합계 — 6억(수도권 밖 3억) 이하 요건 확인용
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium">소재지</p>
          <RadioCardGroup
            name="region_975"
            layout="inline"
            tone="rose"
            value={value.region}
            onChange={(v) => onChange({ region: v as Rental975Form["region"] })}
            options={[
              { value: "capital", label: "수도권" },
              { value: "non_capital", label: "비수도권" },
            ]}
          />
        </div>
      </div>

      {/* ③④ 공통 필드 */}
      <RentalCommonFields
        value={value}
        onChange={patchCommon}
        sectionOffset={3}
      />

      {/* emerald 자동 표시 박스 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1">
        <p className="text-xs font-semibold text-emerald-800">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">의무임대기간</span>
          <span className="font-mono font-medium text-emerald-900">10년</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">양도일 기준 임대기간 (임대개시일→양도일)</span>
          <span className="font-mono font-medium text-emerald-900">{rentalDuration}</span>
        </div>
      </div>
    </div>
  );
}
