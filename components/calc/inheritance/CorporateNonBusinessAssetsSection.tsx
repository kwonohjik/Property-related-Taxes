"use client";

/**
 * 법인 사업무관자산 입력 (PR-C F-8)
 *
 * 법령: 시행령 §15⑤2호 + §16⑤2호 (KoreanLaw MCP 검증 2026-05-21)
 *
 * 조건부 렌더: farmingCategory === "corporate_stock" OR
 *              familyBusinessCategory === "corporate_stock"
 *
 * 정책:
 *   - mirror-pattern (useEffect → store 미러링 금지)
 *   - single-source-engine-helper (calcCorporateStockAdjustedValue 엔진 헬퍼 직접 사용)
 *   - 자동 안분 fallback 금지 (나·라 단서는 사용자가 차감 후 입력)
 */

import { useMemo } from "react";

import { CurrencyInput, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { calcCorporateStockAdjustedValue } from "@/lib/tax-engine/property-valuation-corporate";
import type { CorporateNonBusinessAssets } from "@/lib/tax-engine/types/inheritance-corporate-non-business.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface CorporateNonBusinessAssetsSectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

const FIELD_DEFS: Array<{
  key: keyof CorporateNonBusinessAssets;
  label: string;
  hint: string;
}> = [
  { key: "nonBusinessLand", label: "가. 비사업용토지", hint: "소득세법 §104조의3 판정" },
  { key: "rentedRealEstate", label: "나. 임대부동산", hint: "임직원 국민주택규모 이하 5년 무상임대분 차감 후 입력" },
  { key: "externalLoans", label: "다. 임직원 외 대여금", hint: "특수관계인·기타 대여금" },
  { key: "excessCash", label: "라. 과다보유현금", hint: "5년 평균 200% 초과분 — 사용자가 평균 산정 후 입력" },
  { key: "nonOperatingFinancial", label: "마. 영업무관 금융상품", hint: "사업운영과 무관한 금융상품" },
];

export function CorporateNonBusinessAssetsSection({
  item,
  onUpdate,
}: CorporateNonBusinessAssetsSectionProps) {
  const isCorporateStock =
    item.farmingCategory === "corporate_stock" ||
    item.familyBusinessCategory === "corporate_stock";

  const assets = item.corporateNonBusinessAssets;
  const totalAssets = item.corporateTotalAssets;
  const stockValue =
    item.marketValue ?? item.appraisedValue ?? item.standardPrice ?? 0;

  const preview = useMemo(() => {
    if (!totalAssets || totalAssets <= 0 || stockValue <= 0) return null;
    return calcCorporateStockAdjustedValue(stockValue, totalAssets, assets);
  }, [stockValue, totalAssets, assets]);

  if (!isCorporateStock) return null;

  const updateAssets = (patch: Partial<CorporateNonBusinessAssets>) => {
    onUpdate({
      ...item,
      corporateNonBusinessAssets: { ...(assets ?? {}), ...patch },
    });
  };

  const updateTotalAssets = (v: string) => {
    const n = parseFloat(v.replace(/,/g, ""));
    onUpdate({
      ...item,
      corporateTotalAssets: Number.isFinite(n) && n > 0 ? n : undefined,
    });
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          법인 사업무관자산 차감 (시행령 §15⑤2호 + §16⑤2호)
        </p>
        <p className="text-[10px] text-amber-700 dark:text-amber-300">
          ⓘ 산식: 평가가액 × (총자산 − 사업무관자산 합) / 총자산. 총자산 미입력 시 차감 미적용 (legacy).
          나. 임대부동산 단서·라. 과다현금 5년 평균은 사용자가 직접 차감 후 입력 권장.
        </p>
      </div>

      <CurrencyInput
        label="법인 총자산 (분모)"
        value={totalAssets ? String(totalAssets) : ""}
        onChange={updateTotalAssets}
        placeholder="법인 총자산 (미입력 시 차감 미적용)"
      />

      <div className="grid grid-cols-1 gap-2">
        {FIELD_DEFS.map((def) => (
          <CurrencyInput
            key={def.key}
            label={def.label}
            value={assets?.[def.key] ? String(assets[def.key]) : ""}
            onChange={(v) => {
              const n = parseFloat(v.replace(/,/g, ""));
              updateAssets({
                [def.key]: Number.isFinite(n) && n >= 0 ? n : undefined,
              });
            }}
            hint={def.hint}
            placeholder="없으면 비워두세요"
          />
        ))}
      </div>

      {preview && (
        <div className="rounded-md border border-amber-300 bg-amber-100/60 dark:bg-amber-900/30 dark:border-amber-700 p-2 space-y-0.5">
          <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100">
            ⚖️ 차감 미리보기
          </p>
          <p className="text-[10px] text-amber-800 dark:text-amber-200">
            평가가액 {formatKRW(stockValue)} × (총자산 {formatKRW(totalAssets!)} − 사업무관자산 {formatKRW(preview.sumOfNonBusiness)}) / 총자산
          </p>
          <p className="text-xs font-mono text-amber-900 dark:text-amber-100">
            = {formatKRW(preview.adjustedValue)} (사업자산 비율 {(preview.ratio * 100).toFixed(2)}%)
          </p>
        </div>
      )}
    </div>
  );
}
