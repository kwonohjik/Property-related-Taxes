import { useEffect, useMemo } from "react";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { isMultiHouseSurchargeSuppressed, provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes/transfer";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { HouseCountExemptionInputs } from "./step4-sections/HouseCountExemptionInputs";
import { CalcCountExclusionLegacyNotice } from "./step4-sections/CalcCountExclusionLegacyNotice";
import { SurchargeJudgmentSection } from "./step4-sections/SurchargeJudgmentSection";
import { TemporaryTwoHouseSection } from "./step4-sections/TemporaryTwoHouseSection";
import { SpecialSituationSection } from "./step4-sections/SpecialSituationSection";
import { useRegulatedAreaAutoTip } from "./step4-sections/useRegulatedAreaAutoTip";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { FinalHouseRestartSection } from "@/components/calc/transfer/FinalHouseRestartSection";
import { calcFinalHouseRestartInScope } from "@/lib/calc/final-house-restart";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { ImportedOneHouseFactsCard } from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { calcReplacementHouseApplies } from "@/lib/calc/replacement-house-scope";
import { JudgmentHandoffNoticeCard } from "@/components/calc/transfer/JudgmentHandoffNoticeCard";
import { presaleRightNoHouseExceptionVisible } from "@/lib/calc/presale-right-no-house-exception-scope";
import { HouseholdHousingCountSection } from "./step4-sections/HouseholdHousingCountSection";

// Step4 내부 공용 헬퍼 — 주택·입주권·분양권·재개발APT 계열 판정
// 재개발/재건축 완공 APT(시행령 §166②1호)는 신축주택 양도이므로 1세대1주택·12억 안분 등
// 주택 전용 입력 섹션 가시성을 함께 적용해야 함.
import { isHousingLike, isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { redevSplitResidenceSupersedesStep4, redevAptHoldingStartDate } from "@/lib/calc/redev-field-scope";
import { RedevSplitResidenceNotice, SuccessorResidenceDirectHint } from "@/components/calc/transfer/RedevAptResidenceNotices";
import { houseCountInputsVisible } from "@/lib/calc/house-count-inputs-scope";
import { houseRosterRendered } from "@/lib/calc/house-count-inputs-scope";
import {
  resolveHouseholdHousingCount,
  resolveHouseholdRightCount,
  presaleRightsPatchWithConfirmClear,
  houseCountScalarLocked,
  resolveTemporaryTwoHouse,
} from "@/lib/calc/household-house-count";
import { temporaryTwoHouseSectionVisible } from "@/lib/calc/temporary-two-house-section-scope";
import { highValueThresholdForDisplay } from "@/lib/calc/high-value-threshold-display";
import { temporaryTwoHouseCandidateExcludedIds } from "@/lib/calc/temp-two-house-candidate-exclusion";
import { countExclusionRowsInScope } from "@/lib/calc/house-count-exclusion-rows";
import { mergeContextOf } from "@/lib/calc/merge-house-origin";

/**
 * 미등기 양도(「소득세법」 제104조 제3항) 토글을 **띄우지 않는** 자산 종류.
 *
 * §104③은 미등기양도자산을 「제94조제1항제1호 및 제2호에서 규정하는 자산」으로 정의한다 —
 * 1호가 토지·건물이므로 **건물·토지인 한 종류를 가리지 않는다**. 종전에는 주택·토지·건물
 * 3종만 화이트리스트로 열어 상업용건물·일반건물·재개발APT에서 입력 경로 자체가 없었다.
 *
 * 그래서 **제외 목록으로 뒤집었다** — 신규 자산 종류가 생겼을 때 조용히 빠지지 않는다.
 *
 * - `""`                            : assetKind 미선택 방어. 화이트리스트가 갖고 있던 성질이라
 *                                     블랙리스트 전환 시 명시하지 않으면 사라진다.
 * - `right_to_move_in`·`presale_right` : §94①2호 「부동산을 취득할 수 있는 권리」. 소유권이전
 *                                     등기 대상이 아니어서 「취득에 관한 등기를 하지 아니하고
 *                                     양도」가 성립하지 않는다는 종전 판단을 유지한다.
 * - `general_building`              : **자산-수준 2필드를 쓴다**(아래 GB 전용 블록). 토지·건물이
 *                                     별개 부동산·별개 등기부라 단일 boolean으로 표현할 수 없어
 *                                     `gbLandUnregistered`·`gbBuildingUnregistered`로 나눴다.
 *                                     ⇒ 폼-전역 토글은 GB에서 띄우지 않는다.
 *
 * 렌더 조건(⑤ 특수 상황)과 assetKind 전환 리셋 `useEffect`가 **이 상수를 공유**한다 —
 * 두 곳이 술어를 따로 정의하면 「화면에 없는데 폼 값은 남는」 stale 전송이 재발한다.
 */
const UNREGISTERED_EXCLUDED_KINDS: readonly string[] = [
  "",
  "right_to_move_in",
  "presale_right",
  "general_building", // 자산-수준 2필드로 대체 (폼-전역 isUnregistered 미사용)
];

const allowsUnregisteredToggle = (assetKind: string) =>
  !UNREGISTERED_EXCLUDED_KINDS.includes(assetKind);

// ============================================================
// Step 4: 보유 상황
// ============================================================
export function Step4({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const primaryKind = form.assets?.[0]?.assetKind ?? "";
  const primaryAcquisitionDate = form.assets?.[0]?.acquisitionDate ?? "";
  const primary = form.assets?.[0];

  // 비주택 → 주택 용도변경(§95⑤·⑥). 거주요건 판정의 「주택 취득일」이 주거용 사용 개시일로 바뀐다
  // (서면-2020-부동산-5098). 엔진 resolveWasRegulatedAtAcquisition과 **같은 술어·같은 기준일**을
  // 써야 화면 안내와 판정이 어긋나지 않는다.
  const conversionActive = isUsageConversionActive(primary);
  /**
   * 🔴 OH-51 — 승계조합원 완공APT의 「취득 당시」는 **준공일**이다(시행령 §162①4호). 엔진이 그 날짜로
   *    조정대상지역을 판정하는데(`transfer-tax-redevelopment-apt-exemption.ts`) 화면은 입주권
   *    취득일로 자동판별·토글을 채워, 준공일에 지정된 지역이 「미지정」으로 보였다.
   *    ⑧ 거주 구간 검증과 **같은 leaf**(`redevAptHoldingStartDate`)를 쓴다.
   */
  const successorCompletionActive =
    !conversionActive && !!primary && redevAptHoldingStartDate(primary) !== primary.acquisitionDate;
  const residenceJudgmentDate = conversionActive
    ? primary!.residentialUseStartDate
    : primary
      ? redevAptHoldingStartDate(primary)
      : primaryAcquisitionDate;
  /** 거주요건 맥락에서 기준일을 부르는 이름 — 라벨·안내 문구가 공유한다. */
  const judgmentDateLabel = conversionActive
    ? "용도변경일"
    : successorCompletionActive
      ? "준공일"
      : "취득일";
  /** OH-48 — 재개발 카드의 분리 입력이 §154① 거주기간을 대신하는가(엔진 `resolveAptResidenceMonths`와 같은 조건). */
  const redevSplitResidence = !!primary && redevSplitResidenceSupersedesStep4(primary);

  /**
   * 토지만 출자한 조합원입주권 — 1세대1주택 특례(비과세·LTHD 표2) 대상이 아니다.
   *
   *   §89①4호 본문: 「…관리처분계획의 인가일… 현재 제3호가목에 해당하는 **기존주택을 소유하는
   *     세대**」가 요건 ⇒ 토지 출자는 인가일 현재 기존주택이 없어 불성립.
   *   §95② 단서: 「1세대 1주택…에 해당하는 **자산**」 ⇒ 종전자산이 주택이 아니면 표2 진입 불가.
   *
   * 엔진도 같은 술어로 차단한다(`transfer-tax-redevelopment.ts` `isLandContributedRight`).
   * subject fallback은 API 변환·validate와 동일(미입력 시 입주권 자산 → "right").
   */
  const isLandContributedRight =
    primary?.redevOriginalAssetType === "land" &&
    (primary?.redevSubject || (primaryKind === "right_to_move_in" ? "right" : "apt")) === "right";
  /**
   * 표시용 1세대 여부 — 토지 출자 입주권이면 저장값과 무관하게 false로 보인다.
   * store에 쓰지 않는다(useEffect 미러링 금지). 엔진이 같은 술어로 무시하므로 결과와 어긋나지 않는다.
   */
  const isOneHouseholdEffective = form.isOneHousehold && !isLandContributedRight;

  const primaryAddress =
    (form.assets?.[0]?.addressRoad || form.assets?.[0]?.addressJibun) ?? "";
  // 법정동코드(주소검색 PNU 앞 10자리) — 있으면 동 단위 정밀 판정 경로
  const primaryRegionCode = form.assets?.[0]?.regionCode ?? "";

  // 메시지 ②: 조정대상지역 거주요건(2년) 미충족 — 엔진 §154① 판정과 단일 진실(useMemo 파생, store 미러링 금지).
  const residenceShortfall = useMemo(() => {
    const p = form.assets?.[0];
    const kind = p?.assetKind ?? "";
    if (kind !== "housing" || !form.isOneHousehold) return false;
    if (!form.transferDate || !p?.acquisitionDate) return false;
    // 거주기간 입력 흔적이 있을 때만 — 미입력 초기 상태의 성급한 경고 방지
    const hasResidenceInput =
      (p.residencePeriods?.length ?? 0) > 0 || !!p.residencePeriodMonthsAsset;
    if (!hasResidenceInput) return false;
    try {
      return !meetsOneHouseResidenceRequirement(buildResidenceReqInput(form), ONE_HOUSE_RESIDENCE);
    } catch {
      return false;
    }
  }, [form]);

  // 다주택 중과 한시배제(§167의3·167의10 12의2): 양도일 ∈ [2022-05-10, 2026-05-09] AND 보유 2년 이상
  // → 중과 전면배제(일반세율)이므로 ④ 주택수·중과 판정 섹션을 숨기고 안내 카드로 대체.
  // 엔진 배제 결과(determineMultiHouseSurcharge)와 동일 조건(양도일 윈도우 + 보유기간 differenceInYears)이어야 함.
  const surchargeSuspended = useMemo(
    () => isMultiHouseSurchargeSuppressed(form.transferDate, primaryAcquisitionDate),
    [form.transferDate, primaryAcquisitionDate],
  );

  // 1세대1주택 안내 배너의 고가주택 기준금액 — 양도일 기준 6억·9억·12억 (OH-65, 안내 전용)
  const highValueLabel = highValueThresholdForDisplay(form.transferDate).label;

  // §155① 두 날짜 — ④(`buildHouseholdSpecialPayload`)와 같은 leaf·인자. §154① 단서 맥락과 넘겨받은
  // 사실 카드(⑯·⑱ — OH-36, 토글로 가르면 명부 도출분이 숨는다)가 함께 쓴다.
  const tempTwoHouseDates = useMemo(
    () =>
      resolveTemporaryTwoHouse({
        primaryKind: form.assets?.[0]?.assetKind,
        primaryAcquisitionDate: form.assets?.[0]?.acquisitionDate,
        houses: form.houses,
        transferDate: form.transferDate,
        legacyPrecedence: form.legacyHouseCountPrecedence === true,
        declaredSpecial: form.temporaryTwoHouseSpecial === true,
        declaredNewHouseDate: form.newHouseAcquisitionDate,
        // D1 — 조특법 제외 행 + §155②③ 상속주택 제외 행(엔진 정본 판정) — ④와 같은 leaf.
        mergeContext: mergeContextOf(form), // D8 — 합가 세대는 같은 쪽 안에서 짝을 고른다
        excludedHouseIds: temporaryTwoHouseCandidateExcludedIds(form),
      }),
    // 후보 제외가 양도일·감면주택 선언·상속 관련 세대 사실(증여·권리)까지 읽는다.
    [form],
  );

  // §154① 단서 카드 노출·맥락 — one_house(1주택)/temporary_two_house(2주택+일시적특례)/미노출 (Part B 단일 파생, store 미러링 금지)
  const proviso = useMemo(
    () =>
      provisoGate({
        isOneHousehold: form.isOneHousehold,
        // OH-20 — 재개발 완공APT도 §154① 단서 대상이다(④ · ⑧과 같은 술어). 시행령 §154① 단서는
        //   자산 종류를 가리지 않고 「1세대가 양도일 현재 국내에 1주택을 보유」한 경우에 걸린다.
        isHousing: isOneHouseExemptionAsset(primaryKind),
        // Q-8 — ④·⑧과 **같은 leaf**로 주택 수를 얻는다(3중 패턴).
        householdHousingCount: resolveHouseholdHousingCount({
          primaryKind,
          declared: parseInt(form.householdHousingCount || "1", 10) || 0,
          houses: form.houses,
          transferDate: form.transferDate,
          legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
        }),
        temporaryTwoHouseApplies: tempTwoHouseDates !== undefined,
      }),
    /**
     * ⚠️ `form.houses`가 빠지면 명부를 고쳐도 이 카드가 갱신되지 않는다.
     *
     * §155① 의존(양도주택 취득일 · 신규주택 취득일 · OH-34 표식)은 `tempTwoHouseDates`가 싣는다.
     *
     * `temporary_two_house` 모드는 넘겨받은 사실 카드의 §154① 단서 행이 소비한다(OH-36).
     * 판정 메뉴 `Step2.tsx` 쪽 안전망은 `__tests__/calc/proviso-gate-roster-deps.ui.test.tsx`(PGD).
     */
    [
      form.isOneHousehold,
      primaryKind,
      form.householdHousingCount,
      form.houses,
      form.transferDate,
      form.legacyHouseCountPrecedence,
      tempTwoHouseDates,
    ],
  );

  /**
   * Q-8 — ① 스칼라 버튼 잠금(주택 외 housing-like 3종 전용 — 아래 위젯 참조). 명부가 정본이고
   * 선언값이 **이미 그 파생값과 같을 때만** 잠근다. `"housing"`은 항상 `houseRosterIsAuthoritative`
   * 가 참이라 이 값이 무의미하다 — 그 kind는 버튼 자체를 렌더하지 않는다(명부 필수화 PR-1).
   */
  const houseCountLocked = useMemo(
    () =>
      houseCountScalarLocked(
        primaryKind,
        form.houses,
        parseInt(form.householdHousingCount || "1", 10) || 0,
        form.transferDate,
      ),
    [primaryKind, form.houses, form.householdHousingCount, form.transferDate],
  );

  /**
   * 명부 필수화(PR-1) — 「①의 숫자 칸」 표시용 도출값. ④·⑧과 같은 leaf(`resolveHouseholdHousingCount`)
   * 를 쓴다(3중 패턴) — 표시와 엔진이 다른 값을 쓰면 drift가 생긴다(feedback_engine_result_display_drift).
   */
  const derivedHouseholdHousingCount = useMemo(
    () =>
      resolveHouseholdHousingCount({
        primaryKind,
        declared: parseInt(form.householdHousingCount || "1", 10) || 0,
        houses: form.houses,
        transferDate: form.transferDate,
        legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
      }),
    [primaryKind, form.householdHousingCount, form.houses, form.transferDate, form.legacyHouseCountPrecedence],
  );

  /**
   * 세대 보유 조합원입주권 수 — PR-D(2026-10-05) 표시용 도출값. ④·⑧과 같은
   * leaf(`resolveHouseholdRightCount`)를 쓴다(3중 패턴) — right_to_move_in 전용.
   */
  const derivedHouseholdRightCount = useMemo(
    () => resolveHouseholdRightCount(primaryKind, form.presaleRights),
    [primaryKind, form.presaleRights],
  );

  // 조정대상지역 자동 판별(주소·날짜 → API) + 안내 — 800줄 정책 분리(OH-22). 주택은 섹션② 취득일 조정
  // 토글 아래, 입주권·분양권은 최상단에 렌더.
  const regulatedAutoTip = useRegulatedAreaAutoTip({
    form,
    onChange,
    primaryKind,
    primaryAddress,
    primaryRegionCode,
    residenceJudgmentDate,
    judgmentDateLabel,
  });

  // assetKind 변경 시 표시되지 않는 필드 값 초기화
  //   - 조정대상지역 체크박스: §154① 판정 대상 자산(주택·재개발APT)에서만 표시 → 그 외 false
  //   - 미등기 양도: UNREGISTERED_EXCLUDED_KINDS 제외 종류에서만 표시 → 그 외 false
  //
  // 🔴 종전 게이트는 `primaryKind !== "housing"`이었다 (2026-09-05 정정 — **세액 변경**).
  //    재개발 신축주택도 `checkExemption` 경계에서 `housing`으로 번역돼 §154① 경로를 타는데
  //    (`transfer-tax.ts:196~200`), 이 리셋이 `wasRegulatedAtAcquisition`을 **false로 강제**했다.
  //    그러면 조정대상지역에서 취득한 재개발 신축주택도 거주요건을 면제받아 비과세가 인정된다.
  //    ⚠️ 자동판별 effect는 `isHousingLike`(4종)라 재개발APT에도 값을 **쓰고 있었다** — 즉 두
  //      effect가 서로 다른 술어로 같은 필드를 두고 다퉜다. 렌더 게이트와 같은 술어로 통일한다.
  useEffect(() => {
    const patch: Partial<TransferFormData> = {};
    if (!isOneHouseExemptionAsset(primaryKind)) {
      if (form.isRegulatedArea) patch.isRegulatedArea = false;
      if (form.wasRegulatedAtAcquisition) patch.wasRegulatedAtAcquisition = false;
      // 토글 자체가 리셋되므로 수동 조작 이력도 함께 초기화 — 재진입 시 자동판별 재개
      if (form.isRegulatedAreaTouched) patch.isRegulatedAreaTouched = false;
      if (form.wasRegulatedAtAcquisitionTouched) patch.wasRegulatedAtAcquisitionTouched = false;
    }
    // 렌더 조건과 **같은 술어**를 쓴다 — 따로 정의하면 화면에 없는 값이 엔진에 도달한다.
    if (!allowsUnregisteredToggle(primaryKind) && form.isUnregistered) {
      patch.isUnregistered = false;
    }
    // 비사업용 토지: 토글이 토지에서만 렌더되므로(아래 primaryKind === "land" 블록) 종류를 바꾸면
    // 화면에서 사라지는데 폼 값은 남는다. API 변환에도 같은 게이트가 있으나(3중 패턴), 사이드바
    // 합계·결과 표시가 폼 값을 직접 읽으므로 여기서도 정리한다.
    if (primaryKind !== "land" && (primary?.isNonBusinessLand || primary?.nblUseDetailedJudgment)) {
      patch.assets = form.assets.map((a, i) =>
        i === 0 ? { ...a, isNonBusinessLand: false, nblUseDetailedJudgment: false } : a,
      );
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // 의도적으로 onChange 의존성 제외 (안정적인 props 가정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKind]);

  /**
   * §104①4호 단서(영 §167의6) 확인 2종 — 노출 범위(`presaleRightNoHouseExceptionVisible`)를
   * 벗어나면 리셋한다. 값 자체는 ④가 `primaryKind === "presale_right"`에서만 보내므로(3중 패턴)
   * 다른 자산으로 바꾼 뒤에는 어차피 세액에 영향이 없지만, 같은 presale_right 안에서 양도일·
   * 조정대상지역·세대 주택 수를 바꿔 범위를 벗어났다가 **되돌아오면** stale `true`가 재확인 없이
   * 단서를 되살릴 수 있다 — 범위를 벗어날 때마다 지워 재확인을 요구한다.
   */
  useEffect(() => {
    if (presaleRightNoHouseExceptionVisible(form, primaryKind)) return;
    const patch: Partial<TransferFormData> = {};
    if (form.presaleRightNoOtherRight) patch.presaleRightNoOtherRight = false;
    if (form.presaleRightAgeOrSpouseMet) patch.presaleRightAgeOrSpouseMet = false;
    if (Object.keys(patch).length > 0) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKind, form.transferDate, form.isRegulatedArea, form.householdHousingCount]);

  return (
    <div className="space-y-5">
      {/*
        판정 메뉴에서 넘겨받은 사실 (P5-a) — **최상단**에 둔다.
        아래 입력란이 이미 채워져 있는 이유를 먼저 말해 주지 않으면, 사용자는 자기가 넣지 않은
        값이 들어 있는 것을 보고 버그로 읽는다.
      */}
      <ImportedOneHouseFactsCard
        facts={form.importedOneHouseFacts}
        rights={form}
        specials={form}
        replacementHouseApplies={calcReplacementHouseApplies(form)}
        temporaryTwoHouse={tempTwoHouseDates}
        provisoMode={proviso.mode}
        transferDate={form.transferDate}
      />

      {/* 조정대상지역 자동 판별 안내 — 입주권·분양권(섹션② 미노출 자산)만 최상단 */}
      {primaryKind !== "housing" && regulatedAutoTip}

      {/* 주택·입주권·분양권: 1세대 여부 + 주택 수 + 거주기간 + 조정대상지역 */}
      {isHousingLike(primaryKind) && (
        <section className="rounded-xl border border-sky-200 bg-sky-50/30 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
        <SectionHeader title="① 세대·주택 현황" />
        <div className="space-y-3">
          {/* 1세대 여부 */}
          <ToggleCard
            checked={isOneHouseholdEffective}
            onCheckedChange={(v) => onChange({ isOneHousehold: v })}
            title="1세대 해당"
            description="독립적인 생계를 유지하는 세대"
            tone="violet"
            disabled={isLandContributedRight}
            disabledReason="토지를 출자한 조합원입주권은 1세대1주택 특례(비과세·장기보유특별공제 표2) 대상이 아닙니다. 관리처분계획 인가일 현재 기존주택을 소유한 세대만 해당합니다 (소득세법 §89①4호 본문·§95② 단서)."
          />

          <HouseholdHousingCountSection
            form={form}
            onChange={onChange}
            primaryKind={primaryKind}
            derivedHouseholdHousingCount={derivedHouseholdHousingCount}
            houseCountLocked={houseCountLocked}
          />

          {/*
            세대 보유 조합원입주권 수 — right_to_move_in 자산 유형에서만 노출 (§89①4호 본문 판정).
            PR-D(2026-10-05, 계획서 §4-6 Q-20) — 숫자 칸(0/1/2+)이 아래 「분양권·입주권」 목록과
            같은 사실의 **이중 입력**이었다(V-5). 숫자 칸을 없애고 양도 대상 입주권 1개 + 목록의
            조합원입주권(`type: "redevelopment_right"`) 항목 수로 도출한다 — ④ 단건·다건과 같은
            leaf(`resolveHouseholdRightCount`, 3중 패턴).
          */}
          {primaryKind === "right_to_move_in" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">세대 보유 조합원입주권 수</label>
              <p className="text-sm" data-testid="household-right-count-derived">
                {derivedHouseholdRightCount}개
                <span className="ml-1.5 text-xs text-muted-foreground">
                  (양도하는 입주권 1개 + 아래 목록의 조합원입주권 항목 수로 자동 산정됩니다)
                </span>
              </p>
              {/* §89①4호 가목 본문 요건 안내 */}
              {isOneHouseholdEffective && derivedHouseholdRightCount === 1 && form.householdHousingCount === "0" && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-900">
                  <p className="font-medium">1세대1입주권 비과세 요건 (양도일 현재)</p>
                  <p className="mt-0.5 text-caption leading-relaxed text-violet-800">
                    다른 주택 없음(0채) + 1입주권만(1개) + <b>분양권 미보유</b> 조건 충족.
                    자산 카드의 §⑥ 비과세 토글 ON 및 인가일 기준 보유·거주요건도 함께 확인하세요.
                  </p>
                </div>
              )}

              {/*
                세대 보유 분양권·입주권 — §89①4호 가목 「다른 주택 **또는 분양권**을 보유하지
                아니할 것」 + 본문 「조합원입주권을 1개 보유한 1세대」(위 입주권 수도 이 목록에서
                도출한다). ④ 주택수·중과 판정 섹션은 세대 주택 2채 이상에서만 이 목록을 렌더하는데,
                가목이 요구하는 상태는 「주택 0채」라 **분양권을 선언할 경로가 전무했다**(L1-03).
                ④ 목록이 렌더 중이면 중복이므로 그 술어(`houseRosterRendered`)의 부정일 때만 연다 — 값은 같은 `form.presaleRights`다.
              */}
              {!houseRosterRendered(form, primaryKind) && (
                <PresaleRightsSection
                  rights={form.presaleRights}
                  onChange={(presaleRights) => onChange(presaleRightsPatchWithConfirmClear(presaleRights))}
                  showSpouseOwned={!!form.marriageDate}
                  primaryKind={primaryKind}
                  confirmed={form.householdNoPresaleRightsConfirmed}
                  onConfirmedChange={(v) => onChange({ householdNoPresaleRightsConfirmed: v })}
                />
              )}
            </div>
          )}

        </div>
        </section>
      )}

      {/* ② 1세대1주택 비과세 판정 — 취득일 조정지역·거주기간·§154① 면제사유 (비과세 트랙)
          재개발 신축주택도 §89①3호가목의 「주택」이라 같은 판정을 받는다(술어 JSDoc 참조). */}
      {isOneHouseExemptionAsset(primaryKind) && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
          <SectionHeader title="② 1세대1주택 비과세 판정" description="취득일 조정대상지역·거주기간·보유거주 요건 면제 사유를 입력하세요" />
          <div className="space-y-3">
            {/* 취득일 기준 조정대상지역 — 비과세 거주요건 판단(거주기간 입력의 전제, 원인→결과 순서) */}
            <ToggleCard
              checked={form.wasRegulatedAtAcquisition}
              onCheckedChange={(v) =>
                onChange({ wasRegulatedAtAcquisition: v, wasRegulatedAtAcquisitionTouched: true })
              }
              title={`${judgmentDateLabel} 기준 조정대상지역`}
              description={
                conversionActive
                  ? "비과세 거주요건 판단 — 주택이 된 날(주거용 사용 개시일)이 기준입니다. 해당 시 거주 2년 이상 필요"
                  : "비과세 거주요건 판단 — 해당 시 거주 2년 이상 필요"
              }
              tone="rose"
            />

            {/* 조정대상지역 자동 판별 안내 — 취득일 조정 토글의 판정 근거 (토글 직하 배치) */}
            {regulatedAutoTip}

            {/*
              세대 보유 분양권·조합원입주권 — 「소득세법」 §89②.
              「1세대가 주택과 조합원입주권 또는 분양권을 보유하다가 **그 주택을 양도**하는 경우에는
              제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다」 ⇒ 1세대1주택 비과세 판정의
              **직접 입력**이다. 같은 값이 §104⑦ 중과 주택 수에도 쓰인다(`form.presaleRights` 공용).

              ⚠️ ④의 `HousesListSection`이 렌더 중이면(`houseRosterRendered`) 같은 배열이 두 벌이 되므로 열지 않는다.
            */}
            {!houseRosterRendered(form, primaryKind) && (
              <PresaleRightsSection
                rights={form.presaleRights}
                onChange={(presaleRights) => onChange(presaleRightsPatchWithConfirmClear(presaleRights))}
                showSpouseOwned={!!form.marriageDate}
                primaryKind={primaryKind}
                confirmed={form.householdNoPresaleRightsConfirmed}
                onConfirmedChange={(v) => onChange({ householdNoPresaleRightsConfirmed: v })}
              />
            )}

            {/*
              §89② 배제의 세 예외(3년 초과 · 상속 권리 · 합가)는 **판정 메뉴로 이관**됐다 (P6-a).
              `app/calc/one-house-exemption/steps/Step2.tsx:218-220`이 **같은 컴포넌트**를 렌더한다 —
              복제가 아니라 마운트 지점만 옮긴 것이다.

              🔑 **값은 폼에 그대로 남는다.** 13필드가 `TransferFormData` flat이고 ④가 계속
                 읽으므로(`transfer-tax-api.ts:514·524·526·527` · `-helpers.ts:379·428`),
                 P6 이전에 저장한 이력을 다시 열어도 **세액이 같다**(OH-21).
                 넘겨받은 값은 아래 읽기 전용 요약이 보여 준다.
            */}

            {/* 1세대1주택 안내 배너 — 1세대 + 1채 선택 시 거주기간 입력 동기 부여 */}
            {form.isOneHousehold && form.householdHousingCount === "1" && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3 text-sm text-violet-900">
                <p className="font-medium">1세대 1주택자 적용 효과</p>
                <p className="mt-1 text-xs leading-relaxed text-violet-800">
                  보유 2년 이상 시 양도가액 {highValueLabel} 원까지 비과세이며, {highValueLabel} 초과 고가주택 부분에 한해 과세됩니다.
                  {conversionActive ? (
                    <>
                      {" "}거주 2년 이상이면 장기보유특별공제가 「소득세법」 제95조 제5항에 따라
                      <strong> 비주택 기간은 표1(2%/년), 주택 기간은 표2(4%/년)</strong>로 나누어 적용되며,
                      두 기간의 보유분 합계는 <strong>40%가 한도</strong>입니다. 거주분(4%/년, 40% 한도)은 별도로 더합니다.
                    </>
                  ) : (
                    " 거주 2년 이상이면 장기보유특별공제가 표2(보유 4%/년 + 거주 4%/년, 최대 80%)로 적용됩니다."
                  )}
                  {primaryKind === "housing"
                    ? " 아래 거주기간 입력이 표2 판정에 사용됩니다. (겸용주택 포함)"
                    : ""}
                </p>
              </div>
            )}

            {/* 거주기간 — 1세대1주택 + §154① 판정 대상 자산일 때 노출.
                ④(`transfer-tax-api.ts:399`)는 `residencePeriodMonths`를 자산종류 게이트 없이
                보내므로 이 게이트가 **유일한 입력 통제점**이다 — 조정대상지역 토글과 짝이라
                한쪽만 열면 「거주 2년 필요」라 안내하고 채울 칸이 없는 dead-end가 된다. */}
            {/* OH-48 — 분리 입력이 있으면 엔진은 그것만 읽는다. 같은 질문을 두 번 받지 않도록 안내로 대체. */}
            {form.isOneHousehold && isOneHouseExemptionAsset(primaryKind) && primary && redevSplitResidence && (
              <RedevSplitResidenceNotice isSuccessor={primary.redevIsSuccessorMember === "yes"} />
            )}
            {form.isOneHousehold && isOneHouseExemptionAsset(primaryKind) && primary && !redevSplitResidence && (
              <ResidencePeriodSection
                residenceInputMode={primary.residenceInputMode}
                residencePeriods={primary.residencePeriods}
                residencePeriodMonthsAsset={primary.residencePeriodMonthsAsset}
                transferDate={form.transferDate}
                onChange={(patch) =>
                  onChange({
                    assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)),
                  })
                }
              />
            )}

            {/* C-10b — direct 모드는 거주기간이 스칼라라 주택 기간으로 자동 클램프할 수 없다.
                자동 안분 fallback 금지 원칙에 따라 안내로만 처리한다. */}
            {conversionActive &&
              form.isOneHousehold &&
              primaryKind === "housing" &&
              primary?.residenceInputMode === "direct" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">⚠️ 주거용 사용 개시일 이후의 거주기간만 입력하세요</p>
                  <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
                    거주기간을 개월 수로 직접 입력하셨습니다. 「소득세법」 제95조 제5항 제2호는
                    <strong> 주택으로 보유한 기간 중 거주한 기간</strong>만 산입하므로,
                    주거용 사용 개시일({primary.residentialUseStartDate}) 이후의 거주기간만 입력해야 합니다.
                    입주일·퇴거일 구간으로 입력하면 자동으로 잘라 계산합니다.
                  </p>
                </div>
              )}

            {/* OH-50 — 승계조합원 개월 수 직접 입력 안내(구간 입력은 ⑧이 준공일과 비교해 막는다 · 개월 수는 준공일~양도일 상한만 ⑧ — I-8). */}
            {successorCompletionActive &&
              form.isOneHousehold &&
              !redevSplitResidence &&
              primary?.residenceInputMode === "direct" && (
                <SuccessorResidenceDirectHint completionDate={residenceJudgmentDate} />
              )}

            {/* 메시지 ② 거주요건 불충족 — 엔진 §154① 판정과 일치 (단서면제·2017.8.3 이전 취득 자동 제외) */}
            {residenceShortfall && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-2 text-xs text-rose-900">
                <p className="font-medium">⚠️ 조정대상지역 거주요건(2년) 불충족</p>
                <p className="mt-0.5 text-caption leading-relaxed text-rose-800">
                  {conversionActive ? "용도변경 당시" : "취득 당시"} 조정대상지역 주택은 2년 이상
                  거주해야 1세대1주택 비과세가 적용됩니다.
                  현재 거주기간으로는 비과세가 배제될 수 있습니다.
                </p>
              </div>
            )}

            {/* §154① 단서 — 1주택 맥락(one_house)일 때만 섹션② (일시적 2주택은 §155 특례 섹션③ 아래로 배치) */}
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

            {/* OH-22 §154⑤ 단서 최종 1주택 재기산 — 2021.1.1.~2022.5.9. 양도 1주택만(④·⑧과 같은 술어) */}
            {calcFinalHouseRestartInScope(form) && (
              <FinalHouseRestartSection value={form} acquisitionDate={primary?.acquisitionDate} onChange={onChange} />
            )}
          </div>
        </section>
      )}

      {/* ③ 보유 주택수 ≥ 2 일 때만 의미 있음 (시행령 §155 일시적 2주택은 정의상 종전+신규 2채 보유 중).
          게이트는 ④ 전송·⑧ 검증과 **같은 술어**다 — 종전에는 세 층이 각자 달라 양방향으로 어긋났다.

          🔑 P6-b — `mode="calc"`는 **§155⑧ + 합가**만 그린다. 나머지(§155①⑥⑦⑯·§156의2⑤·
             §154① 단서)는 판정 메뉴가 소유한다. 가르는 기준은 **중과 배제의 근거 조문**이다 —
             15호는 §154① 충족을 요구하므로 비과세 판정을 경유하고, 4호·§167의3⑨는 요구하지
             않아 비과세를 주장할 수 없는 세대도 입력이 필요하다(`TemporaryTwoHouseSection` 상단 표). */}
      {temporaryTwoHouseSectionVisible({
        primaryAssetKind: primaryKind,
        householdHousingCount: form.householdHousingCount,
      }) && (
        <>
          <TemporaryTwoHouseSection form={form} onChange={onChange} mode="calc" />
          <JudgmentHandoffNoticeCard form={form} />
        </>
      )}

      {/* ④ 중과 한시배제 기간 → 중과 판정 섹션 대신 안내 카드 (침묵 숨김 금지) */}
      {surchargeSuspended && isHousingLike(primaryKind) && (
        <ToneCard
          tone="sky"
          title="다주택 중과 한시 배제기간 (일반세율 적용)"
          titleExtra={
            <LawArticleModal legalBasis="소득세법 시행령 §167의3" label="§167의3·167의10 12의2" />
          }
        >
          <p
            data-testid="surcharge-suspended-notice"
            className="text-xs leading-relaxed text-sky-800 dark:text-sky-300"
          >
            양도일이 다주택 중과 한시 배제기간(2022-05-10~2026-05-09)에 해당하고 보유기간이 2년 이상이어서
            조정대상지역 다주택이라도 <b>일반세율</b>이 적용됩니다. 중과 전용 입력(<b>양도일 기준 조정대상지역</b>·중과 경과조치 조건)은
            계산에 영향이 없어 생략됩니다.
            다만 <b>비과세 판정</b>에 쓰이는 입력(세대 보유 주택 목록·분양권·상속주택·감면주택 주택수 제외)은
            이 기간에도 아래에 그대로 제공됩니다.
          </p>
        </ToneCard>
      )}

      {/*
        🔴 D4-03 — 한시배제 기간에도 **감면주택 주택수 제외**는 선언할 수 있어야 한다.

        조특법 §98의2④·§98의3③·§98의5②·§98의6②·§98의7②·§98의8②·§99②·§99의2②는 모두
        「**소득세법 제89조제1항제3호를 적용할 때** … 소유주택으로 보지 아니한다」로,
        §104⑦ 중과가 아니라 **1세대1주택 비과세** 판정을 바꾼다. 그런데 이 섹션의 유일한
        입력 위젯이 아래 ④(중과 트랙) 게이트 안에 있어, 한시배제 창(2022-05-10~2026-05-09)
        안의 양도에서는 **선언할 경로 자체가 사라졌다** → 유효 주택수가 2로 남아 12억 비과세를
        통째로 잃었다(실측: 양도 10억·취득 5억·2014-01-01 취득·2025-06-01 양도·§98의3
        감면주택 1채 기준 선언 시 세액 0 ↔ 미선언 시 141,966,000원).

        바로 위 §89②(분양권 축) 주석이 같은 문제를 이미 인정하고 그 축만 ②로 옮겼는데,
        형제인 감면주택 제외는 남아 있었다. 여기서는 ④의 조건(`isHousingLike && ≥2채`)을
        **그대로 유지**한 채 한시배제 분기에만 같은 위젯을 연다 — ④와 동시에 뜨지 않으므로
        같은 배열을 두 컴포넌트가 각각 patch하는 last-write-wins 위험이 없다.
      */}
      {/* 🔴 「담긴 값이 있으면」도 연다 (2026-09-07 대장 재대조 — `houseCountInputsVisible`).
          주택 목록에 빈 행을 남긴 채 주택수를 1채로 낮추면 위젯이 사라지는데 ⑧은 그 행을
          계속 검증해 지울 화면이 없는 dead-end가 됐다. ⑧의 skip은 D4-03에서 이미 걷어낸
          것이므로(무검증 통과 비대칭) 고칠 곳은 렌더 게이트다. */}
      <CalcCountExclusionLegacyNotice form={form} onChange={onChange} />
      {surchargeSuspended && houseRosterRendered(form, primaryKind) && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
          <SectionHeader
            title="④ 주택수 판정 (비과세)"
            description="세대 보유 주택·분양권·상속주택·감면주택은 1세대1주택 비과세 판정의 주택수를 바꿉니다 — 중과 한시배제와 무관합니다"
          />
          <div className="space-y-3">
            {/*
              🔴 §155②③ — 한시배제 창에서 상속주택 선언 경로가 사라져 있었다.

              「소득세법 시행령」 §155②·③은 「제154조제1항을 적용할 때 … 국내에 1개의 주택을
              소유하고 있는 것으로 본다」로 **§89①3호 비과세** 판정을 바꾼다. §104⑦ 중과와는
              층위가 다르다. 그런데 `houses[]`의 유일한 입력 위젯인 `HousesListSection`이
              ④(중과 트랙) 게이트 안에 있어, 한시배제 창(2022-05-10~2026-05-09) 안의
              양도에서는 `isInherited`를 켤 칸 자체가 없었다 → 유효 주택수가 2로 남아
              12억 비과세를 통째로 잃었다(실측: 양도 10억·취득 5억·2014-01-01 취득·
              2025-06-01 양도·상속주택 1채 → 선언 시 총부담 0 ↔ 미선언 시 141,966,000원).

              같은 게이트가 `presaleRights`도 가둔다 — 「소득세법」 §89②(주택 + 권리 보유 세대의
              주택 양도 → §89①3호 배제) 역시 비과세 축이다. ② 섹션은 `< 2`에서만 열므로
              2채 이상 + 한시배제에서는 선언 경로가 없었다.

              ④와 이 분기는 `surchargeSuspended`로 **배타**라 같은 배열을 두 컴포넌트가
              각각 patch하는 last-write-wins 위험이 없다(D4-03과 동일 논거). 두 분기가 같은 JSX를
              복제해 한쪽만 고쳐 갈라지는 것이 이 결함의 원인이었으므로 3종은
              `HouseCountExemptionInputs` 한 곳에 모았다.

              여기서 열지 않는 것은 **중과 전용** 둘뿐이다 —
                · 양도일 기준 조정대상지역 (이 분기에 없음)
                · 중과 경과조치 나·다목 (`hideGracePeriod`) — 창 안에서는
                  `checkGracePeriodExemption`의 가목 우선 게이트가 내용과 무관하게
                  `suspended: true`를 내므로 **증명 가능한 no-op**이다.
                  ⑧ validate도 같은 조건으로 건너뛴다(보이지 않는 필드 차단 방지).
            */}
            <HouseCountExemptionInputs
              form={form}
              onChange={onChange}
              hideGracePeriod
              countExclusionEnabled={countExclusionRowsInScope(primaryKind)}
              // §155④⑤ 합가 전 소유 쪽 — 판정 메뉴와 같은 파생(합가일 없으면 undefined, PR-2).
              mergeContext={mergeContextOf(form)}
            />
          </div>
        </section>
      )}

      {/* ④ 주택수·중과 판정 — 세대 주택 목록·감면주택 제외·양도일 조정대상지역 (중과 트랙).
          800줄 정책으로 `step4-sections/SurchargeJudgmentSection.tsx`로 분리(2026-09-02). */}
      {!surchargeSuspended && houseCountInputsVisible(form, primaryKind) && (
        <SurchargeJudgmentSection
          form={form}
          onChange={onChange}
          primaryKind={primaryKind}
          primaryAcquisitionDate={primaryAcquisitionDate}
        />
      )}

      {/* ⑤ 특수 상황 — 중과·배제 트리거 (비과세 특례 이후 위치).
          800줄 정책으로 `step4-sections/SpecialSituationSection.tsx`로 분리(2026-08-11). */}
      <SpecialSituationSection
        form={form}
        onChange={onChange}
        primaryKind={primaryKind}
        showFormLevelUnregistered={allowsUnregisteredToggle(primaryKind)}
      />
    </div>
  );
}
