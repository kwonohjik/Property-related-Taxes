import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { NblDetailSection } from "./step4-sections/NblDetailSection";
import { HousesListSection } from "./step4-sections/HousesListSection";
import { MergeDateSection } from "./step4-sections/MergeDateSection";

// Step4 내부 공용 헬퍼 — 주택·입주권·분양권 계열 판정
const isHousingLike = (pt: string) =>
  pt === "housing" || pt === "right_to_move_in" || pt === "presale_right";

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
  const appliedRef = useRef(false);
  const primaryKind = form.assets?.[0]?.assetKind ?? "";
  const primaryAcquisitionDate = form.assets?.[0]?.acquisitionDate ?? "";

  const primaryAddress =
    (form.assets?.[0]?.addressRoad || form.assets?.[0]?.addressJibun) ?? "";

  // 주소·날짜가 준비되면 조정대상지역 자동 판별
  useEffect(() => {
    if (!primaryAddress || !form.transferDate || !isHousingLike(primaryKind)) {
      setRegulatedAuto(null);
      appliedRef.current = false;
      return;
    }
    let cancelled = false;
    setRegulatedLoading(true);
    setRegulatedError(null);
    fetch("/api/address/regulated-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: primaryAddress,
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
        if (!appliedRef.current) {
          onChange({
            isRegulatedArea: data.isRegulatedAtTransfer,
            wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
          });
          appliedRef.current = true;
        }
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
  }, [primaryAddress, form.transferDate, primaryAcquisitionDate, primaryKind]);

  // assetKind 변경 시 표시되지 않는 필드 값 초기화
  //   - 조정대상지역 체크박스: 주택(housing)에서만 표시 → 그 외 false
  //   - 미등기 양도: 토지·건물·주택에서만 표시 → 그 외 false
  useEffect(() => {
    const patch: Partial<TransferFormData> = {};
    if (primaryKind !== "housing") {
      if (form.isRegulatedArea) patch.isRegulatedArea = false;
      if (form.wasRegulatedAtAcquisition) patch.wasRegulatedAtAcquisition = false;
    }
    const allowsUnregistered =
      primaryKind === "housing" ||
      primaryKind === "land" ||
      primaryKind === "building";
    if (!allowsUnregistered && form.isUnregistered) {
      patch.isUnregistered = false;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // 의도적으로 onChange 의존성 제외 (안정적인 props 가정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKind]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">보유 기간과 과세 상황을 입력하세요.</p>

      {/* 조정대상지역 자동 판별 안내 */}
      {isHousingLike(primaryKind) && primaryAddress && (
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
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  ⚠️ 신뢰도: {regulatedAuto.confidence} — 시군구 일부만 지정된 경우 아래 체크박스를 수동 확인하세요.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* 주택·입주권·분양권: 1세대 여부 + 주택 수 + 거주기간 + 조정대상지역 */}
      {isHousingLike(primaryKind) && (
        <>
          {/* 1세대 여부 */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <input
              id="isOneHousehold"
              type="checkbox"
              checked={form.isOneHousehold}
              onChange={(e) => onChange({ isOneHousehold: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <label htmlFor="isOneHousehold" className="text-sm font-medium cursor-pointer">
              1세대 해당 (독립적인 생계를 유지하는 세대)
            </label>
          </div>

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
                    (v === "3+" ? form.householdHousingCount === "3" : form.householdHousingCount === v)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {v}채
                </button>
              ))}
            </div>
          </div>

          {/* 거주기간 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">거주기간</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="480"
                value={form.residencePeriodMonths}
                onChange={(e) => onChange({ residencePeriodMonths: e.target.value })}
                onFocus={(e) => e.target.select()}
                className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-sm text-muted-foreground">개월</span>
              {parseInt(form.residencePeriodMonths) > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({Math.floor(parseInt(form.residencePeriodMonths) / 12)}년{" "}
                  {parseInt(form.residencePeriodMonths) % 12}개월)
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              1세대1주택 80% 장기보유공제에 거주기간이 반영됩니다.
            </p>
          </div>

          {/* 조정대상지역 — 주택만 표시 */}
          {primaryKind === "housing" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                <input
                  id="isRegulated"
                  type="checkbox"
                  checked={form.isRegulatedArea}
                  onChange={(e) => onChange({ isRegulatedArea: e.target.checked })}
                  className="h-4 w-4 rounded accent-primary"
                />
                <div>
                  <label htmlFor="isRegulated" className="text-sm font-medium cursor-pointer">
                    양도일 기준 조정대상지역
                  </label>
                  <p className="text-xs text-muted-foreground">중과세 판단 기준</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                <input
                  id="wasRegulated"
                  type="checkbox"
                  checked={form.wasRegulatedAtAcquisition}
                  onChange={(e) => onChange({ wasRegulatedAtAcquisition: e.target.checked })}
                  className="h-4 w-4 rounded accent-primary"
                />
                <div>
                  <label htmlFor="wasRegulated" className="text-sm font-medium cursor-pointer">
                    취득일 기준 조정대상지역
                  </label>
                  <p className="text-xs text-muted-foreground">비과세 거주요건 판단</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 특수 상황 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">특수 상황</p>
        {/* 미등기 양도 — 주택·토지·건물만 표시 (입주권·분양권은 등기 개념 없음) */}
        {(primaryKind === "housing" ||
          primaryKind === "land" ||
          primaryKind === "building") && (
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
              form.isUnregistered ? "border-destructive bg-destructive/5" : "border-border",
            )}
          >
            <input
              id="isUnregistered"
              type="checkbox"
              checked={form.isUnregistered}
              onChange={(e) => onChange({ isUnregistered: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <div>
              <label htmlFor="isUnregistered" className="text-sm font-medium cursor-pointer">
                미등기 양도
              </label>
              {form.isUnregistered && (
                <p className="text-xs text-destructive font-medium mt-0.5">
                  ⚠️ 70% 단일세율 적용 — 장기보유공제·기본공제 전액 배제
                </p>
              )}
            </div>
          </div>
        )}

        {primaryKind === "land" && (
          <div className="rounded-lg border border-border px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <input
                id="isNonBusiness"
                type="checkbox"
                checked={form.isNonBusinessLand}
                onChange={(e) => onChange({ isNonBusinessLand: e.target.checked })}
                className="h-4 w-4 rounded accent-primary"
              />
              <div>
                <label htmlFor="isNonBusiness" className="text-sm font-medium cursor-pointer">
                  비사업용 토지
                </label>
                <p className="text-xs text-muted-foreground">누진세율 + 10%p 중과세 · 장기보유공제 배제</p>
              </div>
            </div>
            {/* P3: 재촌 요건 안내 (거주지 근접성 판단 기준 설명) */}
            <div className="ml-7 rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/70">농지·임야 재촌(在村) 요건 — 아래 중 하나 충족 시 사업용</p>
              <ul className="space-y-0.5 pl-2">
                <li>• 토지 소재지와 <strong>동일 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 <strong>연접한 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 거주지 사이 <strong>직선거리 30km 이내</strong></li>
              </ul>
              <p className="text-muted-foreground/70 text-[10px] mt-1">소득세법 시행령 §168조의8 — 정밀 판정을 원하시면 세무사 확인 권장</p>
            </div>
          </div>
        )}
      </div>

      {/* 토지: 비사업용 토지 정밀 판정 정보 (P0-A) */}
      {primaryKind === "land" && (
        <NblDetailSection form={form} onChange={onChange} />
      )}

      {/* 주택·입주권·분양권: 다른 보유 주택 목록 (P0-B) */}
      {isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2 && (
        <HousesListSection form={form} onChange={onChange} />
      )}

      {/* 일시적 2주택 특례 */}
      {isHousingLike(primaryKind) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">일시적 2주택 특례</p>
          <div
            className={cn(
              "rounded-lg border px-4 py-3 transition-colors",
              form.temporaryTwoHouseSpecial ? "border-primary/40 bg-primary/5" : "border-border",
            )}
          >
            <div className="flex items-center gap-3">
              <input
                id="temporaryTwoHouse"
                type="checkbox"
                checked={form.temporaryTwoHouseSpecial}
                onChange={(e) =>
                  onChange({
                    temporaryTwoHouseSpecial: e.target.checked,
                    previousHouseAcquisitionDate: e.target.checked ? form.previousHouseAcquisitionDate : "",
                    newHouseAcquisitionDate: e.target.checked ? form.newHouseAcquisitionDate : "",
                  })
                }
                className="h-4 w-4 rounded accent-primary"
                aria-describedby="temporaryTwoHouseDesc"
              />
              <div>
                <label htmlFor="temporaryTwoHouse" className="text-sm font-medium cursor-pointer">
                  일시적 2주택 특례 해당
                </label>
                <p id="temporaryTwoHouseDesc" className="text-xs text-muted-foreground">
                  종전 주택 보유 중 신규 주택 취득 후 일정 기간 내 종전 주택 양도 시 비과세 특례
                </p>
              </div>
            </div>

            {form.temporaryTwoHouseSpecial && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    종전 주택 취득일 <span className="text-destructive">*</span>
                  </label>
                  <DateInput
                    value={form.previousHouseAcquisitionDate}
                    onChange={(v) => onChange({ previousHouseAcquisitionDate: v })}
                  />
                  <p className="text-xs text-muted-foreground">지금 양도하는 주택의 취득일</p>
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
            )}
          </div>
        </div>
      )}

      {/* 주택·입주권·분양권: 합가 특례 (P2) */}
      {isHousingLike(primaryKind) && (
        <MergeDateSection form={form} onChange={onChange} />
      )}
    </div>
  );
}
