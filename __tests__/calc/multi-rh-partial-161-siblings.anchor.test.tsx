/**
 * 다건(연간 합산) 결과 화면의 형제 표시층 — §155⑳ 부분과세 자산의 비과세 단계를 합산 신고서와 같은 단건 규약으로 적는다
 * (R-c06-04 · 사용자 결정 2026-11-22 a 「통일」을 같은 화면 전체에 적용).
 *
 * 시료: 강남 주택 15억(§155⑳ A · 12억 초과 부분과세) + 토지 3억을 다건 route로 각각 신고한다(`filing-aggregate-rh-partial-161-stage`의 일괄 시료와 같은 자산).
 * 종전(route 실측):
 *   ① 자산별 신고서 어댑터 — 비과세 양도차익 422,400,000 · 과세대상 777,600,000 · 양도소득금액 105,600,000 · 비과세 양도소득금액 0 (단건 isRH 분기를 안 탔다)
 *   ② 요약 카드 — 비과세 양도차익 −422,400,000 · 과세대상 977,600,000 · 양도소득금액 245,600,000
 *   ③ PDF 합산 표 — 비과세 양도차익 − 422,400,000 · 과세대상 977,600,000 · 통산 후 양도소득금액 245,600,000 / 자산별 과세대상 777,600,000 · 양도소득금액 105,600,000
 * 단건(같은 주택 단독): 비과세 양도차익 0 · 과세대상 1,200,000,000 · 양도소득금액 528,000,000 · 비과세 양도소득금액 422,400,000.
 * 표시 전용 — 총세액 79,681,800 · 과세표준 243,100,000 불변.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { TRANSFER_RENTAL_HOUSING } from "@/lib/tax-engine/legal-codes/transfer-rental-housing";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { runMulti } from "./_helpers/single-multi-route-parity";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { MultiTransferTaxSummaryCard } from "@/components/calc/results/MultiTransferTaxSummaryCard";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const a = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...a, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

const GANGNAM = "1168010100";
const ROW: HouseEntry = { id: "h2", region: "capital", regionCode: GANGNAM, acquisitionDate: "2012-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };
const RENTAL: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };
const EXPR = { type: "public_expropriation", expropriationCash: "1500000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2024-01-01" };

function houseForm(withExpropriation = false) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM, actualSalePrice: "1,500,000,000", addressJibun: "서울 강남구 역삼동 1" } as never;
  Object.assign(f, { transferDate: "2026-09-18", contractTotalPrice: "1500000000", bundledSaleMode: "actual", residencePeriodMonths: "0", householdHousingCount: "2", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: [RENTAL] });
  const a = f.assets[0] as unknown as Record<string, unknown> & { rentalHousingException: object };
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }] };
  if (withExpropriation) Object.assign(a, { reductions: [EXPR], transferCause: "public_expropriation", expropriationNoticeDate: "2024-01-01" });
  return f;
}
function landForm() {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...makeDefaultAsset(1), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000" } as never;
  Object.assign(f, { transferDate: "2026-09-18", contractTotalPrice: "300000000", householdHousingCount: "2", isOneHousehold: true });
  return f;
}

type Rows = { label: string; values: Record<string, unknown> }[];
const valueOf = (rows: Rows, label: string | RegExp) => rows.find((r) => (typeof label === "string" ? r.label === label : label.test(r.label)))?.values.total;
const STAGE_ROWS = ["전체 양도차익", "비과세 양도차익", "과세대상 양도차익", "장기보유특별공제", "양도소득금액", "감면후 소득금액"] as const;

async function multi(withExpropriation = false) {
  const m = await runMulti([houseForm(withExpropriation), landForm()]);
  expect(m.status).toBe(200);
  const a = m.json.data as unknown as AggregateTransferResult;
  return { a, house: a.properties[0] as PerPropertyBreakdown };
}

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const c of node) collect(c, out);
    return out;
  }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") {
    collect((el.type as (p: unknown) => unknown)(el.props), out);
    return out;
  }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
/** 라벨 바로 뒤 값 — 차감 행은 부호 문자열(`- `)이 따로 붙으므로 이어 읽는다. `from`부터 찾는다. */
function after(t: string[], label: string, from = 0): string | undefined {
  const i = t.indexOf(label, from);
  if (i < 0) return undefined;
  return t[i + 1] === "- " ? `- ${t[i + 2]}` : t[i + 1];
}

describe("① 자산별 신고서 어댑터 — §155⑳ 부분과세 자산은 단건 isRH 분기", () => {
  it("🔑 단건 신고서(같은 주택 단독)와 같은 값 — 비과세 양도차익 0 · 과세대상 1,200,000,000 · 양도소득금액 528,000,000 · 비과세 양도소득금액 422,400,000 (종전 422,400,000 · 777,600,000 · 105,600,000 · 0)", async () => {
    const { house } = await multi();
    expect(house.rentalHousingScenarioId).toBe("RH-A2");
    const hf = houseForm();
    const rows = buildRows(breakdownToFilingResult(house), "single", hf, hf.assets[0]) as Rows;
    expect(valueOf(rows, "비과세 양도차익")).toBe(0);
    expect(valueOf(rows, "과세대상 양도차익")).toBe(1_200_000_000);
    expect(valueOf(rows, "양도소득금액")).toBe(528_000_000);
    expect(valueOf(rows, /^비과세 양도소득금액/)).toBe(422_400_000);
    expect(valueOf(rows, "감면후 소득금액")).toBe(105_600_000);
    // 라벨도 단건 규칙 — 시나리오 A는 조문 없는 라벨
    expect(rows.some((r) => r.label === "비과세 양도소득금액")).toBe(true);

    const s = await runCalc(houseForm());
    expect(s.json.data.mode).toBe("single");
    const srows = buildRows(s.json.data.result, "single", hf, hf.assets[0]) as Rows;
    for (const label of STAGE_ROWS) expect(valueOf(rows, label), label).toBe(valueOf(srows, label));
    expect(valueOf(rows, /^비과세 양도소득금액/)).toBe(valueOf(srows, /^비과세 양도소득금액/));
  });

  it("짝 — 토지 자산은 종전 그대로(isRH 분기 밖)", async () => {
    const { a } = await multi();
    const land = a.properties[1];
    const lf = landForm();
    const rows = buildRows(breakdownToFilingResult(land), "single", lf, lf.assets[0]) as Rows;
    expect(valueOf(rows, "과세대상 양도차익")).toBe(200_000_000);
    expect(valueOf(rows, "양도소득금액")).toBe(140_000_000);
    expect(valueOf(rows, /^비과세 양도소득금액/)).toBe(0);
  });

  it("⑲ 세액감면대상금액 — §77 감면 시료에서 어댑터 ⑲ · 합산 명세서 · 단건 신고서가 모두 과세대상 양도소득금액 105,600,000(단건 종전 528,000,000 · 소득세법 §90①의 B)", async () => {
    const { a, house } = await multi(true);
    expect(house.reductionType).toBe("public_expropriation");
    const hf = houseForm(true);
    const rows = buildRows(breakdownToFilingResult(house), "single", hf, hf.assets[0]) as Rows;
    expect(valueOf(rows, "세액감면대상금액")).toBe(105_600_000);
    const items = buildStatementItems(aggregateToFilingResult(a) as never, hf, hf.assets[0], { properties: a.properties, aggregated: a }, undefined);
    expect(items.get("reductionTargetIncome")!.value).toBe(105_600_000);
    const s = await runCalc(houseForm(true));
    expect(valueOf(buildRows(s.json.data.result, "single", hf, hf.assets[0]) as Rows, "세액감면대상금액")).toBe(105_600_000);
    // 짝 — 같은 주택의 일반 고가주택 경로(특례 없음 · 1주택) 단건 ⑲와 같은 값
    const gf = houseForm(true);
    Object.assign(gf, { householdHousingCount: "1", houses: [] });
    (gf.assets[0] as unknown as { rentalHousingException: object }).rentalHousingException = { ...gf.assets[0].rentalHousingException, applyException: false };
    const g = await runCalc(gf);
    expect(g.json.data.result.rentalHousingExceptionDetail?.applied).not.toBe(true);
    expect(valueOf(buildRows(g.json.data.result, "single", gf, gf.assets[0]) as Rows, "세액감면대상금액")).toBe(105_600_000);
  });
});

/** 아코디언 상세 행 — 라벨 · 산식 · 값(표시 문자열) */
function accordionRows(b: PerPropertyBreakdown) {
  const { container } = render(<PropertyBreakdownAccordion breakdown={b} />);
  return Array.from(container.querySelectorAll("div.divide-y > div")).map((d) => {
    const ps = d.querySelectorAll("p");
    return { label: ps[0]?.textContent ?? "", formula: ps.length > 1 ? (ps[1]?.textContent ?? "") : "", legal: d.querySelector("p.text-micro")?.textContent ?? "", value: d.querySelector("span")?.textContent ?? "" };
  });
}

describe("①-2 자산 카드 아코디언 — 아래 자산별 신고서·PDF 자산별 표와 같은 단계", () => {
  it("🔑 주택 — 과세대상 행 없음 · 양도소득금액 1,200,000,000 − 672,000,000 = 528,000,000 · 그 아래 비과세 양도소득금액 −422,400,000 (종전 과세대상 777,600,000 · 양도소득금액 105,600,000)", async () => {
    const { house } = await multi();
    const rows = accordionRows(house);
    const labels = rows.map((r) => r.label);
    expect(labels.some((l) => l.startsWith("과세대상 양도차익") || /과세 양도차익 \(\d+억 초과분\)/.test(l))).toBe(false);
    const income = rows.find((r) => r.label === "양도소득금액")!;
    expect(income.value).toBe("528,000,000");
    expect(income.formula).toBe("1,200,000,000 - 672,000,000");
    const nt = rows.find((r) => r.label === "비과세 양도소득금액")!;
    expect(nt.value).toBe("-422,400,000");
    expect(nt.legal).toBe(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20);
    // 순서 — PDF 자산별 표와 같다: 장특 → 양도소득금액 → (차손 통산) → 비과세 양도소득금액 → 과세표준 기여분
    const order = ["양도차익", "장기보유특별공제", "양도소득금액", "비과세 양도소득금액", "기본공제 배분액", "과세표준 기여분"].map((l) => labels.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    // 행 검산 — 양도차익 − 장특 = 양도소득금액 · 양도소득금액 − 비과세 양도소득금액 = 통산 후 소득(과세표준 기여분 산식의 출발점)
    expect(1_200_000_000 - 672_000_000).toBe(528_000_000);
    expect(528_000_000 - 422_400_000).toBe(house.incomeAfterOffset);
    // 같은 카드 아래 자산별 신고서(단건 규약)와 같은 값
    const hf = houseForm();
    const frows = buildRows(breakdownToFilingResult(house), "single", hf, hf.assets[0]) as Rows;
    expect(Number(income.value.replace(/,/g, ""))).toBe(valueOf(frows, "양도소득금액"));
    expect(-Number(nt.value.replace(/,/g, ""))).toBe(valueOf(frows, /^비과세 양도소득금액/));
  });

  it("짝 — 토지 카드는 종전 그대로(과세대상 행 없음 · 양도소득금액 140,000,000 · 비과세 양도소득금액 행 없음)", async () => {
    const { a } = await multi();
    const rows = accordionRows(a.properties[1]);
    expect(rows.find((r) => r.label === "양도소득금액")!.value).toBe("140,000,000");
    expect(rows.find((r) => r.label === "양도소득금액")!.formula).toBe("200,000,000 - 60,000,000");
    expect(rows.some((r) => r.label.startsWith("비과세 양도소득금액"))).toBe(false);
    expect(rows.some((r) => r.label.startsWith("과세대상 양도차익"))).toBe(false);
  });
});

describe("② 요약 카드 — 합산 신고서 합계 열과 같은 leaf", () => {
  it("🔑 비과세·과세대상 행 없음(비과세 양도차익 0) · 양도소득금액 668,000,000 · 비과세 양도소득금액 −422,400,000 — 행 검산 1,400,000,000 − 732,000,000 − 422,400,000 − 2,500,000 = 243,100,000", async () => {
    const { a } = await multi();
    const { container } = render(<MultiTransferTaxSummaryCard result={a} properties={[]} taxYear={2026} />);
    const rows = Array.from(container.querySelectorAll("div.flex.justify-between")).map((d) => d.textContent?.replace(/\s+/g, "") ?? "");
    expect(rows).toContain("양도차익1,400,000,000");
    expect(rows.some((r) => r.startsWith("비과세양도차익"))).toBe(false);
    expect(rows.some((r) => r.startsWith("과세대상양도차익"))).toBe(false);
    expect(rows).toContain("장기보유특별공제-732,000,000");
    expect(rows).toContain("양도소득금액668,000,000");
    expect(rows).toContain("비과세양도소득금액-422,400,000");
    expect(rows).toContain("양도소득과세표준243,100,000");
    expect(1_400_000_000 - 732_000_000 - 422_400_000 - 2_500_000).toBe(a.taxBase);
  });
});

describe("③ PDF — 합산 표·자산별 표", () => {
  it("🔑 합산 표 — 총 양도차익 1,400,000,000 · 통산 후 양도소득금액 668,000,000 · 비과세 양도소득금액 − 422,400,000 · 감면후 245,600,000 (종전 비과세 양도차익 − 422,400,000 · 과세대상 977,600,000 · 245,600,000)", async () => {
    const { a } = await multi();
    const all = collect(TransferMultiSection({ r: a as unknown as Record<string, unknown> }));
    const t = all.slice(0, all.indexOf("자산별 신고서 양식")); // 합산 표만
    expect(after(t, "총 양도차익")).toBe("1,400,000,000");
    expect(t.indexOf("비과세 양도차익")).toBe(-1);
    expect(after(t, "통산 후 양도소득금액")).toBe("668,000,000");
    expect(after(t, "비과세 양도소득금액")).toBe("- 422,400,000");
    expect(after(t, "감면후 소득금액")).toBe("245,600,000");
    expect(after(t, "과세표준")).toBe("243,100,000");
  });

  it("🔑 자산별 표(주택) — 단건 PDF와 같은 단계: 과세대상 행 없음 · 양도소득금액 528,000,000 · 비과세 양도소득금액 − 422,400,000 · 감면후 105,600,000", async () => {
    const { a } = await multi();
    const t = collect(TransferMultiSection({ r: a as unknown as Record<string, unknown> }));
    const start = t.indexOf("자산별 신고서 양식");
    const landStart = t.indexOf("p2", start);
    const houseRows = t.slice(start, landStart);
    expect(houseRows).not.toContain("과세대상 양도차익");
    expect(after(houseRows, "양도소득금액")).toBe("528,000,000");
    expect(after(houseRows, "비과세 양도소득금액")).toBe("- 422,400,000");
    expect(after(houseRows, "감면후 소득금액")).toBe("105,600,000");
    // 토지는 종전 그대로
    expect(after(t, "양도소득금액", landStart)).toBe("140,000,000");
  });
});

describe("상세명세서 다건 쪽 — 감면후 산식 · 비과세 양도소득금액 근거", () => {
  it("🔑 감면후 소득금액 산식에 비과세 양도소득금액을 적는다(값 245,600,000 불변) · 근거는 단건과 같은 판정 조문(§155⑳ · §161 아님)", async () => {
    const { a } = await multi();
    const hf = houseForm();
    const items = buildStatementItems(aggregateToFilingResult(a) as never, hf, hf.assets[0], { properties: a.properties, aggregated: a }, undefined);
    expect(items.get("incomeAmountAfter")!.value).toBe(245_600_000);
    expect(items.get("incomeAmountAfter")!.formula).toBe("자산별 (양도소득금액 − 비과세 양도소득금액 − 소득금액 감면대상) 합계 = 245,600,000");
    expect(items.get("nontaxableIncome")!.legalBasis).toBe(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20);
  });

  it("세액 불변 — 총세액 79,681,800 · 과세표준 243,100,000", async () => {
    const { a } = await multi();
    expect(a.totalTax).toBe(79_681_800);
    expect(a.taxBase).toBe(243_100_000);
  });
});
