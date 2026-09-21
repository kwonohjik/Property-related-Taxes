"use client";

/**
 * ② 보유 주택·권리 명세 (P4-2b-2)
 *
 * UI 설계 §3.2. 계산기 섹션을 **재사용**한다 — 복제 금지.
 *
 * ## 🔴 재사용에서 지켜야 하는 규약 3가지 (실측 — 계획서 §20.6)
 *
 *   F-1 `HousesListSection` 안의 **중과배제 2섹션**은 비과세 판정과 무관하다(영 §167의10).
 *       숨길 prop이 없어 `hideSellingHouseExclusion`을 하나 추가했다. 그대로 두면
 *       **입력해도 아무 데도 가지 않는 칸**이 된다(API 본문에 싣지 않는다).
 *   F-2 `HouseCountExemptionInputs`가 내부에서 `HousesListSection`을 렌더한다 —
 *       **둘을 함께 쓰면 안 된다**. 같은 배열을 각각 patch해 last-write-wins가 된다.
 *   F-4 `TemporaryTwoHouseSection`은 판정값을 **전부 상위에서 파생해 props로 받는다**.
 *       그 파생 5종을 여기서 같은 식으로 계산한다(계산기 `Step4.tsx`와 같은 leaf).
 */
import { useEffect, useMemo, useState } from "react";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { HouseCountExemptionInputs } from "@/app/calc/transfer-tax/steps/step4-sections/HouseCountExemptionInputs";
import { TemporaryTwoHouseSection } from "@/app/calc/transfer-tax/steps/step4-sections/TemporaryTwoHouseSection";
import { RightThreeYearExceptionSection } from "@/components/calc/transfer/RightThreeYearExceptionSection";
import { InheritedRightExceptionSection } from "@/components/calc/transfer/InheritedRightExceptionSection";
import { MergedHouseholdRightSection } from "@/components/calc/transfer/MergedHouseholdRightSection";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import { provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { judgeRuralHouseLocation, classifyEupMyeon } from "@/lib/geo/rural-house-location";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";
import { judgmentTemporaryTwoHouseVisible } from "@/lib/calc/one-house-judgment-section-scope";
import {
  deriveJudgmentHouseCount,
  withDerivedHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

export function Step2({ form, onChange }: Props) {
  /**
   * 🔑 재사용 섹션은 렌더 게이트로 `form.householdHousingCount`를 읽는다. 판정 메뉴는 그 값을
   *    store에 두지 않으므로(Q-8) **넘기기 직전에 합성**한다. `useEffect` 미러링이 아니라
   *    파생 뷰다 — 사용자 입력은 원본 `form`으로만 돌아간다.
   */
  const viewForm = useMemo(() => withDerivedHouseCount(form), [form]);
  const houseCount = deriveJudgmentHouseCount(form);
  const primaryAcquisitionDate = form.assets?.[0]?.acquisitionDate ?? "";

  /** 양도 대상(= 거주주택) 자산. §155⑳ 특례는 이 자산에 매달린다. */
  const primary = form.assets[0];
  /** 자산-수준 patch — ③ 단계(`Step3.tsx:33`)와 같은 형태다. */
  const patchPrimaryAsset = (patch: Record<string, unknown>) =>
    onChange({ assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) });

  // ── F-4 파생 props 5종 (계산기 Step4와 같은 leaf) ──────────────
  const tempTwoHouseVerdict = useMemo(
    () =>
      judgeTempTwoHouseFromForm({
        previousAcquisitionDate: primaryAcquisitionDate,
        newHouseAcquisitionDate: form.newHouseAcquisitionDate,
        transferDate: form.transferDate,
        provisoReason: form.provisoReason,
        provisoDepartureDate: form.provisoDepartureDate,
        provisoExpropriationDate: form.provisoExpropriationDate,
        provisoBusinessApprovalDate: form.provisoBusinessApprovalDate,
        residencePeriodMonths: form.residencePeriodMonths,
        publicInstitutionRelocation: form.publicInstitutionRelocation,
        disposalDelayReason: form.disposalDelayReason,
      }),
    [
      primaryAcquisitionDate,
      form.newHouseAcquisitionDate,
      form.transferDate,
      form.provisoReason,
      form.provisoDepartureDate,
      form.provisoExpropriationDate,
      form.provisoBusinessApprovalDate,
      form.residencePeriodMonths,
      form.publicInstitutionRelocation,
      form.disposalDelayReason,
    ],
  );

  /**
   * §155⑯ 연접 판정 — 계산기는 이 블록을 `Step4.tsx:292-317`에 **인라인**으로 갖고 있고
   * 재사용 가능한 export가 없다. 같은 규칙을 그대로 옮긴다(F-4).
   */
  const relocationRegionVerdict = useMemo(() => {
    if (!form.publicInstitutionRelocation) return null;
    const from = form.relocatedSigunguCode;
    const to = form.newHouseSigunguCode;
    if (!from || !to) return null;
    if (from === to) {
      return { ok: true, reason: "이전한 시·군에 신규 주택이 소재합니다 — 지역 요건 충족." };
    }
    const adjacent = getAdjacentSigunguCodes(from);
    if (adjacent.length === 0) {
      return {
        ok: true,
        reason:
          "이전지의 연접 시·군 정보가 없어 자동 판정할 수 없습니다 — 입력하신 선택을 유지합니다.",
      };
    }
    return adjacent.includes(to)
      ? { ok: true, reason: "이전한 시·군과 연접한 시·군에 소재합니다 — 지역 요건 충족." }
      : {
          ok: false,
          reason:
            "이전한 시·군과 연접하지 않습니다 — §155⑯ 지역 요건 미충족으로 처분기한 5년이 적용되지 않습니다.",
        };
  }, [form.publicInstitutionRelocation, form.relocatedSigunguCode, form.newHouseSigunguCode]);

  // §155⑦ 농어촌주택 소재지 — 읍지역은 도시지역 여부를 외부 조회로 가른다(계산기와 동일).
  const [ruralUrbanVerdict, setRuralUrbanVerdict] = useState<
    "urban" | "non_urban" | "unknown" | null
  >(null);
  const ruralEupMyeon = classifyEupMyeon(form.ruralHouseJibun);

  useEffect(() => {
    if (!form.ruralHouseSpecial || ruralEupMyeon !== "eup" || !form.ruralHouseJibun) {
      setRuralUrbanVerdict(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/address/land-use-zone?jibun=${encodeURIComponent(form.ruralHouseJibun)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { verdict?: "urban" | "non_urban" | "unknown" } | null) => {
        if (!cancelled) setRuralUrbanVerdict(d?.verdict ?? "unknown");
      })
      .catch(() => {
        if (!cancelled) setRuralUrbanVerdict("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [form.ruralHouseSpecial, form.ruralHouseJibun, ruralEupMyeon]);

  const ruralLocation = useMemo(
    () =>
      judgeRuralHouseLocation({
        regionCode: form.ruralHouseRegionCode || undefined,
        jibun: form.ruralHouseJibun,
        urbanVerdict: ruralUrbanVerdict ?? undefined,
      }),
    [form.ruralHouseRegionCode, form.ruralHouseJibun, ruralUrbanVerdict],
  );

  // 자동 판정 → 토글 반영 (사용자가 손대면 touched 가드가 멈춘다 — 계산기와 동일)
  useEffect(() => {
    if (form.ruralHouseLocationTouched || ruralLocation.verdict === "unknown") return;
    const auto = ruralLocation.verdict === "qualified";
    if (form.ruralHouseOutsideCapitalEupMyeon !== auto) {
      onChange({ ruralHouseOutsideCapitalEupMyeon: auto });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruralLocation.verdict, form.ruralHouseLocationTouched, form.ruralHouseOutsideCapitalEupMyeon]);

  /**
   * §154① 단서 게이트 — **파생 주택 수**를 넘긴다.
   * 빈 문자열이면 `parseInt("") = NaN`으로 카드가 닫혀 면제 사유를 적을 곳이 사라진다.
   */
  const proviso = useMemo(
    () =>
      provisoGate({
        isOneHousehold: form.isOneHousehold,
        isHousing: true,
        householdHousingCount: String(houseCount),
        temporaryTwoHouseSpecial: form.temporaryTwoHouseSpecial,
      }),
    [form.isOneHousehold, houseCount, form.temporaryTwoHouseSpecial],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="② 보유 주택·권리"
        description={`세대가 보유한 주택과 분양권·입주권, 적용받을 특례를 입력하세요. (현재 판정 주택 수 ${houseCount}채)`}
      />

      <ToneCard tone="sky" bodyClassName="">
        <p className="text-sm leading-relaxed">
          아래 목록에는 <b>양도할 주택을 뺀 나머지</b>를 입력합니다. 양도 대상은 ③ 단계에서
          따로 입력하며, 판정 주택 수는 <b>양도 대상 1채 + 목록</b>으로 계산합니다.
        </p>
      </ToneCard>

      {/* F-2 — `HousesListSection`을 따로 렌더하지 않는다(이 컴포넌트가 내부에서 렌더한다). */}
      <HouseCountExemptionInputs
        form={viewForm}
        onChange={onChange}
        hideGracePeriod
        hideSellingHouseExclusion
      />

      {judgmentTemporaryTwoHouseVisible(form) && (
        <TemporaryTwoHouseSection
          form={viewForm}
          onChange={onChange}
          tempTwoHouseVerdict={tempTwoHouseVerdict}
          relocationRegionVerdict={relocationRegionVerdict}
          ruralLocation={ruralLocation}
          proviso={proviso}
          primaryAcquisitionDate={primaryAcquisitionDate}
        />
      )}

      {/* §89② 배제의 예외 3종 — 각자 내부 게이트를 갖고 있어 해당 없으면 스스로 숨는다. */}
      <RightThreeYearExceptionSection form={viewForm} onChange={onChange} />
      <InheritedRightExceptionSection form={viewForm} onChange={onChange} />
      <MergedHouseholdRightSection form={viewForm} onChange={onChange} />

      {/*
        §154① 단서 — 계산기 Step4와 같은 게이트. 판정 메뉴에도 **반드시 있어야 한다**:
        없으면 해외이주·수용 등으로 거주요건이 면제되는 사람에게 「거주요건 미충족」을 낸다(§3.2-B).
      */}
      {proviso.visible && proviso.mode === "one_house" && (
        <ExemptionProvisoSection
          provisoReason={form.provisoReason}
          provisoDepartureDate={form.provisoDepartureDate}
          provisoExpropriationDate={form.provisoExpropriationDate}
          provisoBusinessApprovalDate={form.provisoBusinessApprovalDate}
          provisoPreContractNoHouse={form.provisoPreContractNoHouse}
          mode={proviso.mode}
          onChange={onChange}
        />
      )}

      {/* ── §155의2 · §155의3 — 판정 메뉴에만 있는 입력 (D-4) ────────── */}
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
           열리는데, 그것은 ③ 단계의 `ResidencePeriodSection`과 **같은 자산-수준 필드**를 쓴다.
           둘 다 띄우면 같은 칸이 두 벌이 된다(F-3과 같은 층위). 실시간 충족 표시는 그대로 뜬다.

        🔑 여기 선언한 임대주택은 위 **명부에 다시 넣지 않는다** — 특례가 주택 수에서 빼 주는
           대상이다. 이중 입력은 ⑧이 경고한다.
      */}
      <RentalHousingExceptionSection
        mode="facts"
        rh={primary.rentalHousingException}
        asset={primary}
        acquisitionDate={primaryAcquisitionDate}
        transferDate={form.transferDate}
        onChange={(rentalHousingException) => patchPrimaryAsset({ rentalHousingException })}
      />
    </div>
  );
}
