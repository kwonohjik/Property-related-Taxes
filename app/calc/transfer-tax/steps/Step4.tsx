import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { isMultiHouseSurchargeSuppressed, provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import {
  ONE_HOUSE_RESIDENCE,
  SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW,
  isWithinSurchargeSuspensionWindow,
} from "@/lib/tax-engine/legal-codes/transfer";
import { DateInput } from "@/components/ui/date-input";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
import { HousesListSection } from "./step4-sections/HousesListSection";
import { MergeDateSection } from "./step4-sections/MergeDateSection";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { SpecialHouseExclusionSection } from "@/components/calc/transfer/SpecialHouseExclusionSection";

// Step4 내부 공용 헬퍼 — 주택·입주권·분양권·재개발APT 계열 판정
// 재개발/재건축 완공 APT(시행령 §166②1호)는 신축주택 양도이므로 1세대1주택·12억 안분 등
// 주택 전용 입력 섹션 가시성을 함께 적용해야 함.
// 한시배제 종료일 표시 문자열 — 상수 단일 출처에서 파생(재연장 개정 시 문구 자동 추종, 하드코딩 금지)
const SUSPENSION_END_KO = (() => {
  const [y, m, d] = SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end.split("-");
  return `${y}.${Number(m)}.${Number(d)}.`;
})();

const isHousingLike = (pt: string) =>
  pt === "housing" ||
  pt === "right_to_move_in" ||
  pt === "presale_right" ||
  pt === "redevelopment_apt";

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
        acquisitionDate: primaryAcquisitionDate || undefined,
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
  }, [primaryAddress, primaryRegionCode, form.transferDate, primaryAcquisitionDate, primaryKind]);

  // assetKind 변경 시 표시되지 않는 필드 값 초기화
  //   - 조정대상지역 체크박스: 주택(housing)에서만 표시 → 그 외 false
  //   - 미등기 양도: 토지·건물·주택에서만 표시 → 그 외 false
  useEffect(() => {
    const patch: Partial<TransferFormData> = {};
    if (primaryKind !== "housing") {
      if (form.isRegulatedArea) patch.isRegulatedArea = false;
      if (form.wasRegulatedAtAcquisition) patch.wasRegulatedAtAcquisition = false;
      // 토글 자체가 리셋되므로 수동 조작 이력도 함께 초기화 — 재진입 시 자동판별 재개
      if (form.isRegulatedAreaTouched) patch.isRegulatedAreaTouched = false;
      if (form.wasRegulatedAtAcquisitionTouched) patch.wasRegulatedAtAcquisitionTouched = false;
    }
    const allowsUnregistered =
      primaryKind === "housing" ||
      primaryKind === "land" ||
      primaryKind === "building";
    if (!allowsUnregistered && form.isUnregistered) {
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
              취득일({primaryAcquisitionDate}):{" "}
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
            checked={form.isOneHousehold}
            onCheckedChange={(v) => onChange({ isOneHousehold: v })}
            title="1세대 해당"
            description="독립적인 생계를 유지하는 세대"
            tone="violet"
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
              {form.isOneHousehold && form.householdRightCount === "1" && form.householdHousingCount === "0" && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-900">
                  <p className="font-medium">1세대1입주권 비과세 요건 (양도일 현재)</p>
                  <p className="mt-0.5 text-caption leading-relaxed text-violet-800">
                    다른 주택 없음(0채) + 1입주권만(1개) 조건 충족.
                    자산 카드의 §⑥ 비과세 토글 ON 및 인가일 기준 보유·거주요건도 함께 확인하세요.
                  </p>
                </div>
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
              title="취득일 기준 조정대상지역"
              description="비과세 거주요건 판단 — 해당 시 거주 2년 이상 필요"
              tone="rose"
            />

            {/* 조정대상지역 자동 판별 안내 — 취득일 조정 토글의 판정 근거 (토글 직하 배치) */}
            {regulatedAutoTip}

            {/* 1세대1주택 안내 배너 — 1세대 + 1채 선택 시 거주기간 입력 동기 부여 */}
            {form.isOneHousehold && form.householdHousingCount === "1" && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3 text-sm text-violet-900">
                <p className="font-medium">1세대 1주택자 적용 효과</p>
                <p className="mt-1 text-xs leading-relaxed text-violet-800">
                  보유 2년 이상 시 양도가액 12억 원까지 비과세이며, 12억 초과 고가주택 부분에 한해 과세됩니다.
                  거주 2년 이상이면 장기보유특별공제가 표2(보유 4%/년 + 거주 4%/년, 최대 80%)로 적용됩니다.
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

            {/* 메시지 ② 거주요건 불충족 — 엔진 §154① 판정과 일치 (단서면제·2017.8.3 이전 취득 자동 제외) */}
            {residenceShortfall && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-2 text-xs text-rose-900">
                <p className="font-medium">⚠️ 조정대상지역 거주요건(2년) 불충족</p>
                <p className="mt-0.5 text-caption leading-relaxed text-rose-800">
                  취득 당시 조정대상지역 주택은 2년 이상 거주해야 1세대1주택 비과세가 적용됩니다.
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
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <SectionHeader title="③ 일시적 2주택·합가 특례" description="종전 주택 보유 중 신규 주택 취득 후 일정 기간 내 양도 시 비과세 특례" />
          <div className="space-y-3">
            <p className="text-sm font-medium">일시적 2주택 특례</p>
            <ToggleCard
              checked={form.temporaryTwoHouseSpecial}
              onCheckedChange={(v) =>
                onChange({
                  temporaryTwoHouseSpecial: v,
                  newHouseAcquisitionDate: v ? form.newHouseAcquisitionDate : "",
                })
              }
              title="일시적 2주택 특례 해당"
              description="종전 주택 보유 중 신규 주택 취득 후 일정 기간(보통 3년) 내 종전 주택 양도 시 비과세"
              tone="emerald"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">종전 주택 취득일</label>
                  <DateInput value={primaryAcquisitionDate} disabled onChange={() => {}} />
                  <p className="text-xs text-muted-foreground">
                    지금 양도하는 주택의 취득일에서 자동 반영 (1단계에서 입력)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    신규 주택 취득일 <span className="text-destructive">*</span>
                  </label>
                  <DateInput
                    value={form.newHouseAcquisitionDate}
                    onChange={(v) => onChange({ newHouseAcquisitionDate: v })}
                  />
                  <p className="text-xs text-muted-foreground">새로 취득한 주택의 취득일</p>
                </div>
              </div>
            </ToggleCard>

            {/* §155① 요건 자동판정 카드 — 엔진 헬퍼 단일소스(judgeTempTwoHouseFromForm), 특례 토글 직하 배치 */}
            {form.temporaryTwoHouseSpecial && (
              <ToneCard
                tone={
                  tempTwoHouseVerdict.status === "eligible"
                    ? "emerald"
                    : tempTwoHouseVerdict.status === "ineligible"
                      ? "amber"
                      : "rose"
                }
                title={
                  tempTwoHouseVerdict.status === "eligible"
                    ? "일시적 2주택 특례 요건 충족"
                    : tempTwoHouseVerdict.status === "ineligible"
                      ? "일시적 2주택 특례 요건 미충족"
                      : "요건 자동 판정 대기"
                }
              >
                <div data-testid="temp-two-house-verdict" className="space-y-1 text-xs">
                  {tempTwoHouseVerdict.status === "pending" ? (
                    <p>양도 자산 취득일·신규 주택 취득일·양도일을 입력하면 요건을 자동 판정합니다.</p>
                  ) : (
                    <>
                      <p>
                        {tempTwoHouseVerdict.oneYearMet ? "충족" : "미충족"} · 요건 A — 종전주택 취득 후 1년 경과 후 신규주택 취득
                        {tempTwoHouseVerdict.oneYearWaived
                          ? " (§154① 단서 사유로 1년 요건 면제)"
                          : ` (1년 경과일 ${tempTwoHouseVerdict.oneYearThreshold.toISOString().slice(0, 10)})`}
                      </p>
                      <p>
                        {tempTwoHouseVerdict.threeYearMet ? "충족" : "미충족"} · 요건 B — 신규주택 취득일부터 3년 내 종전주택 양도
                        {` (처분기한 ${tempTwoHouseVerdict.deadline.toISOString().slice(0, 10)})`}
                      </p>
                      <p className="text-caption">
                        최종 비과세 여부는 계산 결과에서 확정됩니다(조정지역 종전 처분기한 등 반영).
                      </p>
                    </>
                  )}
                </div>
              </ToneCard>
            )}

            {/* §154① 단서 — 일시적 2주택(temporary_two_house) 맥락: 종전주택 §155①→§154①1·2가·3호 준용 (판정 카드 아래 배치) */}
            {proviso.visible && proviso.mode === "temporary_two_house" && (
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

            {/* §156의2⑤ 대체주택 비과세 특례 */}
            <p className="text-sm font-medium mt-1">재개발·재건축 대체주택 특례</p>
            <ToggleCard
              checked={form.replacementHouseSpecial}
              onCheckedChange={(v) =>
                onChange({
                  replacementHouseSpecial: v,
                  replBusinessApprovalDate: v ? form.replBusinessApprovalDate : "",
                  replCompletionDate: v ? form.replCompletionDate : "",
                  replResidenceMonths: v ? form.replResidenceMonths : "",
                  replWillResideNewHouse: v ? form.replWillResideNewHouse : false,
                })
              }
              title="대체주택 비과세 특례 해당 (§156의2⑤)"
              description="재개발·재건축 시행기간 중 거주하기 위해 취득한 대체주택 양도 시 1세대1주택 의제"
              tone="emerald"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    사업시행계획인가일 <span className="text-destructive">*</span>
                  </label>
                  <DateInput
                    value={form.replBusinessApprovalDate}
                    onChange={(v) => onChange({ replBusinessApprovalDate: v })}
                  />
                  <p className="text-xs text-muted-foreground">재개발·재건축 조합의 사업시행인가를 받은 날</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    신축주택 준공일 <span className="text-destructive">*</span>
                  </label>
                  <DateInput
                    value={form.replCompletionDate}
                    onChange={(v) => onChange({ replCompletionDate: v })}
                  />
                  <p className="text-xs text-muted-foreground">재개발·재건축으로 완성된 신축주택의 사용승인일</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    대체주택 거주개월수 <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.replResidenceMonths}
                    onChange={(e) =>
                      onChange({ replResidenceMonths: e.target.value.replace(/[^0-9]/g, "") })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">대체주택에 실제 거주한 총 개월수 (1년 이상 = 12개월 이상)</p>
                </div>
              </div>
              <ToggleCard
                checked={form.replWillResideNewHouse}
                onCheckedChange={(v) => onChange({ replWillResideNewHouse: v })}
                title="신축주택 1년 이상 거주 예정 (자기선언)"
                description="신축주택 완성 후 3년 내 세대전원 이사 및 1년 이상 거주할 것을 확인합니다 (§156의2⑤③)"
                tone="violet"
              />
              {/* 사후관리 경고 카드 (§156의2⑬) */}
              <div className="rounded-lg border border-rose-300 bg-rose-50/60 px-4 py-3 text-xs leading-relaxed text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                <p className="font-semibold text-rose-800 dark:text-rose-300">사후관리 주의 (소득세법 시행령 §156의2⑬)</p>
                <p className="mt-1">
                  신축주택 완성 후 3년(2023.1.12 이후 양도분) 내 세대전원 이사·1년 이상 거주하지 못하고
                  신축주택을 양도하면 비과세받은 세액이 추징됩니다.
                  추징세액은 해당 사유가 발생한 과세연도에 신고·납부해야 합니다.
                </p>
              </div>
            </ToggleCard>

            <MergeDateSection form={form} onChange={onChange} />
          </div>
        </section>
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
            조정대상지역 다주택이라도 <b>일반세율</b>이 적용됩니다. 다주택 중과 관련 입력(세대 보유 주택 목록·
            양도일 조정대상지역 등)은 계산에 영향이 없어 생략됩니다.
          </p>
        </ToneCard>
      )}

      {/* ④ 주택수·중과 판정 — 세대 주택 목록·감면주택 제외·양도일 조정대상지역 (중과 트랙) */}
      {!surchargeSuspended &&
        (primaryKind === "housing" ||
          (isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2)) && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
          <SectionHeader title="④ 주택수·중과 판정" description="세대 전체 보유 주택·양도일 조정대상지역으로 다주택 중과를 판정합니다" />
          <div className="space-y-3">
            {/* 세대 보유 주택 목록 + 분양권 + 감면주택 주택수 제외 (시행령 §167의3 주택 수 산정) */}
            {isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2 && (
              <>
                <HousesListSection form={form} onChange={onChange} />
                {/* 조특법 감면주택 주택수 제외 (§89③3호 의제) */}
                <SpecialHouseExclusionSection
                  items={form.specialHouseExclusions ?? []}
                  onChange={(items) => onChange({ specialHouseExclusions: items })}
                />
                {/* §155② 상속주택 특례 — 상속주택 존재 시 일반주택 양도 비과세(주택수 자동 제외). 2년내 증여분 게이트 */}
                {form.houses?.some((h) => h.isInherited) && (
                  <ToggleCard
                    variant="card"
                    tone="rose"
                    title="양도주택이 상속개시 2년내 피상속인 증여분"
                    description="§155② 상속주택 특례에서 일반주택(양도 대상)이 상속개시일부터 2년 내 피상속인으로부터 증여받은 주택이면 특례가 배제됩니다. 해당 시 체크하세요."
                    checked={form.generalHouseGiftedFromDecedentWithin2yr}
                    onCheckedChange={(v) => onChange({ generalHouseGiftedFromDecedentWithin2yr: v })}
                  />
                )}
              </>
            )}

            {/* 양도일 기준 조정대상지역 — 중과세 판단 기준 (주택 전용) */}
            {primaryKind === "housing" && (
              <ToggleCard
                checked={form.isRegulatedArea}
                onCheckedChange={(v) => onChange({ isRegulatedArea: v, isRegulatedAreaTouched: true })}
                title="양도일 기준 조정대상지역"
                description="중과세 판단 기준"
                tone="rose"
              />
            )}

            {/* 메시지 ① 중과 검토 안내 — 주택 + 양도시 조정대상이면 항상(1주택 포함, 단순 주의환기).
                한시배제 충족(B1: surchargeSuspended)이면 ④ 섹션 자체가 sky 안내 카드로 대체되어 이 팁은
                미도달 — 여기서는 B2(윈도우 내·보유 2년 미만)·B3(종료일 이후)의 혼선만 보강.
                (plan: step4-regulated-tip-surcharge-suspension) */}
            {primaryKind === "housing" && form.isRegulatedArea && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-900">
                <p className="font-medium">⚠️ 양도일 현재 조정대상지역</p>
                <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
                  조정대상지역 주택 양도는 중과세 적용 여부를 검토하세요.
                </p>
                {/* B2: 양도일은 한시배제 윈도우 내이나 보유 2년 미만 (충족 시 섹션 대체로 미도달) */}
                {isWithinSurchargeSuspensionWindow(form.transferDate) && !!primaryAcquisitionDate && (
                  <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
                    보유 2년 미만은 다주택 중과 한시배제(§167의3①12의2) 대상이 아닙니다(단기양도세율과
                    비교 적용).
                  </p>
                )}
                {/* B3: 양도일이 한시배제 종료일 이후 — 계약·허가 기반 경과조치 가능성 안내(자동판정 미지원) */}
                {!!form.transferDate &&
                  form.transferDate > SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end && (
                    <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
                      {SUSPENSION_END_KO}까지 매매계약 체결(계약금 수령)·토지거래허가 신청분은
                      경과조치로 중과가 배제될 수 있습니다(§167의3①12의2 나·다, §167의10①12의2 나·다).
                      아래 ④ 중과 판정 &gt; 중과 경과조치 조건 입력에서 나·다목을 판정합니다.
                    </p>
                  )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ⑤ 특수 상황 — 중과·배제 트리거 (비과세 특례 이후 위치) */}
      <section className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
      <SectionHeader title="⑤ 특수 상황" description="미등기·비사업용 토지·다주택 중과 해당 여부를 확인하세요" />
      <div className="space-y-2">
        {/* 미등기 양도 — 주택·토지·건물만 표시 (입주권·분양권은 등기 개념 없음) */}
        {(primaryKind === "housing" ||
          primaryKind === "land" ||
          primaryKind === "building") && (
          <ToggleCard
            checked={form.isUnregistered}
            onCheckedChange={(v) => onChange({ isUnregistered: v })}
            title="미등기 양도"
            description="70% 단일세율 적용 — 장기보유공제·기본공제 전액 배제"
            tone="rose"
          />
        )}

        {primaryKind === "land" && primary && (
          <ToggleCard
            checked={primary.isNonBusinessLand ?? false}
            onCheckedChange={(v) =>
              onChange({
                assets: form.assets.map((a, i) =>
                  i === 0
                    ? {
                        ...a,
                        isNonBusinessLand: v,
                        // 체크 해제 시 상세 판정도 끔. 체크 시는 현재 상태 유지(라디오로 선택).
                        nblUseDetailedJudgment: v ? a.nblUseDetailedJudgment : false,
                      }
                    : a
                ),
              })
            }
            title="비사업용 토지 여부 검토"
            description="해당 시 기본세율 +10%p 중과 대상"
            tone="rose"
          >
            {/* P3: 재촌 요건 안내 */}
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/70">농지·임야 재촌(在村) 요건 — 아래 중 하나 충족 시 사업용</p>
              <ul className="space-y-0.5 pl-2">
                <li>• 토지 소재지와 <strong>동일 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 <strong>연접한 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 거주지 사이 <strong>직선거리 30km 이내</strong></li>
              </ul>
              <p className="text-muted-foreground/70 text-micro mt-1">소득세법 시행령 §168조의8 — 정밀 판정을 원하시면 세무사 확인 권장</p>
            </div>

            {/* 판정 상태 라디오 */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground/70">판정 상태</p>
              <RadioCardGroup
                name={`nbl-mode-${primary.assetId}`}
                tone="rose"
                value={primary.nblUseDetailedJudgment ? "detailed" : "completed"}
                onChange={(v) =>
                  onChange({
                    assets: form.assets.map((a, i) =>
                      i === 0 ? { ...a, nblUseDetailedJudgment: v === "detailed" } : a
                    ),
                  })
                }
                options={[
                  { value: "completed", label: "이미 비사업용으로 판정 완료", description: "바로 +10%p 중과세 적용" },
                  { value: "detailed", label: "판정 도움 필요", description: "지목·재촌·자경 입력으로 엔진이 자동 판정" },
                ]}
              />
            </div>
          </ToggleCard>
        )}
      </div>

      {/* 비사업용 토지 상세 판정 — "판정 도움" 모드 선택 시만 표시 */}
      {primaryKind === "land" && primary?.isNonBusinessLand && primary?.nblUseDetailedJudgment && primary && (
        <NblSectionContainer
          asset={primary}
          transferDate={form.transferDate}
          onAssetChange={(patch) =>
            onChange({ assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) })
          }
        />
      )}
      </section>
    </div>
  );
}
