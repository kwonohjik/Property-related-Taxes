import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { SelfFarmingIncorporationInput } from "@/components/calc/inputs/SelfFarmingIncorporationInput";

// ============================================================
// Step 5: 감면 확인
// ============================================================
export function Step5({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const reductionOptions = [
    { value: "", label: "해당 없음", desc: "감면 적용 안 함" },
    { value: "self_farming", label: "자경농지 감면", desc: "8년 이상 자경 농지 (한도 1억원)" },
    { value: "long_term_rental", label: "장기임대주택 감면", desc: "8년 이상 임대, 임대료 인상 5% 이하" },
    { value: "new_housing", label: "신축주택 감면", desc: "신축주택 취득 특례 (50%~100%)" },
    { value: "unsold_housing", label: "미분양주택 감면", desc: "미분양주택 취득 특례 (100%)" },
    { value: "public_expropriation", label: "공익사업 수용 감면 (조특법 §77)", desc: "현금 10% / 채권 15%·30%·40% 산출세액 감면 (1년 한도 2억)" },
  ] as const;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        조세특례 감면이 해당되는 경우 선택하세요.
      </p>

      <div className="space-y-2">
        {reductionOptions.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
              form.reductionType === opt.value
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/40",
            )}
          >
            <input
              type="radio"
              name="reductionType"
              value={opt.value}
              checked={form.reductionType === opt.value}
              onChange={() => onChange({ reductionType: opt.value })}
              className="accent-primary"
              aria-label={opt.label}
            />
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* 감면 유형별 추가 입력 */}
      {form.reductionType === "self_farming" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">자경 기간 입력</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={form.farmingYears}
              onChange={(e) => onChange({ farmingYears: e.target.value })}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">년 (8년 이상이어야 감면 적용)</span>
          </div>

          {/* 피상속인 자경기간 합산 (상속 취득 + 8년 미달 시) */}
          {form.acquisitionCause === "inheritance" && (
            <div className="space-y-2 pt-1 border-t border-primary/20">
              {parseInt(form.farmingYears) >= 8 ? (
                <p className="text-xs text-muted-foreground">
                  ✓ 본인 자경기간 {form.farmingYears}년 ≥ 8년 — 피상속인 합산 불필요
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    본인 자경기간 {form.farmingYears}년 {"<"} 8년 → 피상속인 자경기간을 합산할 수 있습니다
                    (조특령 §66⑪)
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">
                      피상속인 자경기간:
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.decedentFarmingYears}
                      onChange={(e) => onChange({ decedentFarmingYears: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">년</span>
                  </div>
                  {parseInt(form.farmingYears) + parseInt(form.decedentFarmingYears || "0") >= 8 && (
                    <p className="text-xs text-green-700">
                      ✓ 합산 자경기간{" "}
                      {parseInt(form.farmingYears) + parseInt(form.decedentFarmingYears || "0")}
                      년 — 감면 요건 충족
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* 편입일 부분감면 (조특령 §66 ⑤⑥) */}
          <SelfFarmingIncorporationInput
            useSelfFarmingIncorporation={form.useSelfFarmingIncorporation}
            selfFarmingIncorporationDate={form.selfFarmingIncorporationDate}
            selfFarmingIncorporationZone={form.selfFarmingIncorporationZone}
            selfFarmingStandardPriceAtIncorporation={form.selfFarmingStandardPriceAtIncorporation}
            onChange={onChange}
          />
        </div>
      )}

      {form.reductionType === "long_term_rental" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">임대 조건 입력</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={form.rentalYears}
              onChange={(e) => onChange({ rentalYears: e.target.value })}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">년 임대</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.rentIncreaseRate}
              onChange={(e) => onChange({ rentIncreaseRate: e.target.value })}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">% 임대료 인상률 (5% 이하여야 감면)</span>
          </div>
        </div>
      )}

      {form.reductionType === "public_expropriation" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-primary">공익사업 수용·협의매수 (조특법 §77)</p>
            <p className="text-xs text-muted-foreground mt-1">
              현금보상은 10%, 채권보상은 15% 감면 (3년 만기특약 30%, 5년 만기특약 40%). 연간 한도 2억원.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">현금 보상액</label>
              <CurrencyInput
                label=""
                value={form.expropriationCash}
                onChange={(v) => onChange({ expropriationCash: v })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">채권 보상액</label>
              <CurrencyInput
                label=""
                value={form.expropriationBond}
                onChange={(v) => onChange({ expropriationBond: v })}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <p className="block text-xs font-medium mb-1">채권 만기보유 특약</p>
            <div className="flex gap-4 text-sm">
              {[
                { value: "none", label: "없음 (15%)" },
                { value: "3", label: "3년 (30%)" },
                { value: "5", label: "5년 (40%)" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="expropriationBondHoldingYears"
                    value={opt.value}
                    checked={form.expropriationBondHoldingYears === opt.value}
                    onChange={() => onChange({ expropriationBondHoldingYears: opt.value as "none" | "3" | "5" })}
                    className="accent-primary"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">사업인정고시일</label>
            <DateInput
              value={form.expropriationApprovalDate}
              onChange={(v) => onChange({ expropriationApprovalDate: v })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              부칙 §53 적용 판정용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도 시 종전 감면율).
            </p>
          </div>
        </div>
      )}

      {(form.reductionType === "new_housing" || form.reductionType === "unsold_housing") && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">물건 소재지</p>
          {/* [I4] 3지선다 — 수도권 과밀억제권역 외는 §99 ④~⑥에서 별도 감면율 적용 */}
          <div className="flex flex-col gap-2">
            {[
              { value: "metropolitan", label: "수도권 (과밀억제권역)", desc: "50% 감면" },
              { value: "outside_overconcentration", label: "수도권 (과밀억제권역 외)", desc: "조문별 상이" },
              { value: "non_metropolitan", label: "비수도권 (지방)", desc: "100% 감면" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reductionRegion"
                  value={opt.value}
                  checked={form.reductionRegion === opt.value}
                  onChange={() => onChange({ reductionRegion: opt.value as typeof form.reductionRegion })}
                  className="accent-primary"
                  aria-label={opt.label}
                />
                <span className="text-sm">{opt.label}</span>
                <span className="text-xs text-muted-foreground">({opt.desc})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          당해 연도 기사용 기본공제
        </label>
        <CurrencyInput
          label=""
          value={form.annualBasicDeductionUsed}
          onChange={(v) => onChange({ annualBasicDeductionUsed: v })}
          placeholder="0"
          hint="동일 연도 다른 양도에서 이미 사용한 기본공제 금액 (연간 한도 250만원)"
        />
      </div>
    </div>
  );
}
