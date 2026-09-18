/**
 * §45의3 매출처 과세제외 — ④API변환 ↔ ⑤렌더 게이트 ↔ ⑧validate ↔ ⑫Zod 정합 (W9).
 *
 * ⑤가 언마운트한 값을 ④가 그대로 보내면 «화면에 없는 값»이 엔진에 도달한다(RC-E).
 * 반대로 ⑤가 요구하는 값을 ④가 빠뜨리면 ⑫Zod가 400으로 계산을 막는다(RC-G 함정).
 * 두 방향을 한 파일에서 고정한다.
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

type SalesRow = DeemedFormState["rcSalesPartners"][number];

function form(sales: SalesRow[]): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "related_corp",
    giftDate: "2025-12-31",
    rcEnterpriseSize: "small",
    rcTotalSalesStr: "20000000000",
    rcPreTaxAdjOperatingIncomeStr: "2500000000",
    rcTaxableIncomeStr: "1800000000",
    rcCorporateTaxNetStr: "340000000",
    rcShareholders: [
      { id: "gap", name: "갑", relation: "self", directRatioPctStr: "20", isCorporate: false },
      { id: "byung", name: "병", relation: "other", directRatioPctStr: "80", isCorporate: false },
    ],
    rcIntermediaryCorps: [],
    rcSalesPartners: sales,
  } as unknown as DeemedFormState;
}

function partners(f: DeemedFormState) {
  const input = buildDeemedGiftInput(f) as unknown as Record<string, unknown>;
  return input.salesPartners as Record<string, unknown>[];
}

const D: SalesRow = {
  id: "sD", name: "D법인", salesAmountStr: "14000000000", isRelated: true, exclusionType: "", rulingStakes: [],
} as SalesRow;

describe("④ 변환이 ⑤ 렌더 게이트를 미러링한다", () => {
  it("[PX-0] 비특수관계 행의 stale exclusionType은 전송되지 않는다", () => {
    const stale = { ...D, id: "etc", name: "기타", salesAmountStr: "6000000000", isRelated: false, exclusionType: "sec10_5" } as SalesRow;
    const out = partners(form([D, stale]));
    expect(out[1]!.exclusionType).toBeUndefined();
  });

  it("[PX-0b] 긍정 짝 — 특수관계 행의 exclusionType은 그대로 전송된다", () => {
    const live = { ...D, id: "etc", name: "기타", salesAmountStr: "6000000000", isRelated: true, exclusionType: "sec10_5" } as SalesRow;
    const out = partners(form([D, live]));
    expect(out[1]!.exclusionType).toBe("sec10_5");
  });

  it("[PX-1] 과세제외유형을 고르면 §⑭3호 보유비율 블록이 언마운트된다 — 그 값도 전송되지 않는다", () => {
    const row = {
      ...D, id: "etc", name: "기타", salesAmountStr: "6000000000", isRelated: true,
      exclusionType: "sec10_5", rulingStakes: [{ shareholderId: "gap", ratioPctStr: "30" }],
    } as SalesRow;
    const out = partners(form([D, row]));
    expect(out[1]!.rulingShareholderStakes).toBeUndefined();
  });

  it("[PX-1b] 긍정 짝 — 과세제외유형이 없으면 §⑭3호 값이 전송된다", () => {
    const row = {
      ...D, id: "etc", name: "기타", salesAmountStr: "6000000000", isRelated: true,
      exclusionType: "", rulingStakes: [{ shareholderId: "gap", ratioPctStr: "30" }],
    } as SalesRow;
    const out = partners(form([D, row]));
    expect(out[1]!.rulingShareholderStakes).toHaveLength(1);
  });

  it("[PX-2] 언마운트된 빈 §⑭ 행이 남아도 ⑧는 통과시키고 ⑫는 400을 내지 않는다", () => {
    // RC-G 함정: ⑧가 렌더 게이트와 같은 술어로 건너뛰므로 ④도 같은 술어로 걸러야 한다.
    const row = {
      ...D, id: "etc", name: "기타", salesAmountStr: "6000000000", isRelated: false,
      exclusionType: "sec10_5", rulingStakes: [{ shareholderId: "", ratioPctStr: "" }],
    } as SalesRow;
    const f = form([D, row]);
    expect(validateDeemedInput(f)).toBeNull();
    const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput(f))));
    expect(parsed.success).toBe(true);
  });
});
