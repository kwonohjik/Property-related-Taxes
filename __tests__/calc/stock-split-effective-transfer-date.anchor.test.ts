/**
 * 분할 모드의 «이 계산의 양도일» — 화면·검증이 엔진과 같은 날짜를 쓴다 (2026-10-07)
 *
 * 분할 모드에는 폼-전역 양도일 칸이 없다(빈 값 — #2024 이후 단일→분할 전환도 비운다). 그런데 ④는
 * 가장 이른 매도 lot 일자를 엔진 `transferDate`로 싣는다. 화면·검증은 폼-전역 칸을 읽어
 *   · 대주주 임계 미리보기·자동 판정(`computeAutoIsMajor`)이 꺼지고
 *   · §94①4 다목(과점주주) 판정이 «아님»이 되어 의제취득일(4호 1986 / 3호 1985)이 엔진과 갈리고
 *   · 순자산 단독(라목, 2023.2.28~) 판정이 «아님»이 되어 엔진이 쓰지 않는 순손익을 요구하고
 *   · 요건 게이트·§165④ 연혁 검증·신고기한 안내를 건너뛰었다.
 * 수정: `effectiveTransferDate` leaf 하나를 ④·화면·검증이 같이 쓴다.
 *
 *   ET-1  leaf — 분할 = 가장 이른 매도 lot 일자 · 그 외 = 폼-전역 양도일
 *   ET-2  ④ body 양도일 = leaf
 *   ET-3  4호 판정 — 분할 = 같은 날짜의 단일과 동일(참)
 *   ET-4  순자산 단독(라목) — 시행일 전후로 단일과 동일
 *   ET-5  대주주 자동 판정 — 분할에서도 판정한다(단일과 동일)
 *   ET-6  §94①4 다목 요건 게이트 검증 — 분할에서도 막는다 / 긍정 짝
 *   ET-7  배선 가드 — 분할 모드에 닿는 화면·검증 파일에 폼-전역 양도일 직접 읽기가 남지 않는다
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { effectiveTransferDate } from "@/lib/calc/stock-effective-transfer-date";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { isSection94_4Form } from "@/lib/calc/stock-transfer-section94-4-form";
import { shouldSkipNetIncome } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
import { computeAutoIsMajor } from "@/components/calc/stock-transfer/major-sync";
import { validateStep1 } from "@/lib/calc/stock-transfer-tax-validate";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

const TWO_SALES: StockTransferFormData["transferLots"] = [
  { id: "t2", transferDate: "2026-08-20", shareCount: "4000", perShareTransferPrice: "21000" },
  { id: "t1", transferDate: "2026-05-10", shareCount: "6000", perShareTransferPrice: "20000" },
];

/** 같은 날짜를 폼-전역 칸에 둔 단일 모드 짝 — 판정 술어의 기대값 */
const singleTwin = (f: StockTransferFormData): StockTransferFormData => ({
  ...f,
  lotsMode: "single",
  transferDate: effectiveTransferDate(f),
});

describe("ET-1 leaf", () => {
  it("분할 — 입력 순서와 무관하게 가장 이른 매도 lot 일자 · 폼-전역 값은 보지 않는다", () => {
    expect(effectiveTransferDate(reportedSplitForm({ transferLots: TWO_SALES }))).toBe("2026-05-10");
    expect(effectiveTransferDate(reportedSplitForm({ transferLots: TWO_SALES, transferDate: "2019-03-01" }))).toBe("2026-05-10");
  });
  it("분할 — 매도 lot 이 없거나 일자가 비면 빈 값", () => {
    expect(effectiveTransferDate(reportedSplitForm({ transferLots: [] }))).toBe("");
    expect(effectiveTransferDate(reportedSplitForm({ transferLots: [{ ...TWO_SALES[0], transferDate: "" }] }))).toBe("");
  });
  it("단일·lots-only — 폼-전역 양도일", () => {
    expect(effectiveTransferDate(reportedSplitForm({ lotsMode: "single", transferDate: "2026-06-15" }))).toBe("2026-06-15");
  });
});

describe("ET-2 ④", () => {
  it("body 양도일 = leaf", () => {
    const f = reportedSplitForm({ transferLots: TWO_SALES });
    expect(buildStockTransferApiBody(f).transferDate).toBe(effectiveTransferDate(f));
  });
});

const BLOCK: Partial<StockTransferFormData> = {
  marketType: "other_asset",
  isMajorShareholder: false,
  isQualifyingBlockShareholder: true,
  blockShareholderRealEstateRatio: "60",
  blockShareholderOwnershipRatio: "60",
  cumulativeTransferRatio: "60",
  aggregationFirstTransferDate: "2026-01-10",
};

describe("ET-3 §94①4 다목 판정", () => {
  it("분할에서도 4호 — 같은 날짜의 단일과 같다", () => {
    const f = reportedSplitForm(BLOCK);
    expect(isSection94_4Form(singleTwin(f))).toBe(true);
    expect(isSection94_4Form(f)).toBe(true);
  });
});

describe("ET-4 순자산 단독(라목 — 2023.2.28 이후 양도)", () => {
  it.each([
    ["2026-05-10", true],
    ["2022-06-01", false],
  ] as const)("매도 lot %s → %s", (d, expected) => {
    const f = reportedSplitForm({
      isHeavyRealEstateForRate: true,
      transferLots: [{ id: "t1", transferDate: d, shareCount: "10000", perShareTransferPrice: "20000" }],
    });
    expect(shouldSkipNetIncome(singleTwin(f), "transfer")).toBe(expected);
    expect(shouldSkipNetIncome(f, "transfer")).toBe(expected);
  });
});

describe("ET-5 대주주 자동 판정", () => {
  it("분할에서도 판정한다 — 단일과 같다", () => {
    const f = reportedSplitForm();
    const single = computeAutoIsMajor(singleTwin(f), {});
    expect(single).not.toBeUndefined();
    expect(computeAutoIsMajor(f, {})).toBe(single);
  });
});

describe("ET-6 §94①4 다목 요건 게이트 검증", () => {
  const gateError = (f: StockTransferFormData) =>
    validateStep1(f).some((e) => e.severity === "error" && e.message.includes("§94①4 다목 요건 미충족"));
  it("소유비율 40% — 분할에서도 막는다", () => {
    expect(gateError(reportedSplitForm({ ...BLOCK, blockShareholderOwnershipRatio: "40" }))).toBe(true);
  });
  it("긍정 짝 — 요건 충족이면 막지 않는다", () => {
    expect(gateError(reportedSplitForm(BLOCK))).toBe(false);
  });
});

describe("ET-7 배선 가드", () => {
  it.each([
    "components/calc/stock-transfer/MajorShareholderBlock.tsx",
    "components/calc/stock-transfer/OtherAssetBlock.tsx",
    "components/calc/stock-transfer/PenaltyDetailBlock.tsx",
    "components/calc/stock-transfer/major-sync.ts",
    "app/calc/stock-transfer-tax/steps/Step3.tsx",
    "lib/calc/stock-transfer-tax-validate-unlisted.ts",
    "lib/calc/stock-transfer-section94-4-form.ts",
    "lib/tax-engine/stock-transfer/unlisted-flat-adapter.ts",
  ])("%s", (path) => {
    const src = readFileSync(path, "utf8");
    expect(src).not.toMatch(/\b(form|merged)\.transferDate\b/);
    expect(src).toMatch(/effectiveTransferDate\(/);
  });
});
