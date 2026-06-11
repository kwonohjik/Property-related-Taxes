import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  type TransferFormData,
  type AssetForm,
  makeDefaultAsset,
} from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import { BundledSaleModeToggle } from "@/components/calc/transfer/CompanionSaleModeBlock";
import { getFilingDeadline, isFilingOverdue } from "@/lib/calc/filing-deadline";

// ============================================================
// Step 1: 자산 목록
// ============================================================
export function Step1({
  form,
  onChange,
  errorAssetIndex,
  errorMessage,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  /** 검증 실패 자산 인덱스 — 해당 카드 인라인 에러 표시 */
  errorAssetIndex?: number | null;
  /** 검증 실패 메시지 */
  errorMessage?: string | null;
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
    if (assets.length > 1 && !hasBundledAssets) {
      setHasBundledAssets(true);
      onChange({ assets });
      return;
    }
    if (!hasBundledAssets && assets.length === 1) {
      onChange({ assets, contractTotalPrice: assets[0].actualSalePrice || "" });
    } else {
      onChange({ assets });
    }
  }

  const filingOverdue = isFilingOverdue(form.transferDate, form.filingDate);

  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <section>
        <SectionHeader
          title="기본정보"
          description="계약·신고 정보를 입력하세요"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldCard
            label="양도일"
            required
            hint="잔금 청산일 또는 등기 접수일 중 빠른 날"
            warning={
              filingOverdue
                ? `⚠ 신고기한(${getFilingDeadline(form.transferDate)})을 지났습니다 — 가산세 자동 적용`
                : undefined
            }
          >
            <DateInput
              value={form.transferDate}
              onChange={(v) => onChange({ transferDate: v })}
            />
          </FieldCard>
          <FieldCard
            label="신고일"
            hint={
              form.transferDate
                ? `신고기한: ${getFilingDeadline(form.transferDate)} (양도월 말일 + 2개월)`
                : "양도일 입력 시 신고기한이 표시됩니다"
            }
          >
            <DateInput
              value={form.filingDate}
              onChange={(v) => onChange({ filingDate: v })}
            />
          </FieldCard>
        </div>
      </section>

      {/* 양도자산 구성 */}
      <section>
        <SectionHeader
          title="양도자산 구성"
          description="자산을 1건 이상 입력하세요"
        />

        {/* 일괄양도 여부 */}
        <div className="mb-3">
          <p className="text-sm font-medium mb-1">
            함께 양도한 다른 자산 또는 같은 물건의 다른 지분이 있나요?
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            동일 아파트를 여러 번에 걸쳐 지분 취득한 경우(예: 60% 상속 + 40% 매매)에도 <strong>&quot;예&quot;</strong>를 선택하고 각 지분을 별도 자산으로 추가하세요.
          </p>
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

        {/* 일괄양도 모드: 총 양도가액 + 총 양도비 + 안분 방식 */}
        {hasBundledAssets && (
          <div className="space-y-3 mb-3">
            <FieldCard
              label="총 양도가액"
              required
              unit="원"
              hint="주된 자산 + 동반 자산 합계 금액을 입력하세요"
            >
              <CurrencyInput
                label=""
                hideUnit
                value={form.contractTotalPrice}
                onChange={(v) => onChange({ contractTotalPrice: v })}
                placeholder="실제 매매계약서상 거래금액"
              />
            </FieldCard>
            <FieldCard
              label="총 양도비 (선택)"
              unit="원"
              hint={
                <>
                  양도 시 1회 발생하는 부대비용 (부동산 중개수수료·인지대 등). 지분 모드 시 시스템이
                  자산별 지분율로 <strong>자동 안분</strong>합니다. <strong>이 값을 입력하면 자산 카드
                  내 &quot;양도비&quot; 입력란은 자동 비활성화</strong>되며 안분된 금액이 표시됩니다. 자산별로
                  다른 양도비가 있는 예외 상황에서만 자산 카드 양도비 필드를 직접 입력하세요 (그 경우
                  자산 입력이 우선).
                </>
              }
            >
              <CurrencyInput
                label=""
                hideUnit
                value={form.totalTransferExpense}
                onChange={(v) => onChange({ totalTransferExpense: v })}
                placeholder="중개수수료 등 양도 부대비용 (전체 1건)"
              />
            </FieldCard>
            <BundledSaleModeToggle
              value={form.bundledSaleMode}
              onChange={(mode) => onChange({ bundledSaleMode: mode })}
            />
          </div>
        )}

        {/* 자산 카드 리스트 */}
        <CompanionAssetsSection
          assets={form.assets}
          bundledSaleMode={form.bundledSaleMode}
          onChange={updateAssets}
          singleMode={!hasBundledAssets}
          transferDate={form.transferDate}
          contractTotalPrice={form.contractTotalPrice}
          totalTransferExpense={form.totalTransferExpense}
          isOneHouseSingle={form.isOneHousehold === true && form.householdHousingCount === "1"}
          errorAssetIndex={errorAssetIndex}
          errorMessage={errorMessage}
        />

        {hasBundledAssets && (
          <p className="mt-2 text-xs text-muted-foreground px-1">
            ※ 소득세법 시행령 §166⑥: 구분 기재된 경우 계약서 가액 기준, 불분명한 경우 기준시가 비율 안분
          </p>
        )}

      </section>
    </div>
  );
}
