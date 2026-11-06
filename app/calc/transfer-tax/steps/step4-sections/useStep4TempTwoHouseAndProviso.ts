"use client";

/**
 * Step4 — §155① 일시적 2주택 두 날짜와 §154① 단서 카드 맥락(800줄 정책으로 `Step4.tsx`에서 분리, NH-14 후속).
 *
 * 일시적 2주택은 **세대 기준 폼 뷰**(`household-facts-view.ts`)로 도출한다 — 첫 자산이 토지·건물이어도 함께 양도 주택이 세대 기준 자산이면
 * 그 주택이 「양도 주택」이다(④ `buildHouseholdSpecialPayload` · ⑧ `transfer-tax-validate-step1.ts`와 같은 leaf·인자).
 * §154① 단서는 첫 자산(원래 폼)으로 본다 — 입력 칸이 첫 자산 거주 섹션 안에 있다(계획서 §4).
 */
import { useMemo } from "react";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { resolveTemporaryTwoHouse } from "@/lib/calc/household-house-count";
import { sellingHousePreviousDateOverride } from "@/lib/calc/selling-house-origin-scope";
import { primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";
import { declaredNewHouseOriginOf } from "@/lib/calc/declared-new-house-origin";
import { mergeContextOf } from "@/lib/calc/merge-house-origin";
import { temporaryTwoHouseCandidateExcludedIds } from "@/lib/calc/temp-two-house-candidate-exclusion";
import { rentalResidenceCandidateHouseIds } from "@/lib/calc/temp-two-house-candidate-exclusion";
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { resolveExemptionHousingCount } from "@/lib/calc/exemption-house-count";
import { deemedOneHouseContextDeclared } from "@/lib/calc/deemed-one-house-context";
import { rentalResidenceContextDeclared } from "@/lib/calc/deemed-one-house-context";

export function useStep4TempTwoHouseAndProviso(form: TransferFormData, householdView: TransferFormData, primaryKind: string) {
  // §155① 두 날짜 — ④(`buildHouseholdSpecialPayload`)와 같은 leaf·인자. §154① 단서 맥락과 넘겨받은
  // 사실 카드(⑯·⑱ — OH-36, 토글로 가르면 명부 도출분이 숨는다)가 함께 쓴다.
  const tempTwoHouseDates = useMemo(
    () =>
      resolveTemporaryTwoHouse({
        primaryKind: householdView.assets?.[0]?.assetKind,
        primaryAcquisitionDate: sellingHousePreviousDateOverride(householdView.assets?.[0], householdView.houses?.length) ?? primaryAcquisitionDateOf(householdView.assets?.[0]),
        houses: householdView.houses,
        transferDate: householdView.transferDate,
        legacyPrecedence: householdView.legacyHouseCountPrecedence === true,
        declaredSpecial: householdView.temporaryTwoHouseSpecial === true,
        declaredNewHouseDate: householdView.newHouseAcquisitionDate,
        declaredNewHouseOrigin: declaredNewHouseOriginOf(householdView), // 결정 #43-3 — ④와 같은 leaf
        // D1 — 조특법 제외 행 + §155②③ 상속주택 제외 행(엔진 정본 판정) — ④와 같은 leaf.
        mergeContext: mergeContextOf(householdView), // D8 — 합가 세대는 같은 쪽 안에서 짝을 고른다
        excludedHouseIds: temporaryTwoHouseCandidateExcludedIds(householdView),
        rentalResidenceHouseIds: rentalResidenceCandidateHouseIds(householdView),
      }),
    // 후보 제외가 양도일·감면주택 선언·상속 관련 세대 사실(증여·권리)까지 읽는다.
    [householdView],
  );

  // §154① 단서 카드 노출·맥락 — one_house(1주택)/temporary_two_house(2주택+일시적특례)/미노출 (Part B 단일 파생, store 미러링 금지)
  const proviso = useMemo(
    () =>
      provisoGate({
        isOneHousehold: form.isOneHousehold,
        // OH-20 — 재개발 완공APT도 §154① 단서 대상이다(④ · ⑧과 같은 술어). 시행령 §154① 단서는
        //   자산 종류를 가리지 않고 「1세대가 양도일 현재 국내에 1주택을 보유」한 경우에 걸린다.
        isHousing: isOneHouseExemptionAsset(primaryKind),
        // Q-8 — ④·⑧과 **같은 leaf**로 주택 수를 얻는다(3중 패턴). §155②③·조특법 제외 **후** 수다(S03-4).
        householdHousingCount: resolveExemptionHousingCount(form),
        temporaryTwoHouseApplies: tempTwoHouseDates !== undefined,
        // V-F4 — §155 의제(합가·⑥⑦⑧) 입력이면 2주택 이상에서도 단서 카드를 연다(④·⑧과 같은 leaf)
        deemedOneHouseContextDeclared: deemedOneHouseContextDeclared(form),
        // §155⑳ 거주주택 특례 선언이면 2주택 이상에서도 단서 카드(1호·2호가목·3호)를 연다(④·⑧과 같은 leaf)
        rentalResidenceDeclared: rentalResidenceContextDeclared(form.assets?.[0]?.rentalHousingException),
      }),
    /**
     * ⚠️ `form.houses`가 빠지면 명부를 고쳐도 이 카드가 갱신되지 않는다.
     *
     * §155① 의존(양도주택 취득일 · 신규주택 취득일 · OH-34 표식)은 `tempTwoHouseDates`가 싣는다.
     *
     * `temporary_two_house` 모드는 넘겨받은 사실 카드의 §154① 단서 행이 소비한다(OH-36).
     * 판정 메뉴 `Step2.tsx` 쪽 안전망은 `__tests__/calc/proviso-gate-roster-deps.ui.test.tsx`(PGD).
     *
     * 제외 후 주택 수(`resolveExemptionHousingCount`)는 양도일·감면주택 선언·상속 관련 세대 사실까지 읽으므로
     * 폼 전체를 의존으로 건다(`tempTwoHouseDates`와 같은 이유).
     */
    [form, primaryKind, tempTwoHouseDates],
  );

  return { tempTwoHouseDates, proviso };
}
