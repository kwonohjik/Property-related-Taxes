"use client";

/** 증여로 보는 경우 — §45의5 특정법인과의 거래. 기본(지분율 직접)·다주주 roster 2모드 입력 폼.
 *  other-forms.tsx에서 분리(800줄 정책 선제 대응) — §45의3 `related-corp-form.tsx`와 대칭.
 *  other-forms.tsx가 re-export하여 기존 import 경로를 보존한다. */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { SpecificCorpPriorTxTable } from "./SpecificCorpPriorTxTable";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { SpecificCorpIntermediaryTable } from "./SpecificCorpIntermediaryTable";
import { SpecificCorpShareholderTable } from "./SpecificCorpShareholderTable";
import { apportionCorporateTax } from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** §45의5 특정법인과의 거래 */
export function SpecificCorpFields({ form, set }: Props) {
  const isRoster = form.scMode === "roster";
  const isAuto = form.scCorporateTaxMode === "auto";
  const isCapital = form.scTransactionType === "capital_transaction";
  const isPriceType =
    form.scTransactionType === "low_price" || form.scTransactionType === "high_price";

  // 영 §34의5⑦ 현저성 echo — useMemo 표시전용. store 역기록 금지.
  const significanceEcho = useMemo(() => {
    if (!isPriceType) return null;
    const mv = parseAmount(form.scMarketValue);
    const cons = parseAmount(form.scConsideration);
    if (mv <= 0 || cons <= 0) return null;
    const diff = Math.max(0, form.scTransactionType === "low_price" ? mv - cons : cons - mv);
    const rateThreshold = Math.floor(mv * 0.3);
    return { diff, rateThreshold, met: diff > 0 && (diff >= rateThreshold || diff >= 300_000_000) };
  }, [isPriceType, form.scTransactionType, form.scMarketValue, form.scConsideration]);

  // 법인세 안분 echo — useMemo 표시전용. store 역기록 금지 (feedback_useeffect_store_mirror_forbidden).
  // 🔴 SC-6-d: 종전에는 영 §34의5④2호가목 산식(공제·감면 차감 → min(거래이익, 소득금액) → 나눗셈)을
  //    **손으로 다시 적었다**. 현재 두 구현의 차액은 0원이지만(곱 ≤ 2^53 분기까지 브루트포스 실측),
  //    엔진이 바뀌면 이 칸만 옛 산식으로 남고 **아무 게이트도 빨개지지 않는다**(테스트·testid 0건).
  //    ⇒ 엔진 leaf를 그대로 부른다. 순수함수 import는 이 저장소의 확립된 패턴이다.
  const corpTaxEcho = useMemo(() => {
    if (!isAuto) return null;
    const assessed = parseAmount(form.scCorpTaxAssessed);
    const income = parseAmount(form.scCorpIncome);
    if (income <= 0 || assessed <= 0) return null;
    // 2·3호는 거래이익이 시가−대가로 «도출»된다 — 입력칸 값을 쓰면 안분 echo가 어긋난다
    const benefit = significanceEcho
      ? significanceEcho.met
        ? significanceEcho.diff
        : 0
      : parseAmount(form.scTransactionBenefit);
    return apportionCorporateTax({
      transactionBenefit: benefit,
      annualIncome: income,
      corporateTaxComputed: assessed,
      corporateTaxOnLandTransfer: parseAmount(form.scCorpTaxLandTransfer),
      corporateTaxCredit: parseAmount(form.scCorpTaxDeduction),
    } as SpecificCorpInput);
  }, [isAuto, form.scCorpTaxAssessed, form.scCorpTaxLandTransfer, form.scCorpTaxDeduction, form.scCorpIncome, form.scTransactionBenefit, significanceEcho]);

  return (
    <div className="space-y-3">
      {/* ── 섹션 1: 입력 방식 ── */}
      <ToneCard tone="sky" sectionNum="1" title="입력 방식 선택" noDark>
        <RadioCardGroup
          name="sc-mode"
          tone="sky"
          layout="inline"
          value={form.scMode}
          onChange={(v) => {
            const next = v as DeemedFormState["scMode"];
            set({
              scMode: next,
              // roster ON → scShareholders [] 초기화 / OFF → undefined(3-state)
              scShareholders: next === "roster" ? (form.scShareholders ?? []) : undefined,
            });
          }}
          options={[
            { value: "single", label: "지분율 직접 입력", testId: "sc-mode-single" },
            { value: "roster", label: "주주 명단 입력", testId: "sc-mode-roster" },
          ]}
        />
      </ToneCard>

      {/* ── 섹션 2: 거래상대방 + 거래유형 (법 §45의5① · 영 §34의5②④⑥⑦) ── */}
      <ToneCard tone="rose" sectionNum="2" title="거래상대방 · 거래유형 (§45의5①)" noDark>
        <FieldCard
          label="거래상대방"
          hint={
            isCapital
              ? "자본거래는 지배주주의 특수관계인과의 거래로 한정됩니다 (상증령 §34의5②)"
              : "특정법인이 «지배주주 및 그 특수관계인»과 거래한 경우에만 적용됩니다"
          }
        >
          <RadioCardGroup
            name="sc-counterparty"
            tone="rose"
            value={form.scCounterparty}
            onChange={(v) => set({ scCounterparty: v as DeemedFormState["scCounterparty"] })}
            options={[
              // 3의2호는 영 §34의5②이 「지배주주의 특수관계인」으로 한정한다 — 본인을 후보에서 뺀다
              ...(isCapital
                ? []
                : [{ value: "ruling_shareholder", label: "지배주주 본인", testId: "sc-cp-ruling" }]),
              { value: "ruling_related", label: "지배주주의 특수관계인", testId: "sc-cp-related" },
              { value: "other", label: "그 밖의 자", testId: "sc-cp-other" },
            ]}
          />
        </FieldCard>

        <FieldCard label="거래유형 (법 §45의5① 각 호)">
          <RadioCardGroup
            name="sc-transaction-type"
            tone="rose"
            value={form.scTransactionType}
            onChange={(v) => {
              const next = v as DeemedFormState["scTransactionType"];
              set({
                scTransactionType: next,
                // 3의2호에서 「지배주주 본인」은 후보가 아니다 — 선택돼 있었다면 비운다(영 §34의5②)
                ...(next === "capital_transaction" && form.scCounterparty === "ruling_shareholder"
                  ? { scCounterparty: "" as const }
                  : {}),
              });
            }}
            options={[
              { value: "gratuitous", label: "1호 무상 제공받음", testId: "sc-tt-gratuitous" },
              { value: "low_price", label: "2호 현저히 낮은 대가로 양수", testId: "sc-tt-low" },
              { value: "high_price", label: "3호 현저히 높은 대가로 양도", testId: "sc-tt-high" },
              { value: "capital_transaction", label: "3의2호 자본거래", testId: "sc-tt-capital" },
              { value: "debt_relief", label: "4호 채무면제·인수·변제", testId: "sc-tt-debt" },
            ]}
          />
        </FieldCard>

        {isPriceType && (
          <>
            <CurrencyInput
              label="시가"
              value={form.scMarketValue}
              onChange={(v) => set({ scMarketValue: v })}
              hint="「법인세법 시행령」 §89에 따른 시가 (상증령 §34의5⑧)"
              data-testid="sc-market-value"
            />
            <CurrencyInput
              label="대가"
              value={form.scConsideration}
              onChange={(v) => set({ scConsideration: v })}
              hint="실제 주고받은 대가"
              data-testid="sc-consideration"
            />
            {significanceEcho && (
              <div
                className={
                  significanceEcho.met
                    ? "rounded-md border border-emerald-200 bg-emerald-100/60 px-3 py-2 text-xs text-emerald-800"
                    : "rounded-md border border-rose-200 bg-rose-100/60 px-3 py-2 text-xs text-rose-800"
                }
                data-testid="sc-significance-echo"
              >
                차액{" "}
                <span className="font-mono font-bold tabular-nums">
                  {significanceEcho.diff.toLocaleString()}
                </span>
                원 · 시가의 100분의 30 ={" "}
                <span className="font-mono tabular-nums">
                  {significanceEcho.rateThreshold.toLocaleString()}
                </span>
                원 · 3억원 → {significanceEcho.met ? "현저성 충족" : "현저성 미달 (이익 0원)"}
                <span className="ml-1 opacity-70">(실계산은 엔진)</span>
              </div>
            )}
          </>
        )}

        {!isPriceType && (
          <CurrencyInput
            label="거래이익"
            value={form.scTransactionBenefit}
            onChange={(v) => set({ scTransactionBenefit: v })}
            hint={
              isCapital
                ? "자본거래 이익은 이 화면이 계산하지 않습니다 — 아래 안내 참조"
                : "증여재산가액·채무면제이익 (상증령 §34의5④1호가목)"
            }
            data-testid="sc-transaction-benefit"
          />
        )}

        {form.scTransactionType === "debt_relief" && (
          <ToggleCard
            variant="chip"
            tone="rose"
            title="해산 중이고 주주등에게 분배할 잔여재산이 없음 (상증령 §34의5⑥ 단서 — 제외)"
            checked={form.scIsDissolvingNoResidual}
            onCheckedChange={(v) => set({ scIsDissolvingNoResidual: v })}
            data-testid="sc-dissolving-no-residual"
          />
        )}

        {isCapital && (
          <CollapsibleHintCard
            tone="rose"
            summary="3의2호 자본거래 — 이익은 §38·§39·§39의2·§39의3·§40·§41의2·§42의2 준용 계산액입니다"
          >
            <p>
              상증령 §34의5④1호<b>나목</b>은 자본거래 이익을 「제2항 각 호의 거래 유형에 따라 법
              제38조, 제39조, 제39조의2, 제39조의3, 제40조, 제41조의2, 제42조의2 … 를 <b>준용</b>하여
              계산한 이익」으로 정합니다. <b>「시가 − 대가」가 아닙니다.</b>
            </p>
            <p className="mt-1">
              이 화면은 그 준용계산을 수행하지 않습니다. 같은 마법사의 해당 유형(합병에 따른 이익 ·
              증자 · 감자 · 현물출자 · 전환사채 · 초과배당 · 법인 조직변경)에서 이익을 산출한 뒤 그
              금액을 「거래이익」에 넣으십시오.
            </p>
            <p className="mt-1">
              상대방 범위도 다릅니다 — 영 §34의5②은 「특정법인과 <b>지배주주의 특수관계인</b> 사이에
              이루어지거나 지배주주의 특수관계인 사이에 이루어지는」 자본거래로 한정하므로,
              <b> 지배주주 본인</b>과의 자본거래는 대상이 아닙니다.
            </p>
          </CollapsibleHintCard>
        )}
        {/* §43²·영 §32의4 11호 — 소급 1년 이내 같은 호 거래 합산 */}
        <SpecificCorpPriorTxTable
          rows={form.scPriorTransactions ?? []}
          onChange={(rows) => set({ scPriorTransactions: rows })}
        />
        <CollapsibleHintCard
          tone="amber"
          summary="1년 이내에 같은 호의 거래가 더 있으면 합산해서 1억원 기준을 판정합니다 (§43²)"
        >
          <p>
            법 §43②은 「제31조제1항제2호 … 및 <b>제45조의5</b>에 따른 이익을 계산할 때 그 증여일부터
            소급하여 1년 이내에 동일한 거래 등이 있는 경우에는 각각의 거래 등에 따른 이익을 해당
            이익별로 <b>합산하여 계산</b>한다」고 정합니다.
          </p>
          <p className="mt-1">
            영 §32의4 <b>11호</b>는 그 이익을 「법 제45조의5제1항의 특정법인과의 거래를 통한 이익(같은
            항 <b>각 호의 거래에 따른 이익별로 구분된 이익</b>을 말한다)」으로 특정합니다 — 호가 다른
            거래는 합산 대상이 아닙니다.
          </p>
          <p className="mt-1">
            합산하지 않으면 거래를 나눌수록 각 건이 영 §34의5⑤의 <b>1억원</b>에 미달해 전부 과세에서
            빠집니다. 윈도 기준일은 위 <b>증여일(거래한 날)</b>입니다.
          </p>
        </CollapsibleHintCard>
      </ToneCard>

      {/* ── 섹션 3: 법인세 상당액 ── */}
      <ToneCard tone="amber" sectionNum="3" title="법인세 상당액 (시행령 §34의5④2호)" noDark>
        <RadioCardGroup
          name="sc-corp-tax-mode"
          tone="amber"
          layout="inline"
          value={form.scCorporateTaxMode}
          onChange={(v) => set({ scCorporateTaxMode: v as DeemedFormState["scCorporateTaxMode"] })}
          options={[
            { value: "direct", label: "직접 입력", testId: "sc-corp-tax-direct" },
            { value: "auto", label: "산출세액 + 소득금액 자동안분", testId: "sc-corp-tax-auto" },
          ]}
        />
        {!isAuto && (
          <CurrencyInput
            label="법인세 상당액"
            value={form.scCorporateTax}
            onChange={(v) => set({ scCorporateTax: v })}
            hint="(산출세액 − 토지등 양도소득 법인세액 − 공제·감면) × 「거래이익을 소득금액으로 나눈 값」과 1 중 작은 값"
            data-testid="sc-corporate-tax"
          />
        )}
        {isAuto && (
          <div className="space-y-2">
            <CurrencyInput
              label="법인세 산출세액"
              value={form.scCorpTaxAssessed}
              onChange={(v) => set({ scCorpTaxAssessed: v })}
              hint="「법인세법」 §55① 산출세액 — 공제·감면 차감 전 금액을 그대로 입력"
              data-testid="sc-corp-tax-assessed"
            />
            <CurrencyInput
              label="토지등 양도소득에 대한 법인세액"
              value={form.scCorpTaxLandTransfer}
              onChange={(v) => set({ scCorpTaxLandTransfer: v })}
              hint="「법인세법」 §55의2분 — 위 산출세액에 포함돼 있으면 그 금액 (없으면 0)"
              data-testid="sc-corp-tax-land-transfer"
            />
            <CurrencyInput
              label="법인세 공제·감면액"
              value={form.scCorpTaxDeduction}
              onChange={(v) => set({ scCorpTaxDeduction: v })}
              hint="공제·감면액 합계 (없으면 0)"
              data-testid="sc-corp-tax-deduction"
            />
            <CurrencyInput
              label="각사업연도소득금액 (안분 분모)"
              value={form.scCorpIncome}
              onChange={(v) => set({ scCorpIncome: v })}
              hint="§34의5④2호나목 분모 — 필수 입력 (0이면 계산 불가)"
              data-testid="sc-corp-income"
            />
            {corpTaxEcho !== null && (
              <div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                안분 법인세 상당액 (표시용) ≈{" "}
                <span className="font-mono tabular-nums font-bold" data-testid="sc-corp-tax-echo">{corpTaxEcho.toLocaleString()}</span>원
                <span className="ml-1 text-amber-600">(실계산은 엔진)</span>
              </div>
            )}
          </div>
        )}
      </ToneCard>

      {/* ── 섹션 4: 지분율 or 주주 명단 ── */}
      <ToneCard
        tone="violet"
        sectionNum="4"
        title={isRoster ? "발행주식 총수 + 지배주주등 주주 명단" : "해당 지배주주등의 주식보유비율"}
        noDark
      >
        {!isRoster && (
          <FieldCard
            label="해당 지배주주등(수증자)의 주식보유비율"
            hint="수증자 1인분입니다 (그룹 합계 아님). 간접보유가 있으면 합산해 입력하세요"
            unit="%"
          >
            <DecimalInput value={form.scRatioPct} onChange={(v) => set({ scRatioPct: v })} data-testid="sc-shareholder-ratio" />
          </FieldCard>
        )}
        {isRoster && (
          <>
            <CurrencyInput
              label="발행주식 총수"
              value={form.scTotalShares}
              onChange={(v) => set({ scTotalShares: v })}
              hint="법인 발행주식 총수 (지분율 분모)"
              // 🔴 SC-4-f: placeholder를 안 주면 CurrencyInput 기본값 「금액 입력」이 뜨는데
              //    이 칸은 「금액」이 아니라 「수」다.
              //    ⚠️ 라벨을 그대로 되풀이하지 않는다 — `placeholder-policy` 래칧(19건)은
              //       「이 수를 올려 통과시키지 말 것」이다. 단위종류만 밝힌다.
              placeholder="주식 수"
              data-testid="sc-total-shares"
            />
            <SpecificCorpShareholderTable
              rows={form.scShareholders ?? []}
              onChange={(rows) => set({ scShareholders: rows })}
            />
            <SpecificCorpIntermediaryTable
              rows={form.scIntermediaryCorps ?? []}
              shareholders={form.scShareholders ?? []}
              onChange={(rows) => set({ scIntermediaryCorps: rows })}
            />
          </>
        )}
        {/* ── ⓐ §45의5① 특정법인 해당성 — 위 ⓑ 승수와 다른 축 ── */}
        <FieldCard
          label="지배주주등 합계 주식보유비율 (직접+간접)"
          hint={
            isRoster
              ? "미입력 시 주주 명단·간접출자관계로 판정합니다 (그 밖의 간접보유는 0%)"
              : "지배주주와 그 친족 «전원»의 합계 — 미입력 시 요건을 판정하지 않습니다"
          }
          unit="%"
        >
          <DecimalInput
            value={form.scGroupRatioPct}
            onChange={(v) => set({ scGroupRatioPct: v })}
            data-testid="sc-group-ratio"
          />
        </FieldCard>
      </ToneCard>

      {/* 「주식보유비율」의 두 축 — 평문 hint로 깔면 검증 오류 메시지를 밀어낸다(hint 150자 정책) */}
      <CollapsibleHintCard tone="violet" summary="「주식보유비율」의 두 축 — 특정법인 해당성(ⓐ)과 인별 승수(ⓑ)">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b>ⓐ 특정법인 해당성 (법 §45의5①)</b>: 「지배주주등의 주식보유비율이 100분의 30 이상인
            <b> 법인</b>」만 특정법인입니다. 「지배주주등」은 법 §45의4①의 「지배주주와 그 친족」이라
            <b> 전원의 합계</b>이고, 미달이면 증여의제가 성립하지 않습니다.
          </li>
          <li>
            <b>ⓑ 인별 승수 (상증령 §34의5⑨)</b>: 증여의제이익은 「<b>해당</b> 지배주주등의 주식보유비율을
            곱한 금액을 해당 지배주주등이 <b>각각</b>」 증여받은 것으로 봅니다. 그룹이 30% 이상인
            특정법인이라면 개인 보유분이 30% 미만이어도 그 개인 비율로 곱하는 것이 맞습니다.
          </li>
          <li>
            <b>직접 + 간접 (법 §45의3①)</b>: 「직접 또는 간접으로 보유하는 주식보유비율(이하 이 조,
            제45조의4 및 <b>제45조의5</b>에서 &quot;주식보유비율&quot;이라 한다)」. 간접보유비율은 각 단계
            직접보유비율의 곱이고, 경로가 둘 이상이면 합합니다(상증령 §34의3②).
          </li>
          <li>
            <b>미입력의 의미</b>: 주주 명단 모드는 명단·간접출자관계에 없는 간접보유를 0%로 보고 ⓐ를
            판정합니다. 지분율 직접 입력 모드는 그룹 합계를 알 수 없어 ⓐ를 <b>판정하지 않습니다</b>.
          </li>
        </ul>
      </CollapsibleHintCard>

      {/* ── 섹션 5: §45의5② 한도 — 증여재산공제 ── */}
      <ToneCard tone="emerald" sectionNum="5" title="§45의5② 한도 — 증여재산공제 (선택)" noDark>
        <CurrencyInput
          label="증여재산공제"
          value={form.scGiftDeduction}
          onChange={(v) => set({ scGiftDeduction: v })}
          hint="§45의5② 한도 ㉮㉠ 계산 시 적용할 증여재산공제액 (미입력 시 0)"
          data-testid="sc-gift-deduction"
        />
      </ToneCard>

      {/* 🔴 SC-K: §68① 단서 — 「특정법인의 「법인세법」 제60조제1항에 따른 과세표준의 신고기한이
          속하는 달의 말일부터 3개월이 되는 날」. §45의5의 증여일은 「거래한 날」(§45의5①)이라
          사업연도와 무관하므로 여기서 따로 받아야 신고기한이 선다(§45의3은 증여시기 자체가
          사업연도 종료일이라 추가 입력이 없다). 값은 증여세 마법사로 이관된다. */}
      <ToneCard tone="slate" sectionNum="6" title="신고기한 (§68① 단서)" noDark>
        <FieldCard
          label="특정법인의 사업연도 종료일"
          hint="이 거래가 속한 사업연도의 종료일 — 증여일(거래한 날)과 다른 축입니다. 법인세 신고기한이 여기서 파생됩니다"
        >
          <DateInput
            value={form.scCorpFiscalYearEndDate}
            onChange={(v) => set({ scCorpFiscalYearEndDate: v })}
            data-testid="sc-corp-fye"
          />
        </FieldCard>
        <ToggleCard
          tone="sky"
          title="성실신고확인서를 제출하는 법인"
          checked={form.corpHonestFilingConfirm}
          onCheckedChange={(v) => set({ corpHonestFilingConfirm: v })}
          description="법인세법 §60① 괄호 — 제출 법인은 법인세 신고기한이 3개월이 아니라 4개월입니다"
          data-testid="sc-honest-filing"
        />
      </ToneCard>
    </div>
  );
}
