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
    /**
     * 🔑 **지분 분할(축 B)은 정의상 다자산**이다 — `form.assets.length > 1` 조건 필수 (R4, 2026-09-03).
     *
     * 종전에는 length 조건 없이 `some(fractional)`만 봐서 **단건 공유지분(축 A)까지** 축 B로
     * 분류했다. 그러면 같은 데이터가 두 상태로 갈린다:
     *  - 사용자가 방금 60%를 입력한 순간: state는 "none" → ① 기본정보에 「공유 지분율」
     *  - 세션 복원 후 재진입: derive가 "fractional" → ③ 취득정보에 「취득 지분율」
     * 라벨이 바뀔 뿐 아니라 ①에만 있는 「나머지 지분은 타인 소유」 선언이 **사라져**
     * 게이트를 통과할 방법이 없어진다(dead-end 부활).
     *
     * 축 B의 단일 진실 공급원인 `isFullFractionalBundle`도 `assets.length > 1`을 요구한다 —
     * 여기만 빠져 있었다. (`every`가 아니라 `some`인 것은 유지한다: 토글 B 진입 직후
     * 지분율이 빈칸이라 `every`는 거짓이 된다.)
     */
    if (
      form.assets.length > 1 &&
      form.assets.some((a) =>
        isFractionalRatioStr(a.ownershipNumerator, a.ownershipDenominator),
      )
    )
      return "fractional";
    if (form.assets.length > 1) return "companion";
    return "none";
  });
  const [pendingCompanionOff, setPendingCompanionOff] = useState(false);

  // 증환지 증가분 존재 시: 당초분·증가분은 한 필지·한 계약이라 양도가액 구분 기재(actual)가 불가능.
  // 양도시 기준시가 안분(§166⑥ 단서)만 유효 → 결정방식 토글 숨김 + apportioned 강제(파생).
  const hasReplotIncrement = form.assets.some((a) => a.isReplotIncrement);
  const effBundledSaleMode: "actual" | "apportioned" = hasReplotIncrement
    ? "apportioned"
    : form.bundledSaleMode;

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
              badge={hasReplotIncrement ? "증환지 양도가액 입력란" : undefined}
              className={
                hasReplotIncrement
                  ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200"
                  : undefined
              }
              hint={
                hasReplotIncrement
                  ? "증환지 — 여기에 당초분 + 증가분 합계 양도가액을 입력하세요. 양도시 기준시가 비율로 각 자산에 자동 안분됩니다 (자산 카드에는 양도가액 입력란이 없습니다)."
                  : "주된 자산 + 동반 자산(또는 전 지분 100%) 합계 금액을 입력하세요"
              }
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
              label={hasReplotIncrement ? "총 양도비" : "총 양도비 (선택)"}
              unit="원"
              hint={
                hasReplotIncrement ? undefined : (
                  <>
                    양도 시 1회 발생하는 부대비용 (중개수수료·인지대 등). 자산별 지분율로{" "}
                    <strong>자동 안분</strong>되며, 입력하면 자산 카드의 &quot;양도비&quot; 칸은
                    비활성화됩니다. 자산마다 양도비가 다르면 이 칸을 비우고 자산 카드에서 직접
                    입력하세요.
                  </>
                )
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
            {splitMode === "companion" && !hasReplotIncrement && (
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
          bundledSaleMode={effBundledSaleMode}
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
          /**
           * 입주권 §⑥ 카드의 거주요건 경고 게이트 (U1-03).
           *
           * ⚠️ 이 값은 **④ 보유 상황 단계**에서 확정된다(자동 판별 또는 수동 토글).
           *    Step1을 처음 지나는 동안에는 기본값 `false`라 경고가 뜨지 않고,
           *    ④를 거친 뒤 되돌아오거나 이력에서 복원한 경우에 동작한다.
           *    그래도 **넘기지 않으면 영영 뜨지 않는다** — 종전이 그 상태였다.
           */
          wasRegulatedAtAcquisition={form.wasRegulatedAtAcquisition}
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
