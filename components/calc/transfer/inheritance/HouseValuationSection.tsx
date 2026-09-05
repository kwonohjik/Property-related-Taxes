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
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
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
import {
  MultiPointBuildingStdPriceModal,
  type MultiPointStdPriceApply,
} from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { deriveSec163_9BaseDate } from "@/lib/calc/transfer-163-9-base-date";
import { sec164AcqTimePointLabel } from "@/lib/calc/transfer-163-9-base-date";
import { isDeemedAcquisitionApplied } from "@/lib/calc/transfer-163-9-base-date";
import { landPriceYearOf } from "@/lib/calc/building-std-batch-apply";
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
        <p className="text-caption text-muted-foreground">지번 주소 입력 후 조회 가능합니다</p>
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

/** YYYY-MM-DD → 연도(number) or undefined (1900 이하·미입력 제외) */
function yearOf(d?: string): number | undefined {
  const y = d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined;
  return y && y > 1900 ? y : undefined;
}

import { LAW_BADGE_CLASS } from "@/components/calc/shared/lawBadge";
import { deriveInheritanceHouseKind } from "@/lib/calc/transfer-tax-api-helpers";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 (YYYY-MM-DD) — pre-1990 환산 모듈에 전달 */
  transferDate?: string;
}

export function HouseValuationSection({ asset, onChange, transferDate }: Props) {
  // 기준일 = 「상속개시일 **또는 증여일** 현재」(§163⑨ 본문) — API payload 빌더와 같은 파생.
  // 증여는 `acquisitionDate`만 본다(취득원인을 바꾼 자산의 stale `inheritanceStartDate` 회피).
  const inheritanceDate = deriveSec163_9BaseDate(asset);
  const isBefore1990 = !!inheritanceDate && inheritanceDate < PRE_1990_DATE;

  // B-1 — 「소득세법」 부칙(법률 제4803호) §8이 1984.12.31. 이전 취득분의 취득시기를 1985.1.1.로
  // **의제**하므로, §164⑦ 3시점 환산의 「취득시점」도 그날이다. 엔진 산식에는 시점 파라미터가
  // 없어(계획서 §3.0) 이 라벨이 사용자가 넣을 값의 시점을 정하는 **유일한 통제점**이다.
  const acqTimeLabel = sec164AcqTimePointLabel(inheritanceDate, "상속개시일");
  const isDeemedAcq = isDeemedAcquisitionApplied(inheritanceDate);

  // 3시점 건물기준시가 일괄 계산기 배선(§164⑤).
  // F2: 계산기(구조·용도 방식 국세청 건물기준시가)는 단독주택 전용 — 공동주택은 미노출.
  // 픽커(InheritanceHouseKindPicker)와 **같은 파생**을 써야 한다 — raw 비교로 두면 픽커에
  // "개별"이 선택돼 보이는데 이 게이트만 false가 되어 아래 일괄 계산 버튼이 영구 미노출된다
  // (이미 checked인 라디오는 다시 눌러도 change가 나지 않는다). 2026-07-30 정정.
  const isHouseIndividual = deriveInheritanceHouseKind(asset) === "house_individual";

  // 1990 이전 토지기준시가는 매 렌더 시 동기적으로 직접 계산 (useEffect 콜백 의존성 제거).
  // 엔진 측은 어차피 inheritedHouseValuation.pre1990 등급 데이터를 받아 자체 계산하므로
  // 별도 store 저장은 불필요. Pre1990LandValuationInput 의 onCalculatedPrice 콜백은 noop.
  const pre1990Land = useMemo<{ total: number; pricePerSqm: number } | null>(() => {
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
      return { total: r.standardPriceAtAcquisition, pricePerSqm: r.pricePerSqmAtAcquisition };
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

  // 3시점 일괄 계산기 points — 취득시 공시지가(위치지수 driver)는 pre-1990이면 등급가액 환산 per-sqm
  // (개별공시지가 미존재) 자동 주입, 그 외는 store의 상속개시일 개별공시지가.
  const batchPoints = useMemo(() => {
    const firstRef = asset.inhHouseValFirstDisclosureDate || HOUSE_FIRST_DISCLOSURE_DATE;
    // 국세청 건물기준시가(신축가격기준액 방식)는 2001.1.1. 최초 고시 → 그 이전 취득 건물의 위치지수
    // 공시지가는 2001.1.1. 현재 공시지가를 사용(§164⑤). 상속개시일 개별공시지가·§164④ 1990.8.30
    // 이전 등급가액 환산값(토지 트랙)을 건물 위치지수로 전용하지 않는다 → 빈 값 시드 + 모달 힌트로 안내.
    const acqYear = yearOf(inheritanceDate);
    const acqLandPerM2 =
      acqYear != null && acqYear <= 2000 ? "" : asset.inhHouseValLandPricePerSqmAtInheritance;
    // 공시지가 기준연도(5/31 공시)는 고시 체계 연도와 별개 축 — 아래 각 시점 공시지가 칸이
    // 쓰는 연도(referenceDate 동일)를 그대로 싣는다.
    return [
      {
        key: "acquisition" as const,
        label: "취득시(상속)",
        year: acqYear,
        landPriceYear: landPriceYearOf(inheritanceDate),
        landPricePerM2: acqLandPerM2,
      },
      {
        key: "firstDisclosure" as const,
        label: "최초공시일",
        year: yearOf(firstRef),
        landPriceYear: landPriceYearOf(firstRef),
        landPricePerM2: asset.inhHouseValLandPricePerSqmAtFirst,
      },
      {
        key: "transfer" as const,
        label: "양도시",
        year: yearOf(transferDate),
        landPriceYear: landPriceYearOf(transferDate),
        landPricePerM2: asset.inhHouseValLandPricePerSqmAtTransfer,
      },
    ];
  }, [
    inheritanceDate,
    transferDate,
    asset.inhHouseValFirstDisclosureDate,
    asset.inhHouseValLandPricePerSqmAtInheritance,
    asset.inhHouseValLandPricePerSqmAtFirst,
    asset.inhHouseValLandPricePerSqmAtTransfer,
  ]);

  // F1: 산출값을 3필드에 단일 onChange patch로 병합(3연속 호출 아님 — stale-clobber 차단).
  const applyBatch = (v: MultiPointStdPriceApply) => {
    const patch: Partial<AssetForm> = {};
    // 양도시 건물기준시가는 받지 않는다 — 영 §164⑦이 나목을 요구하는 시점은 취득시·최초공시시뿐이고,
    // 양도시 주택 기준시가는 법 §99①1호 라목의 개별주택가격 단일값이다(위 StandardPriceInput).
    if (v.firstDisclosure?.housing != null) patch.inhHouseValBuildingStdPriceAtFirst = String(v.firstDisclosure.housing);
    if (v.acquisition?.housing != null) patch.inhHouseValBuildingStdPriceAtInheritance = String(v.acquisition.housing);
    if (Object.keys(patch).length) onChange(patch);
  };

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

      <p className="text-caption text-muted-foreground">
        상속개시일({inheritanceDate || "미입력"})이 개별주택가격 최초 공시일(2005-04-30) 이전이므로
        토지·주택 분리 입력으로 {acqTimeLabel} 합계 기준시가를 환산합니다.
        {isDeemedAcq && (
          <span className="ml-1 font-medium text-rose-700 dark:text-rose-400">
            1984.12.31. 이전 취득분은 「소득세법」 부칙(법률 제4803호) §8에 따라 1985.1.1.에 취득한
            것으로 보므로, 아래 ③ 취득시점 입력은 <b>실제 상속개시일이 아니라 1985.1.1. 시점</b> 값입니다.
          </span>
        )}
        {isBefore1990 && (
          <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">
            [토지: 1990.8.30. 이전 → 등급가액 환산 적용]
          </span>
        )}
      </p>

      {/* 3시점 건물기준시가 일괄 계산기 — 단독주택 전용(F2) */}
      {isHouseIndividual && (
        <div className="flex justify-end">
          <MultiPointBuildingStdPriceModal
            points={batchPoints}
            onApply={applyBatch}
            snapshotPrefix={`bsp-${asset.assetId}-phd`}
            jibun={asset.addressJibun || undefined}
            initialAddress={{
              road: asset.addressRoad,
              jibun: asset.addressJibun,
              building: asset.buildingName,
              detail: asset.addressDetail,
              lng: asset.longitude,
              lat: asset.latitude,
              pnu: asset.addressPnu,
              dong: asset.addressDong || undefined,
              ho: asset.addressHo || undefined,
            }}
          />
        </div>
      )}

      {/* ① 토지 면적 */}
      <FieldCard label="토지 면적" unit="㎡" hint="주택 부수 토지 면적(㎡). 3시점 토지 기준시가 계산의 기준값.">
        <input
          type="text"
          inputMode="decimal"
          value={asset.inhHouseValLandArea}
          onChange={(e) => onChange({ inhHouseValLandArea: e.target.value.replace(/[^0-9.]/g, "") })}
          placeholder="토지 면적 입력"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FieldCard>

      {/* ② 양도시 — emerald 톤 (최신 시점) */}
      <div className="space-y-2 rounded-md border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30 p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-caption font-bold text-white dark:bg-emerald-500">
            1
          </span>
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            양도시 (양도일 기준)
          </p>
        </div>
        <LandPriceLookup
          label="양도시 토지 개별공시지가"
          referenceDate={transferDate ?? ""}
          landPricePerSqm={asset.inhHouseValLandPricePerSqmAtTransfer}
          onLandPricePerSqmChange={(v) => onChange({ inhHouseValLandPricePerSqmAtTransfer: v })}
          landArea={asset.inhHouseValLandArea}
          jibun={asset.addressJibun || undefined}
        />
        <StandardPriceInput
          propertyKind="house_individual"
          totalPrice={asset.inhHouseValHousePriceAtTransfer}
          onTotalPriceChange={(v) => onChange({ inhHouseValHousePriceAtTransfer: v })}
          jibun={asset.addressJibun || undefined}
          referenceDate={transferDate}
          label="양도 당시 공시된 개별주택 가격"
          hint="홈택스/부동산공시가격알리미 — 양도일 직전 공시된 개별주택가격"
        />
      </div>

      {/* ③ 최초고시 시점 (기본 2005-04-30) — violet 톤 (중간 시점) */}
      <div className="space-y-2 rounded-md border-2 border-violet-300 dark:border-violet-700 bg-violet-50/70 dark:bg-violet-950/30 p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-caption font-bold text-white dark:bg-violet-500">
            2
          </span>
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
            최초고시 시점 (기본 {HOUSE_FIRST_DISCLOSURE_DATE})
          </p>
        </div>
        <LandPriceLookup
          label="최초고시 토지 개별공시지가"
          referenceDate={asset.inhHouseValFirstDisclosureDate || HOUSE_FIRST_DISCLOSURE_DATE}
          landPricePerSqm={asset.inhHouseValLandPricePerSqmAtFirst}
          onLandPricePerSqmChange={(v) => onChange({ inhHouseValLandPricePerSqmAtFirst: v })}
          landArea={asset.inhHouseValLandArea}
          jibun={asset.addressJibun || undefined}
        />
        <StandardPriceInput
          propertyKind="house_individual"
          totalPrice={asset.inhHouseValHousePriceAtFirst}
          onTotalPriceChange={(v) => onChange({ inhHouseValHousePriceAtFirst: v })}
          jibun={asset.addressJibun || undefined}
          referenceDate={asset.inhHouseValFirstDisclosureDate || HOUSE_FIRST_DISCLOSURE_DATE}
          label="최초 공시된 개별주택가격"
          hint="홈택스/부동산공시가격알리미 — 최초 공시 시점 개별주택가격. §164⑤ 추정 공식의 분자 승수."
        />
        <FieldCard label="최초 공시 당시 건물기준시가" unit="원" hint="국세청 기준시가 — 취득시 개별주택가격 역산 시 최초공시 합계(토지기준시가 + 이 값)의 건물 부분. 개별주택가격과 별개입니다." className="sm:grid-cols-[200px_1fr]">
          <div className="w-1/2">
            <CurrencyInput
              label=""
              hideUnit
              value={asset.inhHouseValBuildingStdPriceAtFirst}
              onChange={(v) => onChange({ inhHouseValBuildingStdPriceAtFirst: v })}
              placeholder="국세청 기준시가 조회"
            />
          </div>
        </FieldCard>
        {(() => {
          const area = parseFloat(asset.inhHouseValLandArea) || 0;
          const landStdF = Math.floor(parseAmount(asset.inhHouseValLandPricePerSqmAtFirst) * area);
          const buildingStdF = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst) || 0;
          const sumF = landStdF + buildingStdF;
          if (sumF <= 0) return null;
          return (
            <div className="flex items-center justify-between rounded bg-muted/40 px-3 py-2">
              <span className="text-caption text-muted-foreground">최초고시 합산기준시가 (§164⑤ 분모)</span>
              <span className="text-sm font-semibold tabular-nums">{sumF.toLocaleString()}</span>
            </div>
          );
        })()}
      </div>

      {/* ④ 상속개시일 시점 토지단가 — rose 톤 (가장 오래된 시점) */}
      <div className="space-y-2 rounded-md border-2 border-rose-300 dark:border-rose-700 bg-rose-50/70 dark:bg-rose-950/30 p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-caption font-bold text-white dark:bg-rose-500">
            3
          </span>
          <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
            {acqTimeLabel} 시점 {isDeemedAcq ? `(실제 상속개시일 ${inheritanceDate})` : `(${inheritanceDate || "미입력"})`}
          </p>
        </div>

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
            label={`${acqTimeLabel} 토지 개별공시지가`}
            unit="원/㎡"
            hint={`${acqTimeLabel} 직전 공시된 개별공시지가. Vworld 또는 홈택스에서 조회.`}
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

        {/* 취득시점 건물기준시가 — §164⑤ Sum_A 분자의 건물 성분 */}
        <FieldCard
          label={`${acqTimeLabel} 건물기준시가`}
          unit="원"
          hint={`국세청 건물기준시가 (${acqTimeLabel} 당시). §164⑤ 환산 가격 공식에 사용.`}
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
            ? (pre1990Land?.total ?? 0)
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
            ? `취득시 토지기준시가 = 등급가액 환산 ${landStdA.toLocaleString()}`
            : `취득시 토지기준시가 = 공시지가(${landPricePerSqmAtInheritance.toLocaleString()}/㎡) × ${area}㎡ = ${landStdA.toLocaleString()}`;

          return (
            <div className="space-y-1">
              <p className="text-caption text-muted-foreground font-medium">환산 가격 (§164⑤)</p>
              <div className="flex items-start justify-between rounded bg-muted/40 px-3 py-2 gap-3">
                <div className="space-y-0.5">
                  <span className="text-caption text-muted-foreground leading-relaxed block">
                    최초 공시된 개별주택가격 × (취득시 토지기준시가 + 취득시 건물기준시가) ÷ (최초고시 토지기준시가 + 최초고시 건물기준시가)
                  </span>
                  <span className="text-caption text-muted-foreground/60 tabular-nums block">
                    {P_F.toLocaleString()} × ({landStdA.toLocaleString()} + {buildingA.toLocaleString()}) ÷ ({landStdF.toLocaleString()} + {buildingStdF.toLocaleString()})
                  </span>
                  {landStdA > 0 && (
                    <span className="text-caption text-muted-foreground/50 block">
                      {landStdAFormula}
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {estimated !== null ? `${estimated.toLocaleString()}` : "—"}
                </span>
              </div>
            </div>
          );
        })()}

        <ToggleCard
          tone="amber"
          size="sm"
          title={`${acqTimeLabel} 시점 주택가격 직접 입력`}
          checked={asset.inhHouseValUseHousePriceOverride}
          onCheckedChange={(v) => {
            onChange({
              inhHouseValUseHousePriceOverride: v,
              ...(!v && { inhHouseValHousePriceAtInheritanceOverride: "" }),
            });
          }}
        >
          <FieldCard
            label={`${acqTimeLabel} 주택가격`}
            unit="원"
            hint="별도 산정 근거가 있을 때 직접 입력 (국세청 기준시가, 감정가액 등)"
          >
            <CurrencyInput
              label=""
              hideUnit
              value={asset.inhHouseValHousePriceAtInheritanceOverride}
              onChange={(v) => onChange({ inhHouseValHousePriceAtInheritanceOverride: v })}
              placeholder={`${acqTimeLabel} 시점 주택가격`}
            />
          </FieldCard>
        </ToggleCard>
      </div>
    </div>
  );
}
