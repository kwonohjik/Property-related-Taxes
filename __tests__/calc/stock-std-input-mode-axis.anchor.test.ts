/**
 * `transferStdInputMode`는 «취득 후 상장(§165⑤)» 축 전용 필드다 — 축 밖 차단 금지
 *
 * 계획서: docs/00-pm/stock-transfer-std-input-mode-dead-end.plan.md (FD-1~4)
 *
 * ## 무엇을 고정하는가
 *
 * 이 필드의 입력 UI·엔진 소비·결과 표시가 **전부 `acquiredBeforeListing` 안**에 있다:
 *
 *   ⑤ 입력  `PostListingValuationCard.tsx:117`        — ToggleCard children
 *   엔진    `stock-acquisition-basis.ts:144`          — `input.acquiredBeforeListing` 분기 안
 *   ⑦ 표시  `PostListingDetailCard.tsx:189`           — 취득후상장 결과 카드
 *
 * 그런데 종전 ⑧ validate(`validate-step2.ts:296`)만 그 축을 보지 않아,
 * 일반 §163⑨ 경로에서도 daily 규칙을 적용했다. 일반 블록과 취득후상장 카드는
 * **상호배타로 렌더**되므로(`Step2.tsx:393` vs `:465`) 모드 라디오도 일자별 표도
 * 화면에 없고 ⇒ **입력 UI 없이 차단되는 dead-end**가 됐다.
 *
 * ## 🔑 반대편도 함께 본다
 *
 * FD-1만 있으면 「차단을 통째로 없앴다」로도 통과한다. FD-2가 **과소 차단**을,
 * FD-3이 **정당한 차단의 소실**을 각각 막는다
 * ([[feedback_negative_assertion_needs_mutation_probe]]).
 *
 * 안전망 실측(계획서 §2): 이 동작을 바꿔도 **558파일 5,366건이 전부 통과**했다.
 * 즉 종전에 이것을 지키던 테스트는 **0건**이다.
 */

import { describe, it, expect } from "vitest";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

/** 일반 §163⑨ 환산 경로 — 상장 + 환산 + 거래정지 아님 + 취득후상장 아님 */
function generalConversionForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    securityCode: "005930",
    securityName: "삼성전자",
    acquisitionDate: "2015-04-20",
    transferDate: "2025-06-10",
    shareCount: "1000",
    transferTotalPrice: "60000000",
    acquisitionMode: "estimated",
    tradingHaltAtTransfer: false,
    tradingHaltAtAcquisition: false,
    acquiredBeforeListing: false,
    // 분모·분자 모두 «정상 입력»된 상태 — 차단될 이유가 없다
    transferDatePriceAvg1Month: "56590",
    acquisitionDatePriceAvg1Month: "51000",
    ...o,
  };
}

const closingErrors = (form: StockTransferFormData) =>
  validateStep2Domestic(form).filter((e) => e.field === "transferPriceClosing");

const avgErrors = (form: StockTransferFormData) =>
  validateStep2Domestic(form).filter((e) => e.field === "transferDatePriceAvg1Month");

describe("FD — transferStdInputMode 축 정합", () => {
  /**
   * 🔴 종전 결함. 「취득 후 상장」을 켰다 끄면 모드가 `daily`로 남고
   *    (`normalize`가 enum을 보존한다), 그 뒤로는 평균이 멀쩡해도 차단됐다.
   */
  it("FD-1: 일반 §163⑨ 경로 + stale daily + 평균 유효 → 차단되지 않는다", () => {
    const errors = validateStep2Domestic(
      generalConversionForm({ transferStdInputMode: "daily" }),
    );
    expect(
      errors,
      `일반 경로에는 일자별 종가 입력 UI가 없다 — 차단하면 dead-end:\n${JSON.stringify(errors)}`,
    ).toEqual([]);
  });

  /**
   * 🔑 **과소 차단 방지.** FD-1을 「daily면 아무것도 검사하지 않는다」로 고치면
   *    이 단언이 잡는다 — 일반 경로는 direct 규칙으로 «떨어져야» 한다.
   */
  it("FD-2: 일반 §163⑨ 경로 + 평균 미입력 → direct 규칙으로 여전히 차단된다", () => {
    const errors = avgErrors(
      generalConversionForm({ transferStdInputMode: "daily", transferDatePriceAvg1Month: "" }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("직접 입력");
  });

  /**
   * 🔑 **정당한 차단의 보존.** 취득후상장 경로에는 라디오도 일자별 표도 실재하므로
   *    daily 검증은 살아 있어야 한다. daily 분기를 통째로 지우면 이 단언이 실패한다.
   */
  it("FD-3: 취득 후 상장 ON + daily + 종가 미입력 → 종전대로 차단된다", () => {
    const errors = closingErrors(
      generalConversionForm({
        acquiredBeforeListing: true,
        transferStdInputMode: "daily",
        transferPriceClosing: [],
      }),
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("일자별 입력 모드");
  });

  /**
   * ⑤ 토글 OFF patch(FD-5)가 못 잡는 것 — **이미 저장된 폼**이다.
   * 세션 복원·이력 재진입은 normalize를 지나므로 여기서 정규화한다.
   */
  it("FD-4: normalize — 취득후상장 OFF인 저장값의 daily는 direct로 정규화된다", () => {
    const normalized = normalizeStockFormData({
      acquiredBeforeListing: false,
      transferStdInputMode: "daily",
    });
    expect(normalized.transferStdInputMode).toBe("direct");
  });

  it("FD-4b: 취득후상장 ON이면 daily가 그대로 보존된다 (FD-4의 대조군)", () => {
    const normalized = normalizeStockFormData({
      acquiredBeforeListing: true,
      transferStdInputMode: "daily",
    });
    expect(normalized.transferStdInputMode).toBe("daily");
  });
});
