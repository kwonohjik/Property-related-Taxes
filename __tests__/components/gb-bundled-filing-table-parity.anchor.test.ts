/**
 * anchor: 일반건물 일괄의 **신고서 양식 표가 「자산별 양도차익 표」를 대체한다**
 * (결과탭 코드리뷰 Lane 5 — #066 잔여).
 *
 * ## 왜 이 anchor가 있나 — 「배선하지 않기로 한 결정」의 근거다
 *
 * `GeneralBuildingValuationDetailCard`는 어떤 입력으로도 렌더되지 않던 컴포넌트다(참조 0건).
 * 그 카드가 가진 5개 섹션 중 ①②③은 일괄 뷰가 인라인으로 재구현해 뒀고, 남은
 * ④「자산별 양도차익·장특공제·양도소득금액」과 ⑤「§102② 결손금 1차 통산」이 미배선이었다.
 *
 * 실측해 보니 **④·⑤가 보여줄 값은 일괄 신고서 양식 표에 전부 있다** — 토지·건물 열로.
 * 그래서 배선하면 같은 숫자를 두 표로 보여줄 뿐이고, 카드가 요구하는 prop 8개를 집계
 * 결과에서 새로 도출해야 해 **오표시를 새로 만들 위험만 진다**. ⇒ 배선하지 않는다.
 *
 * ⛔ 이 anchor가 깨지면(= 신고서 표가 그 값을 더는 안 보여주면) 그때 카드를 되살릴 근거가
 *   생긴다. 그 전에는 「카드가 있으니 배선하자」가 중복을 만든다.
 *
 * 법령: 소득세법 §95①(양도차익·장특공제) · §102②(결손금 통산) · 시행령 §167의2
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

/** 토지는 오르고 건물은 감가하는 일반건물 실가 일괄 (양도 10억). */
const BASE = {
  totalTransferPrice: 1_000_000_000,
  transferDate: new Date("2026-03-01"),
  acquisitionDate: new Date("2015-03-01"),
  landArea: 200,
  buildingFootprintArea: 100,
  transferLandPricePerSqm: 3_000_000, // × 200 = 600,000,000
  transferBuildingStdPrice: 200_000_000,
  acquisitionLandPricePerSqm: 1_000_000, // × 200 = 200,000,000
  acquisitionBuildingStdPrice: 200_000_000,
  zoneType: "commercial",
  isMetropolitan: false,
  isUnregistered: false,
  actualAcquisitionPrice: 400_000_000,
  actualExpenses: 0,
};

function run(over: Record<string, unknown> = {}) {
  return calculateGeneralBuildingActualTransfer(
    { ...BASE, ...over } as never,
    2026,
    undefined,
    [],
    rates,
  );
}

type Row = { label: string; values: Record<string, number | string | null>; notes?: Record<string, string> };

function rowsOf(over: Record<string, unknown> = {}) {
  const agg = run(over).aggregated as never as {
    properties: unknown[];
  };
  const rows = buildAggregateRows(
    aggregateToFilingResult(agg as never),
    { properties: agg.properties, aggregated: agg } as never,
    createDefaultTransferFormData(),
  ) as never as Row[];
  return (label: string) => {
    const r = rows.find((x) => x.label === label);
    expect(r, `신고서 표에 「${label}」 행이 없다`).toBeDefined();
    return r!;
  };
}

/** 카드 ④가 보여주던 6행 ↔ 신고서 표의 대응 행. */
const CARD_ROW_TO_FILING: [string, string][] = [
  ["양도가액", "양도가액"],
  ["환산취득가", "취득가액"],
  ["기타필요경비(개산공제)", "필요경비"],
  ["양도차익", "전체 양도차익"],
  ["장기보유특별공제", "장기보유특별공제"],
  ["양도소득금액 (통산 전)", "양도소득금액"],
];

// ── G-0 구별력 ──────────────────────────────────────────────────────
describe("G-0 격자 — 일괄이 토지·건물 두 열을 실제로 만든다", () => {
  it("두 열이 있고 값이 서로 다르다 (한 열뿐이면 대체 주장이 성립하지 않는다)", () => {
    const n = rowsOf();
    const v = n("양도가액").values;
    expect(Object.keys(v)).toEqual(expect.arrayContaining(["land", "building", "total"]));
    expect(v["land"]).not.toBe(v["building"]);
  });
});

// ── G-1 ④ 대체 ─────────────────────────────────────────────────────
describe("G-1 신고서 표가 카드 ④의 6행을 토지·건물 열로 보여준다 (#066)", () => {
  it.each(CARD_ROW_TO_FILING)("④ 「%s」 → 신고서 「%s」", (_cardRow, filingRow) => {
    const v = rowsOf()(filingRow).values;
    for (const col of ["land", "building", "total"]) {
      expect(typeof v[col], `${filingRow} / ${col} 열이 숫자가 아니다`).toBe("number");
    }
  });

  it("합계가 두 열의 합이다 (표가 자기 안에서 검산된다)", () => {
    const n = rowsOf();
    for (const label of ["양도가액", "전체 양도차익", "장기보유특별공제"]) {
      const v = n(label).values;
      expect(Number(v["land"]) + Number(v["building"]), label).toBe(Number(v["total"]));
    }
  });
});

// ── G-2 ⑤ 대체 ─────────────────────────────────────────────────────
describe("G-2 신고서 표가 카드 ⑤(§102② 통산)를 설명한다 (#066)", () => {
  /** 건물 취득가를 크게 잡아 건물 차손을 만든다. */
  const LOSS = { actualAcquisitionPrice: 900_000_000, acquisitionBuildingStdPrice: 800_000_000 };

  it("격자 — 건물이 실제로 차손이고 토지가 그것을 흡수한다", () => {
    const n = rowsOf(LOSS);
    expect(Number(n("전체 양도차익").values["building"])).toBeLessThan(0);
    expect(Number(n("양도소득금액").values["land"])).toBeGreaterThan(0);
    expect(Number(n("감면후 소득금액").values["land"])).toBe(0);
  });

  it("🔴 통산으로 줄어든 열에 §102② 근거가 붙는다", () => {
    const after = rowsOf(LOSS)("감면후 소득금액");
    expect(after.notes?.["land"], "토지 열에 통산 근거가 없다").toContain("§102②");
    expect(after.notes?.["building"], "건물 열에 통산 근거가 없다").toContain("§102②");
  });
});
