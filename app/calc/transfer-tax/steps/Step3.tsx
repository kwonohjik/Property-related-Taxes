import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";

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

export function Step3({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
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
      {/* 다필지 모드 */}
      {form.parcelMode && form.propertyType === "land" && (
        <>
          <p className="text-sm text-muted-foreground">필지별 취득 정보를 입력하세요.</p>
          <ParcelListInput
            parcels={form.parcels ?? []}
            totalTransferPrice={parseAmount(form.transferPrice)}
            onChange={(parcels) => onChange({ parcels })}
          />
        </>
      )}

      {(!form.parcelMode || form.propertyType !== "land") && (<>
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
      </>)}
    </div>
  );
}
