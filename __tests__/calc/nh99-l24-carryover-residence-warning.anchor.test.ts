/**
 * 이월과세(`carryover_gift`) 주택 — 거주요건 빌더(`buildResidenceReqInput`)가 읽는 취득일 (레인 L24 · L21/L23 후속).
 *
 * 이월과세 카드에는 취득일 칸이 없다. 빌더가 원시 `asset.acquisitionDate`("" 또는 매매 잔재)를 읽어
 *   · "" 이면 `Invalid date string` throw → Step4 경고 게이트(catch → false)·§155⑳ 카드 단서 범위(`provisoScope` → null)가 조용히 꺼졌고
 *   · 잔재면 엔진(④ 와이어 = 증여 등기접수일)과 다른 날짜로 판정했다.
 * 셀: R1 잔재 빔 · R2 잔재≠등기(뒤) · R3/R5 등기접수일 2016-06(경과규정 2017.8.3. 전) · R4 잔재 빔 · 등기 2016-06.
 * UI 렌더 단언은 `.ui.test.tsx`, 세액·isExempt 불변은 `__tests__/api/transfer.route.nh99-l24-…`.
 */
import { describe, it, expect, vi } from "vitest";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { householdFactsFormView } from "@/lib/calc/household-facts-view";
import { calcRentalResidenceFacts } from "@/lib/calc/rental-residence-form-facts";
import { primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes/transfer";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { carryoverResidenceForm } from "./_helpers/l24-carryover-residence-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const CELLS = [
  { n: "R1 잔재 빔 · 등기 2019-03-01", S: "", G: "2019-03-01", met: false },
  { n: "R2 잔재 2015 · 등기 2019-03-01", S: "2015-01-01", G: "2019-03-01", met: false },
  { n: "R3 잔재 2016-01 · 등기 2016-06-01", S: "2016-01-01", G: "2016-06-01", met: true },
  { n: "R4 잔재 빔 · 등기 2016-06-01", S: "", G: "2016-06-01", met: true },
  { n: "R5 잔재 2019-03 · 등기 2016-06-01", S: "2019-03-01", G: "2016-06-01", met: true },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const reqOf = (f: TransferFormData) => buildResidenceReqInput(householdFactsFormView(f));
async function wireAcquisitionDate(f: TransferFormData): Promise<unknown> {
  let body: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body만 필요하다 */ }
  vi.unstubAllGlobals();
  return body?.acquisitionDate;
}

describe("buildResidenceReqInput — 이월과세 취득일 = ④ 와이어 취득일(증여 등기접수일)", () => {
  for (const c of CELLS) {
    it(`🔑 ${c.n}: throw 없음 · 빌더 취득일 = 등기접수일 = ④ 와이어 · 거주요건 판정 ${c.met ? "충족/경과규정" : "미충족"}`, async () => {
      const f = carryoverResidenceForm(c.S, c.G);
      const req = reqOf(f); // 수정 전: R1·R4 는 Invalid date string throw, R2·R5 는 잔재 날짜
      expect(iso(req.acquisitionDate)).toBe(c.G);
      expect(await wireAcquisitionDate(f)).toBe(c.G);
      expect(meetsOneHouseResidenceRequirement(req, ONE_HOUSE_RESIDENCE)).toBe(c.met);
    });
  }
  it("등기접수일 빔(미완 입력) → 잔재로 채우지 않고 throw (Step4 catch → 경고 없음) · ⑧이 등기접수일 칸을 막는다", () => {
    for (const S of ["", "2019-03-01"]) {
      const f = carryoverResidenceForm(S, "");
      expect(() => reqOf(f)).toThrow(/Invalid date/);
      const issues = [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f));
      expect(issues.some((i) => i.field === "carryover.giftRegistryDate"), `S=${S}`).toBe(true);
    }
  });
  it("대조(불변) — 일반 매매 주택은 취득일을 그대로 읽는다 (빈 값이면 종전처럼 throw)", () => {
    expect(iso(reqOf(carryoverResidenceForm("2019-03-01", "", "purchase")).acquisitionDate)).toBe("2019-03-01");
    expect(() => reqOf(carryoverResidenceForm("", "", "purchase"))).toThrow(/Invalid date/);
  });
  it("일반건물 이월과세(leaf 예외: 원시 취득일 우선) — 빌더 취득일 = leaf 값", () => {
    const f = carryoverResidenceForm("2012-05-01", "2019-03-01", "carryover_gift", { assetKind: "general_building" });
    expect(primaryAcquisitionDateOf(f.assets[0])).toBe("2012-05-01");
    expect(iso(buildResidenceReqInput(f).acquisitionDate)).toBe("2012-05-01");
  });
});

describe("3번 측정 — §155⑳ 카드 단서 범위(`provisoScope`)가 같은 빌더를 쓴다 (수용 사유 · 사업인정 고시일 2021-01-01 · 수용일 2024-03-01)", () => {
  // 수용(§154①2호 가목)은 「사업인정 고시일 전에 취득」이어야 성립 — 취득일 = 증여 등기접수일.
  const withProviso = (S: string, G: string, cause: "carryover_gift" | "purchase" = "carryover_gift") =>
    carryoverResidenceForm(S, G, cause, {}, { provisoReason: "expropriation", provisoExpropriationDate: "2024-03-01", provisoBusinessApprovalDate: "2021-01-01" } as Partial<TransferFormData>);
  const scope = (f: TransferFormData) => calcRentalResidenceFacts(f, f.assets[0], 0).provisoScope;
  it("🔑 잔재 빔 · 등기 2019(고시일 전) → both (수정 전: throw → null)", () => expect(scope(withProviso("", "2019-03-01"))).toBe("both"));
  it("🔑 잔재 2022(고시일 뒤) · 등기 2019 → both (수정 전: 잔재로 null)", () => expect(scope(withProviso("2022-01-01", "2019-03-01"))).toBe("both"));
  it("🔑 잔재 2015(고시일 전) · 등기 2022(고시일 뒤) → null (수정 전: 잔재로 both)", () => expect(scope(withProviso("2015-01-01", "2022-06-01"))).toBeNull());
  it("등기접수일 빔 → null (모름 = 불성립)", () => expect(scope(withProviso("2015-01-01", ""))).toBeNull());
  it("대조(불변) — 매매 취득일 2019 → both · 2022 → null", () => {
    expect(scope(withProviso("2019-03-01", "", "purchase"))).toBe("both");
    expect(scope(withProviso("2022-06-01", "", "purchase"))).toBeNull();
  });
});
