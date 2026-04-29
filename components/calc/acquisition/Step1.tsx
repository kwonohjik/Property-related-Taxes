import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  labelCls,
  selectCls,
  checkboxWrapCls,
  type FormState,
} from "./shared";

interface Step1Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  /** 시가표준액 단가 (원/㎡) — 토지·농지 전용 */
  standardValuePerSqm?: string;
  onStandardValuePerSqmChange?: (v: string) => void;
  /** 취득일 (공시가격 기준연도 자동 계산용) */
  referenceDate?: string;
  isHousing: boolean;
}

/** form.propertyType → StandardPriceInput propertyKind 변환 */
function toPropertyKind(propertyType: string): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (propertyType === "housing") return "house_apart";
  if (propertyType === "land" || propertyType === "land_farmland") return "land";
  return "building_non_residential";
}

/**
 * Step 1: 물건 상세 — 전용면적·시가표준액·사치성·특수관계인
 */
export function Step1({
  form,
  set,
  standardValuePerSqm,
  onStandardValuePerSqmChange,
  referenceDate,
  isHousing,
}: Step1Props) {
  return (
    <div className="space-y-4">
      {isHousing && (
        <div>
          <label className={labelCls}>전용면적 (㎡) <span className="text-muted-foreground font-normal">(선택)</span></label>
          <input
            type="number"
            className={selectCls}
            value={form.areaSqm}
            onChange={(e) => set("areaSqm", e.target.value)}
            placeholder="85㎡ 이하이면 농특세 면제"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className={labelCls}>
          {isHousing ? "주택공시가격 (시가표준액, 선택)" : "시가표준액 (선택)"}
        </label>
        {["housing", "land", "land_farmland"].includes(form.propertyType) ? (
          <StandardPriceInput
            propertyKind={toPropertyKind(form.propertyType)}
            totalPrice={form.standardValue}
            onTotalPriceChange={(v) => set("standardValue", v)}
            pricePerSqm={standardValuePerSqm}
            onPricePerSqmChange={onStandardValuePerSqmChange}
            jibun={form.jibun}
            referenceDate={referenceDate}
            label=""
            hint="없으면 신고가액으로 과세"
            enableLookup={true}
          />
        ) : (
          <CurrencyInput
            label=""
            value={form.standardValue}
            onChange={(v) => set("standardValue", v)}
            placeholder="없으면 신고가액으로 과세"
          />
        )}
      </div>

      <ToggleCard
        tone="amber"
        title="특수관계인 간 거래"
        description="시가 70%~130% 벗어나면 시가 기준 과세"
        checked={form.isRelatedParty}
        onCheckedChange={(v) => set("isRelatedParty", v)}
      >
        <CurrencyInput
          label="시가인정액 (감정가·매매사례가액)"
          value={form.marketValue}
          onChange={(v) => set("marketValue", v)}
          placeholder="시가 기준 금액"
        />
      </ToggleCard>

      <ToggleCard
        tone="amber"
        title="사치성 재산"
        description="골프장·별장·고급주택·고급오락장·고급선박 — 기본세율의 5배 중과 (지방세법 §13①)"
        checked={form.isLuxuryProperty}
        onCheckedChange={(v) => set("isLuxuryProperty", v)}
      />
    </div>
  );
}
