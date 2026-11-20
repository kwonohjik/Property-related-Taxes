/**
 * PR-19 anchor (2026-11 리뷰 D-63 · D-66 · D-67) — 양도 대상을 조합원입주권으로 바꾼 뒤 ②가 숨긴 주택 전용 사실이 화면·④·핸드오프에 새지 않는다.
 * D-66 근거: 국세청 서면-2015-부동산-1685(§155② 상속주택 특례는 일반주택 양도에만 — 입주권 양도는 적용대상 아님) · 법규과-599(2006 — 농어촌 상속주택 동일).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { buildCaseForm } from "./one-house-rulings/harness";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { handoff } from "./_one-house-pr6a-routes";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { makeHouse } from "./one-house-rulings/harness";

afterEach(cleanup);

const GANGNAM = "1168010100";
const RIGHT = { assetKind: "right_to_move_in", redevSubject: "right", redevExemptionEligibleAtApproval: "yes", redevApprovalDate: "2021-05-01" };
const HOUSE = { assetKind: "housing", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "30" };
const form = (kind: Record<string, unknown>, asset: Record<string, unknown>, houses: Record<string, unknown>[] = []) =>
  buildCaseForm(mkCase("2025-05-01", {
    isOneHousehold: true, transferDate: "2025-05-30", contractTotalPrice: "500000000",
    asset: { acquisitionDate: "2018-01-01", regionCode: GANGNAM, addressJibun: "서울특별시 강남구 역삼동 1", ...kind, ...asset }, houses,
  }));

describe("D-63 핸드오프 — 입주권 양도면 숨은 증여 원인·증여 칸을 넘기지 않는다", () => {
  const GIFT = { acquisitionCause: "gift", donorAcquisitionDate: "2005-01-01", giftDonorRelation: "lineal", giftSameHousehold: "yes" };
  it("입주권 → purchase · 증여 칸 비움", () => {
    const a = handoff(form(RIGHT, GIFT)).assets[0];
    expect(a.acquisitionCause).toBe("purchase");
    expect(a.donorAcquisitionDate).toBe("");
    expect(a.giftDonorRelation).toBe("");
  });
  it("대조 — 주택 양도면 증여 사실을 그대로 넘긴다", () => {
    const a = handoff(form(HOUSE, GIFT)).assets[0];
    expect(a.acquisitionCause).not.toBe("purchase");
    expect(a.donorAcquisitionDate).toBe("2005-01-01");
  });
});

describe("D-67 ④ 취득 당시 조정대상지역 — 입주권 양도면 숨은 동일세대 상속 개시일을 기준일로 쓰지 않는다", () => {
  const INH = { acquisitionCause: "inheritance", decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "2010-01-01", decedentAcquisitionDate: "2010-01-01" };
  const was = (f: ReturnType<typeof form>) => (buildOneHouseExemptionApiBody(f) as { wasRegulatedAtAcquisition: boolean }).wasRegulatedAtAcquisition;
  it("상속 잔존값이 있어도 원인 없는 입주권과 같은 값(강남 2018 취득 = 지정 중)", () => {
    expect(was(form(RIGHT, {}))).toBe(true);
    expect(was(form(RIGHT, INH))).toBe(true);
  });
  it("대조 — 주택 양도면 동일세대 보유 개시일(2010 — 지정 전)이 기준일", () => {
    expect(was(form(HOUSE, INH))).toBe(false);
  });
});

describe("D-66 입주권 양도 — 명부 행 §155 특례 사실을 묻지도 싣지도 않는다", () => {
  const UOC_ROW = [{ id: "h1", acquisitionDate: "2016-01-01", region: "non_capital", oneHouseUnavoidableOutsideCapital: true }];
  it("⑧ 0건 · ④ 행 echo·세대 사실 없음 · route 200", async () => {
    const f = form(RIGHT, {}, UOC_ROW);
    expect(validateAllSteps(f).filter((e) => e.severity === "error" && e.field.startsWith("houses.0."))).toEqual([]);
    const body = buildOneHouseExemptionApiBody(f) as { houses?: Record<string, unknown>[]; unavoidableOutsideCapitalHouse?: unknown };
    expect(body.unavoidableOutsideCapitalHouse).toBeUndefined();
    expect(body.houses?.find((h) => h.id === "h1")?.isUnavoidableOutsideCapital).toBeUndefined();
    const surchargeRows = (buildMultiHouseSurchargeApiBody(f).property as { houses?: Record<string, unknown>[] }).houses;
    expect(surchargeRows?.find((h) => h.id === "h1")?.isUnavoidableOutsideCapital).toBeUndefined();
    const o = await observeRaw(mkCase("2025-05-01", {
      isOneHousehold: true, transferDate: "2025-05-30", contractTotalPrice: "500000000",
      asset: { acquisitionDate: "2018-01-01", regionCode: GANGNAM, ...RIGHT }, houses: UOC_ROW,
    }));
    expect(o.status, JSON.stringify(o.json).slice(0, 300)).toBe(200);
  });
  it("대조 — 주택 양도면 ⑧이 §155⑧ 해소 여부를 묻는다", () => {
    const f = form(HOUSE, {}, UOC_ROW);
    expect(validateAllSteps(f).some((e) => e.severity === "error" && e.field.startsWith("houses.0."))).toBe(true);
  });
  it("⑤ 편집기 — 닫으면 §155 카드 대신 안내", () => {
    const h = makeHouse("h1", { acquisitionDate: "2016-01-01" });
    const closed = render(<HouseEntryEditor house={h} onUpdate={() => {}} oneHouseFactsEnabled={false} />);
    expect(closed.container.querySelector('[data-testid="house-row-one-house-facts-right-sale-note"]')).not.toBeNull();
    expect(closed.container.querySelector('[data-testid="house-row-cultural-heritage"]')).toBeNull();
    cleanup();
    const open = render(<HouseEntryEditor house={h} onUpdate={() => {}} />);
    expect(open.container.querySelector('[data-testid="house-row-cultural-heritage"]')).not.toBeNull();
  });
});
