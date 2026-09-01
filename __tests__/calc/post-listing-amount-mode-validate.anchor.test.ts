/**
 * §165⑤ 간이 «순액 입력» — validate 모드 분기 anchor (⑧).
 *
 * 계획서: docs/00-pm/post-listing-simple-amount-input.plan.md §5·§7-5
 *
 * 🔴 모드를 안 가르면 둘 중 하나가 된다:
 *    - 파생 4필드만 검사 → 원천값을 다 넣어도 «입력칸은 찼는데 차단» (dead-end)
 *    - 원천값을 안 봄     → 빈 값으로 통과
 *
 * 같은 형태의 direct/daily 분기가 `transferStdInputMode`에 이미 있다
 * (`stock-transfer-tax-validate-step2.ts:302` · anchor `stock-std-input-mode-axis`).
 *
 * ⚠️ 이 저장소에서 「UI 통과 ↔ validate 차단」 모순은 반복 발생한 결함이다
 *    (memory `feedback_ui_gate_removes_sole_input_path` · `feedback_validation_sync_8th_point`).
 */

import { describe, it, expect } from "vitest";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

/** 취득 후 상장(§165⑤) 간이 모드 — 상장일·1개월 평균까지는 채워 둔다 */
function postListingForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    securityCode: "005930",
    securityName: "삼성전자",
    acquisitionDate: "2008-04-20",
    transferDate: "2025-06-10",
    shareCount: "1000",
    transferTotalPrice: "60000000",
    acquisitionMode: "estimated",
    acquiredBeforeListing: true,
    unlistedDetailMode: "simple",
    listingDate: "2009-08-21",
    listingDatePriceAvg1Month: "8001",
    // §163⑨ 분모 — 이 축과 무관하지만 같은 단계에서 필수라 채워 둔다
    // (안 채우면 AV-3·AV-4가 이 필드 때문에 적색이 되어 «이 anchor가 무엇을 보는지»가 흐려진다)
    transferDatePriceAvg1Month: "56590",
    ...o,
  } as StockTransferFormData;
}

const fieldsOf = (form: StockTransferFormData) =>
  validateStep2Domestic(form).map((e) => e.field);

/** 원천값이 모두 채워지고 파생까지 mirror된 정상 상태 */
const FILLED_AMOUNTS: Partial<StockTransferFormData> = {
  simpleValueInputMode: "amounts",
  listingYearNetIncomeAmount: "500000000",
  listingYearShareCount: "10000",
  listingYearNetAssetAmount: "48000000",
  listingYearGoodwill: "2000000",
  listingYearNetIncomePerShare: "500000",
  listingYearNetAssetPerShare: "5000",
  acquisitionYearNetIncomeAmount: "445200000",
  acquisitionYearShareCount: "10000",
  acquisitionYearNetAssetAmount: "43490000",
  acquisitionYearNetIncomePerShare: "445200",
  acquisitionYearNetAssetPerShare: "4349",
};

describe("AV — 간이 «순액 입력» 모드의 validate 분기", () => {
  it("AV-1 (회귀 가드) direct 모드는 종전대로 파생 4필드를 요구한다", () => {
    const fields = fieldsOf(postListingForm({ simpleValueInputMode: "direct" }));
    expect(fields).toContain("listingYearNetIncomePerShare");
    expect(fields).toContain("listingYearNetAssetPerShare");
    expect(fields).toContain("acquisitionYearNetIncomePerShare");
    expect(fields).toContain("acquisitionYearNetAssetPerShare");
  });

  it("AV-2 amounts 모드 — 원천값 미입력 시 «원천 필드»를 짚어 차단한다", () => {
    const fields = fieldsOf(postListingForm({ simpleValueInputMode: "amounts" }));
    expect(fields).toContain("listingYearNetIncomeAmount");
    expect(fields).toContain("listingYearShareCount");
    expect(fields).toContain("listingYearNetAssetAmount");
    expect(fields).toContain("acquisitionYearNetIncomeAmount");
    // 🔑 파생 필드를 짚으면 사용자가 «고칠 수 없는 칸»을 가리키게 된다 — 그러면 안 된다.
    expect(fields).not.toContain("listingYearNetIncomePerShare");
    expect(fields).not.toContain("acquisitionYearNetAssetPerShare");
  });

  it("AV-3 amounts 모드 — 원천값을 채우면 통과한다 (UI 통과 ↔ validate 차단 모순 없음)", () => {
    const fields = fieldsOf(postListingForm(FILLED_AMOUNTS));
    // 구별력 확보: 같은 폼의 direct 모드는 실제로 차단된다(대조군)
    const directFields = fieldsOf(
      postListingForm({ ...FILLED_AMOUNTS, simpleValueInputMode: "direct",
        listingYearNetIncomePerShare: "", listingYearNetAssetPerShare: "",
        acquisitionYearNetIncomePerShare: "", acquisitionYearNetAssetPerShare: "" }),
    );
    expect(directFields.length).toBeGreaterThan(0);
    expect(fields).toEqual([]);
  });

  it("AV-4 영업권은 «필수가 아니다» — 빈칸이어도 통과한다", () => {
    const fields = fieldsOf(postListingForm({ ...FILLED_AMOUNTS, listingYearGoodwill: "" }));
    expect(fields).toEqual([]);
  });

  it("AV-5 주식수 0은 차단한다 — 1주당 가치의 분모다", () => {
    const fields = fieldsOf(postListingForm({ ...FILLED_AMOUNTS, listingYearShareCount: "0" }));
    expect(fields).toContain("listingYearShareCount");
  });

  it("AV-6 원천값은 찼는데 파생이 비어 있으면 «산정 실패»로 차단한다 (조용한 통과 금지)", () => {
    const fields = fieldsOf(
      postListingForm({ ...FILLED_AMOUNTS, listingYearNetIncomePerShare: "" }),
    );
    expect(fields).toContain("listingYearNetIncomeAmount");
    const msg = validateStep2Domestic(
      postListingForm({ ...FILLED_AMOUNTS, listingYearNetIncomePerShare: "" }),
    ).find((e) => e.field === "listingYearNetIncomeAmount")?.message;
    expect(msg).toMatch(/자동 산정 실패/);
  });

  it("AV-7 결손 법인 — 파생 1주당 가치가 0이어도 «자동 산정 실패»로 차단하지 않는다", () => {
    // 🔑 상증령 §56① 후단 준용으로 결손이면 1주당 순손익가치가 **0**이 된다.
    //    0을 「산정 실패」로 오인해 차단하면 결손 법인은 이 모드로 계산 자체를 못 한다.
    //    (UI 쪽 대응 anchor: post-listing-amount-input.anchor.test.tsx AM-8)
    const form = postListingForm({
      simpleValueInputMode: "amounts",
      listingYearNetIncomeAmount: "-100000000", // 결손
      listingYearShareCount: "10000",
      listingYearNetAssetAmount: "48000000",
      listingYearNetIncomePerShare: "0", // 파생 — §56① 후단
      listingYearNetAssetPerShare: "4800",
      acquisitionYearNetIncomeAmount: "-50000000",
      acquisitionYearShareCount: "10000",
      acquisitionYearNetAssetAmount: "30000000",
      acquisitionYearNetIncomePerShare: "0",
      acquisitionYearNetAssetPerShare: "3000",
    });
    const fields = fieldsOf(form);
    expect(fields.filter((f) => f.includes("NetIncomePerShare"))).toEqual([]);
    expect(fields.filter((f) => f.includes("NetIncomeAmount"))).toEqual([]);
  });

});
