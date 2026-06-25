"use client";

/** 증여로 보는 경우 §37 — 부동산 무상사용·담보 입력 폼 (단일/다기간 G2·G3 + 경정청구 G1). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;

export function FreeRealEstateFields({ form, set }: { form: DeemedFormState; set: SetFn }) {
  const isFreeUse = form.freeSubType === "free_use";
  const multi = form.freePeriods !== undefined;
  const valueLabel = isFreeUse ? "부동산 가액" : "차입금";
  const periods = form.freePeriods ?? [];
  const updatePeriod = (i: number, patch: Partial<{ startDate: string; value: string; interest: string }>) =>
    set({ freePeriods: periods.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <RadioCardGroup
        lawLinks="상증법"
        name="free-subtype"
        tone="violet"
        layout="inline"
        value={form.freeSubType}
        onChange={(v) => set({ freeSubType: v })}
        options={[
          { value: "free_use", label: "무상 사용 (§37①)", testId: "free-subtype-free_use" },
          { value: "collateral", label: "무상 담보 (§37②)", testId: "free-subtype-collateral" },
        ]}
      />

      {/* 다기간 토글 (3-state: undefined=단일 / [...]=다기간) — 시행령§27③(5년)·§27⑤(1년) 초과 */}
      <div data-testid="free-periods-toggle">
      <ToggleCard
        lawLinks="상증법"
        tone="amber"
        checked={multi}
        onCheckedChange={(v) => set({ freePeriods: v ? [{ startDate: "", value: "", interest: "" }] : undefined })}
        title={`다기간 입력 (${isFreeUse ? "5년" : "1년"} 초과)`}
        description="각 기간은 별개 증여 — 세액연결은 첫 기간(현재 증여)"
      >
        <div className="space-y-3">
          {periods.map((p, i) => (
            <div key={i} className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-2" data-testid={`free-period-${i}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800">기간 {i + 1}</span>
                {periods.length > 1 && (
                  <button type="button" className="text-xs text-rose-600" data-testid={`free-period-remove-${i}`} onClick={() => set({ freePeriods: periods.filter((_, idx) => idx !== i) })}>
                    삭제
                  </button>
                )}
              </div>
              <div className="space-y-1" data-testid={`free-period-date-wrap-${i}`}>
                <label className="block text-xs text-amber-700">개시일(증여일)</label>
                <DateInput value={p.startDate} onChange={(v) => updatePeriod(i, { startDate: v })} />
              </div>
              <CurrencyInput label={valueLabel} value={p.value} onChange={(v) => updatePeriod(i, { value: v })} placeholder={`${valueLabel} (원)`} />
              {!isFreeUse && <CurrencyInput label="실제 지급이자" value={p.interest} onChange={(v) => updatePeriod(i, { interest: v })} />}
            </div>
          ))}
          <button type="button" className="text-xs font-medium text-amber-700" data-testid="free-period-add" onClick={() => set({ freePeriods: [...periods, { startDate: "", value: "", interest: "" }] })}>
            + 기간 추가
          </button>
        </div>
      </ToggleCard>
      </div>

      {!multi &&
        (isFreeUse ? (
          <CurrencyInput label="부동산 가액" value={form.freePropertyValue} onChange={(v) => set({ freePropertyValue: v })} hint="5년 현가합이 1억 이상이면 과세 (연 2%·할인율 10%)" placeholder="부동산 가액 (원)" />
        ) : (
          <>
            <CurrencyInput label="차입금" value={form.freeLoanAmount} onChange={(v) => set({ freeLoanAmount: v })} hint="차입이익(차입금×4.6%−이자)이 1천만 이상이면 과세" placeholder="차입금 (원)" />
            <CurrencyInput label="실제 지급이자" value={form.freeInterest} onChange={(v) => set({ freeInterest: v })} />
          </>
        ))}

      <ToggleCard
        lawLinks="상증법"
        tone="violet"
        checked={form.freeRelated}
        onCheckedChange={(v) => set({ freeRelated: v })}
        title="특수관계인 간 거래"
        description="끄면 §37③ — 정당한 사유 없는 경우만 과세"
      />
      {!form.freeRelated && (
        <ToggleCard
          lawLinks="상증법"
          tone="amber"
          checked={form.freeJustifiable}
          onCheckedChange={(v) => set({ freeJustifiable: v })}
          title="거래관행상 정당한 사유 있음 (§37③)"
        />
      )}

      {/* 경정청구(§79②1호·§81⑨) — 무상사용(분모 60월)·담보(분모 12월) 공통 */}
      <div data-testid="free-rect-toggle">
        <ToggleCard
          lawLinks="상증법"
          tone="emerald"
          checked={form.freeRectOn}
          onCheckedChange={(v) => set({ freeRectOn: v })}
          title="경정청구 계산 (소유자 사망·양도 등 중단)"
          description={`${isFreeUse ? "무상사용기간(5년)" : "담보이용기간(1년)"} 중 중단 시 잔여기간분 경정청구 (§79②1호)`}
        >
          <div className="space-y-2">
            <CurrencyInput label="증여세 산출세액" value={form.freeRectTax} onChange={(v) => set({ freeRectTax: v })} hint="세대생략 할증(§57) 포함" placeholder="증여세 산출세액 (원)" />
            <div className="space-y-1" data-testid="free-rect-giftdate-wrap">
              <label className="block text-xs text-emerald-700">당초 증여일({isFreeUse ? "무상사용" : "담보이용"} 개시일)</label>
              <DateInput value={form.freeRectGiftDate} onChange={(v) => set({ freeRectGiftDate: v })} />
            </div>
            <div className="space-y-1" data-testid="free-rect-termdate-wrap">
              <label className="block text-xs text-emerald-700">중단사유 발생일(소유자 사망·양도 등)</label>
              <DateInput value={form.freeRectTermDate} onChange={(v) => set({ freeRectTermDate: v })} />
            </div>
          </div>
        </ToggleCard>
      </div>
    </div>
  );
}
