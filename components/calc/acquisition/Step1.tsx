import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import type { useStandardPriceLookup } from "@/lib/hooks/useStandardPriceLookup";
import {
  labelCls,
  selectCls,
  checkboxWrapCls,
  type FormState,
} from "./shared";

interface Step1Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  priceLookup: ReturnType<typeof useStandardPriceLookup>;
  isHousing: boolean;
}

/**
 * Step 1: 물건 상세 — 전용면적·시가표준액·사치성·특수관계인
 */
export function Step1({ form, set, priceLookup, isHousing }: Step1Props) {
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
                  value={form.standardValue}
                  onChange={(v) => set("standardValue", v)}
                  placeholder="없으면 신고가액으로 과세"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const price = await priceLookup.lookup({ jibun: form.jibun, propertyType: form.propertyType });
                  if (price) set("standardValue", String(price));
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
          <CurrencyInput
            label=""
            value={form.standardValue}
            onChange={(v) => set("standardValue", v)}
            placeholder="없으면 신고가액으로 과세"
          />
        )}
      </div>

      <div className={checkboxWrapCls}>
        <input
          type="checkbox"
          id="isRelatedParty"
          checked={form.isRelatedParty}
          onChange={(e) => set("isRelatedParty", e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <label htmlFor="isRelatedParty" className={`${labelCls} cursor-pointer`}>
          특수관계인 간 거래 (시가 70%~130% 벗어나면 시가 기준 과세)
        </label>
      </div>

      {form.isRelatedParty && (
        <CurrencyInput
          label="시가인정액 (감정가·매매사례가액)"
          value={form.marketValue}
          onChange={(v) => set("marketValue", v)}
          placeholder="시가 기준 금액"
        />
      )}

      <div className={checkboxWrapCls}>
        <input
          type="checkbox"
          id="isLuxuryProperty"
          checked={form.isLuxuryProperty}
          onChange={(e) => set("isLuxuryProperty", e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <label htmlFor="isLuxuryProperty" className={`${labelCls} cursor-pointer`}>
          사치성 재산 (골프장·별장·고급주택·고급오락장·고급선박) — 기본세율의 5배 중과 (지방세법 §13①)
        </label>
      </div>
    </div>
  );
}
