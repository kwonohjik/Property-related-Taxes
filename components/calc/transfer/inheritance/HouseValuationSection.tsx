"use client";

/**
 * 상속 주택 환산취득가 보조 입력 섹션
 *
 * 노출 조건:
 *   - 자산 종류 ∈ {house_individual, house_apart}
 *   - 상속개시일 < 2005-04-30 (개별주택가격 최초 공시일)
 *
 * UI 순서 = 엔진 계산 로직 순서:
 * ① 토지 면적 → ② 1990 분기 안내 → ③ 양도시(토지+주택)
 * → ④ 최초고시(토지+주택) → ⑤ 상속개시일 토지단가(등급가액 환산 or 직접입력)
 * → ⑥ 주택가격 override 토글 → ⑦ 결과 미리보기
 *
 * 근거: 소령 §164⑤ · §176조의2④ · §163⑥ · 시행규칙 §80⑥
 */

import { useMemo, useState } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { landPriceYearOptions, recommendLandPriceYear } from "@/lib/utils/land-price-year";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";
import type { LandGradeInput } from "@/lib/tax-engine/pre-1990-land-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// ─── 공시지가 조회 + 토지기준시가 서브 컴포넌트 ──────────────────────────

interface LandPriceLookupProps {
  label: string;
  referenceDate: string;   // 시점 기준일 (연도 추천 + 조회 기준)
  landPricePerSqm: string;
  onLandPricePerSqmChange: (v: string) => void;
  landArea: string;        // ㎡ — 토지기준시가 = 공시지가 × 면적
  jibun?: string;
}

function LandPriceLookup({
  label,
  referenceDate,
  landPricePerSqm,
  onLandPricePerSqmChange,
  landArea,
  jibun,
}: LandPriceLookupProps) {
  const [selectedYear, setSelectedYear] = useState("");
  const [isManual, setIsManual] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const options = referenceDate ? landPriceYearOptions(referenceDate) : [];
  const recommendedYear = referenceDate ? String(recommendLandPriceYear(referenceDate)) : "";
  const effectiveYear = selectedYear || recommendedYear;

  function handleYearSelect(value: string | null) {
    if (!value) return;
    setSelectedYear(value);
    setIsManual(value !== recommendedYear);
  }

  async function handleLookup() {
    if (!jibun || !effectiveYear) return;
    setIsLookingUp(true);
    setLookupError(null);
    try {
      const params = new URLSearchParams({ jibun, propertyType: "land", year: effectiveYear });
      const res = await fetch(`/api/address/standard-price?${params}`);
      const json = await res.json();
      if (!res.ok || json.error) { setLookupError(json.error?.message ?? "조회 실패"); return; }
      if (json.price && json.price > 0) {
        onLandPricePerSqmChange(String(json.price));
        setLookupError(null);
      } else {
        setLookupError("해당 연도 공시지가 없음");
      }
    } catch { setLookupError("네트워크 오류"); }
    finally { setIsLookingUp(false); }
  }

  const pricePerSqm = parseAmount(landPricePerSqm);
  const area = parseFloat(landArea) || 0;
  const landStdPrice = pricePerSqm > 0 && area > 0 ? Math.floor(pricePerSqm * area) : null;
  const canLookup = !!jibun && !!effectiveYear;

  return (
    <div className="space-y-2">
      {/* 공시지가 연도 선택 + 조회 버튼 */}
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <Select value={effectiveYear} onValueChange={handleYearSelect} disabled={!referenceDate}>
            <SelectTrigger className="h-9 w-full">
              <span>
                {effectiveYear
                  ? `${effectiveYear}년${!isManual ? " (자동)" : ""}`
                  : "기준일 미입력"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.year} value={String(opt.year)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={handleLookup}
          disabled={!canLookup || isLookingUp}
          className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
        >
          {isLookingUp ? "조회 중…" : "공시지가 조회"}
        </button>
      </div>
      {lookupError && <p className="text-xs text-destructive">{lookupError}</p>}
      {!canLookup && (
        <p className="text-[11px] text-muted-foreground">지번 주소 입력 후 조회 가능합니다</p>
      )}

      {/* 공시지가 + 토지기준시가 나란히 */}
      <div className="grid grid-cols-2 gap-2">
        <FieldCard label={label} unit="원/㎡">
          <CurrencyInput
            label=""
            hideUnit
            value={landPricePerSqm}
            onChange={onLandPricePerSqmChange}
            placeholder="원/㎡"
          />
        </FieldCard>
        <FieldCard label="토지기준시가" unit="원" hint="공시지가 × 면적">
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
            {landStdPrice !== null
              ? landStdPrice.toLocaleString()
              : <span className="text-muted-foreground/50">자동 계산</span>}
          </div>
        </FieldCard>
      </div>
    </div>
  );
}

/** 개별주택가격 최초 공시일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";
/** 1990.8.30. 이전 취득 분기 기준 */
const PRE_1990_DATE = "1990-08-30";

const LAW_BADGE_CLASS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
  "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 " +
  "hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors shrink-0 whitespace-nowrap cursor-pointer";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 (YYYY-MM-DD) — pre-1990 환산 모듈에 전달 */
  transferDate?: string;
}

export function HouseValuationSection({ asset, onChange, transferDate }: Props) {
  const inheritanceDate = asset.inheritanceStartDate || asset.acquisitionDate || "";
  const isBefore1990 = !!inheritanceDate && inheritanceDate < PRE_1990_DATE;

  // 1990 이전 토지기준시가는 매 렌더 시 동기적으로 직접 계산 (useEffect 콜백 의존성 제거).
  // 엔진 측은 어차피 inheritedHouseValuation.pre1990 등급 데이터를 받아 자체 계산하므로
  // 별도 store 저장은 불필요. Pre1990LandValuationInput 의 onCalculatedPrice 콜백은 noop.
  const pre1990LandTotal = useMemo<number | null>(() => {
    if (!isBefore1990) return null;
    if (!asset.pre1990Enabled) return null;
    if (!inheritanceDate) return null;

    const area = parseFloat(asset.inhHouseValLandArea) || 0;
    const price1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
    if (area <= 0 || price1990 <= 0) return null;

    const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
      if (!raw) return undefined;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) return undefined;
      return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
    };
    const gCur = buildGrade(asset.pre1990Grade_current);
    const gPrev = buildGrade(asset.pre1990Grade_prev);
    const gAcq = buildGrade(asset.pre1990Grade_atAcq);
    if (!gCur || !gPrev || !gAcq) return null;

    // 양도일 미입력 시 상속개시일을 fallback (환산엔 사용 안 됨, validateInput 통과용)
    const effectiveTransferDate = transferDate || inheritanceDate;

    try {
      const r = calculatePre1990LandValuation({
        acquisitionDate: new Date(inheritanceDate),
        transferDate: new Date(effectiveTransferDate),
        areaSqm: area,
        pricePerSqm_1990: price1990,
        // 양도시 토지단가는 미리보기 환산 자체엔 사용 안 됨. validateInput 통과용 동일값 주입.
        pricePerSqm_atTransfer: price1990,
        grade_1990_0830: gCur,
        gradePrev_1990_0830: gPrev,
        gradeAtAcquisition: gAcq,
      });
      return r.standardPriceAtAcquisition;
    } catch {
      return null;
    }
  }, [
    isBefore1990,
    asset.pre1990Enabled,
    asset.inhHouseValLandArea,
    asset.pre1990PricePerSqm_1990,
    asset.pre1990Grade_current,
    asset.pre1990Grade_prev,
    asset.pre1990Grade_atAcq,
    asset.pre1990GradeMode,
    inheritanceDate,
    transferDate,
  ]);

  // Pre1990LandValuationInput 의 onCalculatedPrice 콜백 — 위 useMemo 가 동일 결과를
  // 동기로 산출하므로 별도 동작 불필요. 콜백 prop 삭제 시 컴포넌트 시그니처를 건드려야 해
  // noop 함수로 둠.
  function handlePre1990Calculated(_price: number) {
    // intentionally empty
  }

  return (
    <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20 p-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
          개별주택가격 미공시 — 3-시점 기준시가 환산 보조
        </p>
        <div className="flex items-center gap-1.5">
          <LawArticleModal
            legalBasis="소득세법시행령 §164"
            label="소령 §164⑤"
            className={LAW_BADGE_CLASS}
          />
          <LawArticleModal
            legalBasis="소득세법시행령 §176조의2"
            label="소령 §176조의2④"
            className={LAW_BADGE_CLASS}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        상속개시일({inheritanceDate || "미입력"})이 개별주택가격 최초 공시일(2005-04-30) 이전이므로
        토지·주택 분리 입력으로 상속개시일 합계 기준시가를 환산합니다.
        {isBefore1990 && (
          <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">
            [토지: 1990.8.30. 이전 → 등급가액 환산 적용]
          </span>
        )}
      </p>

      {/* ① 토지 면적 */}
      <FieldCard label="토지 면적" unit="㎡" hint="주택 부수 토지 면적. 3시점 토지 기준시가 계산의 기준값.">
        <input
          type="text"
          inputMode="decimal"
          value={asset.inhHouseValLandArea}
          onChange={(e) => onChange({ inhHouseValLandArea: e.target.value.replace(/[^0-9.]/g, "") })}
          placeholder="예) 184.2"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FieldCard>

      {/* ② 양도시 */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">양도시 (양도일 기준)</p>
        <LandPriceLookup
          label="양도시 토지 개별공시지가"
          referenceDate={transferDate ?? ""}
          landPricePerSqm={asset.inhHouseValLandPricePerSqmAtTransfer}
          onLandPricePerSqmChange={(v) => onChange({ inhHouseValLandPricePerSqmAtTransfer: v })}
          landArea={asset.inhHouseValLandArea}
          jibun={asset.addressJibun || undefined}
        />
        <FieldCard label="양도시 공시된 개별주택가격 (P_T)" unit="원" hint="홈택스/부동산공시가격알리미 — 양도일 직전 공시된 개별주택가격">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValHousePriceAtTransfer}
            onChange={(v) => onChange({ inhHouseValHousePriceAtTransfer: v })}
            placeholder="홈택스 개별주택가격 조회"
          />
        </FieldCard>
        <FieldCard label="양도당시 건물기준시가" unit="원" hint="국세청 기준시가 — 양도시 합계 기준시가의 건물 성분. 미입력 시 P_T로 대체.">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValBuildingStdPriceAtTransfer}
            onChange={(v) => onChange({ inhHouseValBuildingStdPriceAtTransfer: v })}
            placeholder="국세청 기준시가 조회"
          />
        </FieldCard>
      </div>

      {/* ③ 최초고시 시점 (기본 2005-04-30) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">
          최초고시 시점 (기본 {HOUSE_FIRST_DISCLOSURE_DATE})
        </p>
        <LandPriceLookup
          label="최초고시 토지 개별공시지가"
          referenceDate={asset.inhHouseValFirstDisclosureDate || HOUSE_FIRST_DISCLOSURE_DATE}
          landPricePerSqm={asset.inhHouseValLandPricePerSqmAtFirst}
          onLandPricePerSqmChange={(v) => onChange({ inhHouseValLandPricePerSqmAtFirst: v })}
          landArea={asset.inhHouseValLandArea}
          jibun={asset.addressJibun || undefined}
        />
        <FieldCard label="최초 공시된 개별주택가격 (P_F)" unit="원" hint="홈택스/부동산공시가격알리미 — 최초 공시 시점 개별주택가격. §164⑤ 추정 공식의 분자 승수.">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValHousePriceAtFirst}
            onChange={(v) => onChange({ inhHouseValHousePriceAtFirst: v })}
            placeholder="홈택스 개별주택가격 조회"
          />
        </FieldCard>
        <FieldCard label="최초 공시 당시 건물기준시가" unit="원" hint="국세청 기준시가 — §164⑤ Sum_F 분모 (최초고시 토지기준시가 + 이 값). 개별주택가격과 별개.">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValBuildingStdPriceAtFirst}
            onChange={(v) => onChange({ inhHouseValBuildingStdPriceAtFirst: v })}
            placeholder="국세청 기준시가 조회"
          />
        </FieldCard>
        {(() => {
          const area = parseFloat(asset.inhHouseValLandArea) || 0;
          const landStdF = Math.floor(parseAmount(asset.inhHouseValLandPricePerSqmAtFirst) * area);
          const buildingStdF = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst) || 0;
          const sumF = landStdF + buildingStdF;
          if (sumF <= 0) return null;
          return (
            <div className="flex items-center justify-between rounded bg-muted/40 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">최초고시 합산기준시가 (§164⑤ 분모)</span>
              <span className="text-sm font-semibold tabular-nums">{sumF.toLocaleString()}원</span>
            </div>
          );
        })()}
      </div>

      {/* ④ 상속개시일 시점 토지단가 */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">
          상속개시일 시점 ({inheritanceDate || "미입력"})
        </p>

        {isBefore1990 ? (
          /* 1990-08-30 이전 → 등급가액 환산 (Pre1990LandValuationInput 재사용, acquisitionDate 대신 inheritanceDate) */
          <Pre1990LandValuationInput
            form={{
              pre1990Enabled: asset.pre1990Enabled,
              pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
              pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
              pre1990Grade_current: asset.pre1990Grade_current,
              pre1990Grade_prev: asset.pre1990Grade_prev,
              pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
              pre1990GradeMode: asset.pre1990GradeMode,
            }}
            onChange={(patch) => onChange(patch)}
            acquisitionArea={asset.inhHouseValLandArea || undefined}
            jibun={asset.addressJibun || undefined}
            acquisitionDate={inheritanceDate || undefined}
            transferDate={transferDate}
            onCalculatedPrice={handlePre1990Calculated}
          />
        ) : (
          /* 1990-08-30 이후 → 개별공시지가 직접 입력 */
          <FieldCard
            label="상속개시일 토지 개별공시지가"
            unit="원/㎡"
            hint="상속개시일 직전 공시된 개별공시지가. Vworld 또는 홈택스에서 조회."
          >
            <CurrencyInput
              label=""
              hideUnit
              value={asset.inhHouseValLandPricePerSqmAtInheritance}
              onChange={(v) => onChange({ inhHouseValLandPricePerSqmAtInheritance: v })}
              placeholder="원/㎡"
            />
          </FieldCard>
        )}

        {/* 상속개시일 건물기준시가 — §164⑤ Sum_A 분자의 건물 성분 */}
        <FieldCard
          label="상속개시일 건물기준시가"
          unit="원"
          hint="국세청 건물기준시가 (상속개시일 당시). §164⑤ 환산 가격 공식에 사용."
        >
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValBuildingStdPriceAtInheritance}
            onChange={(v) => onChange({ inhHouseValBuildingStdPriceAtInheritance: v })}
            placeholder="국세청 기준시가 조회"
          />
        </FieldCard>
      </div>

      {/* ⑤ 자동 추정 결과 + override 토글 */}
      <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
        {/* 자동 추정 결과 미리보기 */}
        {!asset.inhHouseValUseHousePriceOverride && (() => {
          const area = parseFloat(asset.inhHouseValLandArea) || 0;
          // 1990이전: useMemo로 동기 계산한 total 사용 (등급가액 환산 결과)
          // 1990이후: store의 개별공시지가(per-sqm) × 면적
          const landPricePerSqmAtInheritance = parseAmount(asset.inhHouseValLandPricePerSqmAtInheritance);
          const landStdA = isBefore1990
            ? (pre1990LandTotal ?? 0)
            : Math.floor(landPricePerSqmAtInheritance * area);
          const buildingA = parseAmount(asset.inhHouseValBuildingStdPriceAtInheritance) || 0;
          const landStdF = Math.floor(parseAmount(asset.inhHouseValLandPricePerSqmAtFirst) * area);
          const buildingStdF = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst) || 0;
          const P_F = parseAmount(asset.inhHouseValHousePriceAtFirst) || 0;
          const sumA = landStdA + buildingA;
          const sumF = landStdF + buildingStdF;
          const estimated = sumF > 0 && P_F > 0
            ? Math.floor(P_F * sumA / sumF)
            : null;

          const landStdAFormula = isBefore1990
            ? `취득시 토지기준시가 = 등급가액 환산 ${landStdA.toLocaleString()}원`
            : `취득시 토지기준시가 = 공시지가(${landPricePerSqmAtInheritance.toLocaleString()}원/㎡) × ${area}㎡ = ${landStdA.toLocaleString()}원`;

          return (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground font-medium">환산 가격 (§164⑤)</p>
              <div className="flex items-start justify-between rounded bg-muted/40 px-3 py-2 gap-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground leading-relaxed block">
                    최초 공시된 개별주택가격 × (취득시 토지기준시가 + 취득시 건물기준시가) ÷ (최초고시 토지기준시가 + 최초고시 건물기준시가)
                  </span>
                  <span className="text-[11px] text-muted-foreground/60 tabular-nums block">
                    {P_F.toLocaleString()} × ({landStdA.toLocaleString()} + {buildingA.toLocaleString()}) ÷ ({landStdF.toLocaleString()} + {buildingStdF.toLocaleString()})
                  </span>
                  {landStdA > 0 && (
                    <span className="text-[11px] text-muted-foreground/50 block">
                      {landStdAFormula}
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {estimated !== null ? `${estimated.toLocaleString()}원` : "—"}
                </span>
              </div>
            </div>
          );
        })()}

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={asset.inhHouseValUseHousePriceOverride}
            onChange={(e) => {
              onChange({
                inhHouseValUseHousePriceOverride: e.target.checked,
                ...(!e.target.checked && { inhHouseValHousePriceAtInheritanceOverride: "" }),
              });
            }}
          />
          상속개시일 시점 주택가격 직접 입력 (환산 가격 override)
        </label>

        {asset.inhHouseValUseHousePriceOverride && (
          <div className="pl-5 pt-1">
            <FieldCard
              label="상속개시일 주택가격"
              unit="원"
              hint="별도 산정 근거가 있을 때 직접 입력 (국세청 기준시가, 감정가액 등)"
            >
              <CurrencyInput
                label=""
                hideUnit
                value={asset.inhHouseValHousePriceAtInheritanceOverride}
                onChange={(v) => onChange({ inhHouseValHousePriceAtInheritanceOverride: v })}
                placeholder="상속개시일 시점 주택가격"
              />
            </FieldCard>
          </div>
        )}
      </div>
    </div>
  );
}
