/**
 * @vitest-environment jsdom
 *
 * EXA-1 — 국외전출세 **2027.1.1. 전 출국 경로 SSR 마크업 기준선** (U0 무동작 안전망)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.ui.plan.md` D-2 · §8 EXA-1
 *
 * ## 왜
 *
 * U1이 era(출국일 ≥ 2027.1.1.) 분기를 넣어도 **2026 이전 출국 경로는 DOM이 한 글자도 달라지면 안 된다**.
 * 새 화면 요소는 전부 `era === true`일 때만 마운트(D-2)하므로, 조건이 잘못 열리거나 기존 JSX를
 * 건드리면 이 마크업이 바뀐다. 눈으로 보는 비교(선례: 커밋 ca90f5535 「SSR 이전/이후 바이트 동일」)는
 * 일회성이라 두 번째 PR부터 소실되므로 **기준선을 파일로 고정**한다.
 *
 * ## 기준선
 *
 * `__snapshots__/exit-tax-pre2027/*.html` — **변경 전(master d72bb35ac) 코드에서 생성**했다.
 * 마크업이 바뀌는 PR은 의도한 변경인지 diff로 먼저 확인하고 `vitest -u`로 갱신한다.
 * (`>` 사이에 줄바꿈만 넣어 diff가 읽히게 했다 — 변환이 단사라 바이트 동일 판정은 그대로다.)
 *
 * ## 범위
 *
 * Step1(출국일·대주주) · Step2(보유 종목) · Step3(정산) · `ExitTaxResultCard`.
 * 출국일 2026-09-01(교재 사례) · 2026-12-31(마지막 전 일) · 빈값 3축. 결과 카드는 교재 갑·을.
 */

import "fake-indexeddb/auto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { ExitTaxResultCard } from "@/components/calc/results/ExitTaxResultCard";
import {
  createInitialStockFormData,
  createEmptyExitTaxHolding,
} from "@/lib/stores/calc-wizard-stock-store";
import type {
  StockTransferFormData,
  ExitTaxHoldingForm,
} from "@/lib/stores/calc-wizard-stock-store";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

const noop = () => {};

/** 마크업을 줄 단위로 읽을 수 있게 — `><` 경계에만 줄바꿈을 넣는다 */
const lines = (html: string) => html.replace(/></g, ">\n<") + "\n";

const snap = (name: string) => `./__snapshots__/exit-tax-pre2027/${name}.html`;

function exitForm(over: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "exit_tax",
    etYearsResidentLast10: "10",
    etDepartureDate: "2026-09-01",
    etIsMajorShareholder: true,
    ...over,
  } as StockTransferFormData;
}

/** id를 고정한다 — 팩토리는 nanoid를 쓰는데 id가 `name`·`key`에 들어가 마크업이 매번 달라진다 */
function holding(id: string, over: Partial<ExitTaxHoldingForm>): ExitTaxHoldingForm {
  return { ...createEmptyExitTaxHolding(), id, ...over };
}

/** 시장 4종 × 시가 모드 4종을 한 번씩 덮는다 (유효한 조합만 — 국내 상장 4종 + 비상장 3모드) */
const FOUR_HOLDINGS: ExitTaxHoldingForm[] = [
  holding("h-kosdaq-market", {
    stockName: "코스닥 A",
    marketType: "kosdaq",
    shareCount: "10,000",
    acquisitionDate: "2015-01-01",
    perShareAcquisitionPrice: "10,000",
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: "50,000",
  }),
  holding("h-kospi-avg", {
    stockName: "코스피 B",
    marketType: "kospi",
    shareCount: "1,000",
    acquisitionDate: "2018-03-02",
    perShareAcquisitionPrice: "70,000",
    departureDayValuationMode: "prior_year_std",
    priorYearEndMonthAvg: "81,500",
    stockCodeOrBizNumber: "005930",
    faceValuePerShare: "100",
    ownershipRatio: "0.01",
  }),
  holding("h-unlisted-sample", {
    stockName: "비상장 C",
    marketType: "unlisted",
    shareCount: "10,000",
    acquisitionDate: "2016-07-15",
    perShareAcquisitionPrice: "20,000",
    departureDayValuationMode: "unlisted_sample",
    unlistedSamplePrice: "30,000",
  }),
  holding("h-konex-std", {
    stockName: "코넥스 D",
    marketType: "konex",
    shareCount: "500",
    acquisitionDate: "2019-11-20",
    perShareAcquisitionPrice: "12,000",
    departureDayValuationMode: "unlisted_std",
    unlistedStdPricePerShare: "15,000",
  }),
];

/** 교재 사례(2026.9.1. 출국) — 갑 코스닥 A · 을 비상장 B */
function textbook(
  kind: "gap" | "eul",
  over: Partial<ExitTaxInput> = {},
  departure = "2026-09-01",
) {
  const holdingInput =
    kind === "gap"
      ? {
          id: "h-gap",
          stockName: "코스닥 A",
          marketType: "kosdaq" as const,
          perShareAcquisitionPrice: 10_000,
          departureDayMarketPrice: 50_000,
        }
      : {
          id: "h-eul",
          stockName: "비상장 B",
          marketType: "unlisted" as const,
          perShareAcquisitionPrice: 20_000,
          departureDayMarketPrice: 30_000,
        };
  return calculateExitTax({
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: new Date(departure),
    isMajorShareholder: true,
    holdings: [
      {
        shareCount: 10_000,
        acquisitionDate: new Date("2015-01-01"),
        departureDayValuationMode: "market_price",
        ...holdingInput,
      },
    ],
    deferralRequested: true,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    reenteredWithin5Years: false,
    ...over,
  } as ExitTaxInput);
}

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

// ============================================================
// Step1 — 거주 연수 · 출국일 · 대주주
// ============================================================

describe("EXA-1 Step1 마크업 기준선 (2026 이전 출국)", () => {
  const cases: Array<[string, Partial<StockTransferFormData>, string]> = [
    ["step1-departure-2026-09-01", {}, "2026-09-01"],
    ["step1-departure-2026-12-31", { etDepartureDate: "2026-12-31" }, "2026-12-31"],
    ["step1-departure-blank", { etDepartureDate: "", etIsMajorShareholder: false }, ""],
  ];
  for (const [name, over] of cases) {
    it(`${name}`, async () => {
      const out = html(<Step1 form={exitForm(over)} onChange={noop} />);
      // 양성 짝 — 빈 렌더가 기준선이 되는 일을 막는다
      expect(out).toContain("거주자 요건 (§118의9①1호)");
      expect(out).toContain("대주주 요건");
      await expect(lines(out)).toMatchFileSnapshot(snap(name));
    });
  }
});

// ============================================================
// Step2 — 보유 종목
// ============================================================

describe("EXA-1 Step2 마크업 기준선 (2026 이전 출국)", () => {
  const cases: Array<[string, Partial<StockTransferFormData>]> = [
    ["step2-holdings-empty", { etHoldings: [] }],
    ["step2-holdings-four", { etHoldings: FOUR_HOLDINGS }],
    [
      "step2-holdings-four-departure-2026-12-31",
      { etHoldings: FOUR_HOLDINGS, etDepartureDate: "2026-12-31" },
    ],
  ];
  for (const [name, over] of cases) {
    it(`${name}`, async () => {
      const out = html(<Step2 form={exitForm(over)} onChange={noop} />);
      expect(out).toContain("보유 종목 — 간주양도 대상 (§178의9)");
      // 시장 선택 버튼은 4개 — U1이 era에서만 5번째를 더한다 (X-1 단언의 단위 짝)
      expect(out).not.toContain("국외주식");
      await expect(lines(out)).toMatchFileSnapshot(snap(name));
    });
  }
});

// ============================================================
// Step3 — 실양도 · 납부유예 · 외국납부세액 · 보유현황 신고
// ============================================================

describe("EXA-1 Step3 마크업 기준선 (2026 이전 출국)", () => {
  const cases: Array<[string, Partial<StockTransferFormData>]> = [
    ["step3-default", {}],
    [
      "step3-settlement-filled",
      {
        etActualTransferDate: "2027-03-01",
        etActualTransferPricePerShare: "45,000",
        etDeferralRequested: true,
        etDeferralInterestDays: "365",
        etDeferralInterestDailyRate: "0.000022",
        etForeignTaxPaid: "30,000,000",
        etHasFiledHoldingsReport: false,
        etTotalFaceValue: "500,000,000",
        etHoldings: FOUR_HOLDINGS,
      },
    ],
  ];
  for (const [name, over] of cases) {
    it(`${name}`, async () => {
      const out = html(<Step3 form={exitForm(over)} onChange={noop} />);
      expect(out).toContain("실양도 정보 — 경정청구용");
      await expect(lines(out)).toMatchFileSnapshot(snap(name));
    });
  }
});

// ============================================================
// ExitTaxResultCard — 교재 사례 갑·을
// ============================================================

describe("EXA-1 ExitTaxResultCard 마크업 기준선 (2026 이전 출국)", () => {
  it("card-gap — 산출세액 84,375,000 (교재 갑)", async () => {
    const r = textbook("gap");
    expect(r.incomeTax).toBe(84_375_000);
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("84,375,000");
    await expect(lines(out)).toMatchFileSnapshot(snap("card-gap"));
  });

  it("card-gap-actual-transfer — 조정공제 12,500,000 · 납부 41,875,000", async () => {
    const r = textbook("gap", {
      actualTransferDate: new Date("2027-03-01"),
      actualTransferPricePerShare: 45_000,
      foreignTaxPaid: 30_000_000,
    });
    expect(r.finalTaxAfterAdjustment).toBe(41_875_000);
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("41,875,000");
    await expect(lines(out)).toMatchFileSnapshot(snap("card-gap-actual-transfer"));
  });

  it("card-eul-actual-transfer — 납부 14,500,000", async () => {
    const r = textbook("eul", {
      actualTransferDate: new Date("2027-03-01"),
      actualTransferPricePerShare: 60_000,
      foreignTaxPaid: 20_000_000,
    });
    expect(r.finalTaxAfterAdjustment).toBe(14_500_000);
    const out = html(<ExitTaxResultCard result={r} />);
    await expect(lines(out)).toMatchFileSnapshot(snap("card-eul-actual-transfer"));
  });

  it("card-gap-departure-2026-12-31 — 마지막 전 일 출국도 현행 카드", async () => {
    const r = textbook("gap", {}, "2026-12-31");
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("3억 이하 20%");
    await expect(lines(out)).toMatchFileSnapshot(snap("card-gap-departure-2026-12-31"));
  });

  it("card-penalty — 보유현황 미신고 가산세 포함", async () => {
    const r = textbook("gap", { hasFiledHoldingsReport: false, totalFaceValue: 500_000_000 });
    const out = html(<ExitTaxResultCard result={r} />);
    await expect(lines(out)).toMatchFileSnapshot(snap("card-penalty"));
  });
});
