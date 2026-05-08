"use client";

/**
 * GeneralBuildingBlock — 일반건물(토지+건물 일괄) 환산취득가 입력 섹션
 *
 * assetKind === "general_building" 진입 시 렌더.
 * 소득세법 시행령 §176의2④ (환산취득가액) + §163⑥ (개산공제 3%).
 *
 * 구조:
 *  ToggleCard (violet) — 환산취득가 사용 여부
 *  └── ① 면적·층수 섹션 (sky)
 *  └── ② 양도시 기준시가 섹션 (emerald) — 안분 분모
 *  └── ③ 취득시 기준시가 섹션 (amber) — 환산 비율 분자 + 개산공제 기준
 *
 * 정책 준수:
 *  - placeholder 숫자 예시 금지 — hint prop에 한국어 설명만
 *  - ToggleCard tone="violet" (amber는 사례 29 CB 우선 점유)
 *  - useEffect → store 미러링 금지 (onChange 직접 처리)
 *  - 자동 안분 fallback 금지 (미입력은 validate에서 차단)
 *  - SelectOnFocusProvider 자동 적용 — 개별 onFocus 추가 불필요
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { useMemo } from "react";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 (공시지가 기준연도 자동 계산용) */
  transferDate?: string;
}

export function GeneralBuildingBlock({ asset, onChange, transferDate }: Props) {
  // 바닥면적 추정 (연면적 ÷ 층수) — 비사업용토지 판정용 참고값
  const estimatedFloorArea = useMemo(() => {
    const area = parseDecimal(asset.gbBuildingArea);
    const floors = parseInt(asset.gbBuildingFloors || "0", 10);
    if (area > 0 && floors > 0) return (area / floors).toFixed(2);
    return null;
  }, [asset.gbBuildingArea, asset.gbBuildingFloors]);

  return (
    <ToggleCard
      title="환산취득가 방식으로 취득가액 계산"
      description="실거래가 확인이 불가한 경우 양도·취득 시점 기준시가 비율로 환산 (소득세법 시행령 §176의2④)"
      tone="violet"
      checked={asset.gbUseEstimatedAcquisition}
      onCheckedChange={(v) => onChange({ gbUseEstimatedAcquisition: v })}
    >
      <div className="space-y-3">
        {/* ① 면적·층수 섹션 (sky) */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
              ①
            </span>
            <p className="text-xs font-semibold text-sky-700">면적·층수</p>
          </div>

          <FieldCard
            label="토지면적"
            unit="㎡"
            hint="등기부등본 또는 토지대장 기재 토지면적 (㎡)"
          >
            <DecimalInput
              value={asset.gbLandArea}
              onChange={(v) => onChange({ gbLandArea: v })}
            />
          </FieldCard>

          <FieldCard
            label="건물 연면적"
            unit="㎡"
            hint="건축물대장 기재 각층 바닥면적 합계 (㎡)"
          >
            <DecimalInput
              value={asset.gbBuildingArea}
              onChange={(v) => onChange({ gbBuildingArea: v })}
            />
          </FieldCard>

          <FieldCard
            label="건물 층수"
            unit="층"
            hint="건물 총 층수. 비사업용 토지 판정 시 바닥면적(연면적÷층수)으로 자동 추정"
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={asset.gbBuildingFloors}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                onChange({ gbBuildingFloors: v });
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right tabular-nums"
            />
          </FieldCard>

          {estimatedFloorArea && (
            <div className="rounded bg-sky-100/60 border border-sky-200 px-3 py-1.5 text-xs text-sky-700">
              바닥면적 추정 (연면적 ÷ 층수): <span className="font-semibold tabular-nums">{estimatedFloorArea} ㎡</span>
              <span className="text-[10px] ml-1 text-sky-500">(비사업용토지 판정용 — 균등층 가정)</span>
            </div>
          )}
        </div>

        {/* ② 양도시 기준시가 섹션 (emerald) */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
              ②
            </span>
            <p className="text-xs font-semibold text-emerald-700">양도시 기준시가 (안분 분모)</p>
          </div>

          <LandPriceLookupField
            label="양도시 토지 공시지가"
            pricePerSqm={asset.gbTransferLandPricePerSqm}
            onPricePerSqmChange={(v) => onChange({ gbTransferLandPricePerSqm: v })}
            area={parseDecimal(asset.gbLandArea) || undefined}
            referenceDate={transferDate}
            jibun={asset.addressJibun}
            hint="국토교통부 공시지가 — 양도일 전년도 기준. 예: 2023년 양도면 2022년 1월 1일 기준 공시지가를 Vworld 또는 토지이음에서 조회"
          />

          <FieldCard
            label="양도시 건물기준시가"
            unit="원"
            hint="국세청 홈택스 → 기준시가 조회 → 건물분 기준시가. 양도일 기준 건물 전체 기준시가 총액 (원)"
          >
            <CurrencyInput
              label="양도시 건물기준시가"
              hideUnit
              value={asset.gbTransferBuildingValue}
              onChange={(v) => onChange({ gbTransferBuildingValue: v })}
            />
          </FieldCard>
        </div>

        {/* ③ 취득시 기준시가 섹션 (amber) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
              ③
            </span>
            <p className="text-xs font-semibold text-amber-700">취득시 기준시가 (환산 비율 분자 + 개산공제 기준)</p>
          </div>

          <LandPriceLookupField
            label="취득시 토지 공시지가"
            pricePerSqm={asset.gbAcqLandPricePerSqm}
            onPricePerSqmChange={(v) => onChange({ gbAcqLandPricePerSqm: v })}
            area={parseDecimal(asset.gbLandArea) || undefined}
            referenceDate={asset.acquisitionDate}
            jibun={asset.addressJibun}
            hint="취득일 전년도 기준 개별공시지가 (원/㎡). 1999년 취득이면 1998년 기준 공시지가 조회"
          />

          <FieldCard
            label="취득시 건물기준시가"
            unit="원"
            hint="취득일 기준 건물기준시가 총액. 이 금액의 3%가 건물 개산공제액이 됩니다 (시행령 §163⑥)"
          >
            <CurrencyInput
              label="취득시 건물기준시가"
              hideUnit
              value={asset.gbAcqBuildingValue}
              onChange={(v) => onChange({ gbAcqBuildingValue: v })}
            />
          </FieldCard>
        </div>

        {/* 안내 텍스트 */}
        <div className="rounded-lg bg-violet-50/60 border border-violet-200 px-3 py-2 text-xs text-violet-700 space-y-0.5">
          <p className="font-semibold">개산공제 계산 기준 (시행령 §163⑥)</p>
          <p>토지: 취득시 공시지가 × 토지면적 × 3%</p>
          <p>건물: 취득시 건물기준시가 총액 × 3%</p>
          <p className="text-violet-500 text-[10px] mt-1">토지·건물 각각 계산됩니다. 등기 자산 3%, 미등기 자산 0.3%.</p>
        </div>
      </div>
    </ToggleCard>
  );
}
