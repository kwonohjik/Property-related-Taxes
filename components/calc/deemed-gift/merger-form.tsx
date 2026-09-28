"use client";

/** 증여로 보는 경우 — 합병 §38 입력 폼. capital-forms.tsx에서 분리(800줄 정책 · 7-13). */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { DeemedFormState } from "./shared";
import { SameClausePriorTable } from "./SameClausePriorTable";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** 합병 주주 구성 행 편집 (과대평가·과소평가 법인 공용). id=name 매칭. */
type ShRow = { name: string; shares: string; isForProfitCorp?: boolean; priorSameClauseGain?: string };
function ShareholderRows({
  label,
  hint,
  tone,
  rows,
  onChange,
  testIdPrefix,
  forProfitToggle = false,
}: {
  label: string;
  hint: string;
  tone: "emerald" | "rose";
  rows: ShRow[];
  onChange: (rows: ShRow[]) => void;
  testIdPrefix: string;
  /** 수증자(과대평가) 행에만 — 증여자 행에 두면 켜도 엔진이 읽지 않는 거짓 입력 경로가 된다 */
  forProfitToggle?: boolean;
}) {
  const border = tone === "emerald" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40";
  const text = tone === "emerald" ? "text-emerald-700" : "text-rose-700";
  const update = (i: number, patch: Partial<ShRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className={`space-y-2 rounded-lg border ${border} p-2`}>
      <p className={`text-xs font-semibold ${text}`}>{label}</p>
      <p className="text-caption text-muted-foreground">{hint}</p>
      {rows.map((r, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-2">
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
          {/* 「상증법」§2 9호·§4의2①·③ — 영리법인 수증자는 납세의무자가 아니다. 이 행의 과세분만 빠진다 */}
          {/* §43²·영 §32의4 3호 — 수증자별 3억 판정이라 행마다 1년 이내 합병 이익 합계를 받는다 */}
          {forProfitToggle && (
            <CurrencyInput
              label="1년 이내 합병으로 얻은 이익 합계 (§43² · 선택)"
              value={r.priorSameClauseGain ?? ""}
              onChange={(v) => update(i, { priorSameClauseGain: v })}
              data-testid={`${testIdPrefix}-prior-${i}`}
              hint="이 주주가 수증자로서 증여일 전 1년 이내 합병으로 얻은 이익 — 3억 금액기준 판정에만 더하고, 과세는 이번 이익입니다"
            />
          )}
          {forProfitToggle && (
            <ToggleCard
              variant="chip"
              tone="violet"
              checked={r.isForProfitCorp === true}
              onCheckedChange={(v) => update(i, { isForProfitCorp: v })}
              title="영리법인 수증자 (§4의2①·③ — 증여세 납세의무자 아님)"
              data-testid={`${testIdPrefix}-corp-${i}`}
            />
          )}
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
                <CurrencyInput label="분할사업부문 순자산가액" value={form.mrgSplitBusinessNetAsset} onChange={(v) => set({ mrgSplitBusinessNetAsset: v })} data-testid="mrg-split-bna" />
                <CurrencyInput label="분할법인 순자산가액" value={form.mrgSplitCompanyNetAsset} onChange={(v) => set({ mrgSplitCompanyNetAsset: v })} data-testid="mrg-split-cna" />
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
              <ToggleCard tone="emerald" checked={form.mrgIsListed} onCheckedChange={(v) => set({ mrgIsListed: v })} title="상장법인" description="합병등기일 후 2개월 종가평균과 단순평균액 중 작은 금액 적용">
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
                description={
                  <>
                    OFF: 직접입력 / ON:{" "}
                    <Frac
                      top="과대평가 1주평가×주식수 + 과소평가 1주평가×주식수"
                      bottom="합병 후 주식수"
                    />
                  </>
                }
              >
                <CurrencyInput label="과소평가(반대)법인 1주당 평가가액" value={form.mrgUnderSharePrice} onChange={(v) => set({ mrgUnderSharePrice: v })} placeholder="1주당 평가가액 (원)" />
                <CurrencyInput label="과소평가법인 합병 전 주식수" value={form.mrgUnderPreShares} onChange={(v) => set({ mrgUnderPreShares: v })} placeholder="합병 전 주식수" />
                <CurrencyInput label="합병 후 존속법인 주식수 (합병비율 반영)" value={form.mrgPostMergerTotalShares} onChange={(v) => set({ mrgPostMergerTotalShares: v })} placeholder="합병 후 주식수" />
                <ToggleCard tone="emerald" checked={form.mrgIsListed} onCheckedChange={(v) => set({ mrgIsListed: v })} title="상장법인" description="합병등기일 후 2개월 종가평균과 단순평균액 중 작은 금액 적용">
                  <CurrencyInput label="합병등기일 후 2개월 종가평균" value={form.mrgListedPostAvgPrice} onChange={(v) => set({ mrgListedPostAvgPrice: v })} placeholder="종가평균 (원)" />
                </ToggleCard>
              </ToggleCard>
              {!isAuto && (
                <CurrencyInput label="합병 후 1주당 평가가액" value={form.mrgMergedPrice} onChange={(v) => set({ mrgMergedPrice: v })} />
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
              <ShareholderRows label="과대평가(이익측)법인 주주" hint="이익을 얻는 측 — 수증자. 양 법인에 같은 주주명이면 동일인(자기증여 차감)." tone="emerald" rows={form.mrgOverShareholders} onChange={(rows) => set({ mrgOverShareholders: rows })} testIdPrefix="mrg-over" forProfitToggle />
              <ShareholderRows label="과소평가(증여자측)법인 주주" hint="손해를 보는 측 — 증여자. 안분의 증여자 풀." tone="rose" rows={form.mrgUnderShareholders} onChange={(rows) => set({ mrgUnderShareholders: rows })} testIdPrefix="mrg-under" />
            </>
          ) : (
            <CurrencyInput label="대주주등 주식수" value={form.mrgMajorShares} onChange={(v) => set({ mrgMajorShares: v })} placeholder="대주주등 주식수" />
          )}
        </>
      ) : (
        <>
          <CurrencyInput label="액면가액" value={form.mrgFaceValue} onChange={(v) => set({ mrgFaceValue: v })} />
          <CurrencyInput label="합병대가 (액면 미달 시 적용)" value={form.mrgConsideration} onChange={(v) => set({ mrgConsideration: v })} />
          <CurrencyInput label="합병당사법인 1주당 평가가액" value={form.mrgOvervaluedPrice} onChange={(v) => set({ mrgOvervaluedPrice: v })} placeholder="1주당 평가가액 (원)" />
          <CurrencyInput label="대주주등 주식수" value={form.mrgMajorShares} onChange={(v) => set({ mrgMajorShares: v })} placeholder="대주주등 주식수" />
        </>
      )}
      {/* §43²·영 §32의4 3호 — 「합병에 따른 이익」 전체가 한 단위(호 구분 없음). 매트릭스는 수증자 행 칸 */}
      <SameClausePriorTable
        form={form}
        set={set}
        rowsKey="mrgPriorSameClauseRows"
        benefitHint="1년 이내 합병으로 얻은 이익(주식교부·주식 외 재산 교부 모두) — 3억 금액기준 판정에만 합산하고 과세는 이번 합병분입니다"
      />
    </ToneCard>
  );
}
