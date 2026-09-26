"use client";

/**
 * ③ 보유 주택·권리 명세 (P4-2b-2 · 2026-09-23 재배치)
 *
 * UI 설계 §3.2. 계산기 섹션을 **재사용**한다 — 복제 금지.
 *
 * ## 🔑 파일명은 `Step2`인데 화면은 **3번째**다
 *
 * 이 화면은 `assets[0].acquisitionDate`·`transferDate`를 6곳에서 소비하는데, 그 둘의 유일한
 * 입력 경로가 ② 양도 대상 화면(`Step3.tsx`)이다. 종전 순서(②보유 → ③양도)에서는 순방향으로
 * 처음 도달한 사용자에게 §155① 블록이 **아예 뜨지 않았다**. 근거·이력은
 * `OneHouseJudgmentCalculator.tsx`의 `STEPS` 주석과
 * `docs/00-pm/one-house-judgment-step-reorder.plan.md`.
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
import { useMemo } from "react";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { HouseCountExemptionInputs } from "@/app/calc/transfer-tax/steps/step4-sections/HouseCountExemptionInputs";
import { TemporaryTwoHouseSection } from "@/app/calc/transfer-tax/steps/step4-sections/TemporaryTwoHouseSection";
import { RightThreeYearExceptionSection } from "@/components/calc/transfer/RightThreeYearExceptionSection";
import { InheritedRightExceptionSection } from "@/components/calc/transfer/InheritedRightExceptionSection";
import { MergedHouseholdRightSection } from "@/components/calc/transfer/MergedHouseholdRightSection";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import { provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";
import {
  judgmentReplacementHouseVisible,
  judgmentTemporaryTwoHouseVisible,
} from "@/lib/calc/one-house-judgment-section-scope";
import { ReplacementHouseSpecialBlock } from "@/app/calc/transfer-tax/steps/step4-sections/ReplacementHouseSpecialBlock";
import { deriveJudgmentResidenceMonths } from "@/lib/calc/one-house-exemption-api";
import { resolveTemporaryTwoHouse } from "@/lib/calc/household-house-count";
import { SpecialTaxHouseCountExclusionSection } from "./SpecialTaxHouseCountExclusionSection";
import {
  deriveJudgmentHouseCount,
  judgmentSaleIsHousing,
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

  /** 양도 대상 자산 — §155① 도출의 자산 종류 축에만 쓴다(입력은 ② 화면이 갖는다). */
  const primary = form.assets[0];

  /**
   * §155① 신규 주택 — **명부에서 도출**한다(④ 변환과 같은 정본 `resolveTemporaryTwoHouse`).
   *
   * 🔑 화면과 ④ 변환이 **같은 함수**를 써야 한다. 종전에는 화면이 `form.newHouseAcquisitionDate`를
   *    직접 읽어 「화면은 요건 충족이라는데 판정은 과세」가 조용히 생길 수 있었다.
   */
  const derivedNewHouse = useMemo(
    () =>
      resolveTemporaryTwoHouse({
        primaryKind: primary?.assetKind,
        primaryAcquisitionDate,
        houses: form.houses,
        legacyPrecedence: form.legacyHouseCountPrecedence === true,
        declaredSpecial: form.temporaryTwoHouseSpecial === true,
        declaredNewHouseDate: form.newHouseAcquisitionDate,
      }),
    [
      primary?.assetKind,
      primaryAcquisitionDate,
      form.houses,
      form.legacyHouseCountPrecedence,
      form.temporaryTwoHouseSpecial,
      form.newHouseAcquisitionDate,
    ],
  );

  /**
   * 거주 개월 — ④와 **같은 정본**(`deriveJudgmentResidenceMonths`, OH-56).
   * 🔴 폼-전역 `residencePeriodMonths`는 이 메뉴의 위젯이 쓰지 않는 옛 필드다(기본 "0").
   */
  const residenceMonths = useMemo(() => deriveJudgmentResidenceMonths(form), [form]);

  // ── F-4 파생 props 5종 (계산기 Step4와 같은 leaf) ──────────────
  const tempTwoHouseVerdict = useMemo(
    () =>
      judgeTempTwoHouseFromForm({
        previousAcquisitionDate: primaryAcquisitionDate,
        newHouseAcquisitionDate: derivedNewHouse?.newAcquisitionDate ?? "",
        transferDate: form.transferDate,
        provisoReason: form.provisoReason,
        provisoDepartureDate: form.provisoDepartureDate,
        provisoExpropriationDate: form.provisoExpropriationDate,
        provisoBusinessApprovalDate: form.provisoBusinessApprovalDate,
        residencePeriodMonths: String(residenceMonths),
        publicInstitutionRelocation: form.publicInstitutionRelocation,
        // §155⑯ 지역 요건 — 엔진과 같이 처분기한 5년 적용 여부를 가른다(OH-57).
        relocatedSigunguCode: form.relocatedSigunguCode,
        newHouseSigunguCode: form.newHouseSigunguCode,
        disposalDelayReason: form.disposalDelayReason,
      }),
    [
      primaryAcquisitionDate,
      derivedNewHouse?.newAcquisitionDate,
      form.transferDate,
      form.provisoReason,
      form.provisoDepartureDate,
      form.provisoExpropriationDate,
      form.provisoBusinessApprovalDate,
      residenceMonths,
      form.publicInstitutionRelocation,
      form.relocatedSigunguCode,
      form.newHouseSigunguCode,
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

  /**
   * 🔴 §155⑦ 농어촌 소재 자동판정 기계장치를 **전부 제거했다**(D-6 3b · P7-4).
   *
   * 사실이 명부 행으로 갔으므로 여기서 세대 단위 값을 만들 이유가 없다. 부수 효과로
   * **`useEffect → store` 미러링이 사라졌다** — 종전에는 자동 판정 결과를
   * `onChange({ ruralHouseOutsideCapitalEupMyeon })`로 써 넣었고 `touched` 플래그로
   * 사용자 입력을 지켰다(`feedback_useeffect_store_mirror_forbidden` 위반 + eslint-disable).
   *
   * 행에서는 **조회 결과**(`ruralUrbanZone`)만 저장하고 판정은 읽는 시점에
   * `resolveRuralLocationQualified`가 한다.
   */

  /**
   * §154① 단서 게이트 — **파생 주택 수**를 넘긴다.
   * 빈 문자열이면 `parseInt("") = NaN`으로 카드가 닫혀 면제 사유를 적을 곳이 사라진다.
   */
  const proviso = useMemo(
    () =>
      provisoGate({
        isOneHousehold: form.isOneHousehold,
        isHousing: true,
        householdHousingCount: houseCount, // 판정 메뉴는 이미 명부 파생값이다(D-3)
        temporaryTwoHouseApplies: derivedNewHouse !== undefined,
      }),
    [form.isOneHousehold, houseCount, derivedNewHouse],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="③ 보유 주택·권리"
        description={`세대가 보유한 주택과 분양권·입주권, 적용받을 특례를 입력하세요. (현재 판정 주택 수 ${houseCount}채)`}
      />

      <ToneCard tone="sky" bodyClassName="">
        <p className="text-sm leading-relaxed">
          아래 목록에는 <b>양도할 주택을 뺀 나머지</b>를 입력합니다. 양도 대상은 ② 단계에서
          이미 입력했으며, 판정 주택 수는 <b>양도 대상 1채 + 목록</b>으로 계산합니다.
        </p>
      </ToneCard>

      {/* F-2 — `HousesListSection`을 따로 렌더하지 않는다(이 컴포넌트가 내부에서 렌더한다). */}
      <HouseCountExemptionInputs
        form={viewForm}
        onChange={onChange}
        hideGracePeriod
        hideSellingHouseExclusion
      />

      {/*
        조특법 §99의4·§98의9 주택 수 제외 (OH-28) — 명부 바로 다음(주택 수를 바꾸는 입력끼리).
        게이트는 ④·⑧과 같다: 양도 대상이 주택일 때만(`judgmentSaleIsHousing`).
      */}
      {judgmentSaleIsHousing(form) && (
        <SpecialTaxHouseCountExclusionSection
          reductions={primary.reductions ?? []}
          transferDate={form.transferDate}
          onChange={(reductions) =>
            onChange({
              assets: form.assets.map((a, i) => (i === 0 ? { ...a, reductions } : a)),
            })
          }
        />
      )}

      {judgmentTemporaryTwoHouseVisible(form) && (
        <TemporaryTwoHouseSection
          form={viewForm}
          onChange={onChange}
          tempTwoHouseVerdict={tempTwoHouseVerdict}
          relocationRegionVerdict={relocationRegionVerdict}
          proviso={proviso}
          primaryAcquisitionDate={primaryAcquisitionDate}
          derivedNewHouseAcquisitionDate={derivedNewHouse?.newAcquisitionDate}
          /*
            🔴 합가일은 ① 세대 단계가 소유한다 — `judgmentMergeDateOwnedByStep1`.
               이 섹션의 `<MergeDateSection>`은 `full` 가드 **밖**이라 주택 수 ≥ 2이면
               ①과 여기 **양쪽에 같은 칸이 떴다**(배타 규약이 이 경로를 빠뜨렸다).
               계산기(calc 모드)는 그 자리에서 합가를 받아야 하므로 컴포넌트 쪽을
               ⚠️ 위 한 줄에 `calc` 모드 표기를 **속성 문법으로 쓰지 말 것** — `TM-8` 소스
                  anchor가 이 파일에 그 문자열이 없어야 한다고 고정한다(제 주석에 제가 걸렸다).
               고치지 않고 **판정 메뉴에서만 끈다**(`hideSellingHouseExclusion`과 같은 층위).
          */
          hideMergeDate
        />
      )}

      {/*
        §156의2⑤ 대체주택 — 일시적 2주택 섹션이 숨는 **1주택 + 조합원입주권** 세대(법령 기본 사례)
        에서는 여기서 따로 그린다(OH-05). 2주택 이상이면 위 섹션 안에 있으므로 두 벌이 되지 않게
        그 조건을 배제한다. 게이트는 ④·⑧과 같은 `judgmentReplacementHouseVisible`.
      */}
      {!judgmentTemporaryTwoHouseVisible(form) && judgmentReplacementHouseVisible(form) && (
        <ToneCard tone="emerald">
          <ReplacementHouseSpecialBlock form={viewForm} onChange={onChange} />
        </ToneCard>
      )}

      {/* §89② 배제의 예외 3종 — 각자 내부 게이트를 갖고 있어 해당 없으면 스스로 숨는다. */}
      <RightThreeYearExceptionSection form={viewForm} onChange={onChange} />
      <InheritedRightExceptionSection form={viewForm} onChange={onChange} />
      <MergedHouseholdRightSection form={viewForm} onChange={onChange} />

      {/*
        §154① 단서 — 계산기 Step4와 같은 게이트. 판정 메뉴에도 **반드시 있어야 한다**:
        없으면 해외이주·수용 등으로 거주요건이 면제되는 사람에게 「거주요건 미충족」을 낸다(§3.2-B).

        🔑 이 카드는 ② 화면으로 옮기지 않았다 — 노출 게이트(`proviso`)가 **명부 파생**
           `derivedNewHouse`에 의존하므로, 명부가 있는 이 화면에 있어야 게이트가 정확하다.
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

      {/*
        🔄 **§155의2 · §155의3 · §155⑳는 ② 양도 대상 화면으로 옮겼다** (2026-09-23).

        셋 다 양도 대상 주택 자신에 매달리고 거주기간 요건을 면제하는 특례라, 거주기간 입력이
        있는 화면에 모으는 것이 맞다. ⑧ 검증도 `validateStep3`로 함께 갔다 —
        다만 §155⑳ **이중입력 경고**만은 `validateStep2`(이 화면)에 남겼다. 그 조건이
        `form.houses.length > 0`이라 명부가 있는 화면에서만 의미가 있기 때문이다.
      */}
    </div>
  );
}
