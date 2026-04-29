"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  OBJECT_TYPE_LABELS,
  BUILDING_TYPE_LABELS,
  type FormState,
} from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
  onReset: () => void;
  /** 공시가격 총액 (원) */
  publishedPrice: string;
  onPublishedPriceChange: (v: string) => void;
  /** 토지 단가 (원/㎡) */
  publishedPricePerSqm?: string;
  onPublishedPricePerSqmChange?: (v: string) => void;
  jibun?: string;
  referenceDate?: string;
}

/** form.objectType → StandardPriceInput propertyKind 변환 */
function toPropertyKind(objectType: string): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (objectType === "housing") return "house_apart";
  if (objectType === "land") return "land";
  return "building_non_residential";
}

export function Step0({
  form,
  onChange,
  onReset,
  publishedPrice,
  onPublishedPriceChange,
  publishedPricePerSqm,
  onPublishedPricePerSqmChange,
  jibun,
  referenceDate,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">기본 정보</h2>
        <ResetButton onReset={onReset} />
      </div>

      {/* 물건 유형 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">물건 유형</label>
        <RadioCardGroup
          name="objectType"
          tone="violet"
          layout="inline"
          options={OBJECT_TYPE_LABELS.map(([value, label]) => ({ value, label }))}
          value={form.objectType}
          onChange={(v) => onChange({ objectType: v })}
        />
      </div>

      {/* 소재지 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          물건 소재지 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </label>
        <AddressSearch
          value={{ road: form.road, jibun: form.jibun, building: form.building, detail: "", lng: "", lat: "" } satisfies AddressValue}
          onChange={(v) => onChange({ jibun: v.jibun, road: v.road, building: v.building })}
        />
      </div>

      {/* 공시가격 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">공시가격</label>
        <p className="text-xs text-muted-foreground">
          주택: 주택공시가격 / 토지: 개별공시지가 합계 / 건축물: 기준시가
        </p>
        {form.objectType !== "building" ? (
          <StandardPriceInput
            propertyKind={toPropertyKind(form.objectType)}
            totalPrice={publishedPrice}
            onTotalPriceChange={onPublishedPriceChange}
            pricePerSqm={publishedPricePerSqm}
            onPricePerSqmChange={onPublishedPricePerSqmChange}
            jibun={jibun ?? form.jibun}
            referenceDate={referenceDate}
            label=""
            enableLookup={true}
          />
        ) : (
          <>
            <CurrencyInput
              label=""
              value={publishedPrice}
              onChange={onPublishedPriceChange}
              placeholder="예: 300,000,000"
            />
            <p className="text-xs text-amber-700">
              ※ 건축물 기준시가는 국세청 홈택스에서 직접 확인 후 입력하세요.
            </p>
          </>
        )}
      </div>

      {/* 1세대1주택 (주택 전용) */}
      {form.objectType === "housing" && (
        <ToggleCard
          tone="violet"
          title="1세대 1주택 특례 신청"
          description="공시가격 9억 이하 시 적용"
          checked={form.isOneHousehold}
          onCheckedChange={(v) => onChange({ isOneHousehold: v })}
        />
      )}

      {/* 건축물 유형 (건축물 전용) */}
      {form.objectType === "building" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">건축물 유형</label>
          <RadioCardGroup
            name="buildingType"
            tone="sky"
            layout="inline"
            options={BUILDING_TYPE_LABELS.map(([value, label]) => ({ value, label }))}
            value={form.buildingType}
            onChange={(v) => onChange({ buildingType: v })}
          />
        </div>
      )}

      {/* 도시지역 여부 */}
      <ToggleCard
        tone="rose"
        title="도시지역 내 소재"
        description="도시지역분 0.14% 추가 과세"
        checked={form.isUrbanArea}
        onCheckedChange={(v) => onChange({ isUrbanArea: v })}
      />
    </div>
  );
}
