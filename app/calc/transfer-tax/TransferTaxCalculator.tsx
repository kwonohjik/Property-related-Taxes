"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCalcWizardStore, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";

/** 세율 백분율 표시 */
function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

const STEPS = ["물건 유형", "양도 정보", "취득 정보", "보유 상황", "감면 확인"];

// ============================================================
// Step 1: 물건 유형
// ============================================================
function Step1({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const options = [
    { value: "housing", label: "주택", icon: "🏠", desc: "아파트, 단독주택, 연립 등" },
    { value: "land", label: "토지", icon: "🌱", desc: "농지, 임야, 나대지 등" },
    { value: "building", label: "건물", icon: "🏢", desc: "상가, 오피스, 창고 등" },
  ] as const;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">양도하는 부동산의 유형을 선택하세요.</p>
      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ propertyType: opt.value })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all",
              form.propertyType === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <span className="text-3xl">{opt.icon}</span>
            <span className="text-sm font-semibold">{opt.label}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Step 2: 양도 정보
// ============================================================
function Step2({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const addressValue: AddressValue = {
    road: form.propertyAddressRoad,
    jibun: form.propertyAddressJibun,
    building: form.propertyBuildingName,
    detail: form.propertyAddressDetail,
    lng: form.propertyLongitude,
    lat: form.propertyLatitude,
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">양도 자산의 소재지·양도가액·양도일을 입력하세요.</p>

      {/* 양도자산 소재지 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          양도자산 소재지 <span className="text-destructive">*</span>
        </label>
        <AddressSearch
          value={addressValue}
          onChange={(v) =>
            onChange({
              propertyAddressRoad: v.road,
              propertyAddressJibun: v.jibun,
              propertyBuildingName: v.building,
              propertyAddressDetail: v.detail,
              propertyLongitude: v.lng,
              propertyLatitude: v.lat,
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          ※ 조정대상지역 여부·공시지가·기준시가 조회에 사용됩니다. (Vworld 주소 검색 API)
        </p>
      </div>

      <CurrencyInput
        label="양도가액"
        value={form.transferPrice}
        onChange={(v) => onChange({ transferPrice: v })}
        placeholder="실제 거래금액"
        required
        hint="실제 매매계약서상 거래금액을 입력하세요."
      />
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          양도일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={form.transferDate}
          onChange={(v) => onChange({ transferDate: v })}
        />
        <p className="text-xs text-muted-foreground">잔금 청산일 또는 등기 접수일 중 빠른 날</p>
      </div>
    </div>
  );
}

// ============================================================
// Step 3: 취득 정보
// ============================================================
function Step3({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const [lookupLoading, setLookupLoading] = useState<"transfer" | "acquisition" | null>(null);
  const [lookupMsg, setLookupMsg] = useState<{ target: "transfer" | "acquisition"; text: string; kind: "ok" | "err" } | null>(null);

  async function lookupStandardPrice(target: "transfer" | "acquisition") {
    if (!form.propertyAddressJibun) {
      setLookupMsg({ target, text: "먼저 Step 2에서 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return;
    }
    const dateStr = target === "transfer" ? form.transferDate : form.acquisitionDate;
    const year = dateStr ? dateStr.slice(0, 4) : String(new Date().getFullYear());
    setLookupLoading(target);
    setLookupMsg(null);
    try {
      const params = new URLSearchParams({
        jibun: form.propertyAddressJibun,
        propertyType: form.propertyType,
        year,
      });
      const res = await fetch(`/api/address/standard-price?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMsg({
          target,
          text: data?.error?.message ?? "공시가격 조회 실패",
          kind: "err",
        });
        return;
      }
      const price = data.price ?? data.pricePerSqm ?? 0;
      if (price > 0) {
        if (target === "acquisition") {
          onChange({ standardPriceAtAcquisition: String(price) });
        } else {
          onChange({ standardPriceAtTransfer: String(price) });
        }
        setLookupMsg({ target, text: `${data.message ?? "조회 성공"}: ${price.toLocaleString()}원`, kind: "ok" });
      } else {
        setLookupMsg({ target, text: "가격 정보 없음", kind: "err" });
      }
    } catch {
      setLookupMsg({ target, text: "네트워크 오류", kind: "err" });
    } finally {
      setLookupLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">취득가액과 필요경비를 입력하세요.</p>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          취득일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={form.acquisitionDate}
          onChange={(v) => onChange({ acquisitionDate: v })}
        />
      </div>

      {/* 환산취득가 토글 */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <input
          id="useEstimated"
          type="checkbox"
          checked={form.useEstimatedAcquisition}
          onChange={(e) => onChange({ useEstimatedAcquisition: e.target.checked, acquisitionPrice: "" })}
          className="h-4 w-4 rounded accent-primary"
        />
        <div>
          <label htmlFor="useEstimated" className="text-sm font-medium cursor-pointer">
            환산취득가액 사용
          </label>
          <p className="text-xs text-muted-foreground">
            취득 당시 실거래가 불명 시 기준시가 비율로 환산 (필요경비: 취득 당시 기준시가 × 3%)
          </p>
        </div>
      </div>

      {form.useEstimatedAcquisition ? (
        <div className="space-y-4 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
          <p className="text-xs font-medium text-primary">
            환산취득가 = 양도가액 × (취득 당시 기준시가 ÷ 양도 당시 기준시가)
          </p>
          <div className="space-y-1.5">
            <CurrencyInput
              label="취득 당시 기준시가"
              value={form.standardPriceAtAcquisition}
              onChange={(v) => onChange({ standardPriceAtAcquisition: v })}
              placeholder="취득 시점 공시가격"
              required
            />
            <button
              type="button"
              onClick={() => lookupStandardPrice("acquisition")}
              disabled={lookupLoading === "acquisition"}
              className="text-xs text-primary underline disabled:opacity-50 hover:text-primary/80"
            >
              {lookupLoading === "acquisition" ? "조회중..." : "🔎 Vworld 공시가격 자동 조회"}
            </button>
            {lookupMsg?.target === "acquisition" && (
              <p className={cn("text-xs", lookupMsg.kind === "ok" ? "text-emerald-700" : "text-destructive")}>
                {lookupMsg.text}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <CurrencyInput
              label="양도 당시 기준시가"
              value={form.standardPriceAtTransfer}
              onChange={(v) => onChange({ standardPriceAtTransfer: v })}
              placeholder="양도 시점 공시가격"
              required
              disabled={!form.standardPriceAtAcquisition || parseAmount(form.standardPriceAtAcquisition) <= 0}
            />
            {(!form.standardPriceAtAcquisition || parseAmount(form.standardPriceAtAcquisition) <= 0) && (
              <p className="text-xs text-muted-foreground">취득 당시 기준시가를 먼저 입력하세요.</p>
            )}
            <button
              type="button"
              onClick={() => lookupStandardPrice("transfer")}
              disabled={lookupLoading === "transfer" || !form.standardPriceAtAcquisition || parseAmount(form.standardPriceAtAcquisition) <= 0}
              className="text-xs text-primary underline disabled:opacity-50 hover:text-primary/80"
            >
              {lookupLoading === "transfer" ? "조회중..." : "🔎 Vworld 공시가격 자동 조회"}
            </button>
            {lookupMsg?.target === "transfer" && (
              <p className={cn("text-xs", lookupMsg.kind === "ok" ? "text-emerald-700" : "text-destructive")}>
                {lookupMsg.text}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            ※ 공시가격은{" "}
            <a
              href="https://www.realtyprice.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              부동산공시가격알리미
            </a>{" "}
            에서 확인하세요.
          </p>
        </div>
      ) : (
        <CurrencyInput
          label="취득가액"
          value={form.acquisitionPrice}
          onChange={(v) => onChange({ acquisitionPrice: v })}
          placeholder="실제 취득금액"
          required
          hint="취득 당시 실제 매매금액을 입력하세요."
        />
      )}

      {form.useEstimatedAcquisition ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">필요경비</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            환산취득가액 적용 시 개산공제(취득 당시 기준시가 × 3%)가 자동 반영됩니다.
            별도 필요경비는 입력하지 않습니다.
          </p>
        </div>
      ) : (
        <CurrencyInput
          label="필요경비"
          value={form.expenses}
          onChange={(v) => onChange({ expenses: v })}
          placeholder="0"
          hint="취득·양도 시 부대비용 (중개수수료, 취득세, 인테리어비 등)"
        />
      )}
    </div>
  );
}

// ============================================================
// Step 4: 보유 상황
// ============================================================
function Step4({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
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
    if (!address || !form.transferDate || form.propertyType !== "housing") {
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

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">보유 기간과 과세 상황을 입력하세요.</p>

      {/* 조정대상지역 자동 판별 안내 */}
      {form.propertyType === "housing" && (form.propertyAddressRoad || form.propertyAddressJibun) && (
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

      {/* 주택 전용: 1세대 여부 + 주택 수 + 거주기간 + 조정대상지역 */}
      {form.propertyType === "housing" && (
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

          {/* 조정대상지역 */}
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
        </>
      )}

      {/* 특수 상황 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">특수 상황</p>
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

      {/* 주택: 다른 보유 주택 목록 (P0-B) */}
      {form.propertyType === "housing" && parseInt(form.householdHousingCount) >= 2 && (
        <HousesListSection form={form} onChange={onChange} />
      )}

      {/* 일시적 2주택 특례 */}
      {form.propertyType === "housing" && (
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

      {/* 주택: 합가 특례 (P2) */}
      {form.propertyType === "housing" && (
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

// ============================================================
// Step 5: 감면 확인
// ============================================================
function Step5({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const reductionOptions = [
    { value: "", label: "해당 없음", desc: "감면 적용 안 함" },
    { value: "self_farming", label: "자경농지 감면", desc: "8년 이상 자경 농지 (한도 1억원)" },
    { value: "long_term_rental", label: "장기임대주택 감면", desc: "8년 이상 임대, 임대료 인상 5% 이하" },
    { value: "new_housing", label: "신축주택 감면", desc: "신축주택 취득 특례 (50%~100%)" },
    { value: "unsold_housing", label: "미분양주택 감면", desc: "미분양주택 취득 특례 (100%)" },
  ] as const;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        조세특례 감면이 해당되는 경우 선택하세요.
      </p>

      <div className="space-y-2">
        {reductionOptions.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
              form.reductionType === opt.value
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/40",
            )}
          >
            <input
              type="radio"
              name="reductionType"
              value={opt.value}
              checked={form.reductionType === opt.value}
              onChange={() => onChange({ reductionType: opt.value })}
              className="accent-primary"
              aria-label={opt.label}
            />
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* 감면 유형별 추가 입력 */}
      {form.reductionType === "self_farming" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">자경 기간 입력</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={form.farmingYears}
              onChange={(e) => onChange({ farmingYears: e.target.value })}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">년 (8년 이상이어야 감면 적용)</span>
          </div>
        </div>
      )}

      {form.reductionType === "long_term_rental" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">임대 조건 입력</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={form.rentalYears}
              onChange={(e) => onChange({ rentalYears: e.target.value })}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">년 임대</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.rentIncreaseRate}
              onChange={(e) => onChange({ rentIncreaseRate: e.target.value })}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">% 임대료 인상률 (5% 이하여야 감면)</span>
          </div>
        </div>
      )}

      {(form.reductionType === "new_housing" || form.reductionType === "unsold_housing") && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">물건 소재지</p>
          <div className="flex gap-3">
            {[
              { value: "metropolitan", label: "수도권 (50% 감면)" },
              { value: "non_metropolitan", label: "비수도권 (100% 감면)" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reductionRegion"
                  value={opt.value}
                  checked={form.reductionRegion === opt.value}
                  onChange={() => onChange({ reductionRegion: opt.value as "metropolitan" | "non_metropolitan" })}
                  className="accent-primary"
                  aria-label={opt.label}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          당해 연도 기사용 기본공제
        </label>
        <CurrencyInput
          label=""
          value={form.annualBasicDeductionUsed}
          onChange={(v) => onChange({ annualBasicDeductionUsed: v })}
          placeholder="0"
          hint="동일 연도 다른 양도에서 이미 사용한 기본공제 금액 (연간 한도 250만원)"
        />
      </div>
    </div>
  );
}

// ============================================================
// 결과 화면
// ============================================================
function ResultView({
  result,
  onReset,
  onBack,
  onLoginPrompt = false,
}: {
  result: TransferTaxResult;
  onReset: () => void;
  onBack: () => void;
  onLoginPrompt?: boolean;
}) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="space-y-5">
      {/* PDF 인쇄 버튼 */}
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🖨️ PDF / 인쇄
        </button>
      </div>

      {/* 핵심 결과 카드 */}
      {result.isExempt ? (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {result.exemptReason ?? "비과세"}
          </p>
          <p className="text-2xl font-bold mt-1">납부세액 0원</p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
          <p className="text-sm font-medium text-muted-foreground mb-1">총 납부세액</p>
          <p className="text-3xl font-bold">{formatKRW(result.totalTax)}</p>
          <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
            <span>결정세액 {formatKRW(result.determinedTax)}</span>
            <span>+</span>
            <span>지방소득세 {formatKRW(result.localIncomeTax)}</span>
          </div>
        </div>
      )}

      {/* 상세 내역 */}
      {!result.isExempt && (
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          <Row label="양도차익" value={formatKRW(result.transferGain)} />
          {result.taxableGain !== result.transferGain && (
            <Row label="과세 양도차익 (12억 초과분)" value={formatKRW(result.taxableGain)} sub />
          )}
          <Row
            label={`장기보유특별공제 (${formatRate(result.longTermHoldingRate)})`}
            value={result.longTermHoldingDeduction > 0 ? `- ${formatKRW(result.longTermHoldingDeduction)}` : "해당없음"}
          />
          <Row
            label="기본공제"
            value={result.basicDeduction > 0 ? `- ${formatKRW(result.basicDeduction)}` : "0원"}
          />
          <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <Row
            label={`산출세액 (${formatRate(result.appliedRate)}${result.surchargeRate ? ` + 중과 ${formatRate(result.surchargeRate)}` : ""})`}
            value={formatKRW(result.calculatedTax)}
          />
          {result.reductionAmount > 0 && (
            <Row label={`감면 (${result.reductionType ?? ""})`} value={`- ${formatKRW(result.reductionAmount)}`} />
          )}
          <Row label="결정세액" value={formatKRW(result.determinedTax)} highlight />
          <Row label="지방소득세 (10%)" value={formatKRW(result.localIncomeTax)} />
        </div>
      )}

      {/* 중과세 정보 */}
      {result.surchargeType && !result.isSurchargeSuspended && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            ⚠️ 중과세 적용 — {result.surchargeType === "multi_house_2" ? "2주택" : result.surchargeType === "multi_house_3plus" ? "3주택+" : "비사업용토지"}{" "}
            (+{formatRate(result.surchargeRate ?? 0)})
          </p>
        </div>
      )}
      {result.isSurchargeSuspended && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-400">
            ℹ️ 다주택 중과세 유예 기간 적용 — 일반세율로 계산됩니다.
          </p>
        </div>
      )}

      {/* 다주택 중과세 상세 결과 (P1) */}
      {result.multiHouseSurchargeDetail && (
        <MultiHouseSurchargeDetailCard detail={result.multiHouseSurchargeDetail} />
      )}

      {/* 비사업용토지 판정 상세 결과 (P1) */}
      {result.nonBusinessLandJudgmentDetail && (
        <div>
          <p className="text-sm font-medium mb-2">비사업용토지 판정 결과</p>
          <NonBusinessLandResultCard judgment={result.nonBusinessLandJudgmentDetail} />
        </div>
      )}

      {/* 계산 과정 토글 */}
      <button
        type="button"
        onClick={() => setShowSteps((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <span>계산 과정 상세 보기</span>
        <span className="text-muted-foreground">{showSteps ? "▲" : "▼"}</span>
      </button>

      {showSteps && (
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          {result.steps.map((step, i) => (
            <div key={i} className="px-4 py-3 flex justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">{step.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.formula}</p>
                {step.legalBasis && (
                  <span className="inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5">
                    {step.legalBasis}
                  </span>
                )}
              </div>
              <p className="font-mono font-medium shrink-0">{formatKRW(step.amount)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 면책 고지 */}
      <DisclaimerBanner />

      {/* 비로그인 안내 */}
      {onLoginPrompt && <LoginPromptBanner hasPendingResult />}

      {/* 하단 버튼 */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          다시 계산하기
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-2.5",
        highlight && "bg-muted/50 font-semibold",
        sub && "pl-7 text-muted-foreground",
      )}
    >
      <span className={sub ? "text-xs" : ""}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

// ============================================================
// 유효성 검사
// ============================================================
function validateStep(step: number, form: TransferFormData): string | null {
  if (step === 0) {
    if (!form.propertyType) return "양도하는 부동산 유형을 선택하세요.";
  }
  if (step === 1) {
    if (!form.propertyAddressRoad && !form.propertyAddressJibun) return "양도자산 소재지를 검색·선택하세요.";
    if (!form.transferPrice || parseAmount(form.transferPrice) <= 0) return "양도가액을 입력하세요.";
    if (!form.transferDate) return "양도일을 선택하세요.";
  }
  if (step === 2) {
    if (!form.acquisitionDate) return "취득일을 선택하세요.";
    if (form.acquisitionDate >= form.transferDate) return "취득일은 양도일보다 이전이어야 합니다.";
    if (form.useEstimatedAcquisition) {
      if (!form.standardPriceAtAcquisition || parseAmount(form.standardPriceAtAcquisition) <= 0)
        return "취득 당시 기준시가를 입력하세요.";
      if (!form.standardPriceAtTransfer || parseAmount(form.standardPriceAtTransfer) <= 0)
        return "양도 당시 기준시가를 입력하세요.";
    } else {
      if (!form.acquisitionPrice || parseAmount(form.acquisitionPrice) < 0)
        return "취득가액을 입력하세요.";
    }
  }
  if (step === 3) {
    if (!form.householdHousingCount) return "세대 보유 주택 수를 선택하세요.";
  }
  return null;
}

// ============================================================
// API 호출 — 폼 데이터 → API 요청
// ============================================================
async function callTransferTaxAPI(form: TransferFormData): Promise<TransferTaxResult> {
  const reductions = [];
  if (form.reductionType === "self_farming") {
    reductions.push({ type: "self_farming", farmingYears: parseInt(form.farmingYears) });
  } else if (form.reductionType === "long_term_rental") {
    reductions.push({
      type: "long_term_rental",
      rentalYears: parseInt(form.rentalYears),
      rentIncreaseRate: parseFloat(form.rentIncreaseRate) / 100,
    });
  } else if (form.reductionType === "new_housing") {
    reductions.push({ type: "new_housing", region: form.reductionRegion });
  } else if (form.reductionType === "unsold_housing") {
    reductions.push({ type: "unsold_housing", region: form.reductionRegion });
  }

  // P0-A: 비사업용 토지 상세 정보 구성
  const nblDetails =
    form.propertyType === "land" && form.nblLandType && form.nblLandArea && form.nblZoneType
      ? {
          landType: form.nblLandType,
          landArea: parseFloat(form.nblLandArea),
          zoneType: form.nblZoneType,
          acquisitionDate: form.acquisitionDate,
          transferDate: form.transferDate,
          farmingSelf: form.nblFarmingSelf || undefined,
          farmerResidenceDistance: form.nblFarmerResidenceDistance
            ? parseFloat(form.nblFarmerResidenceDistance)
            : undefined,
          businessUsePeriods: form.nblBusinessUsePeriods.filter(
            (p) => p.startDate && p.endDate,
          ),
        }
      : undefined;

  // P0-B: 다른 보유 주택 목록 구성 (현재 양도 주택을 포함한 전체 배열 생성)
  const housesPayload =
    form.propertyType === "housing" && form.houses.length > 0
      ? [
          // 현재 양도 주택 (ID: "selling")
          {
            id: "selling",
            region: form.isRegulatedArea ? "capital" : "non_capital",
            acquisitionDate: form.acquisitionDate,
            officialPrice: 0,
            isInherited: false,
            isLongTermRental: false,
            isApartment: false,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
          // 다른 보유 주택들
          ...form.houses
            .filter((h) => h.acquisitionDate)
            .map((h) => ({
              id: h.id,
              region: h.region,
              acquisitionDate: h.acquisitionDate,
              officialPrice: parseInt(h.officialPrice) || 0,
              isInherited: h.isInherited,
              isLongTermRental: h.isLongTermRental,
              isApartment: h.isApartment,
              isOfficetel: h.isOfficetel,
              isUnsoldHousing: h.isUnsoldHousing,
            })),
        ]
      : undefined;

  const body = {
    propertyType: form.propertyType,
    transferPrice: parseAmount(form.transferPrice),
    transferDate: form.transferDate,
    acquisitionPrice: form.useEstimatedAcquisition ? 0 : parseAmount(form.acquisitionPrice),
    acquisitionDate: form.acquisitionDate,
    // 환산취득가액 사용 시 개산공제(3%)는 엔진 내부에서 acquisitionCost에 포함 → expenses=0
    expenses: form.useEstimatedAcquisition ? 0 : parseAmount(form.expenses),
    useEstimatedAcquisition: form.useEstimatedAcquisition,
    standardPriceAtAcquisition: form.useEstimatedAcquisition
      ? parseAmount(form.standardPriceAtAcquisition)
      : undefined,
    standardPriceAtTransfer: form.useEstimatedAcquisition
      ? parseAmount(form.standardPriceAtTransfer)
      : undefined,
    householdHousingCount: parseInt(form.householdHousingCount) || 0,
    residencePeriodMonths: parseInt(form.residencePeriodMonths) || 0,
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    isUnregistered: form.isUnregistered,
    isNonBusinessLand: form.isNonBusinessLand,
    isOneHousehold: form.isOneHousehold,
    reductions,
    annualBasicDeductionUsed: parseAmount(form.annualBasicDeductionUsed),
    ...(form.temporaryTwoHouseSpecial &&
      form.previousHouseAcquisitionDate &&
      form.newHouseAcquisitionDate
      ? {
          temporaryTwoHouse: {
            previousAcquisitionDate: form.previousHouseAcquisitionDate,
            newAcquisitionDate: form.newHouseAcquisitionDate,
          },
        }
      : {}),
    // P0-A: 비사업용 토지 정밀 판정
    ...(nblDetails ? { nonBusinessLandDetails: nblDetails } : {}),
    // P0-B: 다주택 정밀 중과세 판정
    ...(housesPayload ? { houses: housesPayload, sellingHouseId: "selling" } : {}),
    // P2: 합가 특례
    ...(form.marriageDate ? { marriageMerge: { marriageDate: form.marriageDate } } : {}),
    ...(form.parentalCareMergeDate
      ? { parentalCareMerge: { mergeDate: form.parentalCareMergeDate } }
      : {}),
  };

  const res = await fetch("/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
    throw new Error(msg);
  }
  return json.data as TransferTaxResult;
}

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function TransferTaxCalculator() {
  const router = useRouter();
  const { currentStep, formData, result, setStep, updateFormData, setResult, reset } =
    useCalcWizardStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 로그인 상태 확인 (클라이언트 사이드)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        setIsLoggedIn(!!data.user);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        setIsLoggedIn(!!session?.user);
      });
      return () => subscription.unsubscribe();
    });
  }, []);

  const totalSteps = 5;
  const isLastStep = currentStep === totalSteps - 1;
  const isResult = result !== null && currentStep === totalSteps;

  function handleNext() {
    const err = validateStep(currentStep, formData);
    if (err) { setError(err); return; }
    setError(null);
    setStep(currentStep + 1);
  }

  function handleBack() {
    setError(null);
    if (currentStep === 0) {
      router.push("/");
    } else {
      setStep(currentStep - 1);
    }
  }

  async function handleSubmit() {
    setError(null);
    setIsLoading(true);
    try {
      const res = await callTransferTaxAPI(formData);
      setResult(res);
      setStep(totalSteps); // 결과 화면

      // 로그인된 사용자면 이력 자동 저장
      if (isLoggedIn) {
        const { saveCalculation } = await import("@/actions/calculations");
        await saveCalculation({
          taxType: "transfer",
          inputData: formData as unknown as Record<string, unknown>,
          resultData: res as unknown as Record<string, unknown>,
          taxLawVersion: new Date().toISOString().split("T")[0],
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    reset();
    setError(null);
  }

  const stepComponents = [
    <Step1 key={0} form={formData} onChange={updateFormData} />,
    <Step2 key={1} form={formData} onChange={updateFormData} />,
    <Step3 key={2} form={formData} onChange={updateFormData} />,
    <Step4 key={3} form={formData} onChange={updateFormData} />,
    <Step5 key={4} form={formData} onChange={updateFormData} />,
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <h1 className="text-2xl font-bold">양도소득세 계산기</h1>
      </div>

      {isResult && result ? (
        <ResultView
          result={result}
          onReset={handleReset}
          onBack={() => {
            setStep(totalSteps - 1); // 마지막 입력 단계(감면 확인)로 복귀
            setError(null);
          }}
          onLoginPrompt={!isLoggedIn}
        />
      ) : (
        <>
          <StepIndicator steps={STEPS} current={currentStep} />

          {/* 단계 제목 */}
          <h2 className="text-base font-semibold mb-4">
            {["물건 유형 선택", "양도 정보 입력", "취득 정보 입력", "보유 상황 입력", "감면 확인"][currentStep]}
          </h2>

          {/* 폼 내용 */}
          <div className="min-h-[280px]">
            {stepComponents[currentStep]}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <p>{error}</p>
              {isLastStep && (
                <button
                  type="button"
                  onClick={() => { setError(null); handleSubmit(); }}
                  className="mt-2 text-xs underline underline-offset-2 hover:opacity-70 transition-opacity"
                >
                  다시 계산하기
                </button>
              )}
            </div>
          )}

          {/* 네비게이션 — 뒤로가기(항상) + 다음/계산 */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
            >
              {currentStep === 0 ? "홈으로" : "이전"}
            </button>
            {isLastStep ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isLoading ? "계산 중..." : "세금 계산하기"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                다음
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
