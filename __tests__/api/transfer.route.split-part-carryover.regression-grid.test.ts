/**
 * 주택 split 파트 이월과세(P1) — **파트 서브객체가 없는 기존 입력은 하나도 바뀌지 않는다** 회귀 격자 (2026-10-19)
 *
 * P1 규칙(leaf S0~S9·Y8 확장·⑫ refine·multi 거부)은 «파트 이월과세 입력»을 위한 것이다. 서브객체(`landCarryoverPart`·`buildingCarryoverPart`·
 * `carryoverGiftEvent`)가 없는 입력은 P1 전과 **상태·세액이 같아야** 한다(종전 200 ⇒ 200 · 세액 동일 / 종전 400 ⇒ 400).
 * 첫 구현의 S3가 «자산 단위 이월과세 + 소유자 분리»(종전 200)를 400으로 막아 이 계약을 깼다(H-5 `carryover-validate-parity` 회귀).
 *
 * 기준값(`fixtures/split-part-carryover-prep1-grid.json`)은 **P1 이전 master(f499f987e)에서 같은 격자를 돌려 얻은 것**이다 — 해결자가 낸 값이 아니다.
 * 재생성: 이 파일을 P1 이전 체크아웃에서 `GRID_OUT=<path> npx vitest run <이 파일>`로 실행한다 (mock 세율 — 같은 시드끼리만 의미가 있다).
 *
 * 격자 G1: 자산 단위 이월과세(실가·기준시가 환산·PHD 환산) × selfOwns{생략·both·building_only·land_only} × 토지 취득일{없음·건물일과 같은 날·다른 날}
 *          × 토지 원인{생략·purchase·carryover_gift} × 호스트{주 자산·컴패니언}
 * 격자 G2: 일반 호스트 × 건물 원인{매매·신축·증여·상속} × 토지 원인{5종} × 토지 취득일{3} × 1세대1주택{예·아니오} × 필요경비 총액{0·>0} × 호스트 × selfOwns{생략·building_only}
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GIFT = "2023-03-01";
const SPLIT_STD = {
  standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 100, standardPriceAtAcquisition: 300_000_000, buildingStandardPriceAtAcquisition: 100_000_000,
  landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
};
const SPLIT_BASE = {
  propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 1_200_000_000, transferDate: "2025-06-30", expenses: 0,
  isOneHousehold: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
  residencePeriodMonths: 0, annualBasicDeductionUsed: 0, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
  landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000,
  ...SPLIT_STD,
} as Record<string, unknown>;
const PHD = {
  firstDisclosureDate: "2005-04-30", firstDisclosureHousingPrice: 400_000_000, landArea: 100, landPricePerSqmAtAcquisition: 1_000_000,
  buildingStdPriceAtAcquisition: 100_000_000, landPricePerSqmAtFirstDisclosure: 1_200_000, buildingStdPriceAtFirstDisclosure: 110_000_000,
  transferHousingPrice: 900_000_000, landPricePerSqmAtTransfer: 2_000_000, buildingStdPriceAtTransfer: 150_000_000,
};
const CT = (over: Record<string, unknown> = {}) => ({
  giftRegistryDate: GIFT, donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 100_000_000, useEstimatedAcquisition: false,
  giftTaxAmount: 30_000_000, giftDateValuation: 900_000_000, donorRelation: "lineal", exclusionDeclared: {}, ...over,
});

type Case = { id: string; body: Record<string, unknown> };

/** 주 자산 호스트 → 단건 body / 컴패니언 호스트 → 컴패니언으로 같은 필드를 옮긴 body */
function host(kind: "primary" | "companion", fields: Record<string, unknown>): Record<string, unknown> {
  if (kind === "primary") return { ...SPLIT_BASE, ...fields };
  const f = { ...SPLIT_BASE, ...fields };
  return {
    propertyType: "land", transferDate: "2025-06-30", transferPrice: 600_000_000, acquisitionDate: "2010-01-01", acquisitionPrice: 200_000_000, expenses: 0,
    useEstimatedAcquisition: false, householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
    standardPriceAtTransferForApportion: 400_000_000, totalSalePrice: 1_800_000_000,
    companionAssets: [
      {
        assetId: "c1", assetLabel: "주택", assetKind: "housing", standardPriceAtTransferForApportion: 1_200_000_000, standardPriceAtTransfer: 1_200_000_000,
        directExpenses: (f.expenses as number) ?? 0, reductions: [], fixedAcquisitionPrice: 400_000_000,
        ...Object.fromEntries(Object.entries(f).filter(([k]) => !["propertyType", "transferPrice", "transferDate", "expenses", "householdHousingCount", "isRegulatedArea", "wasRegulatedAtAcquisition", "isUnregistered", "isNonBusinessLand", "annualBasicDeductionUsed", "residencePeriodMonths", "useEstimatedAcquisition", "acquisitionPrice"].includes(k))),
      },
    ],
  };
}

function buildGrid(): Case[] {
  const cases: Case[] = [];
  // ── G1 자산 단위 이월과세
  const variants: Record<string, Record<string, unknown>> = {
    actual: { carryoverTaxation: CT() },
    est: { carryoverTaxation: CT({ useEstimatedAcquisition: true, donorAcquisitionPrice: undefined, donorStandardPriceAtAcquisition: 200_000_000 }), useEstimatedAcquisition: true, standardPriceAtTransfer: 900_000_000 },
    phd: { carryoverTaxation: CT({ useEstimatedAcquisition: true, donorAcquisitionPrice: undefined }), useEstimatedAcquisition: true, preHousingDisclosure: PHD },
  };
  for (const [vk, v] of Object.entries(variants))
    for (const selfOwns of [undefined, "both", "building_only", "land_only"])
      for (const landDate of ["none", "same", "diff"] as const)
        for (const landCause of [undefined, "purchase", "carryover_gift"])
          for (const hostKind of ["primary", "companion"] as const) {
            const fields: Record<string, unknown> = {
              acquisitionCause: "carryover_gift", acquisitionDate: GIFT, acquisitionPrice: 900_000_000, ...v,
              ...(selfOwns ? { selfOwns } : {}),
              ...(landDate === "same" ? { landAcquisitionDate: GIFT } : landDate === "diff" ? { landAcquisitionDate: "1995-03-01" } : {}),
              ...(landCause ? { landAcquisitionCause: landCause } : {}),
            };
            if (landDate !== "none") fields.isSeparateAcquisition = landDate === "diff";
            cases.push({ id: `G1|${vk}|${selfOwns ?? "-"}|${landDate}|${landCause ?? "-"}|${hostKind}`, body: host(hostKind, fields) });
          }
  // ── G2 일반 호스트 × 새 규칙(S0·S1·S2′·S9·Y8 확장·S8)이 걸릴 수 있는 입력
  const buildingCauses: [string, Record<string, unknown>][] = [
    ["purchase", { acquisitionCause: "purchase", acquisitionDate: "2021-03-01" }],
    ["newConstruction", { acquisitionCause: "newConstruction", acquisitionDate: "2021-03-01" }],
    ["gift", { acquisitionCause: "gift", acquisitionDate: GIFT }],
    ["inheritance", { acquisitionCause: "inheritance", acquisitionDate: GIFT, decedentAcquisitionDate: "2000-01-01" }],
  ];
  const landCauses: [string, Record<string, unknown>][] = [
    ["-", {}], ["purchase", { landAcquisitionCause: "purchase" }], ["inheritance", { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1990-01-01" }],
    ["gift", { landAcquisitionCause: "gift" }], ["carryover_gift", { landAcquisitionCause: "carryover_gift" }],
  ];
  for (const [bk, b] of buildingCauses)
    for (const [lk, l] of landCauses)
      for (const landDate of ["none", "same", "diff"] as const)
        for (const oneHouse of [false, true])
          for (const exp of [0, 5_000_000])
            for (const hostKind of ["primary", "companion"] as const)
             for (const selfOwns of [undefined, "building_only"]) {
              const buildingDate = b.acquisitionDate as string;
              const fields: Record<string, unknown> = {
                ...b, ...l, ...(selfOwns ? { selfOwns } : {}), isOneHousehold: oneHouse, householdHousingCount: oneHouse ? 1 : 2, expenses: exp,
                ...(landDate === "same" ? { landAcquisitionDate: buildingDate } : landDate === "diff" ? { landAcquisitionDate: "2008-01-01" } : {}),
              };
              if (landDate !== "none") fields.isSeparateAcquisition = landDate === "diff";
              cases.push({ id: `G2|${bk}|${lk}|${landDate}|${oneHouse ? "1h" : "-"}|${exp ? "exp" : "-"}|${hostKind}|${selfOwns ?? "-"}`, body: host(hostKind, fields) });
            }
  return cases;
}

type Row = [number, number | null];
async function run(c: Case): Promise<Row> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c.body) }),
  );
  const json = await res.json();
  const tax = json?.data?.result?.determinedTax ?? json?.data?.aggregated?.determinedTax ?? null;
  return [res.status, tax];
}

const FIXTURE = "__tests__/api/fixtures/split-part-carryover-prep1-grid.json";

describe("파트 서브객체 없는 기존 입력 회귀 격자 (P1 전 master 대조)", () => {
  it("격자 규모", () => {
    expect(buildGrid().length).toBe(216 + 4 * 5 * 3 * 2 * 2 * 2 * 2);
  });

  it("종전 200 ⇒ P1 200(세액 동일) · 종전 400 ⇒ P1 400", async () => {
    const grid = buildGrid();
    const got: Record<string, Row> = {};
    for (const c of grid) got[c.id] = await run(c);
    if (process.env.GRID_OUT) {
      writeFileSync(process.env.GRID_OUT, JSON.stringify(got));
      return;
    }
    const base = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, Row>;
    const diffs: string[] = [];
    for (const c of grid) {
      const [bs, bt] = base[c.id];
      const [ps, pt] = got[c.id];
      if (bs === 200 ? !(ps === 200 && pt === bt) : ps !== bs) diffs.push(`${c.id}: 종전 ${bs}/${bt} → P1 ${ps}/${pt}`);
    }
    expect(diffs).toEqual([]);
    // 격자의 구별력 — 종전 200·400이 모두 충분히 있어야 «같다»가 의미가 있다
    const statuses = Object.values(base).map((r) => r[0]);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThan(100);
    expect(statuses.filter((s) => s === 400).length).toBeGreaterThan(100);
  }, 600_000);
});
