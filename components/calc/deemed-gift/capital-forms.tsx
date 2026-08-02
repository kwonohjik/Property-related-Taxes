"use client";

/** 증여로 보는 경우 Phase 2 — 자본거래 입력 폼 (합병·증자·감자·현물출자·전환사채) + sub-case 토글. */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { type DeemedFormState, type CapTableRow, makeCapTableRow } from "./shared";
import { CapitalDecreaseShareholderTable } from "./CapitalDecreaseShareholderTable";
// §39의3 현물출자 폼은 contribution-form.tsx로 분리(800줄 정책). re-export로 import 경로 보존.
export { ContributionFields } from "./contribution-form";
// §39①3호 전환주식 폼도 분리(800줄 정책). re-export로 import 경로 보존.
export { ConvertibleStockFields } from "./convertible-stock-form";
import { CI_SHARES_LABEL, ListedAvgAutoFetch } from "./capital-forms-shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** 합병 주주 구성 행 편집 (과대평가·과소평가 법인 공용). id=name 매칭. */
type ShRow = { name: string; shares: string };
function ShareholderRows({
  label,
  hint,
  tone,
  rows,
  onChange,
  testIdPrefix,
}: {
  label: string;
  hint: string;
  tone: "emerald" | "rose";
  rows: ShRow[];
  onChange: (rows: ShRow[]) => void;
  testIdPrefix: string;
}) {
  const border = tone === "emerald" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40";
  const text = tone === "emerald" ? "text-emerald-700" : "text-rose-700";
  const update = (i: number, patch: Partial<ShRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className={`space-y-2 rounded-lg border ${border} p-2`}>
      <p className={`text-xs font-semibold ${text}`}>{label}</p>
      <p className="text-caption text-muted-foreground">{hint}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
            placeholder="주주명"
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            data-testid={`${testIdPrefix}-name-${i}`}
          />
          <div className="flex-1">
            <CurrencyInput label="주식수" hideLabel value={r.shares} onChange={(v) => update(i, { shares: v })} placeholder="합병 전 주식수" data-testid={`${testIdPrefix}-shares-${i}`} />
          </div>
          <button
            type="button"
            className="text-xs text-rose-600 hover:underline"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`text-xs font-medium ${text} hover:underline`}
        onClick={() => onChange([...rows, { name: "", shares: "" }])}
        data-testid={`${testIdPrefix}-add`}
      >
        + 주주 추가
      </button>
    </div>
  );
}

/** (7) 합병 §38 — 주식교부(§28③1) / 주식 외 재산교부(§28③2) */
export function MergerFields({ form, set }: Props) {
  const isStock = form.mrgCaseType !== "non_stock";
  const useSh = form.mrgUseShareholders;
  const isAuto = useSh || form.mrgMergedPriceMode === "auto";
  const splitNet = form.mrgIsSplitMerger && form.mrgSplitMode === "net_asset_ratio"; // 과대평가 1주평가 안분 대체
  return (
    <ToneCard tone="emerald" bodyClassName="space-y-3" noDark>
      <RadioCardGroup
        lawLinks="상증법"
        name="mrg-case"
        tone="emerald"
        layout="inline"
        value={form.mrgCaseType}
        onChange={(v) => set({ mrgCaseType: v })}
        options={[
          { value: "stock", label: "주식 교부 (§28③1)", testId: "mrg-case-stock" },
          { value: "non_stock", label: "주식 외 재산 교부 (§28③2)", testId: "mrg-case-non_stock" },
        ]}
      />
      {/* G0 과세요건 전제 (§28① — 차단 아님, 안내) */}
      <ToggleCard
        lawLinks="상증법"
        tone="rose"
        checked={form.mrgIsRelatedCompany}
        onCheckedChange={(v) => set({ mrgIsRelatedCompany: v })}
        title="특수관계 법인 간 합병 (§28①)"
        description="특수관계 법인 간 합병만 §38 과세대상. 자본시장법 §165의4에 따른 주권상장법인 합병은 제외."
      />
      {isStock ? (
        <>
          {/* Phase B 주주 매트릭스 모드 토글 */}
          <ToggleCard
            tone="sky"
            checked={useSh}
            onCheckedChange={(v) => set({ mrgUseShareholders: v })}
            title="다수 대주주·동일인 자기증여 입력 (주주 매트릭스)"
            description="OFF: 단일 대주주 / ON: 양 법인 주주 구성 입력 → 수증자별·증여자별 안분, 동일인 자기증여 차감(재산세과-799)"
          />
          {/* Phase C 분할합병 §28⑦ — 과대평가 1주평가 산정 직전 */}
          <ToggleCard
            lawLinks="상증법"
            tone="amber"
            checked={form.mrgIsSplitMerger}
            onCheckedChange={(v) => set({ mrgIsSplitMerger: v })}
            title="분할합병 (§28⑦)"
            description="분할사업부문이 과대평가(이익측) 법인인 경우 — 분할사업부문 합병직전 주식가액 산정"
          >
            <RadioCardGroup
              lawLinks="상증법"
              name="mrg-split-mode"
              tone="amber"
              layout="inline"
              value={form.mrgSplitMode}
              onChange={(v) => set({ mrgSplitMode: v })}
              options={[
                { value: "supplementary", label: "보충평가 (2016.2.5~)", testId: "mrg-split-supp" },
                { value: "net_asset_ratio", label: "순자산비율 안분 (2016.2.4 이전)", testId: "mrg-split-ratio" },
              ]}
            />
            {splitNet && (
              <>
                <CurrencyInput label="분할법인 분할직전 1주당 평가가액" value={form.mrgSplitPrePrice} onChange={(v) => set({ mrgSplitPrePrice: v })} placeholder="1주당 평가가액 (원)" data-testid="mrg-split-pre" />
                <CurrencyInput label="분할사업부문 순자산가액" value={form.mrgSplitBusinessNetAsset} onChange={(v) => set({ mrgSplitBusinessNetAsset: v })} placeholder="순자산가액 (원)" data-testid="mrg-split-bna" />
                <CurrencyInput label="분할법인 순자산가액" value={form.mrgSplitCompanyNetAsset} onChange={(v) => set({ mrgSplitCompanyNetAsset: v })} placeholder="순자산가액 (원)" data-testid="mrg-split-cna" />
              </>
            )}
          </ToggleCard>
          {/* 공통: 과대평가(이익측)법인 1주평가 — 분할합병 순자산비율이면 안분 계산으로 대체(숨김) */}
          {!splitNet && (
            <>
              <CurrencyInput label={form.mrgIsSplitMerger ? "과대평가(이익측)법인 1주당 평가가액 (보충평가액)" : "과대평가(이익측)법인 1주당 평가가액"} value={form.mrgOvervaluedPrice} onChange={(v) => set({ mrgOvervaluedPrice: v })} placeholder="1주당 평가가액 (원)" data-testid="mrg-over-price" />
              <p className="text-caption text-emerald-700">합병비율 산정상 상대적으로 과대평가된(이익을 얻는) 측 법인. 1주 평가액 크기와 무관.</p>
            </>
          )}
          {!useSh && (
            <>
              <CurrencyInput label="과대평가법인 합병 전 주식수" value={form.mrgPreShares} onChange={(v) => set({ mrgPreShares: v })} placeholder="합병 전 주식수" />
              <CurrencyInput label="교부받은 주식수 (과대평가법인 주주)" value={form.mrgExchangedShares} onChange={(v) => set({ mrgExchangedShares: v })} placeholder="교부받은 주식수" />
            </>
          )}
          {/* 합병 후 1주평가 §28⑤ */}
          {useSh ? (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
              <p className="text-xs font-semibold text-emerald-700">합병 후 1주당 평가가액 — 단순평균액 (§28⑤)</p>
              <CurrencyInput label="과소평가(반대)법인 1주당 평가가액" value={form.mrgUnderSharePrice} onChange={(v) => set({ mrgUnderSharePrice: v })} placeholder="1주당 평가가액 (원)" data-testid="mrg-under-price" />
              <CurrencyInput label="합병 후 존속법인 주식수 (합병비율 반영)" value={form.mrgPostMergerTotalShares} onChange={(v) => set({ mrgPostMergerTotalShares: v })} placeholder="합병 후 주식수" data-testid="mrg-post-total" />
              <ToggleCard tone="emerald" checked={form.mrgIsListed} onCheckedChange={(v) => set({ mrgIsListed: v })} title="상장법인" description="Min(합병등기일 후 2개월 종가평균, 단순평균액) 적용">
                <CurrencyInput label="합병등기일 후 2개월 종가평균" value={form.mrgListedPostAvgPrice} onChange={(v) => set({ mrgListedPostAvgPrice: v })} placeholder="종가평균 (원)" />
              </ToggleCard>
            </div>
          ) : (
            <>
              <ToggleCard
                lawLinks="상증법"
                tone="emerald"
                checked={isAuto}
                onCheckedChange={(v) => set({ mrgMergedPriceMode: v ? "auto" : "direct" })}
                title="합병 후 1주당 평가가액 — 단순평균액 자동계산 (§28⑤)"
                description="OFF: 직접입력 / ON: (과대평가 1주평가×주식수 + 과소평가 1주평가×주식수) ÷ 합병 후 주식수"
              >
                <CurrencyInput label="과소평가(반대)법인 1주당 평가가액" value={form.mrgUnderSharePrice} onChange={(v) => set({ mrgUnderSharePrice: v })} placeholder="1주당 평가가액 (원)" />
                <CurrencyInput label="과소평가법인 합병 전 주식수" value={form.mrgUnderPreShares} onChange={(v) => set({ mrgUnderPreShares: v })} placeholder="합병 전 주식수" />
                <CurrencyInput label="합병 후 존속법인 주식수 (합병비율 반영)" value={form.mrgPostMergerTotalShares} onChange={(v) => set({ mrgPostMergerTotalShares: v })} placeholder="합병 후 주식수" />
                <ToggleCard tone="emerald" checked={form.mrgIsListed} onCheckedChange={(v) => set({ mrgIsListed: v })} title="상장법인" description="Min(합병등기일 후 2개월 종가평균, 단순평균액) 적용">
                  <CurrencyInput label="합병등기일 후 2개월 종가평균" value={form.mrgListedPostAvgPrice} onChange={(v) => set({ mrgListedPostAvgPrice: v })} placeholder="종가평균 (원)" />
                </ToggleCard>
              </ToggleCard>
              {!isAuto && (
                <CurrencyInput label="합병 후 1주당 평가가액" value={form.mrgMergedPrice} onChange={(v) => set({ mrgMergedPrice: v })} placeholder="합병 후 1주당 평가가액 (원)" />
              )}
            </>
          )}
          {useSh ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-700">교부 환산비 (과대평가법인 합병전→합병후)</span>
                <div className="w-16"><CurrencyInput label="분자" hideLabel value={form.mrgExchangeNumer} onChange={(v) => set({ mrgExchangeNumer: v })} data-testid="mrg-ex-numer" /></div>
                <span className="text-xs">주당</span>
                <div className="w-16"><CurrencyInput label="분모" hideLabel value={form.mrgExchangeDenom} onChange={(v) => set({ mrgExchangeDenom: v })} data-testid="mrg-ex-denom" /></div>
                <span className="text-xs">주</span>
              </div>
              <ShareholderRows label="과대평가(이익측)법인 주주" hint="이익을 얻는 측 — 수증자. 양 법인에 같은 주주명이면 동일인(자기증여 차감)." tone="emerald" rows={form.mrgOverShareholders} onChange={(rows) => set({ mrgOverShareholders: rows })} testIdPrefix="mrg-over" />
              <ShareholderRows label="과소평가(증여자측)법인 주주" hint="손해를 보는 측 — 증여자. 안분의 증여자 풀." tone="rose" rows={form.mrgUnderShareholders} onChange={(rows) => set({ mrgUnderShareholders: rows })} testIdPrefix="mrg-under" />
            </>
          ) : (
            <CurrencyInput label="대주주등 주식수" value={form.mrgMajorShares} onChange={(v) => set({ mrgMajorShares: v })} placeholder="대주주등 주식수" />
          )}
        </>
      ) : (
        <>
          <CurrencyInput label="액면가액" value={form.mrgFaceValue} onChange={(v) => set({ mrgFaceValue: v })} placeholder="액면가액 (원)" />
          <CurrencyInput label="합병대가 (액면 미달 시 적용)" value={form.mrgConsideration} onChange={(v) => set({ mrgConsideration: v })} placeholder="합병대가 (원)" />
          <CurrencyInput label="합병당사법인 1주당 평가가액" value={form.mrgOvervaluedPrice} onChange={(v) => set({ mrgOvervaluedPrice: v })} placeholder="1주당 평가가액 (원)" />
          <CurrencyInput label="대주주등 주식수" value={form.mrgMajorShares} onChange={(v) => set({ mrgMajorShares: v })} placeholder="대주주등 주식수" />
        </>
      )}
    </ToneCard>
  );
}

/** (8) 증자 §39 — 저가발행(①1호) / 고가발행(①2호) + 가/나/다/라목 */
export function CapitalIncreaseFields({ form, set }: Props) {
  const isHigh = form.ciDirection === "high";
  const needsRatio = isHigh && form.ciSubType !== "forfeited_realloc"; // 고가 나·다·라목 비율가중
  const sharesLabel = CI_SHARES_LABEL[form.ciSubType];
  return (
    <ToneCard tone="sky" bodyClassName="space-y-3" noDark>
      <RadioCardGroup
        lawLinks="상증법"
        name="ci-direction"
        tone="sky"
        layout="inline"
        value={form.ciDirection}
        onChange={(v) => set({ ciDirection: v })}
        options={[
          { value: "low", label: "저가발행 (①1호)", testId: "ci-direction-low" },
          { value: "high", label: "고가발행 (①2호)", testId: "ci-direction-high" },
        ]}
      />
      <RadioCardGroup
        lawLinks="상증법"
        name="ci-subtype"
        tone="sky"
        value={form.ciSubType}
        onChange={(v) => set({ ciSubType: v })}
        options={[
          { value: "forfeited_realloc", label: "실권주 재배정 (가목)", testId: "ci-subtype-forfeited_realloc" },
          { value: "third_party", label: "제3자 직접배정 (다목)", testId: "ci-subtype-third_party" },
          { value: "excess", label: "초과배정 (라목)", testId: "ci-subtype-excess" },
          { value: "no_realloc", label: "실권주 미배정 (나목)", testId: "ci-subtype-no_realloc" },
        ]}
      />
      <CurrencyInput label="증자 전 1주당 평가가액" value={form.ciPrePrice} onChange={(v) => set({ ciPrePrice: v })} placeholder="증자 전 1주당 평가가액 (원)" />
      <CurrencyInput label="증자 전 발행주식총수" value={form.ciPreShares} onChange={(v) => set({ ciPreShares: v })} placeholder="증자 전 발행주식총수" />
      <CurrencyInput label="신주 1주당 인수가액" value={form.ciNewPrice} onChange={(v) => set({ ciNewPrice: v })} placeholder="신주 1주당 인수가액 (원)" />
      <CurrencyInput label="증자 주식수" value={form.ciIssuedShares} onChange={(v) => set({ ciIssuedShares: v })} placeholder="증자 주식수" />
      <CurrencyInput label={sharesLabel} value={form.ciForfeitedShares} onChange={(v) => set({ ciForfeitedShares: v })} placeholder={sharesLabel} />
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        checked={form.ciIsListed}
        onCheckedChange={(v) => set({ ciIsListed: v })}
        title="주권상장법인등 (증자 후 1주당 가액 단서 §29②1가·3나)"
        description={
          isHigh
            ? "고가: Max(종가평균, 산식 이론값)"
            : "저가: Min(종가평균, 산식 이론값)"
        }
      >
        <ListedAvgAutoFetch
          stockCode={form.ciStockCode}
          onStockCode={(v) => set({ ciStockCode: v })}
          valuationDate={form.giftDate}
          dateLabel="증여일 (상증령 §29① — 상장 주주배정은 권리락일)"
          onFill={(v) => set({ ciListedMarketAvg: v })}
          testId="ci-stock-code"
        />
        <CurrencyInput
          label="증자 후 1주당 평가가액"
          value={form.ciListedMarketAvg}
          onChange={(v) => set({ ciListedMarketAvg: v })}
          placeholder="평가기준일 전후 각 2개월 종가평균 (원)"
        />
        <p className="text-xs text-muted-foreground">
          평가기준일은 상증령 §29① — 상장·코스닥 법인이 주주에게 배정하면 권리락일, 전환주식은 전환한 날,
          그 밖에는 주식대금 납입일입니다. 종가평균은 상증법 §63①1가에 따릅니다.
        </p>
      </ToggleCard>
      {needsRatio && (
        <>
          <CurrencyInput label="특수관계인이 인수한 신주수" value={form.ciRelatedAcquiredShares} onChange={(v) => set({ ciRelatedAcquiredShares: v })} placeholder="특수관계인이 인수한 신주수" />
          <CurrencyInput label="분모 신주수" value={form.ciRatioDenomShares} onChange={(v) => set({ ciRatioDenomShares: v })} hint="나목=균등증자 증자주식총수 / 다·라목=주주 아닌 자 배정+초과인수 총수" placeholder="분모 신주수" />
        </>
      )}
      {!isHigh && (
        <ToggleCard
          lawLinks="상증법"
          tone="violet"
          checked={form.ciSmallImputation}
          onCheckedChange={(v) => set({ ciSmallImputation: v })}
          title="소액주주 1인 의제 (§39②)"
          description="이익을 증여한 소액주주(1%·액면3억 미만)가 2명 이상이면 1명으로 보고 계산"
        />
      )}
    </ToneCard>
  );
}

/** (8b) 증자 §39 cap-table — 다수증자·다증여자 (주주 다중행 + 손해비례 배분 + 검증내역) */
export function CapitalIncreaseAllocationFields({ form, set }: Props) {
  const rows = form.ciAllocRows;
  const updateRow = (id: string, patch: Partial<CapTableRow>) =>
    set({ ciAllocRows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const addRow = () => {
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.id.replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    set({ ciAllocRows: [...rows, makeCapTableRow(`sh-${max + 1}`)] });
  };
  const removeRow = (id: string) =>
    set({
      ciAllocRows: rows
        .filter((r) => r.id !== id)
        .map((r) => ({ ...r, relatedTo: r.relatedTo.filter((rid) => rid !== id) })),
    });
  const toggleRelated = (row: CapTableRow, otherId: string) =>
    updateRow(row.id, {
      relatedTo: row.relatedTo.includes(otherId)
        ? row.relatedTo.filter((x) => x !== otherId)
        : [...row.relatedTo, otherId],
    });

  return (
    <div className="space-y-3">
      <ToneCard tone="sky" sectionNum={1} title="증자 개요" bodyClassName="space-y-2" noDark>
        <RadioCardGroup
          lawLinks="상증법"
          name="ci-alloc-direction"
          tone="sky"
          layout="inline"
          value={form.ciAllocDirection}
          onChange={(v) => set({ ciAllocDirection: v })}
          options={[
            { value: "low", label: "저가발행 (①1호)", testId: "ci-alloc-direction-low" },
            { value: "high", label: "고가발행 (①2호)", testId: "ci-alloc-direction-high" },
          ]}
        />
        <CurrencyInput label="증자 전 1주당 평가가액" value={form.ciAllocPrePrice} onChange={(v) => set({ ciAllocPrePrice: v })} placeholder="증자 전 1주당 평가가액 (원)" />
        <CurrencyInput label="신주 1주당 인수가액" value={form.ciAllocNewPrice} onChange={(v) => set({ ciAllocNewPrice: v })} placeholder="신주 1주당 인수가액 (원)" />
      </ToneCard>

      <ToneCard
        tone="emerald"
        sectionNum={2}
        title="주주 목록 (증자 전 보유·배정·인수)"
        bodyClassName="space-y-2"
        noDark
        titleExtra={
          <button type="button" onClick={addRow} data-testid="ci-alloc-add-row" className="ml-auto rounded-md border border-emerald-300 bg-white/70 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100/60">
            + 주주 추가
          </button>
        }
      >
        {rows.map((r, idx) => (
          <div key={r.id} className="space-y-2 rounded-md border border-emerald-100 bg-white/60 p-2.5" data-testid={`ci-alloc-row-${idx}`}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={r.name}
                onChange={(e) => updateRow(r.id, { name: e.target.value })}
                placeholder="주주 이름"
                data-testid={`ci-alloc-name-${idx}`}
                className="flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-sm"
              />
              {rows.length > 2 && (
                <button type="button" onClick={() => removeRow(r.id)} data-testid={`ci-alloc-remove-${idx}`} className="shrink-0 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">
                  삭제
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CurrencyInput hideUnit label="증자 전 보유" value={r.preShares} onChange={(v) => updateRow(r.id, { preShares: v })} placeholder="증자 전 보유 주식수" />
              <CurrencyInput hideUnit label="당초 배정" value={r.entitledShares} onChange={(v) => updateRow(r.id, { entitledShares: v })} placeholder="균등 배정 신주수" />
              <CurrencyInput hideUnit label="실제 인수" value={r.subscribedShares} onChange={(v) => updateRow(r.id, { subscribedShares: v })} placeholder="실제 인수 신주수" />
              <CurrencyInput hideUnit label="재배정·제3자·초과" value={r.reallocatedShares} onChange={(v) => updateRow(r.id, { reallocatedShares: v })} placeholder="재배정/제3자/초과 신주수" />
            </div>
            <div className="space-y-1">
              <p className="text-caption text-emerald-700">특수관계인 (이 주주에게 증여한 자)</p>
              <div className="flex flex-wrap gap-1.5" data-testid={`ci-alloc-related-${idx}`}>
                {rows.filter((o) => o.id !== r.id).map((o) => {
                  const on = r.relatedTo.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleRelated(r, o.id)}
                      data-testid={`ci-alloc-related-${idx}-${o.id}`}
                      className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-violet-400 bg-violet-100 text-violet-800" : "border-gray-200 bg-white text-gray-500"}`}
                    >
                      {o.name.trim() || "(이름 없음)"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        <p className="text-caption text-muted-foreground">증자 후 1주당 평가가액·증여재산가액은 입력값으로 자동 계산(자동 안분 없음). 특수관계인 없는 자에게 귀속된 이익은 과세 제외.</p>
      </ToneCard>
    </div>
  );
}

/** (9) 감자 §39의2 — 단일(저가/고가 단건) / 다주주(불균등 N:N 안분) */
export function CapitalDecreaseFields({ form, set }: Props) {
  const isHigh = form.cdCaseType === "high";
  const isMulti = form.cdMode === "multi";
  return (
    <ToneCard tone="amber" bodyClassName="space-y-3" noDark>
      <RadioCardGroup
        lawLinks="상증법"
        name="cd-mode"
        tone="amber"
        layout="inline"
        value={form.cdMode}
        onChange={(v) => set({ cdMode: v })}
        options={[
          { value: "single", label: "단일 (저가/고가 단건)", testId: "cd-mode-single" },
          { value: "multi", label: "다주주 (N:N 안분)", testId: "cd-mode-multi" },
        ]}
      />
      {isMulti ? (
        <>
          <CurrencyInput label="감자주식 1주당 평가액" value={form.cdSharePrice} onChange={(v) => set({ cdSharePrice: v })} placeholder="할증 미적용(§53⑧3호)·§60 평가액" />
          <CurrencyInput label="액면가액" value={form.cdFaceValue} onChange={(v) => set({ cdFaceValue: v })} placeholder="고가게이트 §29의2①2호 + 대주주 액면 3억 §28②" />
          <CurrencyInput label="감자 전 발행주식총수" value={form.cdPreTotalShares} onChange={(v) => set({ cdPreTotalShares: v })} placeholder="감자 전 발행주식총수" />
          <CapitalDecreaseShareholderTable shareholders={form.cdShareholders} onChange={(rows) => set({ cdShareholders: rows })} />
        </>
      ) : (
        <>
          <RadioCardGroup
            lawLinks="상증법"
            name="cd-case"
            tone="amber"
            layout="inline"
            value={form.cdCaseType}
            onChange={(v) => set({ cdCaseType: v })}
            options={[
              { value: "low", label: "저가 소각 (①1호)", testId: "cd-case-low" },
              { value: "high", label: "고가 소각 (①2호)", testId: "cd-case-high" },
            ]}
          />
          <CurrencyInput label="감자주식 1주당 평가액" value={form.cdSharePrice} onChange={(v) => set({ cdSharePrice: v })} placeholder="감자주식 1주당 평가액 (원)" />
          <CurrencyInput label="소각 시 지급한 1주당 금액" value={form.cdRedemptionPrice} onChange={(v) => set({ cdRedemptionPrice: v })} placeholder="소각 지급 1주당 금액 (원)" />
          {isHigh ? (
            <>
              <CurrencyInput label="액면가액" value={form.cdFaceValue} onChange={(v) => set({ cdFaceValue: v })} placeholder="고가게이트 §29의2①2호 (평가액 < 액면가 한정)" />
              <CurrencyInput label="해당 주주등 감자 주식수" value={form.cdOwnRedeemedShares} onChange={(v) => set({ cdOwnRedeemedShares: v })} placeholder="해당 주주등 감자 주식수" />
            </>
          ) : (
            <>
              <CurrencyInput label="총감자 주식수" value={form.cdTotalShares} onChange={(v) => set({ cdTotalShares: v })} placeholder="총감자 주식수" />
              <FieldCard label="대주주등 감자후 지분비율" hint="감자 후 대주주등의 지분율" unit="%">
                <DecimalInput value={form.cdMajorRatioPct} onChange={(v) => set({ cdMajorRatioPct: v })} />
              </FieldCard>
              <CurrencyInput label="대주주등 특수관계인 감자 주식수" value={form.cdRelatedShares} onChange={(v) => set({ cdRelatedShares: v })} placeholder="대주주등 특수관계인 감자 주식수" />
            </>
          )}
        </>
      )}
    </ToneCard>
  );
}

/** (11) 전환사채등 §40 — 인수취득(①1호)·주식전환(①2호 가나다/라)·양도(①3호) */
export function ConvertibleBondFields({ form, set }: Props) {
  const ct = form.cbCaseType;
  const isConversion = ct === "conversion" || ct === "conversion_reverse";
  return (
    <ToneCard tone="rose" bodyClassName="space-y-3" noDark>
      <RadioCardGroup
        lawLinks="상증법"
        name="cb-case"
        tone="rose"
        value={form.cbCaseType}
        onChange={(v) => set({ cbCaseType: v })}
        options={[
          { value: "acquisition", label: "인수·취득 (①1호)", testId: "cb-case-acquisition" },
          { value: "conversion", label: "주식전환 가·나·다목 (①2호)", testId: "cb-case-conversion" },
          { value: "conversion_reverse", label: "주식전환 라목 (①2호)", testId: "cb-case-conversion_reverse" },
          { value: "transfer", label: "양도 (①3호)", testId: "cb-case-transfer" },
        ]}
      />
      {(ct === "acquisition" || ct === "transfer") && (
        <CurrencyInput label="전환사채등 시가" value={form.cbMarketValue} onChange={(v) => set({ cbMarketValue: v })} placeholder="전환사채등 시가 (원)" />
      )}
      {ct === "acquisition" && (
        <CurrencyInput label="인수·취득가액" value={form.cbAcquisitionPrice} onChange={(v) => set({ cbAcquisitionPrice: v })} placeholder="인수·취득가액 (원)" />
      )}
      {ct === "transfer" && (
        <CurrencyInput label="양도가액" value={form.cbTransferPrice} onChange={(v) => set({ cbTransferPrice: v })} placeholder="양도가액 (원)" />
      )}
      {isConversion && (
        <>
          <CurrencyInput label="전환등 전 1주당 평가가액" value={form.cbPreConvPrice} onChange={(v) => set({ cbPreConvPrice: v })} placeholder="전환등 전 1주당 평가가액 (원)" />
          <CurrencyInput label="전환등 전 발행주식총수" value={form.cbPreConvShares} onChange={(v) => set({ cbPreConvShares: v })} placeholder="전환등 전 발행주식총수" />
          <CurrencyInput label="1주당 전환가액등" value={form.cbConversionPrice} onChange={(v) => set({ cbConversionPrice: v })} placeholder="1주당 전환가액등 (원)" />
          <CurrencyInput label="전환등 증가주식수 (㉡ 가중평균 분모)" value={form.cbIncreasedShares} onChange={(v) => set({ cbIncreasedShares: v })} placeholder="전환등 증가주식수" />
          <ToggleCard
            tone="emerald"
            checked={form.cbIsListed}
            onCheckedChange={(v) => set({ cbIsListed: v })}
            title="주권상장법인 (교부주식가액 Min/Max §30⑤1)"
            description={ct === "conversion_reverse" ? "라목: Max(종가평균, 이론주가)" : "가·나·다목: Min(종가평균, 이론주가)"}
          >
            <CurrencyInput label="전환일 전후 2개월 종가평균" value={form.cbListedMarketAvg} onChange={(v) => set({ cbListedMarketAvg: v })} placeholder="전환일 전후 2개월 종가평균 (원)" />
          </ToggleCard>
        </>
      )}
      {ct === "conversion" && (
        <>
          <ToggleCard
            tone="sky"
            checked={form.cbAutoExcess}
            onCheckedChange={(v) => set({ cbAutoExcess: v })}
            title="균등지분 초과분 자동산정 (⑤ §40①2호나)"
            description="ON: 인수·총인수가능·본인지분율로 초과분 자동. OFF: 교부받은 주식수 직접입력"
          >
            <CurrencyInput label="인수(전환) 주식수" value={form.cbSubscribedShares} onChange={(v) => set({ cbSubscribedShares: v })} placeholder="인수(전환) 주식수" />
            <CurrencyInput label="총인수가능 주식수" value={form.cbTotalSubscribable} onChange={(v) => set({ cbTotalSubscribable: v })} placeholder="총인수가능 주식수" />
            <FieldCard label="본인 전환전 지분율" hint="균등배정 산정" unit="%">
              <DecimalInput value={form.cbOwnPreRatioPct} onChange={(v) => set({ cbOwnPreRatioPct: v })} />
            </FieldCard>
          </ToggleCard>
          {!form.cbAutoExcess && (
            <CurrencyInput label="교부받은 주식수 (초과분; 미입력 시 증가주식수)" value={form.cbCreditedShares} onChange={(v) => set({ cbCreditedShares: v })} placeholder="교부받은 주식수" />
          )}
          <ToggleCard
            tone="amber"
            checked={form.cbAutoInterestLoss}
            onCheckedChange={(v) => set({ cbAutoInterestLoss: v })}
            title="이자손실분 자동계산 (PV §10의2)"
            description="ON: 만기상환금액·발행이율·적정할인율 현가계수로 산출. OFF: 이자손실분 직접입력"
          >
            <CurrencyInput label="만기상환금액 (원금)" value={form.cbBondMaturity} onChange={(v) => set({ cbBondMaturity: v })} placeholder="만기상환금액 (원)" />
            <FieldCard label="사채발행이율" hint="표면이율" unit="%">
              <DecimalInput value={form.cbCouponRatePct} onChange={(v) => set({ cbCouponRatePct: v })} />
            </FieldCard>
            <FieldCard label="적정할인율 현가계수" hint="공시 현가계수표 값">
              <DecimalInput value={form.cbPvFactorAppr} onChange={(v) => set({ cbPvFactorAppr: v })} />
            </FieldCard>
            <FieldCard label="적정할인율 연금현가계수" hint="공시 연금현가계수표 값">
              <DecimalInput value={form.cbAnnuityFactorAppr} onChange={(v) => set({ cbAnnuityFactorAppr: v })} />
            </FieldCard>
          </ToggleCard>
          {!form.cbAutoInterestLoss && (
            <CurrencyInput label="이자손실분" value={form.cbInterestLoss} onChange={(v) => set({ cbInterestLoss: v })} />
          )}
          <CurrencyInput label="인수 시 기과세 이익 (§30①1)" value={form.cbAcqGainPrior} onChange={(v) => set({ cbAcqGainPrior: v })} />
          <CurrencyInput label="전환가능기간 전환사채 양도차익 (선택 — 양도 cap §30①2 단서)" value={form.cbTransferGainForCap} onChange={(v) => set({ cbTransferGainForCap: v })} />
        </>
      )}
      {ct === "conversion_reverse" && (
        <FieldCard label="특수관계인 전환 전 보유 지분비율" hint="라목 비율 가중" unit="%">
          <DecimalInput value={form.cbRelatedPreRatioPct} onChange={(v) => set({ cbRelatedPreRatioPct: v })} />
        </FieldCard>
      )}
    </ToneCard>
  );
}
