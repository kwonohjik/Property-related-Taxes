"use client";

/**
 * ④ 필요경비 — 자본적지출 / 양도비 분리 입력 + legacy 단일 필드.
 * CompanionAssetCard L642–699 JSX를 그대로 이동.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isFractionalMode } from "../OwnershipRatioInput";
import { GbDeductionOnlyNotice } from "../GbDeductionOnlyNotice";
import { gbPartModes } from "@/lib/calc/transfer-tax-split-acq-mode";
import { mixedSaleSplitScope } from "@/lib/calc/mixed-use-sale-split-scope";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { legacyExpenseMovesToParts } from "@/lib/calc/split-legacy-expense";
import { gbLegacyExpenseUnused } from "@/lib/calc/gb-legacy-expense-unused";
import { GB_LEGACY_EXPENSE_UNUSED_MESSAGE } from "@/lib/calc/gb-legacy-expense-unused";
import { bgExpenseUnusedBasis } from "@/lib/calc/burdened-gift-expense-scope";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { isRedevelopmentSec166Asset } from "@/lib/calc/redev-acquisition-price-source";
import { redevPreApprovalExpensesUnused } from "@/lib/calc/redev-pre-approval-acq-mode";
import { gbCapexBeforeExtensionSlots } from "@/lib/calc/gb-extension-capex-timing";
import { carryoverPurchasedPartScope } from "@/lib/calc/carryover-gift-assumed-debt";
import { carryoverGiftEventForm } from "@/lib/calc/carryover-gift-assumed-debt";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 폼-수준 총 양도비 — 자산별 자동 안분 표시용 */
  totalTransferExpense?: string;
  /** 신고서 자산이 1건뿐인가 — 겸용주택 건물 귀속 양도비는 단건만 받는다(`mixedSaleSplitScope`). */
  isSingleAsset?: boolean;
  /** 함께 양도 둘째 이후 자산인가 — 채무 부분 분할 술어(`carryoverPurchasedPartScope`)가 파트 이월과세 잔재를 꺼진 것으로 읽는 옵션 */
  isNonPrimaryAsset?: boolean;
}

/**
 * B4-2c — 일부양도(`areaScenario === "partial"`) 필요경비 안내.
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-5 · §3.3 U-11
 *
 * ## 항목별 안분 필요성
 *
 * | 항목 | 성격 | 안분 |
 * |---|---|---|
 * | 자본적지출(§97①가목) | **보유 중** 발생 — 물건 여러 부분에 공통될 수 있다 | ✅ 필요 |
 * | 양도비(§97①나목) | **양도 시** 발생(중개수수료·인지대) — 이미 양도분에 대한 지출 | ❌ 불필요 |
 *
 * ## 법령
 *
 * 국심2005구1458(2005.08.31, 기각)이 "취득토지 중 일부 단기 양도" 사안에서
 * **"취득가액 및 필요경비"를 안분**하는 것을 인정했다 → 필요경비도 취득가액과 같은 기준이다.
 *
 * 「소득세법」 제100조 제2항 후문: "이 경우 **공통되는** 취득가액과 양도비용은 해당 자산의
 * 가액에 **비례하여 안분계산**한다."
 *   → **"공통되는"**이 요건이다. 양도분에 **직접 귀속**되면 안분하지 않고 그 전액이 대상이다
 *     (취득가액의 C-2 "구분되면 그 값 우선"과 같은 구조).
 *   ⚠️ 이 조항의 문맥은 토지↔건물 구분이므로 일부양도에는 **유추 적용**이다.
 *      직접 근거는 위 심판례다.
 */
const PARTIAL_CAPEX_NOTE =
  "일부 양도 — 양도한 부분에 직접 귀속되면 그 금액, 여러 부분에 공통되면 취득가액과 같은 기준(취득 당시 기준시가·감정가액 비율)으로 안분한 금액을 입력하세요.";
const PARTIAL_TRANSFER_EXPENSE_NOTE =
  "일부 양도 — 양도비는 이번 양도에서 발생한 금액이므로 안분하지 않습니다. 양도분에 대한 금액만 입력하세요.";

export function AssetSectionExpense({ asset, onChange, totalTransferExpense, isSingleAsset, isNonPrimaryAsset }: Props) {
  // 겸용주택 건물 귀속 양도비 — ④·⑧과 같은 술어. 범위 밖이면 칸이 없고 ④도 보내지 않는다.
  const showMixedBuildingDirect = mixedSaleSplitScope(asset, { isSingleAsset: isSingleAsset === true }).status === "ok";
  const isPartial = (asset.areaScenario ?? "same") === "partial";
  // 이월과세 × 당초 증여 채무 부분(매입분) — 본인 자본적지출·양도비는 증여분·채무 인수 부분에 같은 몫으로 나눈다(계획서 Q-2 a). 노출은 ④ 전송·⑧ 차단과 같은 술어 하나.
  // 토글 값은 증여 사건 서브폼에서 읽는다(`carryoverGiftEventForm`) — 일반건물이 건물만 이월과세면 `asset.carryover`가 아니라 `buildingCarryover`다.
  // 일반건물은 환산 모드에서 이 칸이 개산공제·§97②2호 swap으로 갈려 «같은 몫»이 확정되지 않는다(엔진 설계서 §3.5 · V-1 · V-2) — 실가 모드·분리 OFF에서만 안내한다(분리 ON은 파트 카드가 안내).
  const gbEstimatedExpense = asset.assetKind === "general_building" && (asset.hasSeperateLandAcquisitionDate || gbPartModes(asset).land !== "actual");
  const debtSplitsExpense =
    carryoverGiftEventForm(asset, { isNonPrimary: isNonPrimaryAsset })?.giftDebtAssumed === true &&
    carryoverPurchasedPartScope(asset, { isNonPrimary: isNonPrimaryAsset }).kind === "apply" &&
    !gbEstimatedExpense;
  // 일반건물 · 분리 OFF · 자산 단위 감정·매매사례 — 자본적지출·양도비가 계산에 쓰이지 않는다(§97②2호 본문, A2 §3.7).
  // 분리 ON은 파트 카드가 같은 안내를 띄우고 ⑧ V-8이 자산 단위 칸을 파트 칸으로 안내한다. 모드는 ④·⑧과 같은 leaf.
  const gbModes = asset.assetKind === "general_building" && !asset.hasSeperateLandAcquisitionDate ? gbPartModes(asset) : null;
  const showGbDeductionOnly = gbModes?.land === "appraisal" || gbModes?.land === "salesCase";
  // 부담부증여 · 취득가액이 기준시가(감정가액·매매사례가액) — 두 칸이 세액에 쓰이지 않아 숨기고 이유를 한 줄로 알린다.
  // 값은 지우지 않는다(산정방식을 되돌리면 다시 쓰인다). 판정은 요약 칩과 같은 leaf.
  const bgUnusedBasis = bgExpenseUnusedBasis(asset);
  // 원조합원 재개발 자산(§166) — 두 칸은 인가 후 분 필요경비로만 합산된다(`transfer-tax-api-redev.ts` postApprovalExpenses).
  // 인가 전 분은 재개발 블록 칸이 받고, 그 칸이 쓰이지 않는 모드(개산공제)면 인가 전 지출은 공제되지 않는다 — 같은 leaf로 문구를 가른다.
  const redevPostOnly =
    isRedevelopmentSec166Asset(asset) && asset.redevIsSuccessorMember !== "yes"
      ? redevPreApprovalExpensesUnused(asset) ? "lump" : "actual"
      : null;
  return (
    <>
      {/* 필요경비 — 자본적지출 / 양도비 분리 입력 (소득세법 §97① 가목·나목)
          두 필드 합 > 환산취득가+개산공제 → §97② 단서 swap 발동 */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">
          필요경비 <span className="text-muted-foreground font-normal">(소득세법 §97①·②)</span>
        </p>
        {bgUnusedBasis ? (
          <ToneCard tone="amber">
            <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="bg-expense-unused-notice">
              부담부증여의 취득가액을 {bgUnusedBasis}
              {bgUnusedBasis === "기준시가" ? "로" : "으로"} 산정하므로 필요경비는 개산공제(취득시 기준시가 × 채무비율 × 율 —
              「소득세법 시행령」 제163조 제6항)만 적용됩니다. 자본적지출·양도비는 계산에 쓰이지 않습니다(「소득세법」 제97조
              제2항 제2호 — 자본적지출·양도비와 비교하는 단서는 환산취득가액에만 적용).
            </p>
          </ToneCard>
        ) : (
        <>
        {showGbDeductionOnly && <GbDeductionOnlyNotice />}
        {redevPostOnly && (
          <ToneCard tone="violet">
            <p className="text-xs text-violet-900 dark:text-violet-200" data-testid="redev-expense-post-approval-notice">
              재개발·재건축 조합원 자산 — 이 칸의 자본적지출·양도비는 관리처분계획인가 <b>후</b> 분 필요경비로 계산합니다.
              {redevPostOnly === "actual"
                ? " 인가 전에 종전 부동산에 쓴 비용은 「③ 취득정보 › 재개발 일정·금액」의 「인가전 분 필요경비」에 넣으세요(「소득세법 시행령」 제166조 제1항)."
                : " 인가 전 분 필요경비는 개산공제로 계산하므로 인가 전에 종전 부동산에 쓴 비용은 공제되지 않습니다 — 이 칸에 넣지 마세요(「소득세법 시행령」 제166조 제1항 · 제163조 제6항)."}
            </p>
          </ToneCard>
        )}
        <CurrencyInput
          label="자본적 지출액 (원) — §97① 가목"
          data-field="capitalExpenditure"
          value={asset.capitalExpenditure}
          onChange={(v) => onChange({ capitalExpenditure: v })}
          hint={
            isPartial
              ? PARTIAL_CAPEX_NOTE
              : isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator)
                ? "자산 보유 중 발생한 인테리어·증축 등. 100% 기준 입력 — 시스템이 지분율 자동 적용"
                : "자산 보유 중 발생한 인테리어·증축 등 자본적 지출"
          }
          data-testid="capital-expenditure"
        />
        {/* 일반건물 증축 — 지출 시점으로 원건물·증축분 배분이 갈린다. ④·⑧과 같은 leaf로 띄운다. */}
        {gbCapexBeforeExtensionSlots(asset).asset && (
          <CurrencyInput
            label="그중 증축 전에 지출한 금액 (원)"
            data-field="gbCapexBeforeExtension"
            value={asset.gbCapexBeforeExtension ?? ""}
            onChange={(v) => onChange({ gbCapexBeforeExtension: v })}
            hint={
              "증축 전에 지출한 금액은 원건물에만, 증축 후 금액은 원건물과 증축분에 양도가액 비율로 나눕니다(「소득세법 시행령」 제163조 제3항). 없으면 0을 입력하세요" +
              (isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator) ? ". 100% 기준 입력" : "")
            }
            data-testid="gb-capex-before-extension"
          />
        )}
        {(() => {
          const formTotal = parseAmount(totalTransferExpense || "0");
          const num = parseFloat(asset.ownershipNumerator || "100");
          const den = parseFloat(asset.ownershipDenominator || "100");
          const fractional = isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator);
          const ratio = isFinite(num) && isFinite(den) && den > 0 ? Math.min(num / den, 1.0) : 1.0;
          const allocated = formTotal > 0 ? applyRatio(formTotal, ratio) : 0;
          const useFormLevel = formTotal > 0;
          return (
            <CurrencyInput
              label="양도비 (원) — §97① 나목"
              // 지분 모드만 확정 금액을 보여 준다(가액 비례 = 지분 비례라 화면에서 계산 가능).
              // 컴패니언은 자산별 양도가액이 엔진에서 정해지므로 칸을 비워 둔다 — 잘못된
              // 숫자(총액)를 그대로 보여 주던 것이 Q08의 오해 지점이었다.
              value={useFormLevel ? (fractional ? String(allocated) : "") : asset.transferExpense}
              onChange={(v) => onChange({ transferExpense: v })}
              disabled={useFormLevel}
              hint={
                useFormLevel
                  ? fractional
                    ? `자동 안분 ${allocated.toLocaleString()} = 총 양도비 ${formTotal.toLocaleString()} × 지분 ${num}/${den}. 폼 상단 "총 양도비"를 비우면 직접 입력 가능`
                    : /**
                       * 🔴 종전 문구는 「자동 적용 {총액}」이었다 — 컴패니언에는 지분율 축이 없어
                       *   `ratio = 1.0`이 되는 탓에 **모든 카드가 총액을 그대로** 보여 줬고,
                       *   정작 ④는 그 값을 컴패니언에 0으로 보냈다(Q08).
                       *
                       *   지금은 신고 단위로 1회 보내 엔진이 §100② 후단(양도가액 비례)으로
                       *   안분한다. 「기준시가 안분」 모드에서는 자산별 양도가액을 **엔진이**
                       *   정하므로 이 화면에서 금액을 확정할 수 없다 — 지어내지 않고
                       *   배분 규칙만 밝힌다(결과 화면의 안분 표에 자산별 금액이 나온다).
                       */
                      `총 양도비 ${formTotal.toLocaleString()}을 자산별 양도가액에 비례하여 안분합니다 (소득세법 §100② 후단). 폼 상단 "총 양도비"를 비우면 자산별 직접 입력 가능`
                  : isPartial
                    ? PARTIAL_TRANSFER_EXPENSE_NOTE
                    : fractional
                      ? "양도 시 1회 발생 (중개수수료·인지대 등). 지분 모드는 폼 상단 \"총 양도비\"에서 일괄 입력 권장 (자동 안분)"
                      : "양도 시 발생한 중개수수료·인지대 등"
              }
            />
          );
        })()}
        {debtSplitsExpense && (
          <ToneCard tone="amber">
            <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="carryover-debt-expense-split-notice">
              당초 증여 때 채무를 인수했으면 이 칸의 금액은 증여분과 채무 인수 부분에 같은 몫(증여 당시 평가액 − 인수한 채무 : 인수한 채무)으로 나누어 적용합니다.
            </p>
          </ToneCard>
        )}
        </>
        )}
        {showMixedBuildingDirect && (
          <CurrencyInput
            label="건물에 직접 귀속되는 양도비 (원) — 겸용주택"
            data-field="mixedBuildingDirectTransferExpense"
            data-testid="mixed-building-direct-transfer-expense"
            value={asset.mixedBuildingDirectTransferExpense}
            onChange={(v) => onChange({ mixedBuildingDirectTransferExpense: v })}
            hint={
              "건물에만 관련된 양도비(예: 매수자 요구로 건물을 철거한 비용). 토지로 나누지 않고 주택건물·상가건물 양도가액 비율로만 나눕니다 " +
              "(소득세법 §100② 후단은 공통되는 양도비만 안분). 위 양도비 칸에는 넣지 마세요" +
              (isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator) ? ". 100% 기준 입력 — 시스템이 지분율 자동 적용" : "")
            }
          />
        )}
        {!bgUnusedBasis && (
        <p className="text-caption text-muted-foreground">
          환산취득가 모드에서 (자본+양도비) &gt; (환산+개산공제) 시 §97②2호 단서에 따라 자본+양도비를 필요경비로 적용합니다(감정가액·매매사례가액 모드는 제외).
        </p>
        )}
        {isPartial && !bgUnusedBasis && (
          <p className="text-caption text-muted-foreground" data-testid="partial-expense-basis">
            일부 양도 시 <strong>공통되는</strong> 필요경비는 자산 가액에 비례하여 안분합니다 (「소득세법」 제100조 제2항 후문 유추 · 국심2005구1458).
          </p>
        )}
      </div>

      {/* legacy 단일 필드 — backward-compat (sessionStorage 로드 시 표시).
          분리 계산 자산은 ⑧이 이 값을 파트 칸으로 옮기라고 막으므로(`legacyExpenseMovesToParts`) 양도비가 있어도 보인다 — 숨은 값으로 막지 않는다.
          총 양도비가 쓰이면 꺼진 양도비는 ④가 0으로 본다(O-9 `withInScopeTransferExpenses`) — 같은 값으로 판정해야 이 칸이 숨은 채 쓰이지 않는다. */}
      {parseInt(asset.directExpenses || "0", 10) > 0
       && (legacyExpenseMovesToParts(asset)
         || (parseInt(asset.capitalExpenditure || "0", 10) === 0
           && (parseAmount(totalTransferExpense || "0") > 0 || parseInt(asset.transferExpense || "0", 10) === 0))) && (
        <>
          {gbLegacyExpenseUnused(asset) && (
            <ToneCard tone="amber">
              <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="gb-legacy-expense-unused-notice">
                {GB_LEGACY_EXPENSE_UNUSED_MESSAGE}
              </p>
            </ToneCard>
          )}
          <CurrencyInput
            label="직접 귀속 필요경비 (원) — 이전 입력 형식"
            data-field="directExpenses"
            value={asset.directExpenses}
            onChange={(v) => onChange({ directExpenses: v })}
            hint={isPartial ? PARTIAL_CAPEX_NOTE : undefined}
          />
        </>
      )}
    </>
  );
}
