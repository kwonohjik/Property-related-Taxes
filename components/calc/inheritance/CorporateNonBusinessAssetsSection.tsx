"use client";

/**
 * 법인 사업무관자산 입력 (PR-C F-8 + PR-3-b)
 *
 * 법령: 시행령 §15⑤2호 + §16⑤2호 (KoreanLaw MCP 검증 2026-05-21·2026-06-04)
 *
 * 조건부 렌더: farmingCategory === "corporate_stock" OR
 *              familyBusinessCategory === "corporate_stock"
 *
 * PR-3-b:
 *   - 라목 과다현금 자동산정(보유현금 − 5년평균 × 비율) — 비율 시기별(2025.2.28+ 200% / 이전 150%)
 *   - 나·다목 제외 단서(사택·학자금·전세금, 2025.2.28. 신설) — 시기 조건부 입력
 *
 * 정책:
 *   - mirror-pattern (useEffect → store 미러링 금지)
 *   - single-source-engine-helper (calcCorporateStockAdjustedValue·getExcessCashRatioByDate 엔진 헬퍼 직접 사용)
 *   - feedback_three_state_optional_mode_toggle (과다현금 자동산정 cashByYearEnd undefined/[]/[...])
 */

import { resolveEstateItemValue } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { useMemo } from "react";

import { CurrencyInput, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  calcCorporateStockAdjustedValue,
  getExcessCashRatioByDate,
} from "@/lib/tax-engine/property-valuation-corporate";
import type { CorporateNonBusinessAssets } from "@/lib/tax-engine/types/inheritance-corporate-non-business.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface CorporateNonBusinessAssetsSectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  /** 상속개시일 — 과다현금 비율·제외 단서 시기 판정 (미입력 시 현행 2025+ 가정) */
  deathDate?: string;
}

/** 나·다목 제외 단서 적용 여부 (2025.2.28. 신설) — 엔진 applyExclusionByDate와 동일 규칙 */
function exclusionApplicable(deathDate?: string): boolean {
  return !deathDate || deathDate >= "2025-02-28";
}

function parseKrw(v: string): number | undefined {
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function CorporateNonBusinessAssetsSection({
  item,
  onUpdate,
  deathDate,
}: CorporateNonBusinessAssetsSectionProps) {
  const isCorporateStock =
    item.farmingCategory === "corporate_stock" ||
    item.familyBusinessCategory === "corporate_stock";

  const assets = item.corporateNonBusinessAssets;
  const totalAssets = item.corporateTotalAssets;
  // §60 평가순위 단일 소스 — 엔진·lib/calc가 모두 이 헬퍼를 쓴다.
  // 종전 로컬 계산은 similarSalesValue(§49④)와 «주식 보충평가»(상장=평균종가×주식수,
  // 비상장=V2/V1) 단계를 건너뛰었다. corporate_stock 분류는 listed_stock·unlisted_stock
  // 자산에서만 고를 수 있고 그 자산들은 marketValue를 store에 쓰지 않는 정책이라
  // (inheritance-deduction-suggest.ts:70 — mirror 금지·derive만) 대개 0이 되어
  // 차감 미리보기 카드가 아예 뜨지 않았다.
  const stockValue = resolveEstateItemValue(item);

  const cashAuto = assets?.cashByYearEnd !== undefined;
  const exclude = exclusionApplicable(deathDate);
  const ratioPct = (getExcessCashRatioByDate(deathDate) * 100).toFixed(0);

  const preview = useMemo(() => {
    if (!totalAssets || totalAssets <= 0 || stockValue <= 0) return null;
    return calcCorporateStockAdjustedValue(stockValue, totalAssets, assets, deathDate);
  }, [stockValue, totalAssets, assets, deathDate]);

  if (!isCorporateStock) return null;

  const updateAssets = (patch: Partial<CorporateNonBusinessAssets>) => {
    onUpdate({
      ...item,
      corporateNonBusinessAssets: { ...(assets ?? {}), ...patch },
    });
  };

  const updateTotalAssets = (v: string) => {
    onUpdate({ ...item, corporateTotalAssets: parseKrw(v) });
  };

  const updateCashYear = (idx: number, v: string) => {
    // 🔴 IG-028·IG-029: 종전엔 빈 입력을 `?? 0`으로 0을 저장했고(→ 5년 평균을 끌어내림),
    // 앞칸을 건너뛰면 `arr[idx] = …`가 **희소 배열**을 만들어 JSON에서 `null`이 되었다
    // (실측: `const a=[];a[2]=1;JSON.stringify(a)` → `[null,null,1]`). 그 null을 Zod가
    // 거절해 POST가 400으로 떨어졌다. ⇒ 자리는 고정하되 미입력은 **명시 null**로 둔다.
    const prev = assets?.cashByYearEnd ?? [];
    const arr: (number | null)[] = Array.from(
      { length: Math.max(prev.length, idx + 1) },
      (_, i) => prev[i] ?? null,
    );
    arr[idx] = parseKrw(v) ?? null;
    updateAssets({ cashByYearEnd: arr });
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          법인 사업무관자산 차감 (시행령 §15⑤2호 + §16⑤2호)
        </p>
        <p className="text-micro text-amber-700 dark:text-amber-300">
          ⓘ 산식: 평가가액 × (총자산 − 사업무관자산 합) / 총자산. 총자산 미입력 시 차감 미적용(이전 입력 형식).
        </p>
        <div className="flex flex-wrap gap-1.5">
          <LawArticleModal legalBasis="상증령 §15" label="상증령 §15⑤2호" />
          <LawArticleModal legalBasis="상증령 §16" label="상증령 §16⑤2호" />
          <LawArticleModal legalBasis="소득세법 §104의3" label="소득세법 §104의3 비사업용토지" />
        </div>
      </div>

      <CurrencyInput
        label="법인 총자산 (분모)"
        value={totalAssets ? String(totalAssets) : ""}
        onChange={updateTotalAssets}
        placeholder="법인 총자산 (미입력 시 차감 미적용)"
      />

      {/* 가. 비사업용토지 */}
      <CurrencyInput
        label="가. 비사업용토지"
        value={assets?.nonBusinessLand ? String(assets.nonBusinessLand) : ""}
        onChange={(v) => updateAssets({ nonBusinessLand: parseKrw(v) })}
        hint="소득세법 §104조의3 판정"
        placeholder="없으면 비워두세요"
      />

      {/* 나. 임대부동산 + 사택 제외 단서 (2025.2.28+) */}
      <div className="space-y-1">
        <CurrencyInput
          label="나. 임대부동산 (총액)"
          value={assets?.rentedRealEstate ? String(assets.rentedRealEstate) : ""}
          onChange={(v) => updateAssets({ rentedRealEstate: parseKrw(v) })}
          hint="타인 임대 부동산 총액"
          placeholder="없으면 비워두세요"
        />
        {exclude && (
          <CurrencyInput
            label="└ 사택 제외분 (단서, 2025.2.28. 신설)"
            value={assets?.rentedRealEstateExclusion ? String(assets.rentedRealEstateExclusion) : ""}
            onChange={(v) => updateAssets({ rentedRealEstateExclusion: parseKrw(v) })}
            hint="임직원 사택(국민주택규모↓ or 기준시가 6억↓ + 5년↑ 무상) — 임대부동산에서 차감"
            placeholder="없으면 비워두세요"
          />
        )}
      </div>

      {/* 다. 대여금 + 학자금·전세금 제외 단서 (2025.2.28+) */}
      <div className="space-y-1">
        <CurrencyInput
          label="다. 임직원 외 대여금 (총액)"
          value={assets?.externalLoans ? String(assets.externalLoans) : ""}
          onChange={(v) => updateAssets({ externalLoans: parseKrw(v) })}
          hint="특수관계인·기타 대여금 총액"
          placeholder="없으면 비워두세요"
        />
        {exclude && (
          <CurrencyInput
            label="└ 학자금·전세금 제외분 (단서, 2025.2.28. 신설)"
            value={assets?.externalLoansExclusion ? String(assets.externalLoansExclusion) : ""}
            onChange={(v) => updateAssets({ externalLoansExclusion: parseKrw(v) })}
            hint="임직원 학자금·6억↓ 주택 전세금 — 대여금에서 차감"
            placeholder="없으면 비워두세요"
          />
        )}
      </div>

      {/* 라. 과다보유현금 — 자동산정 토글 */}
      <ToggleCard
        lawLinks="상증법"
        tone="sky"
        title={`라. 과다보유현금 자동산정 (5년 평균 ${ratioPct}% 초과분)`}
        description={
          cashAuto
            ? `상속개시일 보유현금 − 직전 5년 평균 × ${ratioPct}% = 과다현금. (2025.2.28. 이후 200% / 이전 150%)`
            : `체크하면 보유현금·5년 현금을 입력해 자동산정. 미체크 시 초과분을 직접 입력.`
        }
        checked={cashAuto}
        onCheckedChange={(v) =>
          updateAssets(v ? { cashByYearEnd: [], excessCash: undefined } : { cashByYearEnd: undefined, currentCash: undefined })
        }
      />
      {cashAuto ? (
        <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/10 dark:border-sky-800 p-2 space-y-2">
          <CurrencyInput
            label="상속개시일 현재 보유현금"
            value={assets?.currentCash ? String(assets.currentCash) : ""}
            onChange={(v) => updateAssets({ currentCash: parseKrw(v) })}
            hint="요구불예금 + 취득일부터 만기 3개월 이내 금융상품 포함"
          />
          <p className="text-micro font-medium text-sky-700 dark:text-sky-300">
            직전 5개 사업연도 말 현금 (입력한 칸의 평균 사용)
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <CurrencyInput
                key={i}
                label={`${i + 1}년 전 말 현금`}
                hideLabel
                // 0도 정당한 입력이다 — truthy 판정을 쓰면 「비어 보이는 0」이 생긴다.
                value={
                  assets?.cashByYearEnd?.[i] != null
                    ? String(assets.cashByYearEnd[i])
                    : ""
                }
                onChange={(v) => updateCashYear(i, v)}
                placeholder={`${i + 1}년 전 사업연도 말 현금`}
              />
            ))}
          </div>
        </div>
      ) : (
        <CurrencyInput
          label="라. 과다보유현금 (초과분 직접 입력)"
          value={assets?.excessCash ? String(assets.excessCash) : ""}
          onChange={(v) => updateAssets({ excessCash: parseKrw(v) })}
          hint={`5년 평균 ${ratioPct}% 초과분 — 사용자가 산정 후 입력`}
          placeholder="없으면 비워두세요"
        />
      )}

      {/* 마. 영업무관 금융상품 */}
      <CurrencyInput
        label="마. 영업무관 금융상품"
        value={assets?.nonOperatingFinancial ? String(assets.nonOperatingFinancial) : ""}
        onChange={(v) => updateAssets({ nonOperatingFinancial: parseKrw(v) })}
        hint="사업운영과 무관한 금융상품"
        placeholder="없으면 비워두세요"
      />

      {preview && (
        <div className="rounded-md border border-amber-300 bg-amber-100/60 dark:bg-amber-900/30 dark:border-amber-700 p-2 space-y-0.5">
          <p className="text-caption font-semibold text-amber-900 dark:text-amber-100">
            ⚖️ 차감 미리보기
          </p>
          {preview.excessCashAuto && (
            <p className="text-micro text-amber-800 dark:text-amber-200">
              과다현금 자동산정: 보유 {formatKRW(assets?.currentCash ?? 0)} − 5년평균{" "}
              {formatKRW(preview.excessCashAvg5y ?? 0)} × {((preview.excessCashRatio ?? 0) * 100).toFixed(0)}% ={" "}
              {formatKRW(preview.excessCash)}
            </p>
          )}
          <p className="text-micro text-amber-800 dark:text-amber-200">
            평가가액 {formatKRW(stockValue)} × (총자산 {formatKRW(totalAssets!)} − 사업무관자산 {formatKRW(preview.sumOfNonBusiness)}) / 총자산
          </p>
          <p className="text-xs font-mono tabular-nums text-amber-900 dark:text-amber-100">
            = {formatKRW(preview.adjustedValue)} (사업자산 비율 {(preview.ratio * 100).toFixed(2)}%)
          </p>
        </div>
      )}
    </div>
  );
}
