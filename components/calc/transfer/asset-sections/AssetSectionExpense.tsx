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

export function AssetSectionExpense({ asset, onChange, totalTransferExpense }: Props) {
  const isPartial = (asset.areaScenario ?? "same") === "partial";
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
            isPartial
              ? PARTIAL_CAPEX_NOTE
              : isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator)
                ? "자산 보유 중 발생한 인테리어·증축 등. 100% 기준 입력 — 시스템이 지분율 자동 적용"
                : "자산 보유 중 발생한 인테리어·증축 등 자본적 지출"
          }
          data-testid="capital-expenditure"
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
        <p className="text-caption text-muted-foreground">
          환산취득가 모드에서 (자본+양도비) &gt; (환산+개산공제) 시 §97②2호 단서에 따라 자본+양도비를 필요경비로 적용합니다(감정가액·매매사례가액 모드는 제외).
        </p>
        {isPartial && (
          <p className="text-caption text-muted-foreground" data-testid="partial-expense-basis">
            일부 양도 시 <strong>공통되는</strong> 필요경비는 자산 가액에 비례하여 안분합니다 (「소득세법」 제100조 제2항 후문 유추 · 국심2005구1458).
          </p>
        )}
      </div>

      {/* legacy 단일 필드 — backward-compat (sessionStorage 로드 시 표시). */}
      {parseInt(asset.directExpenses || "0", 10) > 0
       && parseInt(asset.capitalExpenditure || "0", 10) === 0
       && parseInt(asset.transferExpense || "0", 10) === 0 && (
        <CurrencyInput
          label="직접 귀속 필요경비 (원) — legacy"
          value={asset.directExpenses}
          onChange={(v) => onChange({ directExpenses: v })}
          hint={isPartial ? PARTIAL_CAPEX_NOTE : undefined}
        />
      )}
    </>
  );
}
