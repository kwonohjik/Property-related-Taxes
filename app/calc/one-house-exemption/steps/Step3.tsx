"use client";

/**
 * ② 양도 대상 주택 (P4-2b-2 · 2026-09-23 재배치)
 *
 * UI 설계 §3.3 · 계획서 `docs/00-pm/one-house-judgment-step-reorder.plan.md`.
 *
 * ## 🔑 파일명은 `Step3`인데 화면은 **2번째**다
 *
 * 순서를 뒤집은 이유는 `OneHouseJudgmentCalculator.tsx`의 `STEPS` 주석에 있다 —
 * 이 화면이 받는 `acquisitionDate`·`transferDate`를 ③ 보유 주택 화면이 소비하기 때문이다.
 * 파일명 유지는 저장소 관례(유닛 9파일이 경로로 import).
 *
 * ## 🔴 「양도 대상 주택 선택」 위젯은 만들지 않는다 (계획서 §20.4)
 *
 * 설계 초안은 ③ 명부에서 양도 대상을 고르는 `RadioCardGroup`을 두려 했으나, 명부는
 * **「다른 보유 주택」**이라 거기에 양도 대상이 들어 있지 않다
 * (`HousesListSection.tsx:529`). API 변환 층이 `id:"selling"` 행을 앞에 붙이며 그 행의
 * 취득일·기준시가·지역을 전부 `assets[0]`에서 읽는다. ⇒ 양도 대상은 **여기서 직접** 받는다.
 */
import { useMemo } from "react";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { RedevelopmentRightExemptionSection } from "@/components/calc/transfer/RedevelopmentRightExemptionSection";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

/**
 * 조정대상지역 한 축 — **주소가 있으면 자동 판정(읽기전용) · 없으면 토글**.
 *
 * 취득 당시·양도 당시 **둘이 같은 컴포넌트**를 쓴다. 종전에는 취득 당시만 자동 판정으로
 * 바뀌어, 주소를 넣으면 「엔진이 무시하는 토글」이 양도 당시 쪽에만 남아 있었다(F-3).
 *
 * 🔑 주소가 있을 때 토글을 띄우면 **사용자가 켠 값이 조용히 버려진다** — 엔진 소비처
 *    셋(거주요건·§155① 처분기한·다주택 중과)이 전부 `regionCode`를 우선하기 때문이다.
 */
function RegulatedAreaField({
  verdict,
  autoLabel,
  autoTestId,
  toggleTestId,
  toggleTitle,
  checked,
  onCheckedChange,
}: {
  verdict: ReturnType<typeof isRegulatedByBjdCode> | null;
  autoLabel: string;
  autoTestId: string;
  toggleTestId: string;
  toggleTitle: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  if (!verdict) {
    return (
      <ToggleCard
        data-testid={toggleTestId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        title={toggleTitle}
        description="소재지를 입력하면 읍·면·동·택지지구 예외까지 자동 판정합니다"
        tone="rose"
        size="sm"
      />
    );
  }
  return (
    <div className="space-y-2" data-testid={autoTestId}>
      <ToneCard
        tone={verdict.isRegulated ? "rose" : "emerald"}
        bodyClassName=""
        className="px-3 py-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-micro font-semibold text-green-700">
            자동
          </span>
          <span className="text-sm font-medium">
            {autoLabel} {verdict.isRegulated ? "해당" : "미해당"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{verdict.basis}</p>
      </ToneCard>
      {/*
        🔴 「아래 토글」이라고 쓰지 않는다 — 이 분기에서는 토글이 렌더되지 않는다.
           화면에 없는 것을 가리키는 안내가 「1단계에서 입력하세요」를 만든 병이다.
        ⚠️ 이 주석은 `&&` 괄호 **밖**에 둔다 — 안은 표현식 자리라 중괄호 주석이
           객체 리터럴로 파싱돼 파일 전체가 깨진다(실측). 주석 본문에 닫는
           슬래시-별표 표기를 적는 것도 같은 이유로 금지다(주석이 거기서 끝난다).
      */}
      {verdict.confidence === "low" && (
        <ToneCard tone="amber" bodyClassName="" className="px-3 py-2">
          <p className="text-xs leading-relaxed">
            이 지역은 지정 이력 자료에 없어 자동 판정이 <b>불확실</b>합니다. 직접 선택하려면
            위 <b>소재지</b>를 지우세요 — 그러면 직접 고르는 토글이 나타납니다.
          </p>
        </ToneCard>
      )}
    </div>
  );
}

export function Step3({ form, onChange }: Props) {
  const primary = form.assets[0];
  /** 양도 대상이 조합원입주권인가 — §89①3호(주택)와 §89①4호(입주권)를 가르는 축이다. */
  const isRightSale = primary.assetKind === "right_to_move_in";

  /** 자산-수준 patch — `assets[0]`만 갈아 끼운다(계산기 Step4:613-617과 같은 형태). */
  const patchAsset = (patch: Record<string, unknown>) =>
    onChange({ assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) });

  /**
   * 취득 당시 조정대상지역 — **엔진과 같은 함수**로 미리 보여준다.
   *
   * 🔴 여기서 별도 판정식을 쓰면 dual-truth가 된다. `regulated-areas.ts` 머리 주석이
   *    「엔진·클라이언트 판별이 이 모듈의 데이터·헬퍼를 공유한다. 별도 매칭/판정 함수 재정의
   *    금지」라고 못 박았고, 엔진 쪽 소비처는
   *    `transfer-tax-exemption-requirements.ts:382-390` `resolveWasRegulatedAtAcquisition`이다.
   *
   * 🔑 **`regionCode`가 있으면 엔진이 토글을 무시한다**(같은 함수 `:383`). 그래서 주소가
   *    들어온 순간 토글을 읽기 전용 자동 판정으로 바꾼다 — 그러지 않으면 사용자가 켠 값이
   *    조용히 버려진다.
   */
  const regulatedVerdict = useMemo(() => {
    if (!primary.regionCode || !primary.acquisitionDate) return null;
    return isRegulatedByBjdCode(primary.regionCode, primary.acquisitionDate);
  }, [primary.regionCode, primary.acquisitionDate]);

  /**
   * 「양도 **당시**」 — 취득 당시와 **같은 규약**이다(F-3, 2026-09-25).
   *
   * 기준일만 `form.transferDate`로 바뀐다. 엔진 쪽 소비처 둘도 `regionCode`를 우선한다:
   *   · §155① 처분기한 — `transfer-tax-temporary-two-house-timing.ts`의 `resolveIsRegulatedAtTransfer`
   *   · 다주택 중과 — `multi-house-surcharge.ts:226` (양도일 기준)
   *
   * 🔴 종전에는 「취득 당시」만 자동 판정으로 바뀌고 이쪽은 수동 토글이라, **주소를 넣으면
   *    중과에서는 무시되는 토글**이 화면에 남아 있었다 — 형제 축에서 이미 고친 것과 같은 병이다.
   */
  const transferRegulatedVerdict = useMemo(() => {
    if (!primary.regionCode || !form.transferDate) return null;
    return isRegulatedByBjdCode(primary.regionCode, form.transferDate);
  }, [primary.regionCode, form.transferDate]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="② 양도 대상 주택"
        description="양도하려는 주택과 예정 조건을 입력하세요. 다른 보유 주택은 ③ 단계에서 입력합니다."
      />

      {/*
        🔴 **양도 대상 종류가 판정 조문을 가른다** (P4-3b).
           주택 → §89①3호(보유·거주요건·§155 각 항) · 조합원입주권 → §89①4호(가목·나목).
           엔진의 자산 게이트가 `propertyType !== "housing"`이라 이 선택이 곧 경로 선택이다.
        🔑 `redevSubject`를 함께 세운다 — §89①4호 카드의 노출 게이트가 그 값을 읽는다.
      */}
      <ToneCard tone="violet" sectionNum="2-A" title="양도 대상">
        <RadioCardGroup
          name="one-house-sale-target"
          tone="violet"
          layout="stack"
          options={[
            {
              value: "housing",
              label: "주택",
              description: "소득세법 §89①3호 — 보유 2년(조정대상지역 취득 시 거주 2년) 요건과 §155 각 항 특례로 판정합니다.",
            },
            {
              value: "right_to_move_in",
              label: "조합원입주권",
              description: "소득세법 §89①4호 — 다른 주택·분양권 보유 여부와 인가일 기준 요건으로 판정합니다.",
            },
          ]}
          value={primary.assetKind === "right_to_move_in" ? "right_to_move_in" : "housing"}
          onChange={(v) =>
            patchAsset(
              v === "right_to_move_in"
                ? { assetKind: "right_to_move_in", redevSubject: "right" }
                : { assetKind: "housing" },
            )
          }
        />
      </ToneCard>

      <ToneCard tone="amber" sectionNum="2-B" title={isRightSale ? "양도 대상 입주권" : "양도 대상 주택"}>
        {/*
          소재지 — **선택 입력**이다. 넣으면 조정대상지역을 읍·면·동·택지지구 예외까지
          정밀 판정하고(2-C), 넣지 않으면 2-C의 토글이 그대로 판정 근거가 된다.
          🔑 PNU 앞 10자리가 법정동코드다(계산기 `AssetSectionBasic.tsx:315-317`과 같은 leaf).
             ⑫ `propertySchema`가 `z.string().length(10)`을 요구하므로 **정확히 10자리**여야 한다.
        */}
        <FieldCard label="소재지" hint="선택 — 입력하면 조정대상지역을 자동 판정합니다">
          <AddressSearch
            value={
              {
                road: primary.addressRoad ?? "",
                jibun: primary.addressJibun ?? "",
                building: primary.buildingName ?? "",
                detail: primary.addressDetail ?? "",
                lng: "",
                lat: "",
              } satisfies AddressValue
            }
            onChange={(v) => {
              const patch: Record<string, unknown> = {
                addressRoad: v.road,
                addressJibun: v.jibun,
                buildingName: v.building,
                addressDetail: v.detail,
              };
              if (v.pnu && v.pnu.length >= 10) patch.regionCode = v.pnu.slice(0, 10);
              patchAsset(patch);
            }}
          />
        </FieldCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldCard label="취득일">
            <DateInput
              data-testid="one-house-acq-date"
              value={primary?.acquisitionDate ?? ""}
              onChange={(acquisitionDate) => patchAsset({ acquisitionDate })}
            />
          </FieldCard>
          <FieldCard label="양도 예정일">
            <DateInput
              data-testid="one-house-sale-date"
              value={form.transferDate}
              onChange={(transferDate) => onChange({ transferDate })}
            />
          </FieldCard>
        </div>
        <FieldCard
          label="예상 양도가액"
          hint="12억 초과 여부(고가주택)를 판정하는 데 쓰입니다"
        >
          <CurrencyInput
            data-testid="one-house-sale-price"
            label="예상 양도가액"
            hideLabel
            hideUnit
            value={form.contractTotalPrice}
            onChange={(contractTotalPrice) => onChange({ contractTotalPrice })}
          />
        </FieldCard>
      </ToneCard>

      <ToneCard tone="rose" sectionNum="2-C" title="조정대상지역">
        <p className="text-sm leading-relaxed">
          <b>취득 당시</b> 조정대상지역이었다면 보유 2년에 더해 <b>거주 2년</b>이 필요합니다.
          양도 당시 지정 여부는 거주요건과 무관합니다.
        </p>

        <RegulatedAreaField
          verdict={regulatedVerdict}
          autoLabel="취득 당시 조정대상지역"
          autoTestId="one-house-regulated-auto"
          toggleTestId="one-house-was-regulated"
          toggleTitle="취득 당시 조정대상지역이었습니다"
          checked={form.wasRegulatedAtAcquisition}
          onCheckedChange={(wasRegulatedAtAcquisition) => onChange({ wasRegulatedAtAcquisition })}
        />

        <RegulatedAreaField
          verdict={transferRegulatedVerdict}
          autoLabel="양도 당시 조정대상지역"
          autoTestId="one-house-transfer-regulated-auto"
          toggleTestId="one-house-is-regulated"
          toggleTitle="양도 당시 조정대상지역입니다"
          checked={form.isRegulatedArea}
          onCheckedChange={(isRegulatedArea) => onChange({ isRegulatedArea })}
        />
      </ToneCard>

      {/*
        §89①4호 1세대1입주권 — **이 화면이 유일한 입력 경로**다 (P6-c-1).
        종전에는 계산기 `RedevelopmentBlock`도 같은 컴포넌트를 `mode="full"`로 띄웠으나,
        입력 4종이 전부 판정 사실이라 계산기 쪽을 읽기 전용 요약으로 바꿨다.
        🔑 §166 3분할 산식 입력은 애초에 이 컴포넌트가 아니라 `RedevelopmentBlock`이 갖는다 —
           세액 맥락(§95② 장기보유특별공제 구조 안내)도 그쪽으로 옮겼다.
      */}
      {isRightSale && (
        <RedevelopmentRightExemptionSection
          asset={primary}
          onChange={patchAsset}
          wasRegulatedAtAcquisition={form.wasRegulatedAtAcquisition}
        />
      )}

      {/*
        거주기간 — **자산-수준** 필드에 바인딩한다. 폼-전역 `residencePeriodMonths`는 이
        위젯이 건드리지 않는 옛 필드이고, 어댑터도 같은 leaf로 자산-수준을 읽는다.

        🔑 입주권 양도에는 띄우지 않는다 — §89①4호의 거주 축은 **인가일 기준 종전주택** 거주이고
           그 값은 위 카드의 `redevPriorHouseResidenceMonths`가 받는다. 둘 다 띄우면 사용자는
           같은 질문을 두 번 받고, 판정에는 그중 하나만 쓰인다.
      */}
      {!isRightSale && (
      <ResidencePeriodSection
        residenceInputMode={primary.residenceInputMode}
        residencePeriods={primary.residencePeriods}
        residencePeriodMonthsAsset={primary.residencePeriodMonthsAsset}
        transferDate={form.transferDate}
        onChange={patchAsset}
      />
      )}

      {/*
        ── §155의2 · §155의3 · §155⑳ — 거주요건을 면제하는 특례 3종 (2026-09-23 ③에서 이동) ──

        셋 다 **양도 대상 주택 자신**에 매달리고, 세 판정이 모두 위 「거주기간」 축을 면제한다.
        ⇒ 거주기간 바로 다음이 계산 로직 순서와도 맞다(UI 순서 = 로직 순서).

        🔑 ⑧ 검증도 함께 옮겼다(`validateStep3`). 다만 §155⑳ **이중입력 경고**만은
           `validateStep2`에 남겼다 — 조건이 `form.houses.length > 0`인데 명부는 ③에서
           입력되므로, 여기로 옮기면 명부 입력 시점에 평가되지 않아 경고가 죽는다.
      */}
      <ToggleCard
        data-testid="one-house-long-term-mortgage"
        checked={form.longTermMortgageSpecial}
        onCheckedChange={(longTermMortgageSpecial) => onChange({ longTermMortgageSpecial })}
        title="장기저당담보주택 특례"
        description="주택을 담보로 연금을 받는 계약(역모기지) — 거주기간 요건이 면제됩니다"
        tone="violet"
        lawRefs={[{ legalBasis: "소득세법 시행령 §155의2", label: "영 §155의2" }]}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldCard label="계약체결일">
            <DateInput
              data-testid="ltm-contract-date"
              value={form.longTermMortgageContractDate}
              onChange={(longTermMortgageContractDate) =>
                onChange({ longTermMortgageContractDate })
              }
            />
          </FieldCard>
          <FieldCard label="계약체결일 현재 가입자 나이" hint="만 나이(세)">
            <IntegerInput
              allowEmpty
              value={form.longTermMortgageBorrowerAge === "" ? undefined : Number(form.longTermMortgageBorrowerAge)}
              onChange={(v) => onChange({ longTermMortgageBorrowerAge: v === undefined ? "" : String(v) })}
            />
          </FieldCard>
          <FieldCard label="계약기간" hint="연 단위">
            <IntegerInput
              allowEmpty
              value={form.longTermMortgageContractYears === "" ? undefined : Number(form.longTermMortgageContractYears)}
              onChange={(v) => onChange({ longTermMortgageContractYears: v === undefined ? "" : String(v) })}
            />
          </FieldCard>
        </div>
        <div className="space-y-2 pt-1">
          <ToggleCard
            variant="chip"
            checked={form.longTermMortgageMaturityLumpSum}
            onCheckedChange={(longTermMortgageMaturityLumpSum) =>
              onChange({ longTermMortgageMaturityLumpSum })
            }
            title="만기에 이 주택을 처분해 일시 상환하는 계약조건"
            tone="violet"
          />
          <ToggleCard
            variant="chip"
            checked={form.longTermMortgageIsTransferredHouseMortgaged}
            onCheckedChange={(longTermMortgageIsTransferredHouseMortgaged) =>
              onChange({ longTermMortgageIsTransferredHouseMortgaged })
            }
            title="양도할 주택이 담보로 제공된 그 주택이다"
            tone="violet"
          />
          <ToggleCard
            variant="chip"
            checked={form.longTermMortgageParentalCareMerge}
            onCheckedChange={(longTermMortgageParentalCareMerge) =>
              onChange({ longTermMortgageParentalCareMerge })
            }
            title="담보주택을 보유한 직계존속과 동거봉양 합가로 2주택이 되었다"
            tone="violet"
          />
          <ToggleCard
            variant="chip"
            checked={form.longTermMortgageTransferredBeforeMaturity}
            onCheckedChange={(longTermMortgageTransferredBeforeMaturity) =>
              onChange({ longTermMortgageTransferredBeforeMaturity })
            }
            title="계약기간이 끝나기 전에 양도한다"
            tone="rose"
          />
        </div>
      </ToggleCard>

      <ToggleCard
        data-testid="one-house-win-win-rental"
        checked={form.winWinRentalSpecial}
        onCheckedChange={(winWinRentalSpecial) => onChange({ winWinRentalSpecial })}
        title="상생임대주택 특례"
        description="임대료를 5% 이하로 올린 계약 — 거주기간 요건이 면제됩니다"
        tone="violet"
        lawRefs={[{ legalBasis: "소득세법 시행령 §155의3", label: "영 §155의3" }]}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldCard label="상생임대차계약 체결일">
            <DateInput
              data-testid="ww-contract-date"
              value={form.winWinRentalContractDate}
              onChange={(winWinRentalContractDate) => onChange({ winWinRentalContractDate })}
            />
          </FieldCard>
          {/*
            🔑 **「인상률」로 받는다 — 「증가율」이 아니다.**
            `DecimalInput`은 음수를 입력할 수 없다(`DecimalInput.tsx:55` 「음수 제외」).
            §155의3①1호 요건은 「증가율이 **5% 이하**」이므로 임대료를 내린 경우도 당연히
            충족이고, 인하폭이 얼마인지는 **판정을 바꾸지 않는다**. ⇒ 음수 입력 위젯을 새로
            만드는 대신 물음을 「올린 비율」로 좁히고, 내린 경우는 0으로 적게 안내한다.
            (어댑터는 음수도 그대로 통과시킨다 — 다른 입력 경로가 생겨도 잘리지 않는다.)
          */}
          <FieldCard
            label="직전임대차 대비 임대료 인상률"
            hint="백분율. 임대료를 내렸거나 그대로면 0을 입력하세요"
          >
            <DecimalInput
              data-testid="ww-increase-rate"
              value={form.winWinRentalIncreaseRatePct}
              onChange={(winWinRentalIncreaseRatePct) => onChange({ winWinRentalIncreaseRatePct })}
              unit="%"
            />
          </FieldCard>
          <FieldCard label="직전임대차 임대기간" hint="개월. 1개월 미만은 1개월로 봅니다">
            <IntegerInput
              /* 🔑 `FieldCard` 라벨은 `htmlFor`로 묶여 있지 않다 — E2E가 집을 수 있도록 aria를 준다. */
              ariaLabel="직전임대차 임대기간"
              allowEmpty
              value={form.winWinRentalPriorLeaseMonths === "" ? undefined : Number(form.winWinRentalPriorLeaseMonths)}
              onChange={(v) => onChange({ winWinRentalPriorLeaseMonths: v === undefined ? "" : String(v) })}
            />
          </FieldCard>
          <FieldCard label="상생임대차 임대기간" hint="개월">
            <IntegerInput
              ariaLabel="상생임대차 임대기간"
              allowEmpty
              value={form.winWinRentalLeaseMonths === "" ? undefined : Number(form.winWinRentalLeaseMonths)}
              onChange={(v) => onChange({ winWinRentalLeaseMonths: v === undefined ? "" : String(v) })}
            />
          </FieldCard>
        </div>
      </ToggleCard>

      {/*
        §155⑳ 장기임대주택 보유자 거주주택 특례 (P4-3a · 계획서 Q-7).

        🔑 계산기와 **같은 컴포넌트**를 `mode="facts"`로 쓴다 — 복제 금지가 Q-7의 조건이었다.
           §161① 안분 3시점 기준시가·직전거주주택 양도일은 세액 산식 입력이라 계산기에 남는다.

        🔴 `onChangeResidence`를 **넘기지 않는다**. 그 prop을 주면 섹션 안에 거주기간 편집기가
           열리는데, 그것은 위 `ResidencePeriodSection`과 **같은 자산-수준 필드**를 쓴다.
           둘 다 띄우면 같은 칸이 두 벌이 된다(F-3과 같은 층위). 실시간 충족 표시는 그대로 뜬다.

        🔑 여기 선언한 임대주택은 ③ **명부에 다시 넣지 않는다** — 특례가 주택 수에서 빼 주는
           대상이다. 이중 입력은 ⑧이 ③ 단계에서 경고한다.
      */}
      <RentalHousingExceptionSection
        mode="facts"
        rh={primary.rentalHousingException}
        asset={primary}
        acquisitionDate={primary.acquisitionDate ?? ""}
        transferDate={form.transferDate}
        onChange={(rentalHousingException) => patchAsset({ rentalHousingException })}
      />

      <ToggleCard
        data-testid="one-house-unregistered"
        checked={form.isUnregistered}
        onCheckedChange={(isUnregistered) => onChange({ isUnregistered })}
        title="미등기 양도자산입니다"
        description="미등기 양도는 비과세·감면이 배제됩니다 (법 §91①)"
        tone="rose"
      />
    </div>
  );
}
