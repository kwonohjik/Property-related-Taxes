// US-72 — PHD 환산 토글 ON + 입력 비움: 5년 이내 양도는 막지 않고, 5년 경과 양도는 막는다 (하이브리드 6조문).
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

const CASES: { name: string; acq: string; reduction: Record<string, unknown> }[] = [
  { name: "§98의3", acq: "2009-06-01", reduction: { type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: "2009-06-01", isOverconcentration983: false, phdMode983: true } },
  { name: "§98의5", acq: "2010-06-01", reduction: { type: "unsold_98_5", contractDate985: "2010-03-01", announcedPrice985: "100000000", contractPrice985: "85000000", phdMode985: true } },
  { name: "§98의6", acq: "2011-06-01", reduction: { type: "unsold_98_6", hoType986: "seller_rented", stdPriceSumAtBase986: "500,000,000", floorAreaSqm986: "100", phdMode986: true } },
];

function makeForm(acq: string, transfer: string, reduction: Record<string, unknown>) {
  const form = createDefaultTransferFormData();
  form.transferDate = transfer;
  form.assets[0] = { ...form.assets[0], acquisitionDate: acq, reductions: [reduction as unknown as AssetReductionForm] };
  return form;
}

describe("[US-72] PHD ON 미입력 — 5년 분기", () => {
  for (const c of CASES) {
    const within = `${Number(c.acq.slice(0, 4)) + 4}${c.acq.slice(4)}`;
    const over = `${Number(c.acq.slice(0, 4)) + 7}${c.acq.slice(4)}`;
    it(`${c.name}: 5년 이내 양도 -> 통과`, () => {
      expect(validateStep(2, makeForm(c.acq, within, c.reduction))).toBeNull();
    });
    it(`${c.name}: 5년 경과 양도 -> PHD 환산 입력 차단`, () => {
      expect(validateStep(2, makeForm(c.acq, over, c.reduction))).toContain("PHD 환산 모드");
    });
  }
});
