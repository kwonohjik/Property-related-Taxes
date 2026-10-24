/**
 * anchor — 공동주택 PHD × 처음 매겨진 가격이 국세청장 고시(영 §164⑥) — 계산 판정·⑧·④ (계획서 docs/00-pm/phd-fill-164-6-apartment.plan.md §9)
 *   B1 §164⑥·⑦ 산식이 같다 — 국세청 고시(1992)와 국토교통부 공시(2005)는 같은 입력이면 같은 값 (독립 BigInt 산식)
 *   B2 (Q-3 b) 최초 고시일이 1990.8.30. 전이어도 계산한다(입력 단가 그대로) — 거부 분기를 두지 않는다
 *   B3 (Q-4 b) §164⑤ 준용 확인 — 취득일·최초 고시일 중 하나라도 2000년 이전이면 확인 전에는 값을 만들지 않는다 · 경계 2000-12-31/2001-01-01
 *   B4 (Q-2 b) ⑧ 메시지 — 공동주택은 «공동주택가격(국세청장이 고시한 기준시가 포함)»·§164⑥·⑦, 단독은 종전 문장
 *   B5 ④ 본문 — 확인란(phdAssistBuildingStdBy164_5)은 전송되지 않는다
 */
import { describe, it, expect, vi } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { computeConvertedHousingPrice, phdAssistNeeds164_5 } from "@/lib/calc/phd-converted-housing-price";
import { validateCarryoverAsset } from "@/lib/calc/transfer-tax-validate-carryover-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { PHD_ELEVEN, PHD_TRANSFER_DATE, allPhdIssues, captureSingleBody, phdForm } from "./_phd-non-estimated-fixture";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", phdHousingType: "apartment", ...over }) as AssetForm;
/** 40㎡ · 최초 가격 8,000만 · 취득 합계 4,000만(50만×40+2,000만) · 최초 합계 5,300만(70만×40+2,500만) */
const SIX: Partial<AssetForm> = {
  phdFirstDisclosureHousingPrice: "80000000",
  acquisitionArea: "40",
  phdLandPricePerSqmAtAcq: "500000",
  phdBuildingStdPriceAtAcq: "20000000",
  phdLandPricePerSqmAtFirst: "700000",
  phdBuildingStdPriceAtFirst: "25000000",
};
const EXPECTED = Number((80_000_000n * 40_000_000n) / 53_000_000n); // 60,377,358 — 엔진 코드와 독립
const at = (acq: string, first: string, over: Partial<AssetForm> = {}) =>
  computeConvertedHousingPrice(asset({ ...SIX, acquisitionDate: acq, phdFirstDisclosureDate: first, ...over }), PHD_TRANSFER_DATE);

describe("B1 §164⑥·⑦ 같은 산식 — 값 회귀 방지", () => {
  it("국세청 고시(1991 취득 · 1992 최초 고시, 확인 후) = 국토교통부 공시(2003 · 2005) = 독립 산식 60,377,358", () => {
    const nts = at("1991-03-01", "1992-01-01", { phdAssistBuildingStdBy164_5: true });
    const molit = at("2003-03-01", "2005-04-30");
    expect(EXPECTED).toBe(60_377_358);
    expect(nts).toMatchObject({ ok: true, value: EXPECTED });
    expect(molit).toMatchObject({ ok: true, value: EXPECTED });
  });
});

describe("B2 최초 고시일 1990.8.30. 전 — 현행대로 계산 (Q-3 b)", () => {
  it.each(["1988-01-01", "1990-08-29", "1990-08-30"])("1987 취득 · 최초 고시 %s → 입력 단가로 계산(확인 후)", (first) => {
    expect(at("1987-03-01", first, { phdAssistBuildingStdBy164_5: true })).toMatchObject({ ok: true, value: EXPECTED });
  });
});

describe("B3 §164⑤ 준용 확인 (Q-4 b)", () => {
  it.each([
    ["취득·최초 고시 모두 2000년 이전", "1991-03-01", "1992-01-01", true],
    ["취득만 2000년 이전 (2000-12-31)", "2000-12-31", "2005-04-30", true],
    ["의제취득일 전 취득(1980) · 1986 최초 고시", "1980-03-01", "1986-01-01", true],
    ["최초 고시일만 보아도 판정한다(취득일 미입력 · 1999 최초 고시)", "", "1999-01-01", true],
    ["둘 다 2001년 이후 (2001-01-01 경계)", "2001-01-01", "2005-04-30", false],
  ])("%s → 필요=%s", (_n, acq, first, need) => {
    expect(phdAssistNeeds164_5({ acquisitionDate: acq, phdFirstDisclosureDate: first })).toBe(need);
  });
  it("필요한데 확인하지 않았으면 값을 만들지 않는다(blocked) · 확인하면 계산한다", () => {
    expect(at("1991-03-01", "1992-01-01")).toEqual({ ok: false, missing: [], blocked: "needs_164_5_confirm" });
    expect(at("2000-12-31", "2005-04-30")).toEqual({ ok: false, missing: [], blocked: "needs_164_5_confirm" });
    expect(at("2000-12-31", "2005-04-30", { phdAssistBuildingStdBy164_5: true }).ok).toBe(true);
  });
  it("2001년 이후만 있으면 확인 없이 계산한다(2001-01-01 경계)", () => {
    expect(at("2001-01-01", "2005-04-30")).toMatchObject({ ok: true, value: EXPECTED });
  });
  it("적용 불가(취득일 ≥ 최초 고시일)가 확인 요구보다 먼저다 — 확인해도 계산할 수 없는 경우를 확인하라고 하지 않는다", () => {
    expect(at("1995-03-01", "1992-01-01")).toEqual({ ok: false, missing: [], blocked: "not_eligible" });
  });
  it("칸이 모자라면 확인 요구보다 칸을 먼저 지목한다", () => {
    const r = computeConvertedHousingPrice(asset({ acquisitionDate: "1991-03-01", phdFirstDisclosureDate: "1992-01-01" }), PHD_TRANSFER_DATE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.blocked).toBeUndefined();
      expect(r.missing.length).toBeGreaterThan(0);
    }
  });
});

describe("B4 ⑧ 메시지 (Q-2 b)", () => {
  const LATE = { useEstimatedAcquisition: true, usePreHousingDisclosure: true, ...PHD_ELEVEN, acquisitionDate: "2010-01-01" };
  const msg = (over: Partial<AssetForm>) =>
    allPhdIssues(phdForm({ ...LATE, ...over })).find((i) => i.field === "phdFirstDisclosureDate")?.message ?? "";
  it("환산 · 공동주택 — 적용 불가 사유가 공동주택가격(국세청 고시 포함)·§164⑥·⑦", () => {
    const m = msg({ phdHousingType: "apartment" });
    expect(m).toContain("취득 당시 공동주택가격(국세청장이 고시한 기준시가 포함)이 고시되어 있으므로 3-시점 환산(§164⑥·⑦) 대상이 아닙니다");
  });
  it("환산 · 단독·다가구 — 종전 문장 그대로", () => {
    const m = msg({ phdHousingType: "individual" });
    expect(m).toContain("취득 당시 주택공시가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다");
    expect(m).not.toContain("§164⑥");
  });
  it("환산 · 괄호 단서(§164⑧ 준용) — 공동주택은 §164⑥·⑦ 산식 괄호 단서", () => {
    // 취득·최초 고시 합계를 같게(토지 같은 단가 · 건물 같은 값) — 취득연도 다음 연도 말 이전 최초 고시
    const same = { acquisitionDate: "2004-06-01", phdLandPricePerSqmAtFirst: "1000000", phdBuildingStdPriceAtFirst: "60000000" };
    const all = (over: Partial<AssetForm>) => allPhdIssues(phdForm({ ...LATE, ...same, ...over })).map((i) => i.message).join("\n");
    expect(all({ phdHousingType: "apartment" })).toContain("§164⑥·⑦ 산식 괄호 단서에 따라 §164⑧을 준용해야 하는데");
    expect(all({ phdHousingType: "apartment" })).toContain("3-시점 환산(§164⑥·⑦)을 끄고");
    expect(all({ phdHousingType: "individual" })).toContain("§164⑦ 산식 괄호 단서에 따라 §164⑧을 준용해야 하는데");
  });
  it("이월과세 APD(공동주택 최초고시 전) — §164⑥·⑦ · PHD(개별) — 라디오가 단독이면 §164⑦", () => {
    const co = (mode: "phd" | "apd", over: Partial<AssetForm> = {}) =>
      String(
        validateCarryoverAsset(
          asset({
            acquisitionCause: "carryover_gift",
            acquisitionDate: "2020-01-01",
            phdFirstDisclosureDate: "2005-04-30",
            phdHousingType: "individual",
            carryover: {
              giftRegistryDate: "2020-01-01",
              donorAcquisitionDate: "2010-01-01",
              donorRelation: "spouse",
              giftDateValuation: "300000000",
              useEstimatedAcquisition: true,
              estimationMode: mode,
            } as AssetForm["carryover"],
            ...over,
          }),
          "자산1",
          PHD_TRANSFER_DATE,
          { isNonPrimaryAsset: false },
        ),
      );
    expect(co("apd")).toContain("취득 당시 공동주택가격(국세청장이 고시한 기준시가 포함)이 고시되어 있으므로 3-시점 환산(§164⑥·⑦) 대상이 아닙니다");
    expect(co("phd")).toContain("취득 당시 주택공시가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다");
    expect(co("phd", { phdHousingType: "apartment" })).toContain("3-시점 환산(§164⑥·⑦) 대상이 아닙니다");
  });
});

describe("B5 ④ 본문 — 확인란은 전송되지 않는다", () => {
  it("감정 + 보조 입력 + 확인란 true/false → 본문 바이트 동일", async () => {
    const base = { isAppraisalAcquisition: true, ...SIX, acquisitionDate: "1991-03-01", phdFirstDisclosureDate: "1992-01-01", standardPriceAtAcq: "60377358" };
    const on = await captureSingleBody(phdForm({ ...base, phdAssistBuildingStdBy164_5: true }));
    const off = await captureSingleBody(phdForm({ ...base, phdAssistBuildingStdBy164_5: false }));
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    expect(JSON.stringify(on)).not.toContain("phdAssistBuildingStdBy164_5");
  });
});
