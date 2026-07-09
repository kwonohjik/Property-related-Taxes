"use client";

/**
 * 다필지 부속토지 입력(상속·증여 1시점) — 위치지수 면적가중평균 ㎡당 공시지가 산정(고시 §6⑥).
 * 각 필지 면적 × ㎡당 공시지가 합 ÷ 총면적. 단일 공시지가 대체.
 */
import { Button } from "@/components/ui/button";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { weightedAvgLandPrice } from "@/lib/tax-engine/building-standard-price-helpers";
import type { LandParcelForm } from "@/lib/calc/building-std-price-form";

interface Props {
  parcels: LandParcelForm[];
  onChange: (parcels: LandParcelForm[]) => void;
  /** 소재지 지번(공시지가 조회용) — 대표 지번 기준. 필지별 주소가 다르면 조회값은 대표 지번에만 정확하므로 수동 수정 */
  jibun?: string;
  /** 평가 시점 기준일(공시지가 조회 연도) */
  referenceDate?: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function LandParcelsSection({ parcels, onChange, jibun, referenceDate }: Props) {
  const update = (i: number, patch: Partial<LandParcelForm>) =>
    onChange(parcels.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const add = () => onChange([...parcels, { areaM2: "", pricePerM2: "" }]);
  const remove = (i: number) => onChange(parcels.filter((_, idx) => idx !== i));

  const valid = parcels.filter((p) => parseDecimal(p.areaM2) > 0 && parseAmount(p.pricePerM2) > 0);
  const totalArea = valid.reduce((s, p) => s + parseDecimal(p.areaM2), 0);
  let weightedAvg = 0;
  if (valid.length > 0 && totalArea > 0) {
    weightedAvg = weightedAvgLandPrice(
      valid.map((p) => ({ areaM2: parseDecimal(p.areaM2), pricePerM2: parseAmount(p.pricePerM2) })),
    );
  }

  return (
    <div className="space-y-2.5">
      {parcels.map((p, i) => (
        <div key={i} className="rounded-md border border-sky-200 bg-white/60 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-sky-700">필지 {i + 1}</span>
            {parcels.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-caption text-rose-600 underline underline-offset-2 hover:no-underline"
              >
                삭제
              </button>
            )}
          </div>
          <FieldCard label="필지 면적" hint="해당 부속토지 면적">
            <DecimalInput value={p.areaM2} onChange={(v) => update(i, { areaM2: v })} unit="㎡" placeholder="필지 면적" />
          </FieldCard>
          <LandPriceLookupField
            pricePerSqm={p.pricePerM2}
            onPricePerSqmChange={(v) => update(i, { pricePerM2: v })}
            area={parseDecimal(p.areaM2) || undefined}
            jibun={jibun}
            referenceDate={referenceDate}
            label={`필지 ${i + 1} ㎡당 개별공시지가`}
          />
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add} className="w-full">
        + 필지 추가
      </Button>

      {weightedAvg > 0 && (
        <div className="rounded-md border border-sky-200 bg-sky-100/60 px-3 py-2 text-xs text-sky-800">
          면적가중평균 ㎡당 공시지가 ={" "}
          <b className="font-mono tabular-nums">{fmt(weightedAvg)}</b> 원/㎡
          <span className="ml-1 text-sky-600">
            (총 {totalArea.toLocaleString("ko-KR")}㎡ · 위치지수 산정 기준)
          </span>
        </div>
      )}
    </div>
  );
}
