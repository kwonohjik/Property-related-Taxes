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

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

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

  // 상속개시일 시점 토지단가 자동 계산 결과를 pre1990 모듈에서 받아 저장
  function handlePre1990Calculated(price: number) {
    onChange({ inhHouseValLandPricePerSqmAtInheritance: String(price) });
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
        <CurrencyInput
          label=""
          hideUnit
          value={asset.inhHouseValLandArea}
          onChange={(v) => onChange({ inhHouseValLandArea: v })}
          placeholder="예) 184.2"
        />
      </FieldCard>

      {/* ② 양도시 */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">양도시 (양도일 기준)</p>
        <FieldCard label="양도시 토지 개별공시지가" unit="원/㎡">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValLandPricePerSqmAtTransfer}
            onChange={(v) => onChange({ inhHouseValLandPricePerSqmAtTransfer: v })}
            placeholder="Vworld 또는 홈택스 조회"
          />
        </FieldCard>
        <FieldCard label="양도시 개별주택가격" unit="원" hint="홈택스 개별주택가격 조회 (양도일 직전 공시)">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValHousePriceAtTransfer}
            onChange={(v) => onChange({ inhHouseValHousePriceAtTransfer: v })}
            placeholder="홈택스 조회"
          />
        </FieldCard>
      </div>

      {/* ③ 최초고시 시점 (기본 2005-04-30) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">
          최초고시 시점 (기본 {HOUSE_FIRST_DISCLOSURE_DATE})
        </p>
        <FieldCard label="최초고시 토지 개별공시지가" unit="원/㎡">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValLandPricePerSqmAtFirst}
            onChange={(v) => onChange({ inhHouseValLandPricePerSqmAtFirst: v })}
            placeholder="2005년 개별공시지가"
          />
        </FieldCard>
        <FieldCard label="최초고시 개별주택가격" unit="원" hint="홈택스 최초 고시 개별주택가격">
          <CurrencyInput
            label=""
            hideUnit
            value={asset.inhHouseValHousePriceAtFirst}
            onChange={(v) => onChange({ inhHouseValHousePriceAtFirst: v })}
            placeholder="홈택스 조회"
          />
        </FieldCard>
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
      </div>

      {/* ⑤ 상속개시일 주택가격 override 토글 */}
      <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
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
          상속개시일 시점 주택가격 직접 입력 (자동 추정 override)
        </label>
        <p className="text-[11px] text-muted-foreground pl-5">
          미입력 시: 최초고시 주택가격 × (상속개시일 토지기준시가 / 최초고시 토지기준시가)로 자동 추정
        </p>

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
