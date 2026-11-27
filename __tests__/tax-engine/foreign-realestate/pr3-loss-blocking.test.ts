/**
 * PR-3 양도차손 처리 — 법 §118의8 준용 목록에 §102(양도차손 통산)가 없다(계획서 엔진 V-1, 사용자 결정 C-1).
 *  - 차손 자산 + 차익 자산이 한 과세기간에 섞임 → 통산하지도 0으로 버리지도 않고 전용 코드로 거부(「확인 필요」).
 *  - 단건 차손 · 전부 차손(통산할 차익이 없음) → 세액 0 결과.
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { aAsset, bAsset, ftax, k1Input, ratesAt, usd } from "./_fixtures";

const rates = ratesAt("2026-07-10");
/** b를 양도차손으로: 양도가액 $200,000×1,200 = 240,000,000 − 취득 260,000,000 = −20,000,000 */
const bLoss = () => bAsset({}, 200_000, 1_200);

const caught = (fn: () => unknown): TaxCalculationError => {
  try {
    fn();
  } catch (e) {
    return e as TaxCalculationError;
  }
  throw new Error("던지지 않음");
};

describe("차익 + 차손 혼재 → 차단", () => {
  it("a 차익 437,000,000 + b 차손 −20,000,000 → FOREIGN_LOSS_NETTING_UNRESOLVED (통산하면 417,000,000 · 0으로 버리면 437,000,000)", () => {
    const e = caught(() => calc(k1Input({ assets: [aAsset(), bLoss()] }), rates));
    expect(e).toBeInstanceOf(TaxCalculationError);
    expect(e.code).toBe(TaxErrorCode.FOREIGN_LOSS_NETTING_UNRESOLVED);
    expect(e.message).toContain("확인 필요");
    expect(e.details).toMatchObject({ path: "assets", lossAssetIds: ["b"], gainAssetIds: ["a"] });
  });

  it("차손이 앞 자산이어도 같다(입력 순서·양도일 순서 무관)", () => {
    const e = caught(() => calc(k1Input({ assets: [bLoss(), aAsset()] }), rates));
    expect(e.code).toBe(TaxErrorCode.FOREIGN_LOSS_NETTING_UNRESOLVED);
  });

  it("route 매핑: 입력 결함처럼 400 + 경로 fieldErrors", async () => {
    const e = caught(() => calc(k1Input({ assets: [aAsset(), bLoss()] }), rates));
    const res = taxCalculationErrorResponse(e);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("FOREIGN_LOSS_NETTING_UNRESOLVED");
    expect(body.error.fieldErrors.assets).toHaveLength(1);
  });

  it("필요경비 산입으로 차손이 된 자산도 같다 — b 차익 100,000,000에 외국세 150,000,000 산입 → −50,000,000", () => {
    const e = caught(() =>
      calc(
        k1Input({
          assets: [aAsset(), bAsset()],
          foreignTax: { method: "expense", items: [ftax("b", 150_000, "2026-03-05", 1_000)] },
        }),
        rates,
      ),
    );
    expect(e.code).toBe(TaxErrorCode.FOREIGN_LOSS_NETTING_UNRESOLVED);
  });

  it("같은 외국세여도 세액공제방법이면 양도차익은 그대로라 차단되지 않는다(한도로 막힐 뿐)", () => {
    const r = calc(
      k1Input({
        assets: [aAsset(), bAsset()],
        foreignTax: { method: "credit", items: [ftax("b", 150_000, "2026-03-05", 1_000)] },
      }),
      rates,
    );
    expect(r.rows[1].capitalGain).toBe(100_000_000);
    expect(r.foreignTaxCreditApplied).toBe(35_111_732); // b 한도(잔액 흡수 — 입력 순서상 마지막 양(+) B)
  });
});

describe("차익 자산이 없으면 통산할 대상이 없다 → 세액 0", () => {
  it("단건 차손(K-7) 세액 0 · 차손 echo", () => {
    const r = calc(k1Input({ assets: [bLoss()] }), rates);
    expect(r.taxCategory).toBe("foreign_realestate");
    expect(r.rows[0].lossAmount).toBe(20_000_000);
    expect([r.incomeAmountTotal, r.basicDeduction, r.taxBase, r.calculatedTax, r.totalTax]).toEqual([0, 0, 0, 0, 0]);
  });

  it("2건 모두 차손 — 세액 0(차손끼리 합쳐도 통산 대상이 아님), 행마다 차손 echo", () => {
    const r = calc(
      k1Input({ assets: [bLoss(), { ...bLoss(), id: "c", transfer: usd(190_000, "2026-03-05", 1_200) }] }),
      rates,
    );
    expect(r.rows.map((x) => x.lossAmount)).toEqual([20_000_000, 32_000_000]);
    expect([r.taxBase, r.calculatedTax, r.localIncomeTax, r.totalTax]).toEqual([0, 0, 0, 0]);
    expect(r.capitalGainTotal).toBe(-52_000_000);
  });

  it("차손 + 양도차익 0(= 차익 없음)도 막지 않는다", () => {
    const zero = bAsset({}, 260_000, 1_000); // 양도가액 260,000,000 − 취득 260,000,000 = 0
    const r = calc(k1Input({ assets: [bLoss(), { ...zero, id: "z" }] }), rates);
    expect(r.rows[1].capitalGain).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it("거주 5년 미만이면 혼재여도 과세대상 아님으로 먼저 끝난다(세액 0 · 오류 아님)", () => {
    const r = calc(k1Input({ domesticResidenceYears: 3, assets: [aAsset(), bLoss()] }), rates);
    expect(r.taxCategory).toBe("not_liable");
  });
});
