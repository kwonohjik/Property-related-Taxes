"use client";

/**
 * 증여로 보는 경우 Phase 3 — 기타이익·자본거래연계·법인 입력 폼
 * (§41의2·§41의3·§41의5·§42·§42의2·§42의3·§45의5).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import type { DeemedFormState } from "./shared";
import { ExcessShareholderTable } from "./ExcessShareholderTable";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** §41의2 초과배당 */
export function ExcessDividendFields({ form, set }: Props) {
  const incomeTaxMode = form.edIncomeTaxMode;

  return (
    <div className="space-y-3">
      {/* ── 섹션 1: 주주 입력 (배당지급일=증여일은 상단 공통 증여일 사용 — §41의2①) ── */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            1
          </span>
          <p className="text-xs font-semibold text-sky-700">
            주주별 배당 내역 — 비례배당·초과배당금액 자동산정 (시행령 §31의2②)
          </p>
        </div>
        <ExcessShareholderTable
          rows={form.edShareholders}
          onChange={(rows) => set({ edShareholders: rows })}
        />
      </div>

      {/* ── 섹션 3: 소득세 상당액 모드 ── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
            2
          </span>
          <p className="text-xs font-semibold text-amber-700">소득세 상당액 확정 여부 — 시행규칙 §10의3</p>
        </div>
        <RadioCardGroup
          name="ed-income-tax-mode"
          tone="amber"
          value={incomeTaxMode ?? "undetermined"}
          onChange={(v) =>
            set({
              edIncomeTaxMode: v as DeemedFormState["edIncomeTaxMode"],
            })
          }
          options={[
            {
              value: "undetermined",
              label: "미확정 — 율표 자동 (시행규칙 §10의3①)",
              description: "증여일 연도 율표에 따라 소득세 상당액을 자동 산정합니다",
              testId: "ed-mode-undetermined",
            },
            {
              value: "exempt",
              label: "비과세 — 소득세 0원 (규칙 §10의3②1호)",
              description: "해당 배당이 소득세 비과세에 해당하는 경우",
              testId: "ed-mode-exempt",
            },
            {
              value: "separate",
              label: "분리과세 확정 — 실제 세액 입력 (규칙 §10의3②2호)",
              description: "분리과세로 납부한 실제 소득세액을 직접 입력합니다",
              testId: "ed-mode-separate",
            },
            {
              value: "comprehensive",
              label: "종합과세 확정 — Max(ⓐ−ⓑ, 14%) 산식 (규칙 §10의3②3호)",
              description: "종합소득과세표준을 입력하면 Max 산식으로 자동 계산합니다",
              testId: "ed-mode-comprehensive",
            },
          ]}
        />

        {/* 분리과세 세액 직접입력 */}
        {incomeTaxMode === "separate" && (
          <div className="pt-1">
            <CurrencyInput
              label="분리과세 소득세액"
              value={form.edSeparateTaxAmount}
              onChange={(v) => set({ edSeparateTaxAmount: v })}
              hint="분리과세 적용 소득세납부세액 (시행규칙 §10의3②2호)"
            />
          </div>
        )}

        {/* 종합과세 과세표준 입력 */}
        {incomeTaxMode === "comprehensive" && (
          <div className="pt-1 space-y-2">
            <CurrencyInput
              label="수증자 종합소득과세표준 ⓐ"
              value={form.edComprehensiveTaxBase}
              onChange={(v) => set({ edComprehensiveTaxBase: v })}
              hint="ⓐ기준 — 초과배당금액 포함 종합소득과세표준 (시행규칙 §10의3②3호)"
            />
            <CurrencyInput
              label="종합소득과세표준 ⓑ (초과배당 제외, 선택)"
              value={form.edComprehensiveTaxBaseExcluding}
              onChange={(v) => set({ edComprehensiveTaxBaseExcluding: v })}
              hint="미입력 시 엔진이 ⓐ − 초과배당금액으로 자동 추정합니다"
            />
            <FieldCard
              label="소득 귀속연도 (선택)"
              hint="미입력 시 증여일(배당지급일) 연도를 소득 귀속연도로 적용합니다"
            >
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={form.edIncomeTaxYear}
                onChange={(e) => set({ edIncomeTaxYear: e.target.value.replace(/\D/g, "") })}
                placeholder="연도 4자리 (미입력 시 증여일 연도)"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </FieldCard>
            <p className="text-xs text-muted-foreground">
              Max(ⓐ과세표준 세율 적용액 − ⓑ차감액 세율 적용액, 초과배당금액 × 14%) — 서버 계산 후 결과에 표시됩니다.
            </p>
          </div>
        )}
      </div>

      {/* ── 섹션 4: 증여세 계산 맥락 (giftTaxContext) — 정산·구법 결과 표시용 ── */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            3
          </span>
          <p className="text-xs font-semibold text-violet-700">
            증여자와의 관계 (선택 — 입력 시 정산·구법 세액 추가 표시)
          </p>
        </div>
        <RadioCardGroup
          name="ed-donor-relationship"
          tone="violet"
          value={form.edDonorRelationship ?? ""}
          onChange={(v) =>
            set({
              edDonorRelationship: v
                ? (v as DeemedFormState["edDonorRelationship"])
                : undefined,
            })
          }
          options={[
            {
              value: "spouse",
              label: "배우자",
              description: "증여재산공제 6억원",
              testId: "ed-rel-spouse",
            },
            {
              value: "lineal_ascendant_adult",
              label: "직계존비속 (성년)",
              description: "증여재산공제 5천만원",
              testId: "ed-rel-lineal-adult",
            },
            {
              value: "lineal_ascendant_minor",
              label: "직계존비속 (미성년)",
              description: "증여재산공제 2천만원",
              testId: "ed-rel-lineal-minor",
            },
            {
              value: "lineal_descendant",
              label: "직계비속 (성년)",
              description: "증여재산공제 5천만원",
              testId: "ed-rel-lineal-desc",
            },
            {
              value: "other_relative",
              label: "기타친족",
              description: "증여재산공제 1천만원",
              testId: "ed-rel-other",
            },
          ]}
        />

        {form.edDonorRelationship && (
          <div className="space-y-2 pt-1">
            <CurrencyInput
              label="10년 내 기적용 공제 누계 (선택)"
              value={form.edPriorDeductionApplied}
              onChange={(v) => set({ edPriorDeductionApplied: v })}
              hint="과거 10년 내 동일인으로부터 받은 증여에서 이미 적용된 공제 합계액"
            />
            <ToggleCard
              tone="rose"
              checked={form.edIsGenerationSkip}
              onCheckedChange={(v) => set({ edIsGenerationSkip: v, edIsMinorGenerationSkip: v ? form.edIsMinorGenerationSkip : false })}
              title="세대생략 할증 (§27)"
              description="수증자가 증여자의 자녀를 건너뛴 직계비속인 경우 30% 할증"
              data-testid="ed-generation-skip-toggle"
            />
            {form.edIsGenerationSkip && (
              <ToggleCard
                tone="rose"
                checked={form.edIsMinorGenerationSkip}
                onCheckedChange={(v) => set({ edIsMinorGenerationSkip: v })}
                title="미성년 세대생략 할증 (§57①)"
                description="수증자가 미성년자이고 20억 초과인 경우 40% 할증 적용"
                data-testid="ed-minor-generation-skip-toggle"
              />
            )}
          </div>
        )}
      </div>

      {/* ── 섹션 5: 정산 (§41의2②③) — 2021.1.1 이후 배당 전용 ── */}
      {/* §0.5 환류: isDiligentFiler 엔진 미사용. isWithinFilingDeadline은 신고세액공제에 사용 */}
      <ToggleCard
        tone="emerald"
        checked={form.edSettlementMode}
        onCheckedChange={(v) => set({ edSettlementMode: v })}
        title="정산 입력 (§41의2②③)"
        description="실제 소득세 납부 후 당초·정산 증여세 차액을 계산합니다 (2021.1.1 이후 배당)"
        data-testid="ed-settlement-toggle"
      >
        <div className="space-y-3 pt-1">
          <CurrencyInput
            label="실제 소득세납부세액 (§31의2④)"
            value={form.edActualIncomeTax}
            onChange={(v) => set({ edActualIncomeTax: v })}
            hint="납부세액 0원인 경우도 0 입력 (시행규칙 §10의3② 확정소득세)"
          />
          <ToggleCard
            tone="emerald"
            checked={form.edIsWithinFilingDeadline}
            onCheckedChange={(v) => set({ edIsWithinFilingDeadline: v })}
            title="기한 내 신고 예정 (신고세액공제 3%)"
            description="법정 신고기한 내 신고 시 산출세액의 3%가 공제됩니다 (§69)"
            data-testid="ed-within-filing-deadline-toggle"
          />
          <p className="text-xs text-muted-foreground">
            정산 결과(당초·정산 증여세 차액·추납/환급)는 계산 후 결과 화면에 표시됩니다.
          </p>
        </div>
      </ToggleCard>
    </div>
  );
}

/** §41의3 상장이익 / §41의5 합병상장이익 */
export function ListingGainFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <RadioCardGroup
        name="lg-event"
        tone="emerald"
        layout="inline"
        value={form.lgEventType}
        onChange={(v) => set({ lgEventType: v })}
        options={[
          { value: "listing", label: "상장 (§41의3)", testId: "lg-event-listing" },
          { value: "merger", label: "합병상장 (§41의5)", testId: "lg-event-merger" },
        ]}
      />
      <CurrencyInput label="정산기준일 1주당 평가가액" value={form.lgSettlementPrice} onChange={(v) => set({ lgSettlementPrice: v })} hint={form.lgEventType === "merger" ? "합병등기일 +3개월 (§63 평가)" : "상장일 +3개월 (§63 평가)"} placeholder="정산기준일 1주당 평가가액 (원)" />
      <CurrencyInput label="1주당 증여세 과세가액(취득가액)" value={form.lgAcqValue} onChange={(v) => set({ lgAcqValue: v })} placeholder="1주당 과세가액(취득가액) (원)" />
      <CurrencyInput label="1주당 기업가치 실질증가이익" value={form.lgCorpGrowth} onChange={(v) => set({ lgCorpGrowth: v })} hint="시행령 §31의3⑤ (1주당 순손익액 평균 × 보유월수)" placeholder="1주당 기업가치 실질증가이익 (원)" />
      <CurrencyInput label="증여·유상취득 주식수" value={form.lgShares} onChange={(v) => set({ lgShares: v })} placeholder="증여·유상취득 주식수" />
    </div>
  );
}

/** §42 재산사용·용역제공 */
export function PropertyServiceUseFields({ form, set }: Props) {
  const isFree = form.psuSubType === "free_use";
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <RadioCardGroup
        name="psu-subtype"
        tone="violet"
        value={form.psuSubType}
        onChange={(v) => set({ psuSubType: v })}
        options={[
          { value: "free_use", label: "무상 사용·용역제공받음 (§42①1호)", testId: "psu-subtype-free_use" },
          { value: "low_price", label: "저가 사용·용역제공받음 (§42①1·3호)", testId: "psu-subtype-low_price" },
          { value: "high_price", label: "고가 사용하게함·용역제공 (§42①2·4호)", testId: "psu-subtype-high_price" },
        ]}
      />
      <CurrencyInput label={isFree ? "재산사용·용역 시가 상당액" : "시가"} value={form.psuMarketValue} onChange={(v) => set({ psuMarketValue: v })} hint={isFree ? "기준금액 1천만원 이상이면 과세" : "기준금액 시가의 30% 이상이면 과세"} placeholder={isFree ? "시가 상당액 (원)" : "시가 (원)"} />
      {!isFree && (
        <CurrencyInput label="대가" value={form.psuConsideration} onChange={(v) => set({ psuConsideration: v })} placeholder="대가 (원)" />
      )}
    </div>
  );
}

/** §42의2 법인 조직변경 */
export function OrgChangeFields({ form, set }: Props) {
  const isShare = form.ocSubType === "share_change";
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <RadioCardGroup
        name="oc-subtype"
        tone="amber"
        layout="inline"
        value={form.ocSubType}
        onChange={(v) => set({ ocSubType: v })}
        options={[
          { value: "share_change", label: "소유지분 변동", testId: "oc-subtype-share_change" },
          { value: "value_change", label: "평가액 변동", testId: "oc-subtype-value_change" },
        ]}
      />
      {isShare ? (
        <>
          <CurrencyInput label="변동 전 지분" value={form.ocPreShares} onChange={(v) => set({ ocPreShares: v })} placeholder="변동 전 지분(주식수)" />
          <CurrencyInput label="변동 후 지분" value={form.ocPostShares} onChange={(v) => set({ ocPostShares: v })} placeholder="변동 후 지분(주식수)" />
          <CurrencyInput label="변동 후 1주당 가액" value={form.ocPostPerShare} onChange={(v) => set({ ocPostPerShare: v })} placeholder="변동 후 1주당 가액 (원)" />
        </>
      ) : (
        <>
          <CurrencyInput label="변동 전 가액" value={form.ocPreValue} onChange={(v) => set({ ocPreValue: v })} placeholder="변동 전 가액 (원)" />
          <CurrencyInput label="변동 후 가액" value={form.ocPostValue} onChange={(v) => set({ ocPostValue: v })} placeholder="변동 후 가액 (원)" />
        </>
      )}
      <CurrencyInput label="변동 전 해당 재산가액 (기준금액 산정)" value={form.ocBaseValue} onChange={(v) => set({ ocBaseValue: v })} hint="기준금액 = min(변동전 재산가액 × 30%, 3억)" placeholder="변동 전 재산가액 (원)" />
    </div>
  );
}

/** §42의3 재산취득 후 가치증가 — 계산사례 프리셋 (국세청 2004 개정세법 해설 pp.197~200) */
const VI_PRESETS: { label: string; testId: string; v: Partial<DeemedFormState> }[] = [
  { label: "①형질변경", testId: "deemed-vi-preset-1", v: { viCurrentValue: "2000000000", viAcqCost: "100000000", viNormalIncrease: "10000000", viContribution: "20000000", viAcqCause: "gift", viReason: "form_change" } },
  { label: "②공유물분할", testId: "deemed-vi-preset-2", v: { viCurrentValue: "7500000000", viAcqCost: "5000000000", viNormalIncrease: "0", viContribution: "0", viAcqCause: "", viReason: "partition" } },
  { label: "③비상장주식 상장", testId: "deemed-vi-preset-3", v: { viCurrentValue: "10000000000", viAcqCost: "1000000000", viNormalIncrease: "0", viContribution: "0", viAcqCause: "borrowed_funds", viReason: "similar" } },
  { label: "④사업 인허가", testId: "deemed-vi-preset-4", v: { viCurrentValue: "5000000000", viAcqCost: "100000000", viNormalIncrease: "50000000", viContribution: "50000000", viAcqCause: "borrowed_funds", viReason: "license" } },
];

/** §42의3 재산취득 후 가치증가 */
export function ValueIncreaseFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      {/* 계산사례 프리셋 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-rose-700">계산사례:</span>
        {VI_PRESETS.map((p) => (
          <button
            key={p.testId}
            type="button"
            data-testid={p.testId}
            onClick={() => set(p.v)}
            className="rounded-md border border-rose-300 bg-white/70 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ① 취득사유 (§42의3①1·2·3호) */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-rose-700">취득사유 (§42의3①)</p>
        <RadioCardGroup
          name="deemed-vi-cause"
          tone="amber"
          layout="stack"
          value={form.viAcqCause}
          onChange={(v) => set({ viAcqCause: v })}
          options={[
            { value: "gift", label: "특수관계인으로부터 증여 (①1호)" },
            { value: "inside_info", label: "내부정보 제공받아 유상취득 (①2호)" },
            { value: "borrowed_funds", label: "차입·담보차입 자금으로 취득 (①3호)" },
          ]}
        />
      </div>

      {/* ② 재산가치증가사유 (시행령 §32의3①) */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-rose-700">재산가치증가사유 (시행령 §32의3①)</p>
        <RadioCardGroup
          name="deemed-vi-reason"
          tone="amber"
          layout="stack"
          value={form.viReason}
          onChange={(v) => set({ viReason: v })}
          options={[
            { value: "form_change", label: "개발사업·형질변경·공유물분할·인가허가 (①1호)" },
            { value: "kotc_registration", label: "한국금융투자협회 등록 K-OTC (①2호)" },
            { value: "konex_listing", label: "코넥스시장 상장 (①3호)" },
            { value: "similar", label: "그 밖의 유사 사유 (①4호)" },
          ]}
        />
        {form.viReason === "similar" && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700" data-testid="deemed-vi-exchange-hint">
            ⚠ 유가증권·코스닥시장 상장 이익은 §42의3에서 제외되어 §41의3 상장이익으로 과세됩니다.
          </p>
        )}
      </div>

      {/* ③ 금액 */}
      <CurrencyInput label="사유발생일 현재 재산가액" value={form.viCurrentValue} onChange={(v) => set({ viCurrentValue: v })} placeholder="사유발생일 현재 재산가액 (원)" />
      <CurrencyInput label="취득가액" value={form.viAcqCost} onChange={(v) => set({ viAcqCost: v })} hint="증여받은 재산은 증여세 과세가액" placeholder="취득가액 (원)" />
      <CurrencyInput label="통상적인 가치상승분" value={form.viNormalIncrease} onChange={(v) => set({ viNormalIncrease: v })} placeholder="통상적인 가치상승분 (원)" />
      <CurrencyInput label="가치상승기여분" value={form.viContribution} onChange={(v) => set({ viContribution: v })} hint="자본적지출액 등" placeholder="가치상승기여분 (원)" />

      {/* ④ 기간 (5년 요건 echo) */}
      <FieldCard label="취득일" hint="취득일부터 5년 이내 가치증가사유 발생 여부 표시">
        <DateInput value={form.viAcqDate} onChange={(v) => set({ viAcqDate: v })} />
      </FieldCard>
      <FieldCard label="사유발생일">
        <DateInput value={form.viEventDate} onChange={(v) => set({ viEventDate: v })} />
      </FieldCard>
    </div>
  );
}

/** §45의5 특정법인과의 거래 */
export function SpecificCorpFields({ form, set }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <CurrencyInput label="거래이익" value={form.scTransactionBenefit} onChange={(v) => set({ scTransactionBenefit: v })} hint="증여재산가액·채무면제이익·시가−대가 차액" placeholder="거래이익 (원)" />
      <CurrencyInput label="법인세 상당액" value={form.scCorporateTax} onChange={(v) => set({ scCorporateTax: v })} hint="(산출세액 − 공제·감면) × min(거래이익/소득금액, 1)" placeholder="법인세 상당액 (원)" />
      <FieldCard label="지배주주등 주식보유비율" hint="증여의제이익 1억원 이상이면 과세" unit="%">
        <DecimalInput value={form.scRatioPct} onChange={(v) => set({ scRatioPct: v })} placeholder="지배주주등 지분율" />
      </FieldCard>
    </div>
  );
}
