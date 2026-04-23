import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";

// ============================================================
// Step 3: 취득 정보 상세 (주 자산 공시가격 조회 및 특례)
//
// 취득 원인·취득일·취득가는 Step 1 자산 카드에서 입력.
// 여기서는 환산취득가 공시가격 조회, 감정가액, pre1990, 다필지, 신축·증축을 다룸.
// ============================================================

function getDefaultPriceYear(dateStr: string, assetKind: string): string {
  if (!dateStr || dateStr.length < 10) return String(new Date().getFullYear());
  const year = parseInt(dateStr.slice(0, 4));
  const mmdd = dateStr.slice(5, 7) + dateStr.slice(8, 10);
  const cutoff = assetKind === "land" ? "0531" : "0429";
  return mmdd < cutoff ? String(year - 1) : String(year);
}

export function Step3({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const primary: AssetForm = form.assets[0] ?? {
    assetId: "",
    assetLabel: "",
    assetKind: "housing",
    isSuccessorRightToMoveIn: false,
    isPrimaryForHouseholdFlags: true,
    standardPriceAtTransfer: "",
    standardPriceAtTransferLabel: "",
    directExpenses: "0",
    reductions: [],
    inheritanceValuationMode: "auto",
    inheritanceDate: "",
    inheritanceAssetKind: "land",
    landAreaM2: "",
    publishedValueAtInheritance: "",
    fixedAcquisitionPrice: "",
    addressRoad: "",
    addressJibun: "",
    addressDetail: "",
    buildingName: "",
    isOneHousehold: false,
    actualSalePrice: "",
    acquisitionCause: "purchase",
    acquisitionDate: "",
    decedentAcquisitionDate: "",
    donorAcquisitionDate: "",
    useEstimatedAcquisition: false,
    standardPriceAtAcq: "",
    standardPriceAtAcqLabel: "",
    parcelMode: false,
    parcels: [],
  };

  const onPrimaryChange = useCallback(
    (patch: Partial<AssetForm>) => {
      const newAssets = [...form.assets];
      if (newAssets.length === 0) return;
      newAssets[0] = { ...newAssets[0], ...patch };
      onChange({ assets: newAssets });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.assets, onChange],
  );

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1984 }, (_, i) => String(currentYear - i));

  const [acqYear, setAcqYear] = useState<string>(
    () => getDefaultPriceYear(primary.acquisitionDate, primary.assetKind)
  );
  const [tsfYear, setTsfYear] = useState<string>(
    () => getDefaultPriceYear(form.transferDate, primary.assetKind)
  );
  const isAcqYearPre1990 = parseInt(acqYear) < 1990;

  const [acqLoading, setAcqLoading] = useState(false);
  const [tsfLoading, setTsfLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const prevAcqDateRef = useRef(primary.acquisitionDate);
  const prevTsfDateRef = useRef(form.transferDate);

  useEffect(() => {
    if (!primary.acquisitionDate) return;
    setAcqYear(getDefaultPriceYear(primary.acquisitionDate, primary.assetKind));
    if (prevAcqDateRef.current && prevAcqDateRef.current !== primary.acquisitionDate) {
      onPrimaryChange({ standardPriceAtAcq: "", standardPriceAtAcqLabel: "" });
    }
    prevAcqDateRef.current = primary.acquisitionDate;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.acquisitionDate, primary.assetKind]);

  useEffect(() => {
    if (!form.transferDate) return;
    setTsfYear(getDefaultPriceYear(form.transferDate, primary.assetKind));
    if (prevTsfDateRef.current && prevTsfDateRef.current !== form.transferDate) {
      onPrimaryChange({ standardPriceAtTransfer: "", standardPriceAtTransferLabel: "" });
    }
    prevTsfDateRef.current = form.transferDate;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.transferDate, primary.assetKind]);

  function buildLabel(data: Record<string, unknown>, year: string): string {
    const announcedDate = String(data.announcedDate ?? "");
    const effectiveDate =
      announcedDate.length === 8
        ? announcedDate
        : data.priceType === "land_price"
          ? `${year}0531`
          : `${year}0429`;
    const typeName =
      data.priceType === "apart_housing_price"
        ? "공동주택"
        : data.priceType === "indvd_housing_price"
          ? "개별주택"
          : data.priceType === "land_price"
            ? "개별공시지가"
            : "공시가격";
    const d = effectiveDate;
    const pubDate = `${d.slice(0, 4)}.${parseInt(d.slice(4, 6), 10)}.${parseInt(d.slice(6, 8), 10)}.`;
    return `${typeName} 공시일 : ${pubDate}`;
  }

  function buildParams(year: string) {
    const detail = (primary.addressDetail ?? "").trim();
    const parts = detail.split(/\s+/);
    const dong = parts.length >= 2 ? parts[0] : "";
    const ho = parts.length >= 2 ? parts.slice(1).join(" ") : "";
    const params = new URLSearchParams({ jibun: primary.addressJibun, propertyType: primary.assetKind, year });
    if (dong) params.set("dong", dong);
    if (ho) params.set("ho", ho);
    return params;
  }

  async function fetchPriceForYear(target: "acquisition" | "transfer", year: string) {
    if (!primary.addressJibun) {
      setLookupMsg({ text: "먼저 자산 카드에서 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return;
    }
    if (target === "acquisition") setAcqLoading(true);
    else setTsfLoading(true);
    setLookupMsg(null);
    try {
      const res = await fetch(`/api/address/standard-price?${buildParams(year)}`);
      const data = (await res.json()) as Record<string, unknown>;
      const price = Number(data.price ?? data.pricePerSqm ?? 0);
      if (!res.ok || price <= 0) {
        setLookupMsg({ text: `${year}년 공시가격 데이터를 찾을 수 없습니다.`, kind: "err" });
        return;
      }
      const label = buildLabel(data, year);
      if (target === "acquisition") {
        onPrimaryChange({ standardPriceAtAcq: String(price), standardPriceAtAcqLabel: label });
      } else {
        onPrimaryChange({ standardPriceAtTransfer: String(price), standardPriceAtTransferLabel: label });
      }
      setLookupMsg({ text: `${year}년 조회 완료`, kind: "ok" });
    } catch {
      setLookupMsg({ text: "네트워크 오류", kind: "err" });
    } finally {
      if (target === "acquisition") setAcqLoading(false);
      else setTsfLoading(false);
    }
  }

  async function lookupStandardPrice(target: "transfer" | "acquisition", silent = false) {
    if (!primary.addressJibun) {
      if (!silent)
        setLookupMsg({ text: "먼저 자산 카드에서 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return;
    }
    const dateStr = target === "transfer" ? form.transferDate : primary.acquisitionDate;
    if (!dateStr) {
      if (!silent) setLookupMsg({ text: "날짜를 먼저 입력하세요.", kind: "err" });
      return;
    }
    const detail = (primary.addressDetail ?? "").trim();
    const parts = detail.split(/\s+/);
    const dong = parts.length >= 2 ? parts[0] : "";
    const ho = parts.length >= 2 ? parts.slice(1).join(" ") : "";
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
        const params = new URLSearchParams({ jibun: primary.addressJibun, propertyType: primary.assetKind, year });
        if (dong) params.set("dong", dong);
        if (ho) params.set("ho", ho);

        const res = await fetch(`/api/address/standard-price?${params.toString()}`);
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) continue;

        const price = Number(data.price ?? data.pricePerSqm ?? 0);
        if (price <= 0) continue;

        const announcedDate = String(data.announcedDate ?? "");
        const effectiveAnnounced =
          announcedDate.length === 8
            ? announcedDate
            : data.priceType === "land_price"
              ? `${year}0531`
              : `${year}0429`;
        if (txDateCompact < effectiveAnnounced) continue;

        const label = buildLabel(data, year);
        if (target === "acquisition") {
          onPrimaryChange({ standardPriceAtAcq: String(price), standardPriceAtAcqLabel: label });
          setAcqYear(year);
        } else {
          onPrimaryChange({ standardPriceAtTransfer: String(price), standardPriceAtTransferLabel: label });
          setTsfYear(year);
        }
        if (!silent)
          setLookupMsg({ text: `조회 완료 (${target === "acquisition" ? "취득" : "양도"} 시점)`, kind: "ok" });
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
  useEffect(() => {
    const isNewFormat = (label: string) => label.includes("공시일");
    if (primary.standardPriceAtAcqLabel && !isNewFormat(primary.standardPriceAtAcqLabel)) {
      onPrimaryChange({ standardPriceAtAcqLabel: "" });
    }
    if (primary.standardPriceAtTransferLabel && !isNewFormat(primary.standardPriceAtTransferLabel)) {
      onPrimaryChange({ standardPriceAtTransferLabel: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 주소·날짜·연도 준비되면 자동 조회
  useEffect(() => {
    if (!primary.addressJibun || !primary.acquisitionDate) return;
    if (!primary.useEstimatedAcquisition) return;
    if (parseAmount(primary.standardPriceAtAcq) > 0) return;
    if (primary.standardPriceAtAcq && primary.standardPriceAtAcqLabel?.includes(acqYear)) return;
    fetchPriceForYear("acquisition", acqYear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.addressJibun, primary.acquisitionDate, primary.useEstimatedAcquisition, primary.assetKind, acqYear]);

  useEffect(() => {
    if (!primary.addressJibun || !form.transferDate) return;
    if (!primary.useEstimatedAcquisition) return;
    if (parseAmount(primary.standardPriceAtTransfer) > 0) return;
    if (primary.standardPriceAtTransfer && primary.standardPriceAtTransferLabel?.includes(tsfYear)) return;
    fetchPriceForYear("transfer", tsfYear);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.addressJibun, form.transferDate, primary.useEstimatedAcquisition, primary.assetKind, tsfYear]);

  const isEstimated = (form.acquisitionMethod || "actual") === "estimated" || primary.useEstimatedAcquisition;
  const isAppraisal = form.acquisitionMethod === "appraisal";
  const hasBothStandardPrices =
    parseAmount(primary.standardPriceAtAcq) > 0 &&
    parseAmount(primary.standardPriceAtTransfer) > 0;

  const yearSelectCls =
    "rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const fetchBtnCls =
    "px-3 py-2 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap transition-colors";

  return (
    <div className="space-y-5">
      {/* 다필지 모드 */}
      {primary.parcelMode && primary.assetKind === "land" && (
        <>
          <p className="text-sm text-muted-foreground">필지별 취득 정보를 입력하세요.</p>
          <ParcelListInput
            parcels={primary.parcels ?? []}
            totalTransferPrice={parseAmount(form.contractTotalPrice)}
            onChange={(parcels) => onPrimaryChange({ parcels })}
          />
        </>
      )}

      {(!primary.parcelMode || primary.assetKind !== "land") && (
        <>
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              취득 원인·취득일·취득가는 <strong>Step 1의 자산 카드</strong>에서 입력하셨습니다.
              여기서는 공시가격 조회, 감정가액, 1990년 이전 토지, 신축·증축 특례를 추가 입력하세요.
            </p>
          </div>

          {isEstimated && hasBothStandardPrices && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                ✓ 환산취득가 기준시가 (Step 1에서 입력됨)
              </p>
              <p className="text-xs text-muted-foreground">
                취득 당시 {Number(primary.standardPriceAtAcq).toLocaleString()} 원
                {primary.standardPriceAtAcqLabel && ` · ${primary.standardPriceAtAcqLabel}`}
              </p>
              <p className="text-xs text-muted-foreground">
                양도 당시 {Number(primary.standardPriceAtTransfer).toLocaleString()} 원
                {primary.standardPriceAtTransferLabel && ` · ${primary.standardPriceAtTransferLabel}`}
              </p>
            </div>
          )}

          {/* 취득가 산정 방식 */}
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
                  actual: "취득 당시 실제 매매금액 (Step 1 취득가에 입력)",
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
                      onChange={() => {
                        const newAssets = [...form.assets];
                        if (newAssets.length > 0) {
                          newAssets[0] = { ...newAssets[0], useEstimatedAcquisition: method === "estimated" };
                        }
                        onChange({ acquisitionMethod: method, assets: newAssets });
                      }}
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

          {/* 환산취득가 — 공시가격 조회 (Step 1에서 미입력 시 fallback) */}
          {isEstimated && !hasBothStandardPrices && (
            <div className="space-y-4 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                ⬆ Step 1에서 기준시가가 입력되지 않았습니다. 여기서 직접 조회·입력하거나 이전 단계로 돌아가세요.
              </p>
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
                      value={primary.standardPriceAtAcq}
                      onChange={(v) =>
                        onPrimaryChange({
                          standardPriceAtAcq: v,
                          standardPriceAtAcqLabel: v ? primary.standardPriceAtAcqLabel : "",
                        })
                      }
                      placeholder="취득 시점 공시가격"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchPriceForYear("acquisition", acqYear)}
                    disabled={acqLoading || !primary.addressJibun || isAcqYearPre1990}
                    className={fetchBtnCls}
                  >
                    {acqLoading ? "조회중" : isAcqYearPre1990 ? "조회불가" : "조회"}
                  </button>
                </div>
                {isAcqYearPre1990 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    1990년 이전은 개별공시지가가 없어 API 조회가 불가합니다. 아래 토지등급 환산 기능을 사용하세요.
                  </p>
                )}
                {!isAcqYearPre1990 && primary.standardPriceAtAcqLabel && (
                  <p className="text-xs text-muted-foreground">{primary.standardPriceAtAcqLabel}</p>
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
                      value={primary.standardPriceAtTransfer}
                      onChange={(v) =>
                        onPrimaryChange({
                          standardPriceAtTransfer: v,
                          standardPriceAtTransferLabel: v ? primary.standardPriceAtTransferLabel : "",
                        })
                      }
                      placeholder="양도 시점 공시가격"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchPriceForYear("transfer", tsfYear)}
                    disabled={tsfLoading || !primary.addressJibun}
                    className={fetchBtnCls}
                  >
                    {tsfLoading ? "조회중" : "조회"}
                  </button>
                </div>
                {primary.standardPriceAtTransferLabel && (
                  <p className="text-xs text-muted-foreground">{primary.standardPriceAtTransferLabel}</p>
                )}
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={async () => {
                    setLookupMsg(null);
                    await lookupStandardPrice("acquisition");
                    await lookupStandardPrice("transfer");
                  }}
                  disabled={acqLoading || tsfLoading || !primary.addressJibun}
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
          )}

          {/* 감정가액 */}
          {isAppraisal && (
            <CurrencyInput
              label="감정가액"
              value={form.appraisalValue ?? ""}
              onChange={(v) => onChange({ appraisalValue: v })}
              placeholder="공인감정기관의 감정가액"
              required
              hint="취득 당시 공인감정기관이 평가한 가액"
            />
          )}

          {/* 1990.8.30. 이전 취득 토지 환산 */}
          {primary.assetKind === "land" &&
            (isAcqYearPre1990 || (primary.acquisitionDate && primary.acquisitionDate < "1990-08-30")) && (
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
                jibun={primary.addressJibun}
                acquisitionDate={primary.acquisitionDate}
                transferDate={form.transferDate}
                onCalculatedPrice={(price) =>
                  onPrimaryChange({ standardPriceAtAcq: String(price) })
                }
              />
            )}

          {/* §114조의2 신축·증축 가산세 판정 */}
          {(primary.assetKind === "building" || primary.assetKind === "housing") && (
            <div className="space-y-3 rounded-lg border border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isSelfBuilt ?? false}
                  onChange={(e) =>
                    onChange({ isSelfBuilt: e.target.checked, buildingType: "", constructionDate: "", extensionFloorArea: "" })
                  }
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
                    <label className="block text-sm">
                      신축·증축 완공일 <span className="text-destructive">*</span>
                    </label>
                    <DateInput
                      value={form.constructionDate ?? ""}
                      onChange={(v) => onChange({ constructionDate: v })}
                    />
                  </div>
                  {form.buildingType === "extension" && (
                    <div className="space-y-1.5">
                      <label className="block text-sm">
                        증축 바닥면적 합계 (㎡) <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.extensionFloorArea ?? ""}
                        onChange={(e) => onChange({ extensionFloorArea: e.target.value })}
                        placeholder="예: 120.5"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <p className="text-xs text-muted-foreground">
                        85㎡ 초과 시 가산세 적용 (소득세법 §114조의2)
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    ⚠️ 신축·증축 후 5년 이내 양도 + 환산취득가액·감정가액 사용 시 5% 가산세가 부과됩니다.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
