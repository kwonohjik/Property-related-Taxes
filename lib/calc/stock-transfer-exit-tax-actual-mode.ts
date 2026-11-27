/**
 * 국외전출세 경정청구 — 실제 양도 입력 방식(모드) 판정 (PR-7b · ④⑤⑧이 같이 import하는 단일 소스)
 *
 * 엔진은 실제 양도를 두 방식으로 받는다(계획서 §2.2 P-5).
 *   · 전역(`global`)      — 종목 공통 «실제 양도 1주당 단가 하나»(2026 출국 교재 사례 41,875,000 불변)
 *   · 종목별(`per_holding`) — `holdings[].actualTransfer` (양도 주수·종목별 단가·종목별 외국납부세액)
 * 두 방식을 함께 쓰면 엔진이 `INVALID_INPUT`으로 거부하고, 2호(국외주식) 과세 종목이 있거나 과세 구분이 둘 이상이면 전역 입력을 거부한다.
 *
 * 어느 종목이 «과세»인지·어느 «구분»인지는 엔진 분류 helper가 정한다(`previewExitTaxClassificationFromBody`) — 여기서 다시 판정하지 않는다.
 * 이 파일은 그 결과를 «모드»로 접는 순수 함수만 둔다(api-foreign-exit과의 순환 import를 피하려고 분류 결과를 인자로 받는다).
 *
 * 모드 규칙
 *   · 출국일 2026 이전 · 판정 불가(입력 미완) · 과세 종목 없음 → `global`, 선택 없음
 *   · 2027 이후 + 과세 구분에 2호가 있음(구분 ≥2도 포함) → `per_holding`, **강제**(선택 없음)
 *   · 2027 이후 + 과세 구분이 1호뿐 → 사용자가 고른 값(`etActualTransferMode`, 기본 `global`), 선택 가능
 * 반대쪽 모드의 값이 남아 있어도 **지우지 않는다** — ④가 보내지 않고 ⑧이 막고 안내한다(숨은 값이 조용히 계산에 들어가거나 사라지지 않게).
 */

import type { ExitTaxHoldingForm, StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isExitTaxFrom2027 } from "@/lib/tax-engine/data/exit-tax-2027-era";
import type { ExitTaxClassificationPreview } from "./stock-transfer-exit-tax-buckets";

export type ExitTaxActualMode = "global" | "per_holding";

export type ExitTaxActualModeInfo = {
  /** 실제 쓰이는 방식 */
  mode: ExitTaxActualMode;
  /** 2호 과세 종목이 있어 종목별만 쓸 수 있는가 */
  forced: boolean;
  /** 사용자가 방식을 고를 수 있는가 (2027 이후 + 과세 구분 1호뿐) */
  selectable: boolean;
  /** 엔진이 «과세»로 분류한 종목 id — 종목별 토글은 이 종목에만 보인다 */
  taxedIds: ReadonlySet<string>;
};

const NONE: ReadonlySet<string> = new Set();

export function resolveExitTaxActualMode(
  form: Pick<StockTransferFormData, "etDepartureDate" | "etActualTransferMode">,
  cls: ExitTaxClassificationPreview | null,
): ExitTaxActualModeInfo {
  if (!isExitTaxFrom2027(form.etDepartureDate) || !cls || cls.taxedIds.size === 0) {
    return { mode: "global", forced: false, selectable: false, taxedIds: cls?.taxedIds ?? NONE };
  }
  if (cls.buckets.some((b) => b !== "clause1")) {
    return { mode: "per_holding", forced: true, selectable: false, taxedIds: cls.taxedIds };
  }
  return {
    mode: form.etActualTransferMode === "per_holding" ? "per_holding" : "global", // 3중 패턴 default "global"
    forced: false,
    selectable: true,
    taxedIds: cls.taxedIds,
  };
}

/** 종목별 실제 양도 입력이 하나라도 켜져 있는가 (토글 ON) */
export function hasHoldingActualInput(form: Pick<StockTransferFormData, "etHoldings">): boolean {
  return (form.etHoldings ?? []).some((h) => h.actualTransfer != null);
}

/** 전역 경정청구 입력(실양도일·단가·외국납부세액·원천징수액)이 하나라도 남아 있는가 — 외국납부세액 토글 ON도 입력으로 본다 */
export function hasGlobalActualInput(
  form: Pick<
    StockTransferFormData,
    | "etActualTransferDate"
    | "etActualTransferPricePerShare"
    | "etHasForeignTax"
    | "etForeignTaxPaid"
    | "etForeignTaxPaidForeign"
    | "etForeignTaxExchangeRate"
    | "etDomesticSourceTaxWithheld"
  >,
): boolean {
  const filled = (s: string | undefined) => !!s && s.trim() !== "";
  return (
    filled(form.etActualTransferDate) ||
    filled(form.etActualTransferPricePerShare) ||
    !!form.etHasForeignTax ||
    filled(form.etForeignTaxPaid) ||
    filled(form.etForeignTaxPaidForeign) ||
    filled(form.etForeignTaxExchangeRate) ||
    filled(form.etDomesticSourceTaxWithheld)
  );
}

/**
 * §118의14① 비거주자 세액공제 입력칸을 열 수 있는 종목인가 — 엔진 `isDomesticIssuer`와 같은 기준(§119 11호 가목).
 * 국내 종목과 내국법인 발행 국외주식(`isListedForeignCorp=false`)만. 외국법인 발행 국외주식(기본값)은 엔진이 거부한다.
 * ④의 `isListedForeignCorp ?? true` 기본값과 같다(3중 패턴).
 */
export function holdingAllowsDomesticWithholding(h: Pick<ExitTaxHoldingForm, "marketType" | "isListedForeignCorp">): boolean {
  return h.marketType !== "foreign_stock" || (h.isListedForeignCorp ?? true) === false;
}
