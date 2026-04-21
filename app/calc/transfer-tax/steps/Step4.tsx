import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";

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

  // 주소·날짜가 준비되면 조정대상지역 자동 판별
  useEffect(() => {
    const address = form.propertyAddressRoad || form.propertyAddressJibun;
    if (!address || !form.transferDate || !isHousingLike(form.propertyType)) {
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
        address,
        transferDate: form.transferDate,
        acquisitionDate: form.acquisitionDate || undefined,
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
        // 사용자가 아직 손대지 않은 경우에만 자동 반영
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
    // 주소·날짜·유형 변경 시에만 재실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.propertyAddressRoad, form.propertyAddressJibun, form.transferDate, form.acquisitionDate, form.propertyType]);

  // propertyType 변경 시 표시되지 않는 필드 값 초기화
  //   - 조정대상지역 체크박스: 주택(housing)에서만 표시 → 그 외 false
  //   - 미등기 양도: 토지·건물·주택에서만 표시 → 그 외 false
  useEffect(() => {
    const patch: Partial<TransferFormData> = {};
    if (form.propertyType !== "housing") {
      if (form.isRegulatedArea) patch.isRegulatedArea = false;
      if (form.wasRegulatedAtAcquisition) patch.wasRegulatedAtAcquisition = false;
    }
    const allowsUnregistered =
      form.propertyType === "housing" ||
      form.propertyType === "land" ||
      form.propertyType === "building";
    if (!allowsUnregistered && form.isUnregistered) {
      patch.isUnregistered = false;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // 의도적으로 onChange 의존성 제외 (안정적인 props 가정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.propertyType]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">보유 기간과 과세 상황을 입력하세요.</p>

      {/* 조정대상지역 자동 판별 안내 */}
      {isHousingLike(form.propertyType) && (form.propertyAddressRoad || form.propertyAddressJibun) && (
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
                  취득일({form.acquisitionDate}):{" "}
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
      {isHousingLike(form.propertyType) && (
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
          {form.propertyType === "housing" && (
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
        {(form.propertyType === "housing" ||
          form.propertyType === "land" ||
          form.propertyType === "building") && (
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

        {form.propertyType === "land" && (
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
      {form.propertyType === "land" && (
        <NblDetailSection form={form} onChange={onChange} />
      )}

      {/* 주택·입주권·분양권: 다른 보유 주택 목록 (P0-B) */}
      {isHousingLike(form.propertyType) && parseInt(form.householdHousingCount) >= 2 && (
        <HousesListSection form={form} onChange={onChange} />
      )}

      {/* 일시적 2주택 특례 */}
      {isHousingLike(form.propertyType) && (
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
      {isHousingLike(form.propertyType) && (
        <MergeDateSection form={form} onChange={onChange} />
      )}
    </div>
  );
}

// ============================================================
// Step 4 보조 컴포넌트: 비사업용 토지 정밀 판정 (P0-A)
// ============================================================

const NBL_LAND_TYPE_OPTIONS = [
  { value: "paddy", label: "답 (논)" },
  { value: "field", label: "전 (밭)" },
  { value: "orchard", label: "과수원" },
  { value: "farmland", label: "농지 (통합)" },
  { value: "forest", label: "임야" },
  { value: "pasture", label: "목장용지" },
  { value: "building_site", label: "건물 부수 토지" },
  { value: "housing_site", label: "주택 부수 토지" },
  { value: "vacant_lot", label: "나대지" },
  { value: "miscellaneous", label: "잡종지" },
  { value: "other", label: "기타" },
] as const;

const NBL_ZONE_TYPE_OPTIONS = [
  { value: "exclusive_residential", label: "전용주거지역" },
  { value: "general_residential", label: "일반주거지역" },
  { value: "semi_residential", label: "준주거지역" },
  { value: "residential", label: "주거지역 (통합)" },
  { value: "commercial", label: "상업지역" },
  { value: "industrial", label: "공업지역" },
  { value: "green", label: "녹지지역" },
  { value: "management", label: "관리지역" },
  { value: "agriculture_forest", label: "농림지역" },
  { value: "natural_env", label: "자연환경보전지역" },
  { value: "undesignated", label: "미지정" },
] as const;

function isFarmlandNblType(landType: string) {
  return ["farmland", "paddy", "field", "orchard"].includes(landType);
}

function NblDetailSection({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const periods = form.nblBusinessUsePeriods;

  function addPeriod() {
    onChange({
      nblBusinessUsePeriods: [
        ...periods,
        { startDate: "", endDate: "", usageType: "자경" },
      ],
    });
  }

  function removePeriod(idx: number) {
    onChange({
      nblBusinessUsePeriods: periods.filter((_, i) => i !== idx),
    });
  }

  function updatePeriod(idx: number, patch: Partial<{ startDate: string; endDate: string; usageType: string }>) {
    onChange({
      nblBusinessUsePeriods: periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/80 bg-muted/20 px-4 py-4">
      <p className="text-sm font-medium">
        비사업용 토지 정밀 판정{" "}
        <span className="text-xs text-muted-foreground font-normal">(선택 — 입력 시 엔진이 자동 판정)</span>
      </p>

      {/* 지목 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">토지 지목</label>
        <select
          value={form.nblLandType}
          onChange={(e) => onChange({ nblLandType: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">선택 안 함</option>
          {NBL_LAND_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 면적 + 용도지역 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">토지 면적 (㎡)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.nblLandArea}
            onChange={(e) => onChange({ nblLandArea: e.target.value })}
            onFocus={(e) => e.target.select()}
            placeholder="예: 500.00"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">용도지역</label>
          <select
            value={form.nblZoneType}
            onChange={(e) => onChange({ nblZoneType: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">선택 안 함</option>
            {NBL_ZONE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 농지계 자경 여부 */}
      {isFarmlandNblType(form.nblLandType) && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input
              id="nblFarmingSelf"
              type="checkbox"
              checked={form.nblFarmingSelf}
              onChange={(e) => onChange({ nblFarmingSelf: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <label htmlFor="nblFarmingSelf" className="text-sm cursor-pointer">직접 자경 (재촌자경)</label>
          </div>
          {form.nblFarmingSelf && (
            <div className="ml-7 space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">거주지까지 직선거리 (km)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.nblFarmerResidenceDistance}
                  onChange={(e) => onChange({ nblFarmerResidenceDistance: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  placeholder="예: 15.0"
                  className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="text-xs text-muted-foreground">km (30km 이내 = 재촌 인정)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 사업용 사용기간 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">사업용 사용기간</label>
          <button
            type="button"
            onClick={addPeriod}
            className="text-xs text-primary hover:underline"
          >
            + 기간 추가
          </button>
        </div>
        {periods.length === 0 && (
          <p className="text-xs text-muted-foreground/70">없음 — 실제 사용기간이 있으면 추가하세요.</p>
        )}
        <div className="space-y-2">
          {periods.map((p, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
              <div>
                <DateInput
                  value={p.startDate}
                  onChange={(v) => updatePeriod(idx, { startDate: v })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">시작일</p>
              </div>
              <div>
                <DateInput
                  value={p.endDate}
                  onChange={(v) => updatePeriod(idx, { endDate: v })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">종료일</p>
              </div>
              <input
                type="text"
                value={p.usageType}
                onChange={(e) => updatePeriod(idx, { usageType: e.target.value })}
                onFocus={(e) => e.target.select()}
                placeholder="자경"
                className="rounded-md border border-input bg-background px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-16"
              />
              <button
                type="button"
                onClick={() => removePeriod(idx)}
                className="mt-1 text-destructive text-xs hover:underline"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step 4 보조 컴포넌트: 다른 보유 주택 목록 (P0-B)
// ============================================================

function HousesListSection({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const houses = form.houses;

  function addHouse() {
    onChange({
      houses: [
        ...houses,
        {
          id: `house_${Date.now()}`,
          region: "capital",
          acquisitionDate: "",
          officialPrice: "",
          isInherited: false,
          isLongTermRental: false,
          isApartment: false,
          isOfficetel: false,
          isUnsoldHousing: false,
        },
      ],
    });
  }

  function removeHouse(id: string) {
    onChange({ houses: houses.filter((h) => h.id !== id) });
  }

  function updateHouse(id: string, patch: Partial<(typeof houses)[number]>) {
    onChange({ houses: houses.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          다른 보유 주택 목록{" "}
          <span className="text-xs text-muted-foreground font-normal">(정밀 중과세 판정용, 선택)</span>
        </p>
        <button
          type="button"
          onClick={addHouse}
          className="text-xs text-primary hover:underline"
        >
          + 주택 추가
        </button>
      </div>
      {/* C4: 양도 주택 권역 선택 (isRegulatedArea와 별개 — 중과세 가액기준 판정용) */}
      <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">양도 주택 소재지</span>
        <div className="flex gap-3">
          {([["capital", "수도권"], ["non_capital", "지방"]] as const).map(([val, label]) => (
            <label key={val} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name="sellingHouseRegion"
                value={val}
                checked={form.sellingHouseRegion === val}
                onChange={() => onChange({ sellingHouseRegion: val })}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        현재 양도하는 주택 외 세대 구성원이 보유한 주택을 입력하세요.
      </p>

      {houses.length === 0 && (
        <p className="text-xs text-muted-foreground/70">없음 — 주택 추가 시 정밀 주택 수 산정이 적용됩니다.</p>
      )}

      <div className="space-y-3">
        {houses.map((h, idx) => (
          <div key={h.id} className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">주택 {idx + 1}</span>
              <button
                type="button"
                onClick={() => removeHouse(h.id)}
                className="text-xs text-destructive hover:underline"
              >
                삭제
              </button>
            </div>

            {/* 지역 + 취득일 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground">지역 구분</label>
                <select
                  value={h.region}
                  onChange={(e) => updateHouse(h.id, { region: e.target.value as "capital" | "non_capital" })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="capital">수도권</option>
                  <option value="non_capital">지방</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground">취득일</label>
                <DateInput
                  value={h.acquisitionDate}
                  onChange={(v) => updateHouse(h.id, { acquisitionDate: v })}
                />
              </div>
            </div>

            {/* 공시가격 */}
            <div className="space-y-1">
              <label className="block text-[11px] text-muted-foreground">공시가격 (원)</label>
              <input
                type="number"
                min="0"
                step="1000000"
                value={h.officialPrice}
                onChange={(e) => updateHouse(h.id, { officialPrice: e.target.value })}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* 특례 체크 */}
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isInherited}
                  onChange={(e) => updateHouse(h.id, { isInherited: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                상속주택
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isLongTermRental}
                  onChange={(e) => updateHouse(h.id, { isLongTermRental: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                장기임대 등록
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isApartment}
                  onChange={(e) => updateHouse(h.id, { isApartment: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                아파트
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isOfficetel}
                  onChange={(e) => updateHouse(h.id, { isOfficetel: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                오피스텔
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Step 4 보조 컴포넌트: 합가 특례 (P2)
// ============================================================

function MergeDateSection({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const hasAnyMerge = form.marriageDate || form.parentalCareMergeDate;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        합가 특례{" "}
        <span className="text-xs text-muted-foreground font-normal">(선택 — 혼인·동거봉양 합가 시 중과 배제)</span>
      </p>
      <div
        className={cn(
          "rounded-lg border px-4 py-3 space-y-4 transition-colors",
          hasAnyMerge ? "border-primary/40 bg-primary/5" : "border-border",
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">혼인합가일</label>
            <DateInput
              value={form.marriageDate}
              onChange={(v) => onChange({ marriageDate: v })}
            />
            <p className="text-xs text-muted-foreground">혼인합가 후 5년 이내 양도 시 중과 배제</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">동거봉양 합가일</label>
            <DateInput
              value={form.parentalCareMergeDate}
              onChange={(v) => onChange({ parentalCareMergeDate: v })}
            />
            <p className="text-xs text-muted-foreground">동거봉양 합가 후 10년 이내 양도 시 중과 배제</p>
          </div>
        </div>
      </div>
    </div>
  );
}
