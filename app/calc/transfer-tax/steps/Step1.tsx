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
import type { AssetSplitMode } from "@/components/calc/transfer/OwnershipRatioInput";
import { isFractionalRatioStr } from "@/lib/calc/transfer-tax-api-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  // 자산 분할 모드 — 단일 소스(명시 state). length·ratio derive는 초기화(세션 복원) 1회만 —
  // 렌더마다 재계산하면 토글 ON 직후 자기소멸. (memory feedback_three_state_optional_mode_toggle)
  const [splitMode, setSplitMode] = useState<AssetSplitMode>(() => {
    if (
      form.assets.some((a) =>
        isFractionalRatioStr(a.ownershipNumerator, a.ownershipDenominator),
      )
    )
      return "fractional";
    if (form.assets.length > 1) return "companion";
    return "none";
  });
  const [pendingCompanionOff, setPendingCompanionOff] = useState(false);

  // 토글 A — 함께 양도(다른 물건 N개)
  function handleCompanionToggle(yes: boolean) {
    if (yes) {
      setSplitMode("companion");
      if (form.assets.length === 1)
        onChange({ assets: [...form.assets, makeDefaultAsset(2)] });
    } else {
      setSplitMode("none");
      if (form.assets.length > 1) {
        const firstAsset: AssetForm = {
          ...form.assets[0],
          actualSalePrice: form.contractTotalPrice || form.assets[0].actualSalePrice,
        };
        onChange({ assets: [firstAsset] });
      }
    }
  }

  // 토글 B — 같은 물건 지분 분할(③ 취득정보에서 호출). ownership 빈칸으로 추가 →
  // validate 미입력 차단(옵션 c)으로 "지분분할인데 단독(100/100)" 모순 방지.
  function handleFractionalToggle(yes: boolean) {
    if (yes) {
      setSplitMode("fractional");
      const first: AssetForm = {
        ...form.assets[0],
        ownershipNumerator: "",
        ownershipDenominator: "",
      };
      if (form.assets.length === 1) {
        const sib: AssetForm = {
          ...makeDefaultAsset(2),
          ownershipNumerator: "",
          ownershipDenominator: "",
        };
        onChange({ assets: [first, sib] });
      } else {
        onChange({ assets: [first, ...form.assets.slice(1)] });
      }
    } else {
      setSplitMode("none");
      const firstAsset: AssetForm = {
        ...form.assets[0],
        ownershipNumerator: "100",
        ownershipDenominator: "100",
      };
      onChange({ assets: [firstAsset] });
    }
  }

  function updateAssets(assets: AssetForm[]) {
    // 외부 자산 추가(증환지 등)로 2개 이상이 되고 모드 미설정이면 companion 자동 승격.
    // fractional은 명시 토글로만 진입 — derive 재계산 없음(자기소멸 차단).
    if (splitMode === "none" && assets.length > 1) {
      setSplitMode("companion");
      onChange({ assets });
      return;
    }
    if (splitMode === "none" && assets.length === 1) {
      onChange({ assets, contractTotalPrice: assets[0].actualSalePrice || "" });
      return;
    }
    onChange({ assets });
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
        {/* 토글 A — 함께 양도한 다른 자산 (목록 레벨). 지분 분할은 자산 카드 ③ 토글 B. */}
        <ToggleCard
          className="mb-3"
          tone="sky"
          checked={splitMode === "companion"}
          disabled={splitMode === "fractional"}
          disabledReason={
            splitMode === "fractional"
              ? "‘지분별 취득’ 모드와 동시에 사용할 수 없습니다. (자산 카드 ③ 취득정보)"
              : undefined
          }
          onCheckedChange={(yes) => {
            if (yes) handleCompanionToggle(true);
            else if (form.assets.length > 1) setPendingCompanionOff(true);
            else handleCompanionToggle(false);
          }}
          title="같은 날 다른 부동산도 함께 파셨나요?"
          description={
            <>
              같은 날 다른 부동산도 함께 양도한 경우 켜세요 — 각 자산을 별도로 추가합니다. (같은
              물건을 지분으로 나눠 취득한 경우는 자산 카드 ③ 취득정보의 ‘지분별 취득’ 토글을
              사용하세요.)
            </>
          }
        />

        {/* 분할 모드: 총 양도가액(공통) + 총 양도비 + 안분 방식(companion 전용) */}
        {splitMode !== "none" && (
          <div className="space-y-3 mb-3">
            <FieldCard
              label="총 양도가액"
              required
              unit="원"
              hint="주된 자산 + 동반 자산(또는 전 지분 100%) 합계 금액을 입력하세요"
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
                  양도 시 1회 발생하는 부대비용 (부동산 중개수수료·인지대 등). 시스템이 자산별
                  지분율로 <strong>자동 안분</strong>합니다. <strong>이 값을 입력하면 자산 카드 내
                  &quot;양도비&quot; 입력란은 자동 비활성화</strong>되며 안분된 금액이 표시됩니다.
                  자산별로 다른 양도비가 있는 예외 상황에서만 자산 카드 양도비 필드를 직접
                  입력하세요 (그 경우 자산 입력이 우선).
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
            {splitMode === "companion" && (
              <BundledSaleModeToggle
                value={form.bundledSaleMode}
                onChange={(mode) => onChange({ bundledSaleMode: mode })}
              />
            )}
          </div>
        )}

        {/* 자산 카드 리스트 */}
        <CompanionAssetsSection
          assets={form.assets}
          bundledSaleMode={form.bundledSaleMode}
          onChange={updateAssets}
          singleMode={splitMode === "none"}
          transferDate={form.transferDate}
          filingDate={form.filingDate}
          filingOverdue={filingOverdue}
          filingDeadline={filingDeadline}
          onFormChange={onChange}
          contractTotalPrice={form.contractTotalPrice}
          totalTransferExpense={form.totalTransferExpense}
          isOneHouseSingle={form.isOneHousehold === true && form.householdHousingCount === "1"}
          errorAssetIndex={errorAssetIndex}
          errorMessage={errorMessage}
          splitMode={splitMode}
          onFractionalToggle={handleFractionalToggle}
        />

        {splitMode === "companion" && (
          <p className="mt-2 text-xs text-muted-foreground px-1">
            ※ 소득세법 시행령 §166⑥: 구분 기재된 경우 계약서 가액 기준, 불분명한 경우 기준시가 비율 안분
          </p>
        )}

        {/* 토글 A OFF 폐기 확인 (memory feedback_dialog_data_discard_confirm) */}
        <Dialog open={pendingCompanionOff} onOpenChange={setPendingCompanionOff}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>‘함께 양도’ 모드를 끄시겠습니까?</DialogTitle>
              <DialogDescription>
                추가한 동반 자산이 모두 삭제됩니다. 되돌릴 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setPendingCompanionOff(false)}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCompanionToggle(false);
                  setPendingCompanionOff(false);
                }}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
              >
                삭제하고 끄기
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}
