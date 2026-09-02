import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { isMultiHouseSurchargeSuppressed, provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { classifyEupMyeon, judgeRuralHouseLocation } from "@/lib/geo/rural-house-location";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes/transfer";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { HouseCountExemptionInputs } from "./step4-sections/HouseCountExemptionInputs";
import { SurchargeJudgmentSection } from "./step4-sections/SurchargeJudgmentSection";
import { TemporaryTwoHouseSection } from "./step4-sections/TemporaryTwoHouseSection";
import { SpecialSituationSection } from "./step4-sections/SpecialSituationSection";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { RightThreeYearExceptionSection } from "@/components/calc/transfer/RightThreeYearExceptionSection";
import { InheritedRightExceptionSection } from "@/components/calc/transfer/InheritedRightExceptionSection";
import { MergedHouseholdRightSection } from "@/components/calc/transfer/MergedHouseholdRightSection";

// Step4 내부 공용 헬퍼 — 주택·입주권·분양권·재개발APT 계열 판정
// 재개발/재건축 완공 APT(시행령 §166②1호)는 신축주택 양도이므로 1세대1주택·12억 안분 등
// 주택 전용 입력 섹션 가시성을 함께 적용해야 함.
import { isHousingLike } from "@/lib/calc/housing-like-asset";

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
  const [regulatedAuto, setRegulatedAuto] = useState<{
    isRegulatedAtTransfer: boolean;
    wasRegulatedAtAcquisition: boolean;
    transferBasis: string;
    acquisitionBasis: string | null;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  // §155⑦ 농어촌주택 소재 요건 자동 판별(W-3) — 읍지역만 용도지역(도시지역) 조회가 필요하다.
  const [ruralUrbanVerdict, setRuralUrbanVerdict] = useState<
    "urban" | "non_urban" | "unknown" | null
  >(null);
  const [regulatedLoading, setRegulatedLoading] = useState(false);
  const [regulatedError, setRegulatedError] = useState<string | null>(null);
  // 수동 조작 플래그 최신값 미러 — fetch 완료 시점(비동기)에 stale closure 없이 참조
  const touchedRef = useRef({ transfer: false, acquisition: false });
  touchedRef.current = {
    transfer: form.isRegulatedAreaTouched,
    acquisition: form.wasRegulatedAtAcquisitionTouched,
  };
  const primaryKind = form.assets?.[0]?.assetKind ?? "";
  const primaryAcquisitionDate = form.assets?.[0]?.acquisitionDate ?? "";
  const primary = form.assets?.[0];

  // 비주택 → 주택 용도변경(§95⑤·⑥). 거주요건 판정의 「주택 취득일」이 주거용 사용 개시일로 바뀐다
  // (서면-2020-부동산-5098). 엔진 resolveWasRegulatedAtAcquisition과 **같은 술어·같은 기준일**을
  // 써야 화면 안내와 판정이 어긋나지 않는다.
  const conversionActive = isUsageConversionActive(primary);
  const residenceJudgmentDate = conversionActive
    ? primary!.residentialUseStartDate
    : primaryAcquisitionDate;
  /** 거주요건 맥락에서 기준일을 부르는 이름 — 라벨·안내 문구가 공유한다. */
  const judgmentDateLabel = conversionActive ? "용도변경일" : "취득일";

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

  // §154① 단서 카드 노출·맥락 — one_house(1주택)/temporary_two_house(2주택+일시적특례)/미노출 (Part B 단일 파생, store 미러링 금지)
  const proviso = useMemo(
    () =>
      provisoGate({
        isOneHousehold: form.isOneHousehold,
        isHousing: primaryKind === "housing",
        householdHousingCount: form.householdHousingCount,
        temporaryTwoHouseSpecial: form.temporaryTwoHouseSpecial,
      }),
    [form.isOneHousehold, primaryKind, form.householdHousingCount, form.temporaryTwoHouseSpecial],
  );

  // §155① 일시적 2주택 요건 자동판정 — 엔진 헬퍼 단일소스 재사용(store 미러링 금지, useMemo 파생)
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

  // 주소(또는 법정동코드)·날짜가 준비되면 조정대상지역 자동 판별
  useEffect(() => {
    if ((!primaryAddress && !primaryRegionCode) || !form.transferDate || !isHousingLike(primaryKind)) {
      setRegulatedAuto(null);
      return;
    }
    let cancelled = false;
    setRegulatedLoading(true);
    setRegulatedError(null);
    fetch("/api/address/regulated-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: primaryAddress || undefined,
        regionCode: primaryRegionCode || undefined,
        transferDate: form.transferDate,
        // 용도변경 시 주거용 사용일 기준 — 자동 판별 결과가 그대로 wasRegulatedAtAcquisition
        // 토글에 반영되므로, 여기서 취득일을 보내면 엔진 판정과 어긋난다.
        acquisitionDate: residenceJudgmentDate || undefined,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setRegulatedError("조정대상지역 판별 실패");
          setRegulatedAuto(null);
          return;
        }
        setRegulatedAuto(data);
        // 조회 결과가 바뀔 때마다 재반영 — 단, 사용자가 직접 만진 토글은 덮어쓰지 않음
        const patch: Partial<TransferFormData> = {};
        if (!touchedRef.current.transfer) patch.isRegulatedArea = data.isRegulatedAtTransfer;
        if (!touchedRef.current.acquisition) {
          patch.wasRegulatedAtAcquisition = data.wasRegulatedAtAcquisition;
        }
        if (Object.keys(patch).length > 0) onChange(patch);
      })
      .catch(() => {
        if (!cancelled) {
          setRegulatedError("조정대상지역 판별 중 네트워크 오류");
          setRegulatedAuto(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRegulatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryAddress, primaryRegionCode, form.transferDate, residenceJudgmentDate, primaryKind]);

  // §155⑦ 소재 요건 — 읍지역일 때만 용도지역을 조회한다(면지역은 도시지역 여부를 따지지 않는다).
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

  // 판정 결과는 store에 미러링하지 않는다 — 파생값은 useMemo로만 만든다.
  const ruralLocation = useMemo(
    () =>
      judgeRuralHouseLocation({
        regionCode: form.ruralHouseRegionCode || undefined,
        jibun: form.ruralHouseJibun,
        urbanVerdict: ruralUrbanVerdict ?? undefined,
      }),
    [form.ruralHouseRegionCode, form.ruralHouseJibun, ruralUrbanVerdict],
  );

  // 자동 판정 결과를 토글에 반영 — **사용자가 직접 조작한 뒤에는 덮지 않는다**(touched 가드).
  //   조정대상지역 자동판별(`isRegulatedAreaTouched`)과 동일한 패턴이다.
  //   판정 불가(unknown)일 때는 아무것도 하지 않는다 — 미충족으로 단정하지 않는다.
  useEffect(() => {
    if (form.ruralHouseLocationTouched || ruralLocation.verdict === "unknown") return;
    const auto = ruralLocation.verdict === "qualified";
    if (form.ruralHouseOutsideCapitalEupMyeon !== auto) {
      onChange({ ruralHouseOutsideCapitalEupMyeon: auto });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruralLocation.verdict, form.ruralHouseLocationTouched, form.ruralHouseOutsideCapitalEupMyeon]);

  // §155⑯ 연접 판정 — 두 코드가 모두 있을 때만 결론을 낸다(판정 불가는 표시하지 않는다).
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
        reason: "이전지의 연접 시·군 정보가 없어 자동 판정할 수 없습니다 — 입력하신 선택을 유지합니다.",
      };
    }
    return adjacent.includes(to)
      ? { ok: true, reason: "이전한 시·군과 연접한 시·군에 소재합니다 — 지역 요건 충족." }
      : {
          ok: false,
          reason: "이전한 시·군과 연접하지 않습니다 — §155⑯ 지역 요건 미충족으로 처분기한 5년이 적용되지 않습니다.",
        };
  }, [
    form.publicInstitutionRelocation,
    form.relocatedSigunguCode,
    form.newHouseSigunguCode,
  ]);

  // assetKind 변경 시 표시되지 않는 필드 값 초기화
  //   - 조정대상지역 체크박스: 주택(housing)에서만 표시 → 그 외 false
  //   - 미등기 양도: UNREGISTERED_EXCLUDED_KINDS 제외 종류에서만 표시 → 그 외 false
  useEffect(() => {
    const patch: Partial<TransferFormData> = {};
    if (primaryKind !== "housing") {
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

  // 조정대상지역 자동 판별 안내 — 주택은 섹션② 취득일 조정 토글 아래, 입주권·분양권은 최상단에 렌더
  const regulatedAutoTip = isHousingLike(primaryKind) && primaryAddress && (
    <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-xs space-y-1">
      <p className="font-medium text-blue-800 dark:text-blue-300">
        📍 조정대상지역 자동 판별 {regulatedLoading && "(조회중...)"}
      </p>
      {regulatedError && <p className="text-destructive">{regulatedError}</p>}
      {regulatedAuto && (
        <>
          <p className="text-muted-foreground">
            양도일({form.transferDate}):{" "}
            <span className={regulatedAuto.isRegulatedAtTransfer ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
              {regulatedAuto.isRegulatedAtTransfer ? "조정대상지역 ✓" : "미지정"}
            </span>{" "}
            — {regulatedAuto.transferBasis}
          </p>
          {regulatedAuto.acquisitionBasis && (
            <p className="text-muted-foreground">
              {judgmentDateLabel}({residenceJudgmentDate}):{" "}
              <span className={regulatedAuto.wasRegulatedAtAcquisition ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
                {regulatedAuto.wasRegulatedAtAcquisition ? "조정대상지역 ✓" : "미지정"}
              </span>{" "}
              — {regulatedAuto.acquisitionBasis}
            </p>
          )}
          {regulatedAuto.confidence !== "high" && (
            <p className="text-caption text-amber-700 dark:text-amber-400">
              ⚠️ 신뢰도: {regulatedAuto.confidence} — 시군구 일부만 지정된 경우 아래 체크박스를 수동 확인하세요.
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
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

          {/* 주택 수 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              세대 보유 주택 수 <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              {["1", "2", "3+"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ householdHousingCount: v === "3+" ? "3" : v })}
                  className={cn(
                    "flex-1 rounded-md border py-2 text-sm font-medium transition-colors",
                    (v === "3+" ? parseInt(form.householdHousingCount) >= 3 : form.householdHousingCount === v)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {v === "3+" ? "3채 이상" : `${v}채`}
                </button>
              ))}
            </div>
            {/* 3채 이상: 정확한 세대 보유 주택 수 — 비과세·장특(§89①3호가목 1주택 요건) 판정에 실제 주택 수 사용.
                토글 캡("3")이 4채+를 3으로 저장하면 감면·특례 배제 겹칠 때 1주택 특례를 오부여하므로 정확값을 입력받는다. */}
            {parseInt(form.householdHousingCount) >= 3 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="shrink-0 text-xs text-muted-foreground">정확한 세대 보유 주택 수</span>
                <div className="w-20">
                  <IntegerInput
                    id="household-house-count-exact"
                    value={parseInt(form.householdHousingCount) || 3}
                    onChange={(n) => onChange({ householdHousingCount: String(Math.max(3, n)) })}
                    ariaLabel="정확한 세대 보유 주택 수"
                  />
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">채</span>
              </div>
            )}
          </div>

          {/* 세대 보유 입주권 수 — right_to_move_in 자산 유형에서만 노출 (§89①4호 가목 판정) */}
          {primaryKind === "right_to_move_in" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                세대 보유 조합원입주권 수 <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground -mt-0.5">
                양도하는 입주권 자체도 포함하여 세대 전체 입주권 수를 입력하세요.
                예: 양도 대상 입주권 1개 + 다른 입주권 없음 → 1개
              </p>
              <div className="flex gap-2">
                {["0", "1", "2+"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange({ householdRightCount: v === "2+" ? "2" : v })}
                    className={cn(
                      "flex-1 rounded-md border py-2 text-sm font-medium transition-colors",
                      (v === "2+" ? form.householdRightCount === "2" : form.householdRightCount === v)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {v === "2+" ? "2개 이상" : `${v}개`}
                  </button>
                ))}
              </div>
              {/* §89①4호 가목 본문 요건 안내 */}
              {isOneHouseholdEffective && form.householdRightCount === "1" && form.householdHousingCount === "0" && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-900">
                  <p className="font-medium">1세대1입주권 비과세 요건 (양도일 현재)</p>
                  <p className="mt-0.5 text-caption leading-relaxed text-violet-800">
                    다른 주택 없음(0채) + 1입주권만(1개) + <b>분양권 미보유</b> 조건 충족.
                    자산 카드의 §⑥ 비과세 토글 ON 및 인가일 기준 보유·거주요건도 함께 확인하세요.
                  </p>
                </div>
              )}

              {/*
                세대 보유 분양권 — §89①4호 가목 「다른 주택 **또는 분양권**을 보유하지 아니할 것」.
                ④ 주택수·중과 판정 섹션은 세대 주택 2채 이상에서만 이 목록을 렌더하는데, 가목이
                요구하는 상태는 「주택 0채」라 **분양권을 선언할 경로가 전무했다**(L1-03).
                ④가 이미 렌더 중이면 중복이므로 2채 미만에서만 연다 — 값은 같은 `form.presaleRights`다.
              */}
              {parseInt(form.householdHousingCount || "0") < 2 && (
                <PresaleRightsSection
                  rights={form.presaleRights}
                  onChange={(presaleRights) => onChange({ presaleRights })}
                  showSpouseOwned={!!form.marriageDate}
                />
              )}
            </div>
          )}

        </div>
        </section>
      )}

      {/* ② 1세대1주택 비과세 판정 — 취득일 조정지역·거주기간·§154① 면제사유 (비과세 트랙) */}
      {primaryKind === "housing" && (
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

              ⚠️ 2채 이상에서는 ④의 `HousesListSection`이 같은 배열을 렌더하므로 여기서는 열지 않는다.
            */}
            {parseInt(form.householdHousingCount || "0") < 2 && (
              <PresaleRightsSection
                rights={form.presaleRights}
                onChange={(presaleRights) => onChange({ presaleRights })}
                showSpouseOwned={!!form.marriageDate}
              />
            )}

            {/*
              §89② 배제의 3년 초과 예외 — 시행령 §156의2④·§156의3③ / 시행규칙 §75①.
              권리 취득일부터 3년을 넘겨 양도한 경우에만 스스로 열린다(엔진 술어 공용).
            */}
            <RightThreeYearExceptionSection form={form} onChange={onChange} />

            {/*
              §89② 배제의 상속 권리 예외 — 시행령 §156의2⑥·⑦ · §156의3④·⑤ · ⑮.
              권리 목록에서 「상속받은 권리」를 체크한 경우에만 스스로 열린다.
            */}
            <InheritedRightExceptionSection form={form} onChange={onChange} />

            {/*
              §89② 배제의 합가 예외 — 시행령 §156의2⑧·⑨(§156의3⑥ 준용).
              🔴 주택 2채 미만이면 ③ 섹션이 렌더되지 않아 합가일 입력 경로가 아예 없다 —
                 그래서 이 카드가 그 구간에서 합가일 칸을 직접 소유한다(컴포넌트 주석 참조).
            */}
            <MergedHouseholdRightSection form={form} onChange={onChange} />

            {/* 1세대1주택 안내 배너 — 1세대 + 1채 선택 시 거주기간 입력 동기 부여 */}
            {form.isOneHousehold && form.householdHousingCount === "1" && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3 text-sm text-violet-900">
                <p className="font-medium">1세대 1주택자 적용 효과</p>
                <p className="mt-1 text-xs leading-relaxed text-violet-800">
                  보유 2년 이상 시 양도가액 12억 원까지 비과세이며, 12억 초과 고가주택 부분에 한해 과세됩니다.
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

            {/* 거주기간 — 1세대1주택 + 주택 자산일 때만 노출 */}
            {form.isOneHousehold && primaryKind === "housing" && primary && (
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
                provisoExpropriationDate={form.provisoExpropriationDate}
                provisoBusinessApprovalDate={form.provisoBusinessApprovalDate}
                provisoPreContractNoHouse={form.provisoPreContractNoHouse}
                mode={proviso.mode}
                onChange={onChange}
              />
            )}
          </div>
        </section>
      )}

      {/* ③ 일시적 2주택·합가 특례 — 보유 주택수 ≥ 2 일 때만 의미 있음 (시행령 §155 일시적 2주택은 정의상 종전+신규 2채 보유 중) */}
      {isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2 && (
        <TemporaryTwoHouseSection
          form={form}
          onChange={onChange}
          tempTwoHouseVerdict={tempTwoHouseVerdict}
          relocationRegionVerdict={relocationRegionVerdict}
          ruralLocation={ruralLocation}
          proviso={proviso}
          primaryAcquisitionDate={primaryAcquisitionDate}
        />
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
      {surchargeSuspended &&
        isHousingLike(primaryKind) &&
        parseInt(form.householdHousingCount) >= 2 && (
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
            <HouseCountExemptionInputs form={form} onChange={onChange} hideGracePeriod />
          </div>
        </section>
      )}

      {/* ④ 주택수·중과 판정 — 세대 주택 목록·감면주택 제외·양도일 조정대상지역 (중과 트랙).
          800줄 정책으로 `step4-sections/SurchargeJudgmentSection.tsx`로 분리(2026-09-02). */}
      {!surchargeSuspended &&
        (primaryKind === "housing" ||
          (isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2)) && (
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
