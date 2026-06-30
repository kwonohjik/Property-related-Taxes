import { useState } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  type TransferFormData,
  type AssetForm,
  makeDefaultAsset,
} from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import { BundledSaleModeToggle } from "@/components/calc/transfer/CompanionSaleModeBlock";
import { getFilingDeadline, isFilingOverdue, isAllBurdenedGift } from "@/lib/calc/filing-deadline";

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

  // §105①3호 — 전 자산 부담부증여 양도는 예정신고 기한 3개월 (일반·혼합은 2개월)
  const burdenedGiftDeadline = isAllBurdenedGift(form.assets);
  const filingOverdue = isFilingOverdue(form.transferDate, form.filingDate, burdenedGiftDeadline);
  // 양도일·신고일 위젯이 자산 카드 ① 안으로 이동 — 신고기한 문자열은 form.assets 전체가
  // 필요한 isAllBurdenedGift 의존이므로 여기서 산출해 prop으로 내려보낸다 (leaf 재계산 금지).
  const filingDeadline = form.transferDate ? getFilingDeadline(form.transferDate, burdenedGiftDeadline) : "";

  return (
    <div className="space-y-6">
      <section>
        {/* 일괄양도 여부 */}
        <ToggleCard
          className="mb-3"
          tone="sky"
          checked={hasBundledAssets}
          onCheckedChange={handleBundledToggle}
          title="함께 양도한 다른 자산이 있거나, 같은 물건을 지분별로 나눠 취득했나요?"
          description={
            <>
              같은 날 다른 부동산도 함께 팔았거나, 이 부동산을 여러 번에 나눠 취득해 취득시기가
              다르면 켜세요. (예: 같은 아파트를 60%는 상속, 40%는 매매로 취득) — 각 자산·지분을
              별도로 추가합니다.
            </>
          }
        />

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
          filingDate={form.filingDate}
          filingOverdue={filingOverdue}
          filingDeadline={filingDeadline}
          burdenedGiftDeadline={burdenedGiftDeadline}
          onFormChange={onChange}
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
