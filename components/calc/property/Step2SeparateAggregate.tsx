"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ZONING_DISTRICT_LABELS, type FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step2SeparateAggregate({ form, onChange }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">별도합산과세 상세 정보</h2>
      <p className="text-sm text-muted-foreground">
        기준면적(건물 바닥면적 × 용도지역 배율) 판정에 필요한 정보를 입력하세요
        (지방세법 시행령 §101).
      </p>

      {/* 용도지역 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">용도지역</label>
        <RadioCardGroup
          name="saZoningDistrict"
          tone="sky"
          layout="inline"
          options={ZONING_DISTRICT_LABELS.map(([value, label]) => ({ value, label }))}
          value={form.saZoningDistrict}
          onChange={(v) => onChange({ saZoningDistrict: v })}
        />
      </div>

      {/* 토지 면적 */}
      <div className="space-y-1">
        <label className="text-sm font-medium">토지 면적 (㎡)</label>
        <CurrencyInput
          label="토지 면적"
          value={form.saLandArea}
          onChange={(v) => onChange({ saLandArea: v })}
          placeholder="예: 500"
        />
        <p className="text-xs text-muted-foreground">
          공시가격 ÷ 면적 = 개별공시지가(원/㎡)로 자동 환산됩니다.
        </p>
      </div>

      {/* 공장 여부 */}
      <ToggleCard
        tone="sky"
        title="공장용지"
        description="공장입지기준면적 적용"
        checked={form.saIsFactory}
        onCheckedChange={(v) => onChange({ saIsFactory: v })}
      />

      {/* 건물 바닥면적 (비공장) */}
      {!form.saIsFactory && (
        <div className="space-y-1">
          <label className="text-sm font-medium">건물 바닥면적 (㎡)</label>
          <CurrencyInput
            label="건물 바닥면적"
            value={form.saBuildingFloorArea}
            onChange={(v) => onChange({ saBuildingFloorArea: v })}
            placeholder="예: 200"
          />
          <p className="text-xs text-muted-foreground">
            기준면적 = 건물 바닥면적 × 용도지역 배율 (지방세법 시행령 §101②)
          </p>
        </div>
      )}

      {/* 공장입지기준면적 (공장) */}
      {form.saIsFactory && (
        <div className="space-y-1">
          <label className="text-sm font-medium">공장입지기준면적 (㎡)</label>
          <CurrencyInput
            label="공장입지기준면적"
            value={form.saFactoryStandardArea}
            onChange={(v) => onChange({ saFactoryStandardArea: v })}
            placeholder="예: 1,000"
          />
          <p className="text-xs text-muted-foreground">
            산업집적활성화법상 공장입지기준면적 이내: 별도합산, 초과: 종합합산
          </p>
        </div>
      )}

      {/* 건축물 철거 여부 */}
      <ToggleCard
        tone="sky"
        title="건축물 철거 완료"
        description="6개월 이내 특례 적용 가능"
        checked={form.saDemolished}
        onCheckedChange={(v) => onChange({ saDemolished: v })}
      />

      {form.saDemolished && (
        <div className="space-y-1">
          <label className="text-sm font-medium">철거일</label>
          <input
            type="text"
            value={form.saDemolishedDate}
            onChange={(e) => onChange({ saDemolishedDate: e.target.value })}
            placeholder="YYYY-MM-DD"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            철거일부터 과세기준일(6월 1일)까지 6개월 이내이면 별도합산 유지 특례 적용
            (지방세법 시행령 §101③)
          </p>
        </div>
      )}
    </div>
  );
}
