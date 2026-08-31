"use client";

/**
 * §97의4 — 장기임대주택 장기보유특별공제 추가율 입력 폼 (R-3 확정·활성)
 *
 * 효과: §95② 보유기간별 공제율에 임대기간별 추가율을 "가산" (§97의3의 대체와 다름).
 *       추가율: 6~7년 2% / 7~8년 4% / 8~9년 6% / 9~10년 8% / 10년↑ 10%.
 * 요건: 소령 §167의3①2호 장기임대주택 6년 이상 임대 + 사업자등록 + 임대료 5% 제한.
 *       1세대1주택 표2(§95② 단서) 해당 시 추가율 미가산 (§97의4① 단서 — 엔진 처리).
 *
 * 정책:
 * - 추가율은 표만 정적 안내 — 미리보기 율을 UI에서 자체 계산하지 않음(엔진 단일 진실, 공실 차감 반영).
 * - rentIncreaseViolationMode 기본 "" / hasVacancyOverGrace 기본 null (3-state). useEffect→store 미러링 금지.
 */

import { useMemo } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { RentalCommonFields, RegistrationFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";

type Rental974Form = Extract<RentalReductionFormVariant, { type: "rental_97_4" }>;

interface Props {
  value: Rental974Form;
  onChange: (patch: Partial<Rental974Form>) => void;
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

const ADDITIONAL_RATE_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["6년 이상 ~ 7년 미만", "2%"],
  ["7년 이상 ~ 8년 미만", "4%"],
  ["8년 이상 ~ 9년 미만", "6%"],
  ["9년 이상 ~ 10년 미만", "8%"],
  ["10년 이상", "10%"],
];

export function Rental974InputForm({ value, onChange, transferDate }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental974Form>);
  };

  // emerald 자동 표시 박스 — useMemo, store 미기록
  const rentalDuration = useMemo(
    () => diffYearsMonths(value.rentalStartDate, transferDate ?? ""),
    [value.rentalStartDate, transferDate],
  );

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

        <div className="rounded-md border border-dashed border-violet-300 bg-violet-50/80 px-3 py-2">
          <p className="text-micro text-violet-800">
            ℹ️ 소령 §167의3①2호 장기임대주택(민간건설·민간매입·공공건설·공공매입)을 <strong>6년 이상</strong> 임대해야 합니다.
            1세대1주택 장기보유특별공제 표2(소득세법 §95② 단서)가 적용되는 경우에는
            추가공제율을 가산하지 않습니다 (조특법 §97의4① 단서).
          </p>
        </div>
      </ToneCard>

      {/* ② 추가공제율 안내 (§95② 보유기간 공제율에 가산) */}
      <ToneCard tone="amber" sectionNum="②" title="임대기간별 추가공제율 (§97의4①)" noDark>

        <p className="text-micro text-amber-800">
          §95② 보유기간별 장기보유특별공제율에 아래 추가율을 <strong>가산</strong>합니다 (대체 아님).
        </p>
        <div className="rounded-md border border-amber-200 bg-white/70 divide-y divide-amber-100">
          {ADDITIONAL_RATE_ROWS.map(([label, rate]) => (
            <div key={label} className="flex items-center justify-between px-2.5 py-1 text-caption">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-semibold text-amber-900">{rate}</span>
            </div>
          ))}
        </div>
        <p className="text-micro text-amber-700">
          ※ 적용 추가율은 공실 차감 후 유효임대기간으로 엔진이 산정합니다.
        </p>
      </ToneCard>

      {/* ③ 대상 요건 — 조특령 §97의4① → 소령 §167의3①2호 가목·다목 (D2-04) */}
      <ToneCard tone="sky" sectionNum="③" title="장기임대주택 요건" bodyClassName="space-y-2" noDark>
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">장기임대주택 유형</p>
          <p className="mb-1.5 text-micro text-muted-foreground">
            조특령 §97의4①은 「소득세법 시행령」 §167조의3①2호 <strong>가목 및 다목</strong>의
            장기임대주택만 대상으로 합니다 (나목은 §97의4 대상이 아닙니다).
          </p>
          <RadioCardGroup
            name="rental974Category"
            tone="sky"
            value={value.rental974Category}
            onChange={(v) =>
              onChange({ rental974Category: v as "purchase_a" | "construction_c" })
            }
            options={[
              {
                value: "purchase_a",
                label: "가목 — 민간매입임대 1호 이상",
                description:
                  "민간매입임대주택을 1호 이상 임대 + 5년 이상 임대. 기준시가 한도 6억원(수도권 밖 3억원)",
              },
              {
                value: "construction_c",
                label: "다목 — 건설임대 2호 이상",
                description:
                  "대지 298㎡ 이하·주택 연면적 149㎡ 이하 건설임대주택을 2호 이상 임대 + 5년 이상 임대 또는 분양전환. 기준시가 한도 6억원",
              },
            ]}
          />
          {value.rental974Category === "" && (
            <p className="mt-1 text-micro text-rose-600">
              ※ 반드시 선택하세요 (미선택 시 계산 불가)
            </p>
          )}
        </div>

        <div className="border-t border-sky-200 pt-2">
          <CurrencyInput
            label="임대개시일 당시 기준시가 (주택+부수토지 합계)"
            value={value.officialPriceAtStart}
            onChange={(v) => onChange({ officialPriceAtStart: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            한도{" "}
            {value.rental974Category === "purchase_a" && value.region === "non_capital"
              ? "3억원 (가목 — 수도권 밖)"
              : "6억원"}
            를 초과하면 장기임대주택에 해당하지 않아 §97의4를 적용할 수 없습니다.
          </p>
        </div>
      </ToneCard>

      {/* ④⑤ 공통 필드 (임대료 증액·공실) */}
      <RentalCommonFields
        value={value}
        onChange={patchCommon}
        sectionOffset={4}
        vacancyGraceMonths={3}
      />

      {/* emerald 자동 표시 박스 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1">
        <p className="text-xs font-semibold text-emerald-800">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">최소 의무임대기간</span>
          <span className="font-mono font-medium text-emerald-900">6년</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">양도일 기준 임대기간 (임대개시일→양도일)</span>
          <span className="font-mono font-medium text-emerald-900">{rentalDuration}</span>
        </div>
        <p className="text-micro text-emerald-700">
          ※ 공실 차감 후 실제 유효임대기간과 적용 추가율은 엔진이 계산합니다.
        </p>
      </div>
    </div>
  );
}
