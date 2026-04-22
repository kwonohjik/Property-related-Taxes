"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import type { useStandardPriceLookup } from "@/lib/hooks/useStandardPriceLookup";
import {
  OBJECT_TYPE_LABELS,
  BUILDING_TYPE_LABELS,
  type FormState,
} from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
  onReset: () => void;
  priceLookup: ReturnType<typeof useStandardPriceLookup>;
}

export function Step0({ form, onChange, onReset, priceLookup }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">기본 정보</h2>
        <ResetButton onReset={onReset} />
      </div>

      {/* 물건 유형 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">물건 유형</label>
        <div className="grid gap-2">
          {OBJECT_TYPE_LABELS.map(([val, label]) => (
            <label key={val} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="objectType"
                value={val}
                checked={form.objectType === val}
                onChange={() => onChange({ objectType: val })}
                className="accent-primary"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
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
          <>
            <div className="flex gap-2 items-center">
              <select
                value={priceLookup.year}
                onChange={(e) => priceLookup.setYear(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="공시가격 조회 연도"
              >
                {priceLookup.yearOptions.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <div className="flex-1">
                <CurrencyInput
                  label=""
                  value={form.publishedPrice}
                  onChange={(v) => onChange({ publishedPrice: v })}
                  placeholder="예: 300,000,000"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const apiType = form.objectType === "land" ? "land" : "housing";
                  const price = await priceLookup.lookup({ jibun: form.jibun, propertyType: apiType });
                  if (price) onChange({ publishedPrice: String(price) });
                }}
                disabled={priceLookup.loading || !form.jibun}
                className="px-3 py-2 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                {priceLookup.loading ? "조회중" : "조회"}
              </button>
            </div>
            {priceLookup.announcedLabel && (
              <p className="text-xs text-muted-foreground">{priceLookup.announcedLabel}</p>
            )}
            {priceLookup.msg && (
              <p className={`text-xs ${priceLookup.msg.kind === "ok" ? "text-emerald-700" : "text-destructive"}`}>
                {priceLookup.msg.text}
              </p>
            )}
          </>
        ) : (
          <>
            <CurrencyInput
              label=""
              value={form.publishedPrice}
              onChange={(v) => onChange({ publishedPrice: v })}
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isOneHousehold}
            onChange={(e) => onChange({ isOneHousehold: e.target.checked })}
            className="accent-primary"
          />
          <span className="text-sm">
            1세대 1주택 특례 신청 (공시가격 9억 이하 시 적용)
          </span>
        </label>
      )}

      {/* 건축물 유형 (건축물 전용) */}
      {form.objectType === "building" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">건축물 유형</label>
          <div className="grid gap-2">
            {BUILDING_TYPE_LABELS.map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="buildingType"
                  value={val}
                  checked={form.buildingType === val}
                  onChange={() => onChange({ buildingType: val })}
                  className="accent-primary"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 도시지역 여부 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isUrbanArea}
          onChange={(e) => onChange({ isUrbanArea: e.target.checked })}
          className="accent-primary"
        />
        <span className="text-sm">도시지역 내 소재 (도시지역분 0.14% 추가 과세)</span>
      </label>
    </div>
  );
}
