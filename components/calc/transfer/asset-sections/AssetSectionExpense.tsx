"use client";

/**
 * ④ 필요경비 — 자본적지출 / 양도비 분리 입력 + legacy 단일 필드.
 * CompanionAssetCard L642–699 JSX를 그대로 이동.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isFractionalMode } from "../OwnershipRatioInput";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 폼-수준 총 양도비 — 자산별 자동 안분 표시용 */
  totalTransferExpense?: string;
}

export function AssetSectionExpense({ asset, onChange, totalTransferExpense }: Props) {
  return (
    <>
      {/* 필요경비 — 자본적지출 / 양도비 분리 입력 (소득세법 §97① 가목·나목)
          두 필드 합 > 환산취득가+개산공제 → §97② 단서 swap 발동 */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">
          필요경비 <span className="text-muted-foreground font-normal">(소득세법 §97①·②)</span>
        </p>
        <CurrencyInput
          label="자본적 지출액 (원) — §97① 가목"
          value={asset.capitalExpenditure}
          onChange={(v) => onChange({ capitalExpenditure: v })}
          hint={
            isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator)
              ? "자산 보유 중 발생한 인테리어·증축 등. 100% 기준 입력 — 시스템이 지분율 자동 적용"
              : "자산 보유 중 발생한 인테리어·증축 등 자본적 지출"
          }
        />
        {(() => {
          const formTotal = parseAmount(totalTransferExpense || "0");
          const num = parseFloat(asset.ownershipNumerator || "100");
          const den = parseFloat(asset.ownershipDenominator || "100");
          const fractional = isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator);
          const ratio = isFinite(num) && isFinite(den) && den > 0 ? Math.min(num / den, 1.0) : 1.0;
          const allocated = formTotal > 0 ? Math.floor(formTotal * ratio) : 0;
          const useFormLevel = formTotal > 0;
          return (
            <CurrencyInput
              label="양도비 (원) — §97① 나목"
              value={useFormLevel ? String(allocated) : asset.transferExpense}
              onChange={(v) => onChange({ transferExpense: v })}
              disabled={useFormLevel}
              hint={
                useFormLevel
                  ? fractional
                    ? `자동 안분 ${allocated.toLocaleString()} = 총 양도비 ${formTotal.toLocaleString()} × 지분 ${num}/${den}. 폼 상단 "총 양도비"를 비우면 직접 입력 가능`
                    : `자동 적용 ${allocated.toLocaleString()} (폼 상단 "총 양도비"). 비우면 직접 입력 가능`
                  : fractional
                    ? "양도 시 1회 발생 (중개수수료·인지대 등). 지분 모드는 폼 상단 \"총 양도비\"에서 일괄 입력 권장 (자동 안분)"
                    : "양도 시 발생한 중개수수료·인지대 등"
              }
            />
          );
        })()}
        <p className="text-caption text-muted-foreground">
          환산취득가/감정가액 모드에서 (자본+양도비) &gt; (환산+개산공제) 시 §97② 단서에 따라 자본+양도비를 필요경비로 적용합니다.
        </p>
      </div>

      {/* legacy 단일 필드 — backward-compat (sessionStorage 로드 시 표시). */}
      {parseInt(asset.directExpenses || "0", 10) > 0
       && parseInt(asset.capitalExpenditure || "0", 10) === 0
       && parseInt(asset.transferExpense || "0", 10) === 0 && (
        <CurrencyInput
          label="직접 귀속 필요경비 (원) — legacy"
          value={asset.directExpenses}
          onChange={(v) => onChange({ directExpenses: v })}
        />
      )}
    </>
  );
}
