"use client";

/**
 * 공동주택 고시 전 취득 → 취득당시 기준시가 환산(양도 전용, 소령 §164·고시).
 * 취득당시 = ① 최초고시 공동주택기준시가 × (④ 취득당시 토지 + ⑤ 취득당시 건물) ÷ (② 최초고시 토지 + ③ 최초고시 건물).
 *   토지 = ㎡당 공시지가 × 대지지분면적 / 건물 = 2001 건물기준시가 × 산정기준율(해당 시점).
 * 취득연도는 상위 「취득 시점」의 취득연도 입력을 사용.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import {
  APARTMENT_CONVERSION_INDEX_YEAR,
  type ApartmentConversionForm,
} from "@/lib/calc/building-std-price-form";

interface Props {
  value: ApartmentConversionForm;
  onChange: (patch: Partial<ApartmentConversionForm>) => void;
  /** 소재지 지번(공시지가 조회용) */
  jibun?: string;
  /** 부모 「취득 시점」의 취득연도 — 취득당시 공시지가 조회 기준연도 */
  acquisitionYear?: string;
}

const Y = APARTMENT_CONVERSION_INDEX_YEAR;

function MiniCard({
  num,
  title,
  tone,
  children,
}: {
  num: number;
  title: string;
  tone: "emerald" | "amber" | "sky";
  children: React.ReactNode;
}) {
  const T: Record<string, { border: string; bg: string; badge: string; text: string }> = {
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50/50", badge: "bg-emerald-200 text-emerald-800", text: "text-emerald-700" },
    amber: { border: "border-amber-200", bg: "bg-amber-50/50", badge: "bg-amber-200 text-amber-800", text: "text-amber-700" },
    sky: { border: "border-sky-200", bg: "bg-sky-50/50", badge: "bg-sky-200 text-sky-800", text: "text-sky-700" },
  };
  const t = T[tone];
  return (
    <div className={`rounded-md border p-2.5 space-y-2 ${t.border} ${t.bg}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-micro font-bold ${t.badge}`}>
          {num}
        </span>
        <span className={`text-xs font-semibold ${t.text}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function ApartmentConversionSection({ value, onChange, jibun, acquisitionYear }: Props) {
  const refDate = (year?: string) => (year ? `${year}-06-01` : undefined);
  return (
    <div className="space-y-2.5">
      <p className="rounded-md bg-violet-50 px-2.5 py-1.5 text-caption text-violet-700">
        공동주택기준시가가 고시되기 전에 취득한 경우, 최초고시 기준시가를 토지·건물 비율로 취득당시 가액으로 환산합니다.
        취득연도는 위 「취득 시점」의 취득연도를 사용합니다.
      </p>

      <MiniCard num={1} title="최초고시 공동주택기준시가" tone="emerald">
        <FieldCard label="최초고시 기준시가" hint="국토부 최초 고시 공동주택가격">
          <CurrencyInput
            label="최초고시 기준시가"
            hideLabel
            value={value.firstNoticeApartmentPrice}
            onChange={(v) => onChange({ firstNoticeApartmentPrice: v })}
            placeholder="최초고시 공동주택기준시가"
          />
        </FieldCard>
        <FieldCard label="최초고시 연도" hint="산정기준율 적용 기준연도">
          <DecimalInput
            value={value.firstNoticeYear}
            onChange={(v) => onChange({ firstNoticeYear: v })}
            placeholder="최초고시 연도 (4자리)"
            thousandSeparator={false}
          />
        </FieldCard>
      </MiniCard>

      <MiniCard num={2} title="공동주택 면적·구조(2001 건물기준시가 산정)" tone="sky">
        <FieldCard label="대지(지분)면적" hint="해당 호의 대지지분 면적">
          <DecimalInput value={value.landAreaM2} onChange={(v) => onChange({ landAreaM2: v })} unit="㎡" placeholder="대지지분 면적" />
        </FieldCard>
        <FieldCard label="건물 연면적" hint="전유 + 공용">
          <DecimalInput value={value.totalFloorArea} onChange={(v) => onChange({ totalFloorArea: v })} unit="㎡" placeholder="건물 연면적" />
        </FieldCard>
        <FieldCard label={`건물 구조 (${Y}년 지수표)`}>
          <BuildingStructureSelect year={Y} value={value.structureKey} onChange={(v) => onChange({ structureKey: v })} />
        </FieldCard>
        <FieldCard label={`건물 용도 (${Y}년 지수표)`}>
          <BuildingUsageSelect year={Y} value={value.usageNo} onChange={(v) => onChange({ usageNo: v })} />
        </FieldCard>
        <LandPriceLookupField
          pricePerSqm={value.building2001LandPrice}
          onPricePerSqmChange={(v) => onChange({ building2001LandPrice: v })}
          jibun={jibun}
          referenceDate={refDate(String(Y))}
          label={`${Y}년 건물기준시가 위치지수용 ㎡당 공시지가`}
          hint={`${Y}.1.1 기준 개별공시지가`}
        />
      </MiniCard>

      <MiniCard num={3} title="최초고시 시점 토지·건물 가액(분모)" tone="emerald">
        <LandPriceLookupField
          pricePerSqm={value.firstNoticeLandPrice}
          onPricePerSqmChange={(v) => onChange({ firstNoticeLandPrice: v })}
          area={parseFloat(value.landAreaM2.replace(/,/g, "")) || undefined}
          jibun={jibun}
          referenceDate={refDate(value.firstNoticeYear)}
          label="최초고시 시점 ㎡당 공시지가"
          hint="② 토지가액 = 공시지가 × 대지지분면적"
        />
      </MiniCard>

      <MiniCard num={4} title="취득당시 토지·건물 가액(분자)" tone="amber">
        <LandPriceLookupField
          pricePerSqm={value.acquisitionLandPrice}
          onPricePerSqmChange={(v) => onChange({ acquisitionLandPrice: v })}
          area={parseFloat(value.landAreaM2.replace(/,/g, "")) || undefined}
          jibun={jibun}
          referenceDate={refDate(acquisitionYear)}
          label="취득당시 ㎡당 공시지가"
          hint="④ 토지가액 = 공시지가 × 대지지분면적"
        />
      </MiniCard>
    </div>
  );
}
