"use client";

/**
 * CohabitAncillaryLandBlock — §23의2① 주택부수토지 면적한도 차감 입력 (Phase 3, G4)
 *
 * 단독주택 대형토지 전용. 아파트·공동주택가격에는 부수토지 포함이므로 입력 생략.
 * 3필드 전부 입력 또는 전부 미입력 — partial 입력 시 validation 차단(⑧ 이미 구현).
 *
 * 법령: §23의2①, 소득세 시행령 §154⑦
 *   지역별 배율: 수도권 주거·상업·공업지역(3배) / 수도권 녹지(5배) / 비수도권(5배) / 그 밖(10배)
 *
 * 800줄 정책: 별도 파일 분리 (HeirComposition/Step4 인라인 금지).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { AncillaryLandRegion } from "@/lib/tax-engine/types/inheritance-gift.types";

interface CohabitAncillaryLandBlockProps {
  ancillaryLandArea: string;
  buildingFootprintArea: string;
  ancillaryLandRegion: AncillaryLandRegion | "";
  ancillaryLandStdPrice: string;
  onChange: (patch: {
    ancillaryLandArea?: string;
    buildingFootprintArea?: string;
    ancillaryLandRegion?: AncillaryLandRegion | "";
    ancillaryLandStdPrice?: string;
  }) => void;
}

const REGION_OPTIONS: { value: AncillaryLandRegion; label: string; hint: string }[] = [
  {
    value: "metro_residential_commercial_industrial",
    label: "수도권 주거·상업·공업",
    hint: "건물 정착 면적 × 3배 (§154⑦1호가)",
  },
  {
    value: "metro_green",
    label: "수도권 녹지",
    hint: "건물 정착 면적 × 5배 (§154⑦1호나)",
  },
  {
    value: "non_metro",
    label: "비수도권",
    hint: "건물 정착 면적 × 5배 (§154⑦1호다)",
  },
  {
    value: "other",
    label: "그 밖의 토지",
    hint: "건물 정착 면적 × 10배 (§154⑦2호)",
  },
];

/** 부수토지 4필드가 부분 입력 상태인지 확인 (validation 안내 전시용) */
function isPartial(
  area: string,
  footprint: string,
  region: AncillaryLandRegion | "",
  landStdPrice: string,
): boolean {
  const filledCount = [area, footprint, region, landStdPrice].filter((v) => v !== "").length;
  return filledCount > 0 && filledCount < 4;
}

export function CohabitAncillaryLandBlock({
  ancillaryLandArea,
  buildingFootprintArea,
  ancillaryLandRegion,
  ancillaryLandStdPrice,
  onChange,
}: CohabitAncillaryLandBlockProps) {
  const partial = isPartial(
    ancillaryLandArea,
    buildingFootprintArea,
    ancillaryLandRegion,
    ancillaryLandStdPrice,
  );

  // 한도 면적 미리보기
  const limitAreaPreview = (() => {
    const area = parseDecimal(buildingFootprintArea);
    const region = ancillaryLandRegion as AncillaryLandRegion | "";
    if (!area || !region) return null;
    const ratioMap: Record<AncillaryLandRegion, number> = {
      metro_residential_commercial_industrial: 3,
      metro_green: 5,
      non_metro: 5,
      other: 10,
    };
    return area * ratioMap[region];
  })();

  return (
    <div
      className="rounded-lg border border-sky-200 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-900/20 p-3 space-y-3"
      data-testid="cohabit-ancillary-land-block"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 dark:bg-sky-800 text-[10px] font-bold text-sky-800 dark:text-sky-200 select-none">
          G4
        </span>
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
          §23의2① 주택부수토지 면적한도 차감 (선택 입력)
        </p>
      </div>

      {/* 아파트·공동주택 안내 */}
      <div className="rounded-md border border-sky-100 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/10 p-2 text-[10px] text-sky-600 dark:text-sky-400 leading-relaxed">
        <strong>아파트·공동주택가격</strong>에는 부수토지가 포함되어 있어 이 항목을 입력하지
        않아도 됩니다. 단독주택 대형토지를 별도 자산 항목으로 분리 입력한 경우에만 아래 네 항목을
        모두 입력하세요. 개별주택가격은 건물+토지 일체이므로, 초과분은 토지분 공시가격에서만
        차감하고 건물분은 보존됩니다.
      </div>

      {/* 부수토지 실제 면적 */}
      <div className="space-y-1" data-testid="ancillary-land-area-input">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          부수토지 실제 면적 (㎡)
        </label>
        <DecimalInput
          value={ancillaryLandArea}
          onChange={(v) => onChange({ ancillaryLandArea: v })}
          placeholder="실제 부수토지 면적 입력 (㎡)"
        />
      </div>

      {/* 건물 정착 면적 */}
      <div className="space-y-1" data-testid="building-footprint-area-input">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          건물 정착 면적 (㎡)
        </label>
        <DecimalInput
          value={buildingFootprintArea}
          onChange={(v) => onChange({ buildingFootprintArea: v })}
          placeholder="건물이 실제로 정착된 면적 입력 (㎡)"
        />
      </div>

      {/* 부수토지 공시가격 (토지분) */}
      <div className="space-y-1" data-testid="ancillary-land-std-price-input">
        <CurrencyInput
          label="부수토지 공시가격 (토지분, 원)"
          value={ancillaryLandStdPrice}
          onChange={(v) => onChange({ ancillaryLandStdPrice: v })}
          hint="개별공시지가 × 부수토지 면적. 초과분은 이 토지분 가액에서만 차감(건물분 보존)."
        />
      </div>

      {/* 지역 구분 — 소득세 시행령 §154⑦ 배율 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          지역 구분 (소득세 시행령 §154⑦ 배율)
        </label>
        <RadioCardGroup
          lawLinks="상증법"
          name="ancillaryLandRegion"
          tone="sky"
          layout="stack"
          value={ancillaryLandRegion}
          onChange={(v) =>
            onChange({ ancillaryLandRegion: v as AncillaryLandRegion | "" })
          }
          options={REGION_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
            description: opt.hint,
          }))}
        />
      </div>

      {/* 한도 면적 미리보기 */}
      {limitAreaPreview !== null && (
        <div className="rounded-md border border-sky-200 bg-sky-100/60 dark:border-sky-700 dark:bg-sky-800/20 p-2 text-xs text-sky-700 dark:text-sky-300">
          한도 면적:{" "}
          <strong>
            {limitAreaPreview.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎡
          </strong>{" "}
          (건물 정착 면적 {parseDecimal(buildingFootprintArea).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎡ ×{" "}
          {
            {
              metro_residential_commercial_industrial: 3,
              metro_green: 5,
              non_metro: 5,
              other: 10,
            }[ancillaryLandRegion as AncillaryLandRegion] ?? "?"
          }
          배)
          {parseDecimal(ancillaryLandArea) > limitAreaPreview && (
            <span className="ml-1 text-rose-600 dark:text-rose-400 font-semibold">
              — 초과 {(parseDecimal(ancillaryLandArea) - limitAreaPreview).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎡ 차감 적용
            </span>
          )}
        </div>
      )}

      {/* 부분 입력 경고 */}
      {partial && (
        <div
          className="rounded-md border border-rose-200 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-900/20 p-2 text-[10px] text-rose-600 dark:text-rose-400"
          data-testid="ancillary-land-partial-warning"
        >
          ⚠ 부수토지 면적·건물 정착 면적·지역 구분·부수토지 공시가격 네 항목을 모두 입력하거나
          모두 비워야 합니다. 부분 입력 시 계산 요청이 차단됩니다.
        </div>
      )}
    </div>
  );
}
