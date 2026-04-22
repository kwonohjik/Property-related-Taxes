import { cn } from "@/lib/utils";
import {
  type TransferFormData,
  type AssetForm,
  makeDefaultAsset,
} from "@/lib/stores/calc-wizard-store";
import { ResetButton } from "@/components/calc/shared/ResetButton";
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
  onReset,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  onReset: () => void;
}) {
  const isBundled = form.assets.length > 1;

  function updateAssets(assets: AssetForm[]) {
    onChange({ assets });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          양도하는 자산을 입력하세요. 여러 자산을 하나의 계약으로 일괄 양도하는 경우 아래에서 추가하세요.
        </p>
        <ResetButton onReset={onReset} />
      </div>

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

      {/* 총 양도가액 */}
      <CurrencyInput
        label="총 양도가액 (모든 자산 합계, 원)"
        value={form.contractTotalPrice}
        onChange={(v) => onChange({ contractTotalPrice: v })}
        placeholder="실제 매매계약서상 거래금액"
        required
        hint={
          isBundled
            ? "주된 자산 + 동반 자산 합계 금액을 입력하세요."
            : "실제 매매계약서상 거래금액을 입력하세요."
        }
      />

      {/* 일괄양도 시 양도가액 결정 방식 */}
      {isBundled && (
        <BundledSaleModeToggle
          value={form.bundledSaleMode}
          onChange={(mode) => onChange({ bundledSaleMode: mode })}
        />
      )}

      {/* 자산 카드 리스트 */}
      <CompanionAssetsSection
        assets={form.assets}
        bundledSaleMode={form.bundledSaleMode}
        onChange={updateAssets}
      />

      {/* 자산이 2건 이상이면 안분 방식 안내 */}
      {form.assets.length < 2 && (
        <button
          type="button"
          onClick={() =>
            onChange({
              assets: [...form.assets, makeDefaultAsset(form.assets.length + 1)],
            })
          }
          className={cn(
            "w-full rounded-lg border-2 border-dashed border-border py-3",
            "text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors",
          )}
        >
          + 함께 양도된 다른 자산이 있나요? (일괄양도 추가)
        </button>
      )}
      {isBundled && (
        <p className="text-xs text-muted-foreground px-1">
          ※ 소득세법 시행령 §166⑥: 구분 기재된 경우 계약서 가액 기준, 불분명한 경우 기준시가 비율 안분
        </p>
      )}
    </div>
  );
}
