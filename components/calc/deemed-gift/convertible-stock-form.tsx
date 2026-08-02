"use client";

/** 증여로 보는 경우 — (8-3) 전환주식 §39①3호 입력 폼. capital-forms.tsx에서 분리(800줄 정책). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { DeemedFormState } from "./shared";
import { CI_SHARES_LABEL, ListedAvgAutoFetch, ALLOCATION_METHOD_OPTIONS, allocationMethodHint, type Props, type SetFn } from "./capital-forms-shared";

const CS_SECTION_TONE = {
  sky: { box: "border-sky-200 bg-sky-50/40", badge: "bg-sky-200 text-sky-800", title: "text-sky-700" },
  amber: { box: "border-amber-200 bg-amber-50/40", badge: "bg-amber-200 text-amber-800", title: "text-amber-700" },
} as const;

type CsKeys = {
  prePrice: keyof DeemedFormState;
  preShares: keyof DeemedFormState;
  newPrice: keyof DeemedFormState;
  issuedShares: keyof DeemedFormState;
  forfeitedShares: keyof DeemedFormState;
  relatedAcquired: keyof DeemedFormState;
  ratioDenom: keyof DeemedFormState;
  isListed: keyof DeemedFormState;
  listedMarketAvg: keyof DeemedFormState;
  allocationMethod: keyof DeemedFormState;
};

/** 전환주식 한 시점(전환/발행)의 §29②1~5 산식 입력 구간 */
function CsNumericSection({
  form,
  set,
  ph,
  tone,
  num,
  title,
  keys,
  newPriceLabel,
  sharesLabel,
  needsRatio,
  stockCode,
  onStockCode,
  valuationDate,
  dateLabel,
  stockCodeTestId,
  onValuationDate,
}: {
  form: DeemedFormState;
  set: SetFn;
  ph: string;
  tone: keyof typeof CS_SECTION_TONE;
  num: number;
  title: string;
  keys: CsKeys;
  newPriceLabel: string;
  sharesLabel: string;
  needsRatio: boolean;
  stockCode: string;
  onStockCode: (v: string) => void;
  valuationDate: string;
  dateLabel: string;
  stockCodeTestId: string;
  onValuationDate?: (v: string) => void;
}) {
  const t = CS_SECTION_TONE[tone];
  const v = (k: keyof DeemedFormState) => String(form[k]);
  const on = (k: keyof DeemedFormState) => (val: string) => set({ [k]: val } as Partial<DeemedFormState>);
  return (
    <div className={`space-y-2 rounded-lg border ${t.box} p-3`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${t.badge} text-micro font-bold select-none`}>{num}</span>
        <p className={`text-xs font-semibold ${t.title}`}>{title}</p>
      </div>
      <CurrencyInput label="증자 전 1주당 평가가액" value={v(keys.prePrice)} onChange={on(keys.prePrice)} placeholder={`${ph} 증자 전 1주당 평가가액 (원)`} />
      <CurrencyInput label="증자 전 발행주식총수" value={v(keys.preShares)} onChange={on(keys.preShares)} placeholder={`${ph} 증자 전 발행주식총수`} />
      <CurrencyInput label={newPriceLabel} value={v(keys.newPrice)} onChange={on(keys.newPrice)} placeholder={`${ph} ${newPriceLabel} (원)`} />
      <CurrencyInput label="증자 주식수" value={v(keys.issuedShares)} onChange={on(keys.issuedShares)} placeholder={`${ph} 증자 주식수`} />
      <CurrencyInput label={sharesLabel} value={v(keys.forfeitedShares)} onChange={on(keys.forfeitedShares)} placeholder={`${ph} ${sharesLabel}`} />
      <RadioCardGroup
        lawLinks="상증법"
        name={`cs-alloc-method-${ph}`}
        tone="rose"
        value={form[keys.allocationMethod] as DeemedFormState["ciAllocationMethod"]}
        onChange={(val) => set({ [keys.allocationMethod]: val } as Partial<DeemedFormState>)}
        options={ALLOCATION_METHOD_OPTIONS.map((o) => ({ ...o, testId: `cs-alloc-method-${ph}-${o.value}` }))}
      />
      <p className="text-xs text-muted-foreground">
        {allocationMethodHint(form[keys.allocationMethod] as DeemedFormState["ciAllocationMethod"])}
      </p>
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        checked={form[keys.isListed] === true}
        onCheckedChange={(val) => set({ [keys.isListed]: val } as Partial<DeemedFormState>)}
        title={`${ph} 시점 주권상장법인등 (§29②1가·3나 단서)`}
        description="§29②6이 §29②1~5를 상속하므로 시점별로 각각 판정합니다"
      >
        <ListedAvgAutoFetch
          stockCode={stockCode}
          onStockCode={onStockCode}
          valuationDate={valuationDate}
          dateLabel={dateLabel}
          onFill={(val) => on(keys.listedMarketAvg)(val)}
          testId={stockCodeTestId}
          onValuationDate={onValuationDate}
        />
        <CurrencyInput
          label="증자 후 1주당 평가가액"
          value={v(keys.listedMarketAvg)}
          onChange={on(keys.listedMarketAvg)}
          placeholder={`${ph} 시점 전후 각 2개월 종가평균 (원)`}
        />
      </ToggleCard>
      {needsRatio && (
        <>
          <CurrencyInput label="특수관계인이 인수한 신주수" value={v(keys.relatedAcquired)} onChange={on(keys.relatedAcquired)} placeholder={`${ph} 특수관계인이 인수한 신주수`} />
          <CurrencyInput label="분모 신주수" value={v(keys.ratioDenom)} onChange={on(keys.ratioDenom)} placeholder={`${ph} 분모 신주수`} />
        </>
      )}
    </div>
  );
}

/** (8-3) 전환주식 §39①3호 — 전환 시점 − 발행 시점 이익 (시행령 §29②6) */
export function ConvertibleStockFields({ form, set }: Props) {
  const isHigh = form.csDirection === "high";
  const needsRatio = isHigh && form.csSubType !== "forfeited_realloc";
  const sharesLabel = CI_SHARES_LABEL[form.csSubType];
  return (
    <ToneCard tone="rose" bodyClassName="space-y-3" noDark>
      <RadioCardGroup
        lawLinks="상증법"
        name="cs-direction"
        tone="rose"
        layout="inline"
        value={form.csDirection}
        onChange={(v) => set({ csDirection: v })}
        options={[
          { value: "low", label: "저가발행 (3호 가목)", testId: "cs-direction-low" },
          { value: "high", label: "고가발행 (3호 나목)", testId: "cs-direction-high" },
        ]}
      />
      <RadioCardGroup
        lawLinks="상증법"
        name="cs-subtype"
        tone="rose"
        value={form.csSubType}
        onChange={(v) => set({ csSubType: v })}
        options={[
          { value: "forfeited_realloc", label: "실권주 재배정 (가목)", testId: "cs-subtype-forfeited_realloc" },
          { value: "third_party", label: "제3자 직접배정 (다목)", testId: "cs-subtype-third_party" },
          { value: "excess", label: "초과배정 (라목)", testId: "cs-subtype-excess" },
          { value: "no_realloc", label: "실권주 미배정 (나목)", testId: "cs-subtype-no_realloc" },
        ]}
      />
      <p className="text-xs text-muted-foreground">증여이익 = 전환 시점 이익 − 발행 시점 이익 (음수면 0)</p>
      <CsNumericSection
        form={form}
        set={set}
        ph="전환"
        tone="sky"
        num={1}
        title="전환 시점 (교부받은 주식 기준)"
        newPriceLabel="1주당 전환가액등"
        sharesLabel={sharesLabel}
        needsRatio={needsRatio}
        stockCode={form.csStockCode}
        onStockCode={(val) => set({ csStockCode: val })}
        valuationDate={form.giftDate}
        dateLabel="증여일 = 전환한 날 (상증령 §29①2호)"
        stockCodeTestId="cs-stock-code"
        keys={{
          prePrice: "csConvPrePrice",
          preShares: "csConvPreShares",
          newPrice: "csConvNewPrice",
          issuedShares: "csConvIssuedShares",
          forfeitedShares: "csConvForfeitedShares",
          relatedAcquired: "csConvRelatedAcquiredShares",
          ratioDenom: "csConvRatioDenomShares",
          isListed: "csConvIsListed",
          listedMarketAvg: "csConvListedMarketAvg",
          allocationMethod: "csConvAllocationMethod",
        }}
      />
      <CsNumericSection
        form={form}
        set={set}
        ph="발행"
        tone="amber"
        num={2}
        title="발행 시점 (전환주식 발행 당시)"
        newPriceLabel="신주 1주당 인수가액"
        sharesLabel={sharesLabel}
        needsRatio={needsRatio}
        stockCode={form.csStockCode}
        onStockCode={(val) => set({ csStockCode: val })}
        valuationDate={form.csIssuanceDate}
        dateLabel="전환주식 발행 당시 (상증령 §29②6나 — 증여일과 다르다)"
        stockCodeTestId="cs-issue-stock-code"
        onValuationDate={(val) => set({ csIssuanceDate: val })}
        keys={{
          prePrice: "csIssuePrePrice",
          preShares: "csIssuePreShares",
          newPrice: "csIssueNewPrice",
          issuedShares: "csIssueIssuedShares",
          forfeitedShares: "csIssueForfeitedShares",
          relatedAcquired: "csIssueRelatedAcquiredShares",
          ratioDenom: "csIssueRatioDenomShares",
          isListed: "csIssueIsListed",
          listedMarketAvg: "csIssueListedMarketAvg",
          allocationMethod: "csIssueAllocationMethod",
        }}
      />
    </ToneCard>
  );
}
