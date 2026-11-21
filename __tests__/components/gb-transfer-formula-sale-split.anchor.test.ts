/**
 * 결과뷰 리뷰 2026-11-21 R-c05-01 (MAJOR) — 일반건물 상세명세서 「자산별 양도가액」 산식(`buildGbTransferFormula`).
 *
 * 종전: 기준시가 합계가 있으면 판정을 보지 않고 「총액 × 기준시가 / 합계 = 양도가액」을 그렸다 — 구분 기재(§100③ 미발동)가 채택되면
 *   우변은 구분값인데 좌변은 안분식이라 거짓 등식이었다(925,000,000 × 920,550,000 / (920,550,000+20,629,440) = 900,000,000 · 좌변 실제 904,725,192).
 *   감정평가가액 비율로 안분한 경우도 기준시가 비율 식을 그렸다(좌변 904,725,192 ≠ 822,222,222).
 * 폼 → ④ → route(mock 세율) → 상세명세서 빌더(`buildStatementItems`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { GB_SAMPLES, T, asset, form, run, singleForm } from "./_helpers/gb-bundled-blocks-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

async function formulas(f: TransferFormData) {
  const r = await run(f);
  expect(r.status).toBe(200);
  const agg = r.aggregated;
  const items = buildStatementItems(aggregateToFilingResult(agg), f, f.assets[0], { properties: agg.properties, aggregated: agg }, undefined);
  const col = items.get("transferPrice")?.perAsset ?? [];
  return Object.fromEntries(agg.properties.map((p, i) => [p.propertyId, col[i]?.formula]));
}

const ADOPTED = `${TRANSFER.SPLIT_DECLARED_VALUE} · 안분가액과 30% 미만 차이 — ${TRANSFER.SPLIT_DEEMED_UNCLEAR}`;
const EST = GB_SAMPLES["S100-est"][0][0];
const SPLIT_1300_300 = { saleSplitMode: "actual", landTransferPrice: "1300000000", buildingTransferPrice: "300000000" } as Partial<AssetForm>;

describe("R-c05-01 — 구분 기재 채택이면 계약서 구분 기재 가액을 적는다", () => {
  it("환산 2-way(S100-est 900,000,000 / 25,000,000) — 안분식 아님", async () => {
    const r = await formulas(singleForm("S100-est"));
    expect(r.land).toBe(`계약서 구분 기재 토지 가액 = 900,000,000 (${ADOPTED})`);
    expect(r.building).toBe(`계약서 구분 기재 건물 가액 = 25,000,000 (${ADOPTED})`);
  });

  it("증축 3-way — 토지 구분값 · 건물 구분값을 본체·증축 양도시 기준시가 비율로(증축분 잔액)", async () => {
    const r = await formulas(form(T, [asset(1, ...GB_SAMPLES.EXT3[0], SPLIT_1300_300)]));
    expect(r.land).toBe(`계약서 구분 기재 토지 가액 = 1,300,000,000 (${ADOPTED})`);
    // floor(300,000,000 × 259,072,400 / 299,072,400) = 259,875,936
    expect(r.building1).toBe(
      `계약서 구분 기재 건물 가액 300,000,000 × 본체 양도시 기준시가 259,072,400 / (본체 259,072,400 + 증축 40,000,000) = 259,875,936 (${ADOPTED})`,
    );
    expect(r.building2).toBe(`계약서 구분 기재 건물 가액 300,000,000 - 건물(3001) 259,875,936 = 40,124,064 (잔액 보정 · ${ADOPTED})`);
  });

  it("축 B 지분 50%+50% — 지분 몫으로 적는다", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
    const BUY = GB_SAMPLES["S100-act"][0][0];
    const r = await formulas(form(T, [asset(1, BUY, half), asset(2, BUY, half)]));
    expect(r["land#0"]).toBe(`계약서 구분 기재 토지 가액(지분 몫) = 650,000,000 (${ADOPTED})`);
    expect(r["building#1"]).toBe(`계약서 구분 기재 건물 가액(지분 몫) = 150,000,000 (${ADOPTED})`);
  });
});

describe("R-c05-01 — 감정평가가액 비율 안분은 기준시가 식을 그리지 않는다", () => {
  const APPR = { landAppraisalAtTransfer: "800000000", buildingAppraisalAtTransfer: "100000000" } as Partial<AssetForm>;
  const VIA_APPRAISAL = (v: string) => `양도가액 총액을 양도 당시 감정평가가액 비율로 안분 = ${v} (${TRANSFER.BUNDLED_APPORTIONMENT})`;

  it("구분 기재 없음 · 감정 basis — 925,000,000 × 800/900 = 822,222,222", async () => {
    const r = await formulas(form(925_000_000, [asset(1, EST, APPR)]));
    expect(r.land).toBe(VIA_APPRAISAL("822,222,222"));
    expect(r.building).toBe(VIA_APPRAISAL("102,777,778"));
  });

  it("§100③ 발동 · 감정 basis — 같은 문구", async () => {
    const r = await formulas(form(925_000_000, [asset(1, EST, APPR, { saleSplitMode: "actual", landTransferPrice: "500000000", buildingTransferPrice: "425000000" } as Partial<AssetForm>)]));
    expect(r.land).toBe(VIA_APPRAISAL("822,222,222"));
  });
});

describe("(긍정 짝) 기준시가 안분은 종전 안분식 그대로", () => {
  it("§100③ 발동 · 기준시가 basis — 925,000,000 × 920,550,000 / (920,550,000+20,629,440) = 904,725,192", async () => {
    const r = await formulas(form(925_000_000, [asset(1, EST, { saleSplitMode: "actual", landTransferPrice: "500000000", buildingTransferPrice: "425000000" } as Partial<AssetForm>)]));
    expect(r.land).toBe("925,000,000 × 920,550,000 / (920,550,000+20,629,440) = 904,725,192");
  });
});
