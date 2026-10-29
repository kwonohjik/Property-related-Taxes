/**
 * 일반건물 상속·증여 파트의 추계 — ⑫ 방어선 (2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-share-mode-mix-and-inherited-estimate-guard.plan.md` S-2 (Q-2 a).
 * 폼 → ④ `callTransferTaxAPI` 본문(또는 직접 본문) → route POST · mock 세율.
 *
 * - 상속·증여 파트는 추계할 수 없다(소득세법 §97①1호 단서·같은 법 시행령 §163⑨). 화면은 ⑤·③·⑧이 막는데
 *   ⑫·엔진은 받아서 평가액 대신 환산으로 계산했다(1988 상속 301,110,000 → 310,092,558).
 * - 의제취득일 전 상속·증여(④가 파트 모드 `actual` + ①②③ 별도 필드), 상속이 아닌 파트의 환산은 그대로 계산된다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { GB_SAMPLES, T, asset, form } from "../components/_helpers/gb-bundled-blocks-fixtures";
import { LAND_INHERITED_ESTIMATION_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { GB_BUILDING_INHERITED_ESTIMATION_MESSAGE } from "@/lib/api/transfer-tax-schema-required-refines-gb";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const INH = GB_SAMPLES.INH[0][0];
const GIFT: Partial<AssetForm> = {
  ...INH, acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", donorAcquisitionDate: "1970-01-01",
  decedentAcquisitionDate: "", fixedAcquisitionPrice: "400000000", publishedValueAtInheritance: "", gbBuildingInheritedValue: "",
};

type Body = Record<string, unknown> & { generalBuildingValuation?: Record<string, unknown> };
async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  return { status: res.status, tax: json.data?.aggregated?.determinedTax as number | undefined, fieldErrors: (json.error?.fieldErrors ?? {}) as Record<string, string[]> };
}
const bodyOf = async (f: TransferFormData) => JSON.parse(JSON.stringify(await captureBody(f))) as Body;
const single = (price: number, ...over: Partial<AssetForm>[]) => form(price, [asset(1, ...over)]);

describe("S-2 — 상속·증여 파트 추계는 ⑫가 막는다", () => {
  it("🔴 분리 OFF 상속 + 옛 추계 플래그 → 400 토지·건물(종전 200 · 310,092,558) · ⑧도 막는다", async () => {
    const f = single(T, INH, { useEstimatedAcquisition: true });
    expect(allIssues(f).some((s) => s.includes("상속으로 취득한 토지는"))).toBe(true);
    const r = await post(await bodyOf(f));
    expect(r.status).toBe(400);
    expect(r.fieldErrors["generalBuildingValuation.landAcqMode"]).toEqual([LAND_INHERITED_ESTIMATION_MESSAGE]);
    expect(r.fieldErrors["generalBuildingValuation.buildingAcqMode"]).toEqual([GB_BUILDING_INHERITED_ESTIMATION_MESSAGE]);
  });

  it("분리 ON 상속 토지만 추계 → 토지만 400", async () => {
    const r = await post(await bodyOf(single(T, INH, { hasSeperateLandAcquisitionDate: true, landAcqMode: "estimated" })));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual(["generalBuildingValuation.landAcqMode"]);
  });

  it("분리 OFF 증여 + 옛 추계 플래그 → 400", async () => {
    const r = await post(await bodyOf(single(T, GIFT, { useEstimatedAcquisition: true })));
    expect(r.status).toBe(400);
    // 추계 금지(파트 모드) 두 키 + 고시 전 증여의 파트 신고가액 두 키(`gb-gift-off-sec164-unsplit.plan.md` — 분리 OFF 증여는 파트 가액 슬롯이 비어 있다)
    expect(Object.keys(r.fieldErrors).sort()).toEqual([
      "generalBuildingValuation.buildingAcqMode",
      "generalBuildingValuation.buildingAcquisitionPrice",
      "generalBuildingValuation.landAcqMode",
      "generalBuildingValuation.landAcquisitionPrice",
    ]);
  });

  it("직접 본문 — 파트 모드 없이 환산 경로(actualPriceMode 없음) + 토지 상속 → 엔진 기본값(환산)으로 보고 400", async () => {
    const b = await bodyOf(single(T, INH));
    const v = b.generalBuildingValuation!;
    delete v.actualPriceMode;
    delete v.landAcqMode;
    v.buildingAcqMode = "actual";
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual(["generalBuildingValuation.landAcqMode"]);
  });

  it("직접 본문 — 상속 건물을 감정가액·매매사례가액으로 보내도 400(환산만이 아니다)", async () => {
    for (const mode of ["appraisal", "salesCase"]) {
      const b = await bodyOf(single(T, INH));
      delete b.generalBuildingValuation!.actualPriceMode; // 환산 경로 — 실가 경로는 파트 모드를 읽지 않는다
      b.generalBuildingValuation!.buildingAcqMode = mode;
      const r = await post(b);
      expect(r.status, mode).toBe(400);
      // 매매사례가액은 기존 규칙(그 파트의 매매사례가액 필수 · I2)도 함께 걸린다 — 이 규칙의 경로·문구만 본다.
      expect(r.fieldErrors["generalBuildingValuation.buildingAcqMode"], mode).toEqual([GB_BUILDING_INHERITED_ESTIMATION_MESSAGE]);
    }
  });

  it("직접 본문 — 실가 경로(actualPriceMode)면 파트 모드가 없어도 실가로 보고 통과(정상 상속 301,110,000)", async () => {
    const b = await bodyOf(single(T, INH));
    delete b.generalBuildingValuation!.landAcqMode;
    delete b.generalBuildingValuation!.buildingAcqMode;
    const r = await post(b);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(301_110_000);
  });

  it("실가 경로(actualPriceMode)에 남은 파트 추계 모드는 엔진이 읽지 않는다 → 막지 않는다(부담부증여 B-2와 같은 축 · 세액 = 정상 상속)", async () => {
    const b = await bodyOf(single(T, INH));
    b.generalBuildingValuation!.landAcqMode = "estimated";
    b.generalBuildingValuation!.buildingAcqMode = "estimated";
    const r = await post(b);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(301_110_000);
  });

  it("지분 분할·함께 양도 본문도 같은 스키마를 거친다", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const frac = await post(await bodyOf(form(T, [asset(1, INH, half), asset(2, INH, half, { useEstimatedAcquisition: true })])));
    expect(frac.status).toBe(400);
    expect(Object.keys(frac.fieldErrors)).toContain("generalBuildingShares.1.valuation.landAcqMode");
    const companion = form(T + 300_000_000, [asset(1, GB_SAMPLES["S100-act"][0][0]), asset(2, INH, { useEstimatedAcquisition: true })], {
      assetSplitMode: "companion", bundledSaleMode: "actual",
    } as Partial<TransferFormData>);
    const bundled = await post(await bodyOf(companion));
    expect(bundled.status).toBe(400);
    expect(Object.keys(bundled.fieldErrors).some((k) => k.endsWith("generalBuildingValuation.landAcqMode"))).toBe(true);
  });
});

describe("S-2 — 정상 경로는 그대로", () => {
  const cases: Array<[string, TransferFormData, number]> = [
    ["상속 1988(실가)", single(T, INH), 301_110_000],
    ["의제취득일 전 상속 1980(①②③)", single(1_620_000_000, ...GB_SAMPLES.PRE[0]), 314_470_228],
    ["토지 상속 + 건물 매매 환산(C2)", single(T, INH, { hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", buildingAcqMode: "estimated", landAcqMode: "actual", acquisitionDate: "2010-05-01" }), 293_104_038],
  ];
  it.each(cases)("%s → 200 · 결정세액 불변", async (_n, f, tax) => {
    const r = await post(await bodyOf(f));
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(r.tax).toBe(tax);
  });
});

/**
 * 종전에는 위 「정상 경로」 목록에 있었으나 **⑧ 이 막는 입력**이다(「증여일이 기준시가 고시 전이라 토지·건물의 증여 신고가액을 파트별로 나누어 입력하세요」 ·
 * 「건물 증여 신고가액(취득가액)을 입력하세요」). 고정돼 있던 329,040,000 · 318,098,519 는 ④ 가 비어 있는 증여 파트 가액을 §164 가액만으로 메운 값이었고
 * (`gb-sec164-substitutes-blank-reported.plan.md` — `compareSec164`), 의제취득일 전 증여 1980(314,470,228)은 ③ 환산 경로가 낸 값이다.
 * 분리 OFF 증여 × 고시 전은 파트별 신고가액이 없어 §163⑨ 단서 비교(파트별 「신고가액과 §164 가액 중 많은 금액」)가 성립하지 않는다 —
 * ⑫ 도 막는다(`gb-gift-off-sec164-unsplit.plan.md` Q-1 a — `refineGbPropertyRequired`).
 */
describe("S-2 — ⑧ 이 막는 증여 입력은 ⑫ 도 400 (종전 「정상 경로」 목록에서 이동)", () => {
  const blocked: Array<[string, TransferFormData, string]> = [
    ["토지 매매 환산 + 건물 증여(건물 증여 가액 비움) — 종전 200 · 318,098,519", single(T, INH, { hasSeperateLandAcquisitionDate: true, acquisitionCause: "purchase", landAcquisitionDate: "2005-05-01", landAcqMode: "estimated", gbBuildingAcquisitionCause: "gift", buildingAcqMode: "actual", fixedAcquisitionPrice: "100000000" }), "건물 증여 신고가액"],
    ["증여(실가) · 분리 OFF · 고시 전 — 종전 200 · 329,040,000 → 315,810,000", single(T, GIFT), "파트별로 나누어 입력하세요"],
    ["의제취득일 전 증여 1980 · 분리 OFF — 종전 200 · 314,470,228", single(1_620_000_000, GIFT, { landAcquisitionDate: "1980-05-01", acquisitionDate: "1980-05-01" }), "파트별로 나누어 입력하세요"],
  ];
  it.each(blocked)("%s → ⑧ 차단 · ⑫ 400", async (_n, f, msg8) => {
    expect(allIssues(f).some((x) => x.includes(msg8))).toBe(true);
    expect((await post(await bodyOf(f))).status).toBe(400);
  });
});
