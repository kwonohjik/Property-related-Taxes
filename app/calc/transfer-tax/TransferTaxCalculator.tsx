"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCalcWizardStore, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxPenaltyResult } from "@/lib/tax-engine/transfer-tax-penalty";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { getFilingDeadline, isFilingOverdue } from "@/lib/calc/filing-deadline";


const STEPS_SINGLE = ["물건 유형", "양도 정보", "취득 정보", "보유 상황", "감면 확인", "가산세"];
const STEPS_MULTI = ["물건 유형", "양도 정보", "취득 정보", "보유 상황", "감면 확인"];

const isHousingLike = (pt: string) =>
  pt === "housing" || pt === "right_to_move_in" || pt === "presale_right";

// ============================================================
// Step 1: 물건 유형
// ============================================================
function Step1({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const options = [
    { value: "housing",        label: "주택",   icon: "🏠", desc: "아파트, 단독주택, 연립 등" },
    { value: "right_to_move_in", label: "입주권", icon: "🏗️", desc: "재개발·재건축 입주권" },
    { value: "presale_right",  label: "분양권", icon: "📋", desc: "아파트 분양권" },
    { value: "land",           label: "토지",   icon: "🌱", desc: "농지, 임야, 나대지 등" },
    { value: "building",       label: "건물",   icon: "🏢", desc: "상가, 오피스, 창고 등" },
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

      {form.propertyType === "right_to_move_in" && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <label className="block text-sm font-medium">조합원 유형</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                value: false,
                label: "원조합원",
                desc: "재개발·재건축 조합원자격을 직접 취득",
              },
              {
                value: true,
                label: "승계조합원",
                desc: "타인의 입주권을 양수(승계취득)",
              },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => onChange({ isSuccessorRightToMoveIn: opt.value })}
                className={cn(
                  "rounded-md border-2 p-3 text-left transition-all",
                  form.isSuccessorRightToMoveIn === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
                )}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            ※ 승계조합원은 장기보유특별공제가 적용되지 않습니다 (소득세법 §95② 단서).
          </p>
        </div>
      )}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">신고일</label>
          <DateInput
            value={form.filingDate}
            onChange={(v) => onChange({ filingDate: v })}
          />
          {form.transferDate ? (
            <p className="text-xs text-muted-foreground">
              신고기한: {getFilingDeadline(form.transferDate)} (양도월 말일 + 2개월)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">양도일 입력 시 신고기한이 표시됩니다.</p>
          )}
          {isFilingOverdue(form.transferDate, form.filingDate) && (
            <p className="text-xs font-medium text-destructive">
              ⚠️ 신고기한({getFilingDeadline(form.transferDate)})을 지났습니다 — 무신고·지연납부 가산세가 자동 적용됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step 3: 취득 정보
// ============================================================

// 날짜와 물건 유형을 보고 공시가격 기본 조회 연도를 계산
// 공시일 이전 날짜라면 전년도를 사용해야 함 (주택 4.29, 토지 5.31 기준)
function getDefaultPriceYear(dateStr: string, propertyType: string): string {
  if (!dateStr || dateStr.length < 10) return String(new Date().getFullYear());
  const year = parseInt(dateStr.slice(0, 4));
  const mmdd = dateStr.slice(5, 7) + dateStr.slice(8, 10); // "MMDD"
  const cutoff = propertyType === "land" ? "0531" : "0429";
  return mmdd < cutoff ? String(year - 1) : String(year);
}

function Step3({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2004 }, (_, i) => String(currentYear - i));

  const [acqYear, setAcqYear] = useState<string>(
    () => getDefaultPriceYear(form.acquisitionDate, form.propertyType)
  );
  const [tsfYear, setTsfYear] = useState<string>(
    () => getDefaultPriceYear(form.transferDate, form.propertyType)
  );
  const [acqLoading, setAcqLoading] = useState(false);
  const [tsfLoading, setTsfLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  // 날짜 변경 감지용 ref — 날짜가 바뀌면 공시가격 초기화 (Bug Fix)
  const prevAcqDateRef = useRef(form.acquisitionDate);
  const prevTsfDateRef = useRef(form.transferDate);

  useEffect(() => {
    if (!form.acquisitionDate) return;
    setAcqYear(getDefaultPriceYear(form.acquisitionDate, form.propertyType));
    if (prevAcqDateRef.current && prevAcqDateRef.current !== form.acquisitionDate) {
      onChange({ standardPriceAtAcquisition: "", standardPriceAtAcquisitionLabel: "" });
    }
    prevAcqDateRef.current = form.acquisitionDate;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.acquisitionDate, form.propertyType]);

  useEffect(() => {
    if (!form.transferDate) return;
    setTsfYear(getDefaultPriceYear(form.transferDate, form.propertyType));
    if (prevTsfDateRef.current && prevTsfDateRef.current !== form.transferDate) {
      onChange({ standardPriceAtTransfer: "", standardPriceAtTransferLabel: "" });
    }
    prevTsfDateRef.current = form.transferDate;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.transferDate, form.propertyType]);

  // API 응답으로 레이블 생성
  function buildLabel(data: Record<string, unknown>, year: string): string {
    const announcedDate = String(data.announcedDate ?? "");
    const effectiveDate = announcedDate.length === 8
      ? announcedDate
      : data.priceType === "land_price" ? `${year}0531` : `${year}0429`;
    const typeName =
      data.priceType === "apart_housing_price" ? "공동주택" :
      data.priceType === "indvd_housing_price" ? "개별주택" :
      data.priceType === "land_price" ? "개별공시지가" : "공시가격";
    const d = effectiveDate;
    const pubDate = `${d.slice(0, 4)}.${parseInt(d.slice(4, 6), 10)}.${parseInt(d.slice(6, 8), 10)}.`;
    return `${typeName} 공시일 : ${pubDate}`;
  }

  function buildParams(year: string) {
    const detail = form.propertyAddressDetail?.trim() ?? "";
    const parts = detail.split(/\s+/);
    const dong = parts.length >= 2 ? parts[0] : "";
    const ho   = parts.length >= 2 ? parts.slice(1).join(" ") : "";
    const params = new URLSearchParams({ jibun: form.propertyAddressJibun, propertyType: form.propertyType, year });
    if (dong) params.set("dong", dong);
    if (ho)   params.set("ho", ho);
    return params;
  }

  // 지정 연도로 개별 조회 (조회 버튼)
  async function fetchPriceForYear(target: "acquisition" | "transfer", year: string) {
    if (!form.propertyAddressJibun) {
      setLookupMsg({ text: "먼저 Step 2에서 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return;
    }
    if (target === "acquisition") setAcqLoading(true);
    else setTsfLoading(true);
    setLookupMsg(null);
    try {
      const res = await fetch(`/api/address/standard-price?${buildParams(year)}`);
      const data = await res.json() as Record<string, unknown>;
      const price = Number(data.price ?? data.pricePerSqm ?? 0);
      if (!res.ok || price <= 0) {
        setLookupMsg({ text: `${year}년 공시가격 데이터를 찾을 수 없습니다.`, kind: "err" });
        return;
      }
      const label = buildLabel(data, year);
      if (target === "acquisition") {
        onChange({ standardPriceAtAcquisition: String(price), standardPriceAtAcquisitionLabel: label });
      } else {
        onChange({ standardPriceAtTransfer: String(price), standardPriceAtTransferLabel: label });
      }
      setLookupMsg({ text: `${year}년 조회 완료`, kind: "ok" });
    } catch {
      setLookupMsg({ text: "네트워크 오류", kind: "err" });
    } finally {
      if (target === "acquisition") setAcqLoading(false);
      else setTsfLoading(false);
    }
  }

  // 날짜 기준 자동 연도 탐색 조회 (하단 통합 버튼 + 자동 조회용)
  async function lookupStandardPrice(target: "transfer" | "acquisition", silent = false) {
    if (!form.propertyAddressJibun) {
      if (!silent) setLookupMsg({ text: "먼저 Step 2에서 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return;
    }
    const dateStr = target === "transfer" ? form.transferDate : form.acquisitionDate;
    if (!dateStr) {
      if (!silent) setLookupMsg({ text: "날짜를 먼저 입력하세요.", kind: "err" });
      return;
    }
    const detail = form.propertyAddressDetail?.trim() ?? "";
    const parts = detail.split(/\s+/);
    const dong = parts.length >= 2 ? parts[0] : "";
    const ho   = parts.length >= 2 ? parts.slice(1).join(" ") : "";
    const txDateCompact = dateStr.replace(/-/g, "");

    if (!silent) {
      if (target === "acquisition") setAcqLoading(true);
      else setTsfLoading(true);
      setLookupMsg(null);
    }

    try {
      const txYear = parseInt(dateStr.slice(0, 4));
      const yearCandidates = [txYear, txYear - 1, txYear - 2, txYear - 3].map(String);

      for (const year of yearCandidates) {
        const params = new URLSearchParams({ jibun: form.propertyAddressJibun, propertyType: form.propertyType, year });
        if (dong) params.set("dong", dong);
        if (ho)   params.set("ho", ho);

        const res = await fetch(`/api/address/standard-price?${params.toString()}`);
        const data = await res.json() as Record<string, unknown>;
        if (!res.ok) continue;

        const price = Number(data.price ?? data.pricePerSqm ?? 0);
        if (price <= 0) continue;

        const announcedDate = String(data.announcedDate ?? "");
        const effectiveAnnounced = announcedDate.length === 8
          ? announcedDate
          : data.priceType === "land_price" ? `${year}0531` : `${year}0429`;
        if (txDateCompact < effectiveAnnounced) continue;

        const label = buildLabel(data, year);
        if (target === "acquisition") {
          onChange({ standardPriceAtAcquisition: String(price), standardPriceAtAcquisitionLabel: label });
          setAcqYear(year);
        } else {
          onChange({ standardPriceAtTransfer: String(price), standardPriceAtTransferLabel: label });
          setTsfYear(year);
        }
        if (!silent) setLookupMsg({ text: `조회 완료 (${target === "acquisition" ? "취득" : "양도"} 시점)`, kind: "ok" });
        return;
      }
      if (!silent) setLookupMsg({ text: "공시가격 데이터를 찾을 수 없습니다.", kind: "err" });
    } catch {
      if (!silent) setLookupMsg({ text: "네트워크 오류", kind: "err" });
    } finally {
      if (!silent) {
        if (target === "acquisition") setAcqLoading(false);
        else setTsfLoading(false);
      }
    }
  }

  // 구 형식 레이블 마이그레이션
  const isNewFormat = (label: string) => label.includes("공시일");
  useEffect(() => {
    if (form.standardPriceAtAcquisitionLabel && !isNewFormat(form.standardPriceAtAcquisitionLabel)) {
      onChange({ standardPriceAtAcquisitionLabel: "" });
    }
    if (form.standardPriceAtTransferLabel && !isNewFormat(form.standardPriceAtTransferLabel)) {
      onChange({ standardPriceAtTransferLabel: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 주소·날짜·연도 준비되면 자동 조회 — 이미 해당 연도 가격이 있으면 스킵
  useEffect(() => {
    if (!form.propertyAddressJibun || !form.acquisitionDate) return;
    if (!form.useEstimatedAcquisition) return;
    if (form.standardPriceAtAcquisition && form.standardPriceAtAcquisitionLabel?.includes(acqYear)) return;
    fetchPriceForYear("acquisition", acqYear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.propertyAddressJibun, form.acquisitionDate, form.useEstimatedAcquisition, form.propertyType, acqYear]);

  useEffect(() => {
    if (!form.propertyAddressJibun || !form.transferDate) return;
    if (!form.useEstimatedAcquisition) return;
    if (form.standardPriceAtTransfer && form.standardPriceAtTransferLabel?.includes(tsfYear)) return;
    fetchPriceForYear("transfer", tsfYear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.propertyAddressJibun, form.transferDate, form.useEstimatedAcquisition, form.propertyType, tsfYear]);

  // 연도 선택 드롭다운 공통 스타일
  const yearSelectCls = "rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const fetchBtnCls = "px-3 py-2 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap transition-colors";

  // 취득 원인 변경 시 부수 필드 초기화
  useEffect(() => {
    const patch: Partial<TransferFormData> = {};
    if (form.acquisitionCause !== "inheritance" && form.decedentAcquisitionDate) {
      patch.decedentAcquisitionDate = "";
    }
    if (form.acquisitionCause !== "gift" && form.donorAcquisitionDate) {
      patch.donorAcquisitionDate = "";
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.acquisitionCause]);

  const acquisitionDateLabel =
    form.acquisitionCause === "inheritance"
      ? "상속개시일"
      : form.acquisitionCause === "gift"
        ? "증여일(취득일)"
        : "취득일";

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">취득가액과 필요경비를 입력하세요.</p>

      {/* 취득 원인 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          취득 원인 <span className="text-destructive">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "purchase" as const, label: "매매", desc: "유상취득" },
            { value: "inheritance" as const, label: "상속", desc: "피상속인 사망" },
            { value: "gift" as const, label: "증여", desc: "무상취득" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ acquisitionCause: opt.value })}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md border-2 px-3 py-2.5 text-center transition-all",
                form.acquisitionCause === opt.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              )}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
              <span className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          {acquisitionDateLabel} <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={form.acquisitionDate}
          onChange={(v) => onChange({ acquisitionDate: v })}
        />
      </div>

      {form.acquisitionCause === "inheritance" && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            피상속인 취득일 <span className="text-destructive">*</span>
          </label>
          <DateInput
            value={form.decedentAcquisitionDate}
            onChange={(v) => onChange({ decedentAcquisitionDate: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            ※ 단기보유 단일세율(50%/40%·70%/60%) 판정 시 피상속인 취득일부터 양도일까지 보유기간을 통산합니다 — 소득세법 §95④
          </p>
        </div>
      )}

      {form.acquisitionCause === "gift" && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            증여자 취득일 <span className="text-destructive">*</span>
          </label>
          <DateInput
            value={form.donorAcquisitionDate}
            onChange={(v) => onChange({ donorAcquisitionDate: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            ※ 단기보유 단일세율 판정 시 증여자 취득일부터 양도일까지 보유기간을 통산합니다.
          </p>
        </div>
      )}

      {/* 취득가 산정 방식 — 3지선다 */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">취득가 산정 방식 <span className="text-destructive">*</span></p>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
          {(["actual", "estimated", "appraisal"] as const).map((method) => {
            const labels: Record<string, string> = {
              actual: "실거래가",
              estimated: "환산취득가액 (기준시가 비율)",
              appraisal: "감정가액",
            };
            const hints: Record<string, string> = {
              actual: "취득 당시 실제 매매금액",
              estimated: "취득 당시 실거래가 불명 시 기준시가 비율로 환산",
              appraisal: "공인감정기관의 감정가액",
            };
            const isSelected = (form.acquisitionMethod || "actual") === method;
            return (
              <label key={method} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="acquisitionMethod"
                  value={method}
                  checked={isSelected}
                  onChange={() => onChange({
                    acquisitionMethod: method,
                    useEstimatedAcquisition: method === "estimated",
                    acquisitionPrice: "",
                  })}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div>
                  <span className="text-sm font-medium">{labels[method]}</span>
                  <p className="text-xs text-muted-foreground">{hints[method]}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {(form.acquisitionMethod || "actual") === "estimated" || form.useEstimatedAcquisition ? (
        <div className="space-y-4 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
          <p className="text-xs font-medium text-primary">
            환산취득가 = 양도가액 × (취득 당시 기준시가 ÷ 양도 당시 기준시가)
          </p>

          {/* 취득 당시 기준시가 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              취득 당시 기준시가 <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={acqYear}
                onChange={(e) => setAcqYear(e.target.value)}
                className={yearSelectCls}
                aria-label="취득 당시 기준시가 조회 연도"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <div className="flex-1">
                <CurrencyInput
                  label=""
                  value={form.standardPriceAtAcquisition}
                  onChange={(v) => onChange({ standardPriceAtAcquisition: v, standardPriceAtAcquisitionLabel: v ? form.standardPriceAtAcquisitionLabel : "" })}
                  placeholder="취득 시점 공시가격"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => fetchPriceForYear("acquisition", acqYear)}
                disabled={acqLoading || !form.propertyAddressJibun}
                className={fetchBtnCls}
              >
                {acqLoading ? "조회중" : "조회"}
              </button>
            </div>
            {form.standardPriceAtAcquisitionLabel && (
              <p className="text-xs text-muted-foreground">{form.standardPriceAtAcquisitionLabel}</p>
            )}
          </div>

          {/* 양도 당시 기준시가 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              양도 당시 기준시가 <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={tsfYear}
                onChange={(e) => setTsfYear(e.target.value)}
                className={yearSelectCls}
                aria-label="양도 당시 기준시가 조회 연도"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <div className="flex-1">
                <CurrencyInput
                  label=""
                  value={form.standardPriceAtTransfer}
                  onChange={(v) => onChange({ standardPriceAtTransfer: v, standardPriceAtTransferLabel: v ? form.standardPriceAtTransferLabel : "" })}
                  placeholder="양도 시점 공시가격"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => fetchPriceForYear("transfer", tsfYear)}
                disabled={tsfLoading || !form.propertyAddressJibun}
                className={fetchBtnCls}
              >
                {tsfLoading ? "조회중" : "조회"}
              </button>
            </div>
            {form.standardPriceAtTransferLabel && (
              <p className="text-xs text-muted-foreground">{form.standardPriceAtTransferLabel}</p>
            )}
          </div>

          {/* 공시가격 조회 — 하단 통합 버튼 */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={async () => {
                setLookupMsg(null);
                await lookupStandardPrice("acquisition");
                await lookupStandardPrice("transfer");
              }}
              disabled={acqLoading || tsfLoading || !form.propertyAddressJibun}
              className="text-xs text-primary underline disabled:opacity-50 hover:text-primary/80"
            >
              {acqLoading || tsfLoading ? "조회중..." : "🔎 Vworld 공시가격 자동 조회"}
            </button>
            {lookupMsg && (
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
          placeholder={
            form.acquisitionCause === "inheritance"
              ? "상속 재산 평가액"
              : form.acquisitionCause === "gift"
                ? "증여 재산 평가액"
                : "실제 취득금액"
          }
          required
          hint={
            form.acquisitionCause === "inheritance"
              ? "상속 재산 평가액을 입력하세요."
              : form.acquisitionCause === "gift"
                ? "증여 재산 평가액을 입력하세요."
                : "취득 당시 실제 매매금액을 입력하세요."
          }
        />
      )}

      {/* 감정가액 입력 */}
      {(form.acquisitionMethod === "appraisal") && (
        <CurrencyInput
          label="감정가액"
          value={form.appraisalValue ?? ""}
          onChange={(v) => onChange({ appraisalValue: v })}
          placeholder="공인감정기관의 감정가액"
          required
          hint="취득 당시 공인감정기관이 평가한 가액"
        />
      )}

      {/* 1990.8.30. 이전 취득 토지 환산 (land + acquisitionDate < 1990-08-30) */}
      {form.propertyType === "land" && form.acquisitionDate && form.acquisitionDate < "1990-08-30" && (
        <Pre1990LandValuationInput
          form={{
            pre1990Enabled: form.pre1990Enabled,
            pre1990AreaSqm: form.pre1990AreaSqm,
            pre1990PricePerSqm_1990: form.pre1990PricePerSqm_1990,
            pre1990PricePerSqm_atTransfer: form.pre1990PricePerSqm_atTransfer,
            pre1990Grade_current: form.pre1990Grade_current,
            pre1990Grade_prev: form.pre1990Grade_prev,
            pre1990Grade_atAcq: form.pre1990Grade_atAcq,
            pre1990GradeMode: form.pre1990GradeMode,
          }}
          onChange={(patch) => onChange(patch)}
        />
      )}

      {(form.acquisitionMethod || "actual") === "estimated" || form.useEstimatedAcquisition ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">필요경비</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            환산취득가액 적용 시 개산공제(취득 당시 기준시가 × 3%)가 자동 반영됩니다.
            별도 필요경비는 입력하지 않습니다.
          </p>
        </div>
      ) : form.acquisitionMethod !== "appraisal" ? (
        <CurrencyInput
          label="필요경비"
          value={form.expenses}
          onChange={(v) => onChange({ expenses: v })}
          placeholder="0"
          hint="취득·양도 시 부대비용 (중개수수료, 취득세, 인테리어비 등)"
        />
      ) : null}

      {/* §114조의2 신축·증축 가산세 판정 섹션 */}
      {(form.propertyType === "building" || form.propertyType === "housing") && (
        <div className="space-y-3 rounded-lg border border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSelfBuilt ?? false}
              onChange={(e) => onChange({ isSelfBuilt: e.target.checked, buildingType: "", constructionDate: "", extensionFloorArea: "" })}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-sm font-medium">본인이 신축 또는 증축한 건물입니까?</span>
          </label>
          {form.isSelfBuilt && (
            <div className="space-y-3 pl-6">
              <div className="flex gap-4">
                {(["new", "extension"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="buildingType"
                      value={t}
                      checked={form.buildingType === t}
                      onChange={() => onChange({ buildingType: t })}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm">{t === "new" ? "신축" : "증축"}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm">신축·증축 완공일 <span className="text-destructive">*</span></label>
                <DateInput
                  value={form.constructionDate ?? ""}
                  onChange={(v) => onChange({ constructionDate: v })}
                />
              </div>
              {form.buildingType === "extension" && (
                <div className="space-y-1.5">
                  <label className="block text-sm">증축 바닥면적 합계 (㎡) <span className="text-destructive">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.extensionFloorArea ?? ""}
                    onChange={(e) => onChange({ extensionFloorArea: e.target.value })}
                    placeholder="예: 120.5"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">85㎡ 초과 시 가산세 적용 (소득세법 §114조의2)</p>
                </div>
              )}
              <p className="text-xs text-amber-700 dark:text-amber-400">
                ⚠️ 신축·증축 후 5년 이내 양도 + 환산취득가액·감정가액 사용 시 5% 가산세가 부과됩니다.
              </p>
            </div>
          )}
        </div>
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
          {/* [I4] 3지선다 — 수도권 과밀억제권역 외는 §99 ④~⑥에서 별도 감면율 적용 */}
          <div className="flex flex-col gap-2">
            {[
              { value: "metropolitan", label: "수도권 (과밀억제권역)", desc: "50% 감면" },
              { value: "outside_overconcentration", label: "수도권 (과밀억제권역 외)", desc: "조문별 상이" },
              { value: "non_metropolitan", label: "비수도권 (지방)", desc: "100% 감면" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reductionRegion"
                  value={opt.value}
                  checked={form.reductionRegion === opt.value}
                  onChange={() => onChange({ reductionRegion: opt.value as typeof form.reductionRegion })}
                  className="accent-primary"
                  aria-label={opt.label}
                />
                <span className="text-sm">{opt.label}</span>
                <span className="text-xs text-muted-foreground">({opt.desc})</span>
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
// Step 6: 가산세 (선택 입력)
// ============================================================
function Step6({
  form,
  onChange,
  determinedTax,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  determinedTax: number | null;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 기납부세액 변경 시 미납세액 자동 재계산
  function handlePriorPaidChange(v: string) {
    onChange({ priorPaidTax: v });
    if (determinedTax !== null) {
      const priorPaid = parseAmount(v ?? "0");
      const autoUnpaid = Math.max(0, determinedTax - priorPaid);
      onChange({ priorPaidTax: v, unpaidTax: autoUnpaid > 0 ? String(autoUnpaid) : "0" });
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        가산세 계산이 필요한 경우에만 입력하세요. (선택 사항)
      </p>

      {/* 가산세 계산 토글 */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.enablePenalty}
          onChange={(e) => onChange({ enablePenalty: e.target.checked })}
          className="accent-primary w-4 h-4"
        />
        <span className="text-sm font-medium">가산세 계산하기</span>
      </label>

      {(form.enablePenalty ?? false) && (
        <div className="space-y-5 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">

          {/* 신고불성실가산세 */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-primary">신고불성실가산세 (국세기본법 §47의2·§47의3)</p>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">신고 유형</label>
              <div className="flex flex-col gap-2">
                {([
                  { value: "correct"      as const, label: "정상신고",    desc: "가산세 없음" },
                  { value: "none"         as const, label: "무신고",      desc: "납부세액 × 20% (부정행위 40%)" },
                  { value: "under"        as const, label: "과소신고",    desc: "납부세액 × 10% (부정행위 40%)" },
                  { value: "excess_refund"as const, label: "초과환급신고",desc: "납부세액 × 10% (부정행위 40%)" },
                ]).map((opt) => (
                  <label key={opt.value} className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    form.filingType === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}>
                    <input
                      type="radio"
                      name="filingType"
                      value={opt.value}
                      checked={form.filingType === opt.value}
                      onChange={() => onChange({ filingType: opt.value })}
                      className="accent-primary"
                      aria-label={opt.label}
                    />
                    <div>
                      <span className="font-medium">{opt.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {(form.filingType ?? "correct") !== "correct" && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">부정행위 여부</label>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: "normal",         label: "일반 (단순 착오·실수)",                  desc: "" },
                      { value: "fraudulent",     label: "부정행위",                              desc: "이중장부·허위증빙·재산은닉 등 → 40%" },
                      { value: "offshore_fraud", label: "역외거래 부정행위 (2015.7.1 이후)",     desc: "→ 60%" },
                    ].map((opt) => (
                      <label key={opt.value} className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                        form.penaltyReason === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                      )}>
                        <input
                          type="radio"
                          name="penaltyReason"
                          value={opt.value}
                          checked={form.penaltyReason === opt.value}
                          onChange={() => onChange({ penaltyReason: opt.value as typeof form.penaltyReason })}
                          className="accent-primary"
                          aria-label={opt.label}
                        />
                        <div>
                          <span className="font-medium">{opt.label}</span>
                          {opt.desc && <span className="ml-2 text-xs text-muted-foreground">{opt.desc}</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <CurrencyInput
                  label="기납부세액"
                  value={form.priorPaidTax}
                  onChange={handlePriorPaidChange}
                  placeholder="0"
                  hint="예정신고 시 기납부한 세액"
                />

                {(form.filingType === "under" || form.filingType === "excess_refund") && (
                  <CurrencyInput
                    label="당초 신고세액"
                    value={form.originalFiledTax}
                    onChange={(v) => onChange({ originalFiledTax: v })}
                    placeholder="0"
                    hint="최초 신고한 납부세액"
                  />
                )}

                {form.filingType === "excess_refund" && (
                  <CurrencyInput
                    label="초과환급신고 환급세액"
                    value={form.excessRefundAmount}
                    onChange={(v) => onChange({ excessRefundAmount: v })}
                    placeholder="0"
                    hint="과다 수령한 환급세액"
                  />
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((p) => !p)}
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    {showAdvanced ? "고급 설정 접기 ▲" : "고급 설정 (이자상당액 가산액) ▼"}
                  </button>
                  {showAdvanced && (
                    <div className="mt-2">
                      <CurrencyInput
                        label="이자상당액 가산액"
                        value={form.interestSurcharge}
                        onChange={(v) => onChange({ interestSurcharge: v })}
                        placeholder="0"
                        hint="세법에 따른 이자상당액 — 가산세 산정 납부세액에서 제외 (국세기본법 §47의2③)"
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 지연납부가산세 */}
          <div className="space-y-3 border-t border-border/50 pt-4">
            <p className="text-xs font-semibold text-primary">지연납부가산세 (국세기본법 §47의4)</p>

            <CurrencyInput
              label="미납·미달납부세액"
              value={form.unpaidTax}
              onChange={(v) => onChange({ unpaidTax: v })}
              placeholder="0"
              hint={
                determinedTax !== null
                  ? `결정세액 ${determinedTax.toLocaleString()}원 − 기납부세액 자동 계산`
                  : "납부하지 않았거나 미달납부한 세액 (가산세 계산하기 클릭 시 자동 계산)"
              }
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">법정납부기한</label>
              <DateInput
                value={form.paymentDeadline}
                onChange={(v) => onChange({ paymentDeadline: v })}
              />
              <p className="text-xs text-muted-foreground">
                예정신고: 양도월 말일부터 2개월 / 확정신고: 다음해 5월 31일
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">실제 납부일 <span className="text-muted-foreground font-normal">(미입력 시 오늘 기준)</span></label>
              <DateInput
                value={form.actualPaymentDate}
                onChange={(v) => onChange({ actualPaymentDate: v })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 메인 컴포넌트
// ============================================================
interface TransferTaxCalculatorProps {
  /** 다건 모드: 현재 자산 저장 후 새 자산 추가 (마법사 step 0으로 리셋) */
  onSaveAndAddNext?: () => void;
  /** 다건 모드: 현재 자산 저장 후 공통 설정 단계로 이동 */
  onSaveAndGoToSettings?: () => void;
}

export default function TransferTaxCalculator({
  onSaveAndAddNext,
  onSaveAndGoToSettings,
}: TransferTaxCalculatorProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  // 다건 양도 편집 모드 내 임베딩 여부
  const isEmbeddedInMulti = pathname?.includes("/multi") ?? false;
  // 다건 모드는 5단계 (가산세 제외 — 합산 결과 기준이므로 공통 설정에서 입력)
  const STEPS = isEmbeddedInMulti ? STEPS_MULTI : STEPS_SINGLE;
  const { currentStep, formData, result, setStep, updateFormData, setResult, reset, clearPendingMigration } =
    useCalcWizardStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [penaltyResult, setPenaltyResult] = useState<TransferTaxPenaltyResult | null>(null);
  const [isPenaltyLoading, setIsPenaltyLoading] = useState(false);
  /** 가산세 계산하기로 얻은 결정세액 — unpaidTax 자동 계산용 */
  const [calcDeterminedTax, setCalcDeterminedTax] = useState<number | null>(null);

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

  const totalSteps = STEPS.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isResult = result !== null && currentStep === totalSteps;

  // 잘못된 step 상태 복구: currentStep >= totalSteps인데 result가 없으면 step 0으로 리셋
  useEffect(() => {
    if (currentStep >= totalSteps && !result) {
      setStep(0);
    }
  }, [currentStep, result, setStep]);

  // 신고일·양도일 변경 시 가산세 필드 자동 설정
  //   - 신고기한 초과 시: 무신고(filingType="none") + 지연납부 자동 ON, paymentDeadline=신고기한, actualPaymentDate=신고일
  //   - 신고기한 이내 또는 신고일 미입력: 가산세 자동 OFF
  useEffect(() => {
    const { transferDate, filingDate } = formData;
    if (!transferDate || !filingDate) {
      if (formData.enablePenalty) {
        updateFormData({
          enablePenalty: false,
          filingType: "correct",
          paymentDeadline: "",
          actualPaymentDate: "",
        });
      }
      return;
    }
    const overdue = isFilingOverdue(transferDate, filingDate);
    if (overdue) {
      const deadline = getFilingDeadline(transferDate);
      if (
        !formData.enablePenalty ||
        formData.filingType !== "none" ||
        formData.paymentDeadline !== deadline ||
        formData.actualPaymentDate !== filingDate
      ) {
        updateFormData({
          enablePenalty: true,
          filingType: "none",
          penaltyReason: formData.penaltyReason || "normal",
          paymentDeadline: deadline,
          actualPaymentDate: filingDate,
        });
      }
    } else {
      if (formData.enablePenalty) {
        updateFormData({
          enablePenalty: false,
          filingType: "correct",
          paymentDeadline: "",
          actualPaymentDate: "",
        });
      }
    }
    // 의도적으로 일부 필드만 의존성에 포함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.transferDate, formData.filingDate]);

  function handleNext() {
    const err = validateStep(currentStep, formData);
    if (err) { setError(err); return; }
    setError(null);
    setStep(currentStep + 1);
  }

  function handleBack() {
    setError(null);
    if (currentStep === 0) {
      if (!isEmbeddedInMulti) router.push("/");
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
          // [I8] 양도일 기준 세법 버전 — 세법 적용 시점을 오늘이 아닌 양도일로 기록
          taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
        });
        // [I6] 이력 저장 성공 후 pendingMigration 플래그 해제
        clearPendingMigration();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePenaltyCalc() {
    setError(null);
    setIsPenaltyLoading(true);
    try {
      // 1단계: enablePenalty 없이 결정세액만 확보
      const baseRes = await callTransferTaxAPI({ ...formData, enablePenalty: false });
      const detTax = baseRes.determinedTax;
      setCalcDeterminedTax(detTax);

      // 2단계: 미납세액 자동 계산
      const priorPaid = parseAmount(formData.priorPaidTax ?? "0");
      const autoUnpaid = Math.max(0, detTax - priorPaid);
      const updatedUnpaidTax = autoUnpaid > 0 ? String(autoUnpaid) : "0";
      updateFormData({ unpaidTax: updatedUnpaidTax });

      // 3단계: 계산된 unpaidTax로 가산세 포함 재계산
      const penaltyRes = await callTransferTaxAPI({ ...formData, unpaidTax: updatedUnpaidTax });
      setPenaltyResult(penaltyRes.penaltyDetail ?? null);
      if (!penaltyRes.penaltyDetail) {
        setError("가산세 항목을 입력해 주세요. (신고 유형 또는 미납세액+납부기한)");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "가산세 계산 중 오류가 발생했습니다.");
    } finally {
      setIsPenaltyLoading(false);
    }
  }

  function handleReset() {
    reset();
    setError(null);
    setPenaltyResult(null);
  }

  const stepComponentsAll = [
    <Step1 key={0} form={formData} onChange={updateFormData} />,
    <Step2 key={1} form={formData} onChange={updateFormData} />,
    <Step3 key={2} form={formData} onChange={updateFormData} />,
    <Step4 key={3} form={formData} onChange={updateFormData} />,
    <Step5 key={4} form={formData} onChange={updateFormData} />,
    <Step6 key={5} form={formData} onChange={updateFormData} determinedTax={calcDeterminedTax} />,
  ];
  // 다건 모드는 가산세(Step6) 제외
  const stepComponents = isEmbeddedInMulti ? stepComponentsAll.slice(0, 5) : stepComponentsAll;

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <h1 className="text-2xl font-bold">양도소득세 계산기</h1>
        <div className="mt-2">
          <a
            href="/calc/transfer-tax/multi"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary text-primary text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            여러건 양도 계산 →
          </a>
        </div>
      </div>

      {isResult && result ? (
        <TransferTaxResultView
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
          <StepIndicator
            steps={STEPS}
            current={currentStep}
            onStepClick={(i) => {
              if (i === currentStep) return;
              setError(null);
              setStep(i);
            }}
          />

          {/* 단계 제목 */}
          <h2 className="text-base font-semibold mb-4">
            {["물건 유형 선택", "양도 정보 입력", "취득 정보 입력", "보유 상황 입력", "감면 확인", "가산세 입력"][currentStep]}
          </h2>

          {/* 폼 내용 */}
          <div className="min-h-[280px]">
            {stepComponents[currentStep]}
          </div>

          {/* 가산세 계산 결과 인라인 카드 */}
          {isLastStep && penaltyResult && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">가산세 계산 결과</p>
              {penaltyResult.filingPenalty && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-muted-foreground">신고불성실가산세</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">납부세액 기준</span>
                    <span>{penaltyResult.filingPenalty.penaltyBase.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">적용 세율</span>
                    <span>{(penaltyResult.filingPenalty.penaltyRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>신고불성실가산세</span>
                    <span className="text-destructive">{penaltyResult.filingPenalty.filingPenalty.toLocaleString()}원</span>
                  </div>
                </div>
              )}
              {penaltyResult.delayedPaymentPenalty && (
                <div className="space-y-1 text-sm border-t border-border/40 pt-3">
                  <p className="font-medium text-muted-foreground">지연납부가산세</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">미납세액</span>
                    <span>{penaltyResult.delayedPaymentPenalty.unpaidTax.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">경과일수</span>
                    <span>{penaltyResult.delayedPaymentPenalty.elapsedDays}일</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">일 이자율</span>
                    <span>{(penaltyResult.delayedPaymentPenalty.dailyRate * 100).toFixed(3)}%</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>지연납부가산세</span>
                    <span className="text-destructive">{penaltyResult.delayedPaymentPenalty.delayedPaymentPenalty.toLocaleString()}원</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>가산세 합계</span>
                <span className="text-destructive">{penaltyResult.totalPenalty.toLocaleString()}원</span>
              </div>
            </div>
          )}

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
          <div className="mt-6 space-y-2">
            {isLastStep && !isEmbeddedInMulti && formData.enablePenalty && (
              <button
                type="button"
                onClick={handlePenaltyCalc}
                disabled={isPenaltyLoading}
                className="w-full rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60 transition-colors"
              >
                {isPenaltyLoading ? "계산 중..." : "가산세 계산하기"}
              </button>
            )}
            <div className="flex gap-3">
              {/* 다건 편집 모드 내 step 0에서는 홈으로 버튼 미표시 */}
              {!(isEmbeddedInMulti && currentStep === 0) && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
                >
                  {currentStep === 0 ? "홈으로" : "이전"}
                </button>
              )}
              {isLastStep ? (
                isEmbeddedInMulti ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const err = validateStep(currentStep, formData);
                        if (err) { setError(err); return; }
                        setError(null);
                        onSaveAndAddNext?.();
                      }}
                      className="flex-1 rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      + 양도 건 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const err = validateStep(currentStep, formData);
                        if (err) { setError(err); return; }
                        setError(null);
                        onSaveAndGoToSettings?.();
                      }}
                      className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      공통 설정으로 →
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                  >
                    {isLoading ? "계산 중..." : "세금 계산하기"}
                  </button>
                )
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
          </div>
        </>
      )}
    </div>
  );
}
