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
import { SaleHouseSpecialsGroup } from "@/components/calc/transfer/SaleHouseSpecialsGroup";
import { FinalHouseRestartSection } from "@/components/calc/transfer/FinalHouseRestartSection";
import { judgmentFinalHouseRestartInScope } from "@/lib/calc/final-house-restart";
import { provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { judgeRelocationRegion } from "@/lib/calc/relocation-region-verdict";
import {
  judgmentCountExclusionRowApplies,
  judgmentMarriageRentalOriginVisible,
  judgmentMergeInputVisible,
  judgmentReplacementHouseVisible,
  judgmentRightSaleMergeOwnsInput,
  judgmentTemporaryTwoHouseVisible,
} from "@/lib/calc/one-house-judgment-section-scope";
import { MergeDateSection } from "@/components/calc/transfer/MergeDateSection";
import { mergeContextOf } from "@/lib/calc/merge-house-origin";
import { ReplacementHouseSpecialBlock } from "@/app/calc/transfer-tax/steps/step4-sections/ReplacementHouseSpecialBlock";
import {
  judgmentDerivedNewHouse,
  judgmentTempTwoHouseVerdict,
} from "@/lib/calc/one-house-judgment-temp-two-house";
import { LegacyCountExclusionNotice } from "./LegacyCountExclusionNotice";
import { RentalUnitsMarriageOriginSection } from "./RentalUnitsMarriageOriginSection";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
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

  /**
   * §155① 신규 주택 — **명부에서 도출**한다(④ 변환과 같은 정본 `resolveTemporaryTwoHouse`).
   *
   * 🔑 화면과 ④ 변환이 **같은 함수**를 써야 한다. 종전에는 화면이 `form.newHouseAcquisitionDate`를
   *    직접 읽어 「화면은 요건 충족이라는데 판정은 과세」가 조용히 생길 수 있었다.
   */
  const derivedNewHouse = useMemo(() => judgmentDerivedNewHouse(form), [form]);

  // ── F-4 파생 props (계산기 Step4와 같은 leaf) ──────────────
  /**
   * §155① 요건 카드 — 조립은 ⑧ 검증과 **같은 함수**(`judgmentTempTwoHouseVerdict`)다(OH-01 A2b).
   * 거주 개월은 ④와 같은 정본(`deriveJudgmentResidenceMonths`, OH-56)을 그 안에서 쓴다.
   */
  const tempTwoHouseVerdict = useMemo(
    () => judgmentTempTwoHouseVerdict(form, derivedNewHouse),
    [form, derivedNewHouse],
  );

  /**
   * §155⑯ 연접 판정 — 증여세 부담부증여 경로와 같은 leaf(`judgeRelocationRegion` — E-1 한계 G3에서 옮겼다).
   */
  const relocationRegionVerdict = useMemo(
    () =>
      judgeRelocationRegion({
        publicInstitutionRelocation: form.publicInstitutionRelocation,
        relocatedSigunguCode: form.relocatedSigunguCode,
        newHouseSigunguCode: form.newHouseSigunguCode,
      }),
    [form.publicInstitutionRelocation, form.relocatedSigunguCode, form.newHouseSigunguCode],
  );

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

  // 조특법 주택 수 제외 — 요건을 갖춘 행만(엔진 평가기 그대로 · Q-3(b)). 머리말의 주택 수 안내용.
  const countExcludedIds = useMemo(
    // 입주권 양도면 판정에 쓰는 행 선언만(해석례 확인 조문 — ④·⑧·route와 같은 술어)
    () =>
      eligibleCountExcludedHouseIds({
        ...form,
        houses: (form.houses ?? []).map((h) =>
          judgmentCountExclusionRowApplies(form, h) ? h : { ...h, countExclusion: undefined },
        ),
      }),
    [form],
  );

  // §156의2⑤ — 일시적 2주택 섹션이 숨는 세대에서만 여기서 그린다(두 벌 방지).
  const showStandaloneReplacement =
    !judgmentTemporaryTwoHouseVisible(form) && judgmentReplacementHouseVisible(form);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="③ 보유 주택·권리"
        description={`세대가 보유한 주택과 분양권·입주권, 적용받을 특례를 입력하세요. (현재 판정 주택 수 ${houseCount}채${
          countExcludedIds.size > 0
            ? ` — 조특법으로 소유주택으로 보지 않는 ${countExcludedIds.size}채를 빼면 ${houseCount - countExcludedIds.size}채`
            : ""
        })`}
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
        // 「배우자 단독 보유」(중과 축)는 판정에 쓰이지 않는다 — 같은 사실을 합가 전 보유 쪽이 묻는다.
        hideSpouseOwned
        // 합가 칸과 같은 게이트 — 칸이 없거나 합가일이 비면 행에 묻지 않는다.
        mergeContext={judgmentMergeInputVisible(form) ? mergeContextOf(form) : undefined}
        /*
          조특법 주택 수 제외(§99의4·§98의9·보유 감면주택)는 **명부 행**에서 받는다(행 편집 ⑥ · 「특례」 배지).
          입주권 양도에도 칸은 연다(행 편집 창이 한 벌이다) — 판정에 쓰는 것은 해석례로 입주권 적용이 확인된 감면주택
          조문(§98·§98의2·§98의5·§99)뿐이고, 그 밖의 선언은 ④가 보내지 않고 배지도 달지 않으며 아래 안내가 그 사실을 말한다.
          계획서 `docs/00-pm/one-house-judgment-count-exclusion-row-link.plan.md`.
        */
        countExclusionEnabled
        countExclusionApplies={(h) => judgmentCountExclusionRowApplies(form, h)}
      />

      {!judgmentSaleIsHousing(form) &&
        (form.houses ?? []).some((h) => h.countExclusion && !judgmentCountExclusionRowApplies(form, h)) && (
          <ToneCard tone="amber">
            <p className="text-xs leading-relaxed" data-testid="right-sale-count-exclusion-unused-notice">
              조합원입주권 양도(§89①4호)에서 다른 주택 수에서 빼는 조특법 주택은 해석례로 확인된 §98·§98의2·§98의5·§99
              감면주택뿐입니다. 농어촌·고향주택(§99의4)·준공후미분양주택(§98의9) 등 그 밖의 선언은 이 판정에 쓰지 않고 다른
              주택으로 셉니다.
            </p>
          </ToneCard>
        )}

      {/* 행을 지정하지 않은 옛 세대 단위 선언 — ⑧이 막으므로 해소 경로를 함께 둔다(Q-2). */}
      {judgmentSaleIsHousing(form) && <LegacyCountExclusionNotice form={form} onChange={onChange} />}

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
            합가일은 이 섹션의 `<MergeDateSection>`이 받는다(주택 수 ≥ 2 — 계산기와 같은 자리).
            1주택 + 권리 세대는 아래 `MergedHouseholdRightSection`이 소유한다 —
            배타 규약·④⑧ 게이트는 `judgmentMergeInputVisible` 한 곳.
          */
        />
      )}

      {/*
        입주권 양도 + 다른 주택 1채 — 위 두 소유자가 모두 숨는 구간(M9). 혼인 전 배우자 쪽 주택은 §89①4호
        「다른 주택」에서 빠진다(서면-2015-부동산-1200). 배타 규약은 `judgmentRightSaleMergeOwnsInput`.
      */}
      {judgmentRightSaleMergeOwnsInput(form) && <MergeDateSection form={form} onChange={onChange} />}

      {/* 혼인합가 1199 — ②에서 선언한 장기임대주택(명부 밖)의 혼인 전 보유자. 혼인일 바로 다음에 둔다. */}
      {judgmentMarriageRentalOriginVisible(form) && <RentalUnitsMarriageOriginSection form={form} onChange={onChange} />}

      {/* §89② 배제의 예외 3종 — 각자 내부 게이트를 갖고 있어 해당 없으면 스스로 숨는다. */}
      <RightThreeYearExceptionSection form={viewForm} onChange={onChange} />
      <InheritedRightExceptionSection form={viewForm} onChange={onChange} />
      <MergedHouseholdRightSection form={viewForm} onChange={onChange} />

      {/*
        양도 대상 주택에 적용할 특례 — 2주택 이상이면 일시적 2주택 섹션 **안**의 같은 소제목이 소유한다.
        여기는 그 섹션이 숨는 1주택(+권리) 세대 몫이다. 소제목은 자식이 하나라도 뜰 때만 그린다.
      */}
      {((proviso.visible && proviso.mode === "one_house") || showStandaloneReplacement) && (
        <SaleHouseSpecialsGroup>
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
              provisoDepartureOnlyHouse={form.provisoDepartureOnlyHouse}
              provisoExpropriationDate={form.provisoExpropriationDate}
              provisoBusinessApprovalDate={form.provisoBusinessApprovalDate}
              provisoRentalLeaseResidenceMonths={form.provisoRentalLeaseResidenceMonths}
              provisoPreContractNoHouse={form.provisoPreContractNoHouse}
              rental4ho={form}
              mode={proviso.mode}
              onChange={onChange}
            />
          )}

          {/*
            §156의2⑤ 대체주택 — 일시적 2주택 섹션이 숨는 **1주택 + 조합원입주권** 세대(법령 기본 사례)
            에서는 여기서 따로 그린다(OH-05). 2주택 이상이면 위 섹션 안에 있으므로 두 벌이 되지 않게
            그 조건을 배제한다. 게이트는 ④·⑧과 같은 `judgmentReplacementHouseVisible`.
          */}
          {showStandaloneReplacement && (
            <ToneCard tone="emerald">
              <ReplacementHouseSpecialBlock form={viewForm} onChange={onChange} />
            </ToneCard>
          )}
        </SaleHouseSpecialsGroup>
      )}

      {/* OH-22 §154⑤ 단서 최종 1주택 재기산 — 명부 파생 1주택 · 2021.1.1.~2022.5.9. 양도(④·⑧과 같은 술어) */}
      {judgmentFinalHouseRestartInScope(form) && (
        <FinalHouseRestartSection
          value={form}
          acquisitionDate={form.assets[0]?.acquisitionDate}
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
