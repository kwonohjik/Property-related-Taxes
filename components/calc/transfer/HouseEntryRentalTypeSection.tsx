"use client";

/**
 * HouseEntryRentalTypeSection — 장기임대 9유형(가~자목) 매트릭스 입력
 *
 * isRegisteredRental ON 하위에서 rentalType 선택 → 해당 유형이 요구하는 필드만 조건부 노출.
 * 필드 ↔ 유형 매핑은 엔진 checkRentalType_A~I(multi-house-surcharge-helpers.ts:108-264) 실측 기준.
 * (설계: docs/02-design/features/transfer-rental-type-matrix.engine.design.md)
 *
 * 정책: RadioCardGroup/ToggleCard/DateInput/DecimalInput/CurrencyInput 전용 · useEffect 미러링 금지.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { getRentalTypeLabel } from "@/lib/tax-engine/multi-house-surcharge";
import type { RentalHousingType } from "@/lib/tax-engine/multi-house-surcharge";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
}

// 유형별 노출 필드 (엔진 checkRentalType_X 요구 필드 — 공통 등록정보 외)
const TYPE_FIELDS: Record<RentalHousingType, Array<keyof HouseEntry>> = {
  A: ["rentalStartOfficialPrice", "rentIncreaseUnder5Pct"],
  B: ["acquisitionOfficialPrice", "isNationalSizeHousing", "hasMinimum2Units"],
  C: ["rentalStartOfficialPrice", "hasMinimum2Units", "rentalLandArea", "rentalTotalFloorArea", "rentIncreaseUnder5Pct", "isConvertedToSale"],
  D: ["acquisitionOfficialPrice", "firstSaleContractDate", "rentalLandArea", "rentalTotalFloorArea", "hasMinimum5UnitsInCity", "isExcludedAfter20200711Apt"],
  E: ["rentalStartOfficialPrice", "rentIncreaseUnder5Pct", "isExcluded918Rule", "isExcludedAfter20200711Apt", "isExcludedShortToLongChange"],
  F: ["rentalStartOfficialPrice", "hasMinimum2Units", "rentalLandArea", "rentalTotalFloorArea", "rentIncreaseUnder5Pct", "isConvertedToSale", "isExcludedShortToLongChange"],
  G: ["rentalCancellationDate", "hasHalfDutyPeriodMet", "isSoldWithin1YearOfCancellation"],
  H: ["rentalStartOfficialPrice", "rentIncreaseUnder5Pct", "isExcluded918Rule", "hasContractDepositProof"],
  I: ["rentalStartOfficialPrice", "hasMinimum2Units", "rentalLandArea", "rentalTotalFloorArea", "rentIncreaseUnder5Pct"],
};

type FieldKind = "price" | "area" | "date" | "bool";
const FIELD_META: Record<string, { kind: FieldKind; label: string; hint?: string }> = {
  rentalStartOfficialPrice: { kind: "price", label: "임대개시 당시 공시가격", hint: "수도권 6억·비수도권 3억 등 유형별 한도 판정" },
  acquisitionOfficialPrice: { kind: "price", label: "취득 당시 공시가격" },
  rentalLandArea: { kind: "area", label: "대지면적", hint: "298㎡ 이하 요건(건설임대)" },
  rentalTotalFloorArea: { kind: "area", label: "연면적", hint: "149㎡ 이하 요건(건설임대)" },
  firstSaleContractDate: { kind: "date", label: "최초 분양계약일" },
  rentalCancellationDate: { kind: "date", label: "자진·자동 말소일" },
  rentIncreaseUnder5Pct: { kind: "bool", label: "임대료 증액 5% 이하 충족" },
  isNationalSizeHousing: { kind: "bool", label: "국민주택규모(전용 85㎡ 이하)" },
  hasMinimum2Units: { kind: "bool", label: "같은 시·군 2호 이상 보유" },
  hasMinimum5UnitsInCity: { kind: "bool", label: "같은 시·군 5호 이상 보유" },
  isConvertedToSale: { kind: "bool", label: "분양전환 해당" },
  hasHalfDutyPeriodMet: { kind: "bool", label: "임대의무기간 1/2 이상 충족" },
  isSoldWithin1YearOfCancellation: { kind: "bool", label: "말소일 이후 1년 이내 양도" },
  // 결격(제외) 사유 — 체크 시 중과배제가 적용되지 않음
  isExcluded918Rule: { kind: "bool", label: "2018.9.14 이후 조정지역 취득 (결격)" },
  isExcludedAfter20200711Apt: { kind: "bool", label: "2020.7.11 이후 등록 아파트 (결격)" },
  isExcludedShortToLongChange: { kind: "bool", label: "단기→장기 변경신고분 (결격)" },
  hasContractDepositProof: { kind: "bool", label: "계약금 지급 증빙 보유" },
};

export function HouseEntryRentalTypeSection({ house, onUpdate }: Props) {
  const rentalType = house.rentalType;
  const fields = rentalType ? TYPE_FIELDS[rentalType] : [];

  function setStr(key: keyof HouseEntry, v: string) {
    onUpdate({ [key]: v || undefined } as Partial<HouseEntry>);
  }
  function setBool(key: keyof HouseEntry, v: boolean) {
    onUpdate({ [key]: v } as Partial<HouseEntry>);
  }

  return (
    <div className="space-y-3 pt-1">
      {/* 유형 선택 (가~자목) */}
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-foreground font-medium">
          장기임대주택 유형 <span className="text-muted-foreground/60 font-normal">(미선택 시 등록임대 5년 단순 판정)</span>
        </label>
        <RadioCardGroup
          name={`rental-type-${house.id}`}
          layout="stack"
          tone="violet"
          value={rentalType ?? ""}
          onChange={(v) => onUpdate({ rentalType: (v || undefined) as RentalHousingType | undefined })}
          options={(["A", "B", "C", "D", "E", "F", "G", "H", "I"] as RentalHousingType[]).map((t) => ({
            value: t,
            label: getRentalTypeLabel(t),
          }))}
        />
      </div>

      {/* 선택 유형이 요구하는 필드만 조건부 노출 */}
      {fields.length > 0 && (
        <div className="space-y-2.5 rounded-md border border-violet-200/70 bg-violet-50/30 p-2.5">
          <p className="text-[11px] text-violet-700/80">
            선택한 유형의 중과배제 요건 입력 — 미입력·미충족 시 주택 수에 산입됩니다.
          </p>
          {fields.map((key) => {
            const meta = FIELD_META[key as string];
            if (!meta) return null;
            if (meta.kind === "price") {
              return (
                <CurrencyInput
                  key={key as string}
                  label={meta.label}
                  value={(house[key] as string) ?? ""}
                  onChange={(v) => setStr(key, v)}
                  hint={meta.hint}
                />
              );
            }
            if (meta.kind === "area") {
              return (
                <div key={key as string} className="space-y-1">
                  <label className="block text-[11px] text-muted-foreground font-medium">
                    {meta.label} (㎡)
                  </label>
                  <DecimalInput
                    value={(house[key] as string) ?? ""}
                    onChange={(v) => setStr(key, v)}
                    placeholder={meta.label}
                  />
                  {meta.hint && <p className="text-[11px] text-muted-foreground/70">{meta.hint}</p>}
                </div>
              );
            }
            if (meta.kind === "date") {
              return (
                <div key={key as string} className="space-y-1">
                  <label className="block text-[11px] text-muted-foreground font-medium">{meta.label}</label>
                  <DateInput value={(house[key] as string) ?? ""} onChange={(v) => setStr(key, v)} />
                </div>
              );
            }
            // bool
            return (
              <ToggleCard
                key={key as string}
                variant="chip"
                tone="violet"
                checked={(house[key] as boolean) ?? false}
                onCheckedChange={(v) => setBool(key, v)}
                title={meta.label}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
