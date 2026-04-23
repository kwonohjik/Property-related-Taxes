import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  type TransferFormData,
  type AssetForm,
  makeDefaultAsset,
} from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import { BundledSaleModeToggle } from "@/components/calc/transfer/CompanionSaleModeBlock";
import { getFilingDeadline, isFilingOverdue } from "@/lib/calc/filing-deadline";

// ============================================================
// Step 1: 자산 목록
// ============================================================
export function Step1({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const [hasBundledAssets, setHasBundledAssets] = useState(() => form.assets.length > 1);

  function handleBundledToggle(yes: boolean) {
    setHasBundledAssets(yes);
    if (yes && form.assets.length === 1) {
      onChange({ assets: [...form.assets, makeDefaultAsset(2)] });
    } else if (!yes && form.assets.length > 1) {
      const firstAsset: AssetForm = {
        ...form.assets[0],
        actualSalePrice: form.contractTotalPrice || form.assets[0].actualSalePrice,
      };
      onChange({ assets: [firstAsset] });
    }
  }

  function updateAssets(assets: AssetForm[]) {
    if (!hasBundledAssets && assets.length === 1) {
      // 단일 자산 모드: actualSalePrice → contractTotalPrice 자동 동기화
      onChange({ assets, contractTotalPrice: assets[0].actualSalePrice || "" });
    } else {
      onChange({ assets });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        양도하는 자산을 입력하세요. 여러 자산을 하나의 계약으로 일괄 양도하는 경우 아래에서 추가하세요.
      </p>

      {/* 양도일·신고일 (계약 공통) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            양도일 <span className="text-destructive">*</span>
          </label>
          <DateInput
            value={form.transferDate}
            onChange={(v) => onChange({ transferDate: v })}
          />
          <p className="text-xs text-muted-foreground">잔금 청산일 또는 등기 접수일 중 빠른 날</p>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">신고일</label>
          <DateInput
            value={form.filingDate}
            onChange={(v) => onChange({ filingDate: v })}
          />
          {form.transferDate ? (
            <p className="text-xs text-muted-foreground">
              신고기한: {getFilingDeadline(form.transferDate)} (양도월 말일 + 2개월)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">양도일 입력 시 신고기한이 표시됩니다.</p>
          )}
          {isFilingOverdue(form.transferDate, form.filingDate) && (
            <p className="text-xs font-medium text-destructive">
              ⚠️ 신고기한({getFilingDeadline(form.transferDate)})을 지났습니다 — 무신고·지연납부 가산세가 자동 적용됩니다.
            </p>
          )}
        </div>
      </div>

      {/* 일괄양도 여부 질문 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">함께 양도한 다른 자산이 있나요?</p>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          {([false, true] as const).map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => handleBundledToggle(val)}
              className={cn(
                "rounded-md border-2 py-2 text-sm font-medium transition-all",
                hasBundledAssets === val
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              )}
            >
              {val ? "예" : "아니오"}
            </button>
          ))}
        </div>
      </div>

      {/* 일괄양도 모드: 총 양도가액 + 안분 방식 */}
      {hasBundledAssets && (
        <>
          <CurrencyInput
            label="총 양도가액 (모든 자산 합계, 원)"
            value={form.contractTotalPrice}
            onChange={(v) => onChange({ contractTotalPrice: v })}
            placeholder="실제 매매계약서상 거래금액"
            required
            hint="주된 자산 + 동반 자산 합계 금액을 입력하세요."
          />
          <BundledSaleModeToggle
            value={form.bundledSaleMode}
            onChange={(mode) => onChange({ bundledSaleMode: mode })}
          />
        </>
      )}

      {/* 자산 카드 리스트 */}
      <CompanionAssetsSection
        assets={form.assets}
        bundledSaleMode={form.bundledSaleMode}
        onChange={updateAssets}
        singleMode={!hasBundledAssets}
        transferDate={form.transferDate}
      />

      {hasBundledAssets && (
        <p className="text-xs text-muted-foreground px-1">
          ※ 소득세법 시행령 §166⑥: 구분 기재된 경우 계약서 가액 기준, 불분명한 경우 기준시가 비율 안분
        </p>
      )}
    </div>
  );
}
