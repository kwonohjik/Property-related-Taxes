"use client";

/**
 * ExitTaxActualTransferBlock — 국외전출세 **3단계 경정청구: 종목별 실제 양도** (⑤ · PR-7b)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.plan.md` §2.2 PR-7 결정(P-1~P-7) · §2.3
 * 검증 짝: `validateExitTaxActualTransfer`(칸 단위 + 방식 충돌) · 엔진 판정 `findExitTaxFormProblem`(⑫와 단일 소스)
 *
 * 입력 방식(전역/종목별)은 **엔진 분류 helper**가 정한다(`previewExitTaxActualMode`) — 화면에서 따로 판정하지 않는다.
 *   · 2027 이후 + 2호 과세 종목이 있거나 구분 ≥2   → 종목별만(강제)
 *   · 2027 이후 + 과세 구분 1호뿐                  → 종목 공통(전역·현행) 또는 종목별 선택
 *   · 2026 이전 출국 · 판정 불가                    → 전역만(이 블록은 아무것도 그리지 않는다 — 종전 DOM 그대로)
 *
 * 반대 방식의 값이 남아 있으면 **조용히 지우지 않는다** — ⑧이 막고, 여기서 «지우기» 버튼으로 사용자가 직접 비운다.
 * (④는 모드가 다른 값을 body에 싣지 않는다 — 숨은 값이 계산에 섞이지 않는다.)
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import { hasGlobalActualInput } from "@/lib/calc/stock-transfer-exit-tax-actual-mode";
import type { ExitTaxActualModeInfo } from "@/lib/calc/stock-transfer-exit-tax-actual-mode";
import { previewExitTaxActualMode } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import {
  createEmptyExitTaxActualTransfer,
  createInitialStockFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import type {
  ExitTaxHoldingActualForm,
  ExitTaxHoldingForm,
  StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import { FOREIGN_TAX_EXCLUSION_OPTIONS } from "./exit-tax-foreign-tax-options";
import { ExitTaxHoldingActualFields } from "./ExitTaxHoldingActualFields";
import { SectionBox, type StockStepBlockProps } from "./stock-section-box";

/**
 * 이 블록이 그려지는가 — 종목별 모드 · 방식 선택(2027 이후 + 1호뿐) · 종목별 입력이 남아 있어 안내가 필요할 때.
 * 호출자(`ExitTaxSettlementBlock`)가 같은 술어로 자리를 정한다(널 컴포넌트를 형제로 끼우면 `useId`가 바뀐다).
 */
export function exitTaxActualBlockVisible(
  form: Pick<StockTransferFormData, "etHoldings">,
  info: ExitTaxActualModeInfo,
): boolean {
  return info.mode === "per_holding" || info.selectable || (form.etHoldings ?? []).some((h) => h.actualTransfer != null);
}

const MODE_OPTIONS = [
  {
    value: "global",
    label: "종목 공통 단가 하나로 입력 (현행)",
    description: "실제 양도 1주당 단가 하나를 전 종목에 적용합니다 — 보유 종목이 한 종류일 때 맞습니다",
  },
  {
    value: "per_holding",
    label: "종목별로 입력",
    description: "양도한 종목마다 양도 주식 수·1주당 양도가·외국납부세액을 입력합니다 — 일부만 양도했거나 종목마다 가격이 다를 때",
  },
] as const;

export function ExitTaxActualTransferBlock({ form, onChange }: StockStepBlockProps) {
  const info = previewExitTaxActualMode(form);
  const holdings = form.etHoldings ?? [];
  const staleHoldingInput = holdings.some((h) => h.actualTransfer != null);
  const staleGlobalInput = hasGlobalActualInput(form);
  const perHolding = info.mode === "per_holding";

  function updateActual(id: string, patch: Partial<ExitTaxHoldingActualForm>) {
    onChange({
      etHoldings: holdings.map((h) =>
        h.id === id && h.actualTransfer ? { ...h, actualTransfer: { ...h.actualTransfer, ...patch } } : h,
      ),
    });
  }

  function setSold(h: ExitTaxHoldingForm, sold: boolean) {
    // 끄면 객체 전체를 버린다(숨은 값 금지) · 켜면 빈 입력으로 시작한다
    onChange({
      etHoldings: holdings.map((x) =>
        x.id === h.id ? { ...x, actualTransfer: sold ? createEmptyExitTaxActualTransfer() : null } : x,
      ),
    });
  }

  function clearHoldingInputs() {
    onChange({ etHoldings: holdings.map((h) => (h.actualTransfer ? { ...h, actualTransfer: null } : h)) });
  }

  function clearGlobalInputs() {
    const d = createInitialStockFormData();
    onChange({
      etActualTransferDate: d.etActualTransferDate,
      etActualTransferPricePerShare: d.etActualTransferPricePerShare,
      etHasForeignTax: d.etHasForeignTax,
      etForeignTaxPaid: d.etForeignTaxPaid,
      etForeignTaxPaidForeign: d.etForeignTaxPaidForeign,
      etForeignTaxCurrencyCode: d.etForeignTaxCurrencyCode,
      etForeignTaxExchangeRate: d.etForeignTaxExchangeRate,
      etDomesticSourceTaxWithheld: d.etDomesticSourceTaxWithheld,
    });
  }

  const anyForeignTax = holdings.some((h) => h.actualTransfer && h.actualTransfer.foreignTaxInput !== "none");

  return (
    <div className="space-y-4" data-testid="exit-actual-transfer-block" data-field="etActualTransferMode">
      {/* ── 입력 방식: 선택(2027 이후 · 1호뿐) / 안내(강제) ── */}
      {info.selectable && (
        <FieldCard label="실제 양도 입력 방식" stacked>
          <RadioCardGroup
            name="etActualTransferMode"
            value={info.mode}
            onChange={(v) => onChange({ etActualTransferMode: v })}
            tone="emerald"
            layout="stack"
            options={[...MODE_OPTIONS]}
            data-testid="exit-actual-mode-radio"
          />
        </FieldCard>
      )}
      {info.forced && (
        <div data-testid="exit-actual-forced-note">
          <ToneCard tone="emerald" title="종목별 실제 양도 입력 (§118의12~§118의14)">
            <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
              국외주식(2호) 과세 종목이 있거나 세율 구분이 둘 이상이면 종목 공통 단가 하나로는 계산할 수 없어, 실제로 양도한 종목마다
              양도 주식 수·1주당 양도가·외국납부세액을 입력합니다. 켜지 않은 종목은 양도하지 않은 것으로 보고 계산에 넣지 않습니다.
            </p>
          </ToneCard>
        </div>
      )}

      {/* ── 반대 방식 값이 남음 — 지우지 않고 막고 안내한다 ── */}
      {perHolding && staleGlobalInput && (
        <div data-testid="exit-actual-stale-global">
          <ToneCard tone="rose" title="종목 공통(전역) 입력이 남아 있습니다">
            <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
              실양도일·실양도 단가·외국납부세액·원천징수액을 종목 공통으로 입력한 값이 남아 있습니다. 두 방식은 함께 쓸 수 없어 계산이 막힙니다 —
              아래 버튼으로 지우세요.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={clearGlobalInputs} data-testid="exit-actual-clear-global">
              종목 공통 입력 지우기
            </Button>
          </ToneCard>
        </div>
      )}
      {!perHolding && staleHoldingInput && (
        <div data-testid="exit-actual-stale-holding">
          <ToneCard tone="rose" title="종목별 실제 양도 입력이 남아 있습니다">
            <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
              {info.selectable
                ? "입력 방식이 종목 공통인데 종목별로 입력한 값이 남아 있습니다. 두 방식은 함께 쓸 수 없어 계산이 막힙니다 — 입력 방식을 종목별로 바꾸거나 아래 버튼으로 지우세요."
                : "이 출국일·종목 구성에서는 종목 공통 입력만 쓰는데 종목별로 입력한 값이 남아 있습니다. 계산이 막힙니다 — 아래 버튼으로 지우세요."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={clearHoldingInputs} data-testid="exit-actual-clear-holding">
              종목별 입력 지우기
            </Button>
          </ToneCard>
        </div>
      )}

      {/* ── 종목별 입력 ── */}
      {perHolding && (
        <SectionBox label="실양도 정보 — 경정청구용 · 종목별 (§118의12~§118의14, 선택)" tone="emerald">
          <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
            납부유예 후 실제로 양도한 종목만 켜세요. 실제 양도가액이 출국일 양도가액보다 낮으면 종목별 하락분으로 §118의12 조정공제를
            계산합니다(종목 간 상계 없음). 양도하지 않았으면 모두 꺼 두세요.
          </p>
          {holdings.map((h, i) => {
            const taxed = info.taxedIds.has(h.id);
            const label = h.stockName || `종목 ${i + 1}`;
            if (!taxed) {
              // 제외 종목에는 토글이 없다. 남은 입력이 있으면 지울 수 있게만 보인다(엔진이 막는다)
              if (!h.actualTransfer) return null;
              return (
                <div key={h.id} data-testid={`exit-actual-excluded-${h.id}`} data-field={`etHoldings[${i}].actualTransfer`}>
                  <ToneCard tone="rose" title={`${label} — 제외 종목에 실제 양도 입력이 남아 있습니다`}>
                    <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
                      이 종목은 국외전출세 과세 대상에서 제외돼 실제 양도를 입력할 수 없습니다. 입력을 지우세요.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSold(h, false)}>
                      이 종목 입력 지우기
                    </Button>
                  </ToneCard>
                </div>
              );
            }
            return (
              <ToggleCard
                key={h.id}
                title={`${label} — 실제 양도함`}
                description="켜면 양도한 주식 수와 1주당 양도가를 입력합니다. 끄면 이 종목의 실제 양도 입력이 모두 지워집니다."
                checked={h.actualTransfer != null}
                onCheckedChange={(v) => setSold(h, v)}
                tone="emerald"
                data-testid={`exit-actual-toggle-${h.id}`}
                data-field={`etHoldings[${i}].actualTransfer`}
              >
                {h.actualTransfer && (
                  <ExitTaxHoldingActualFields
                    holding={h}
                    actual={h.actualTransfer}
                    index={i}
                    onChange={(patch) => updateActual(h.id, patch)}
                  />
                )}
              </ToggleCard>
            );
          })}

          {anyForeignTax && (
            <FieldCard label="§118의13② 배제 사유" required stacked field="etForeignTaxExclusionReason">
              <RadioCardGroup
                name="etForeignTaxExclusionReason"
                value={form.etForeignTaxExclusionReason}
                onChange={(v) => onChange({ etForeignTaxExclusionReason: v as "none" | "credit_allowed" | "step_up" })}
                tone="violet"
                layout="stack"
                options={FOREIGN_TAX_EXCLUSION_OPTIONS}
              />
            </FieldCard>
          )}
        </SectionBox>
      )}
    </div>
  );
}
