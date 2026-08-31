/**
 * lot 축 anchor — 리뷰 2026-08-28 #6·#11·#22·#23
 *
 * 네 결함이 전부 **매수 lot을 매도에 배정하는 축**에 있다.
 *
 * ── #6 자본조정 희석이 `donorAcquisitionPrice`를 건드리지 않는다 ─────────────────
 *   `applyCapitalAdjustmentsToLots`는 `perShareAcquisitionPrice`만 환산하는데,
 *   매칭 3종은 전부 `resolveLotAcquisitionPrice`(= 이월과세면 `donorAcquisitionPrice`)를
 *   1주당 단가로 쓴다. 희석된 주식수 × 희석 안 된 증여자 단가 = **총원가가 배로 뛴다**.
 *   무상증자는 과소, 형식감자는 **과대**(납세자 불리)로 갈린다.
 *   근거: 소득세법 §97의2①1호(증여자 취득 당시 실지거래가액 승계)
 *        집행기준 97-163-12(무상주 1주당 환산 — 총취득원가 불변)
 *
 * ── #11 이동평균법이 §97의2① 1년 요건을 흡수 시점 1회만 판정한다 ────────────────
 *   `balanceCost`가 lot 흡수 시점에 한 번 확정돼, 「그 lot 취득 후 첫 매도일」의
 *   승계 여부가 1년 경계 너머 매도까지 끌려간다. 같은 함수의 `accrue`(①2호·①3호)는
 *   매도마다 재판정하므로 **한 함수 안에서 ①1호와 ①2·3호의 기준이 갈린다**.
 *   근거: 소득세법 §97의2① 각 호 외의 부분 괄호(주식등 1년) · 같은 항 1호
 *
 * ── #22 specific 매칭 합계가 매도 수량에 못 미쳐도 경고가 없다 ──────────────────
 *   `matchFifo`·`matchMovingAvg`에는 있는 매도 수량 대조가 `matchSpecific`에만 없다.
 *   양도가액이 조용히 깎인다(과소). 근거: 소득세법 §96①·§100①
 *
 * ── #23 매도일보다 나중에 취득한 lot이 소진돼 보유일수가 음수가 된다 ────────────
 *   물량 트랙 while 루프에 날짜 조건이 없다. 명문은 없으나 「매도일 현재 보유하지
 *   않은 주식」을 원가로 삼는 산정방법은 없고, 형제 경로(부동산·주식 단건)는 이미
 *   같은 규칙을 갖고 있다.
 *
 *   LOT-CA-1~4   (#6)
 *   LOT-MA-1~3   (#11)
 *   LOT-SP-1~2   (#22)
 *   LOT-NEG-1~3  (#23)
 *   LOT-VAL-1~5  (#22·#23 차단 정본 — ⑧ validate + ⑫ Zod)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type {
  StockTransferInput,
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { validateStep1 } from "@/lib/calc/stock-transfer-tax-validate";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { SYNTH_SINGLE_TRANSFER_ID } from "@/lib/stores/calc-wizard-stock-types";

type CapitalAdjustment = NonNullable<StockTransferInput["capitalAdjustments"]>[number];

function base(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.6,
    selfMarketCap: 2_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isListedSmallShareholder: false,
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    acquisitionDate: new Date("2025-06-01"),
    transferDate: new Date("2025-12-01"),
    shareCount: 20_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 50_000,
    acquisitionMode: "actual",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: new Date("2026-02-28"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

/** 이월과세 매수 lot — 증여 2025-06-01, 수증 평가 80,000/주, 증여자 단가 30,000/주 */
function carryoverLot(shareCount: number, id = "a"): AcquisitionLot {
  return {
    id,
    acquisitionDate: new Date("2025-06-01"),
    shareCount,
    perShareAcquisitionPrice: 80_000,
    acquisitionCause: "carryover_gift",
    donorAcquisitionPrice: 30_000,
    donorRelation: "spouse",
    donorDeceased: false,
  };
}

function trn(id: string, date: string, shareCount: number, perShare: number): TransferLot {
  return { id, transferDate: new Date(date), shareCount, perShareTransferPrice: perShare };
}

function bonus100(date: string): CapitalAdjustment {
  return { type: "bonus_capital_reserve", eventDate: new Date(date), ratio: 1.0 };
}

// ============================================================
// #6 — 자본조정 희석 × 증여자 취득단가
// ============================================================

describe("LOT-CA (#6): 자본조정 희석은 증여자 취득단가에도 적용된다", () => {
  // 이월과세 lot 10,000주 → 2025-07-01 무상증자 100% → 20,000주 → 2025-12-01 전량 매도
  // 증여자 총취득원가 10,000 × 30,000 = 300,000,000 은 희석 후에도 불변이어야 한다.
  const lots = [carryoverLot(10_000)];
  const adjustments = [bonus100("2025-07-01")];
  const transferLots = [trn("t1", "2025-12-01", 20_000, 50_000)];

  it("LOT-CA-1: 무상증자 100% — 증여자 총취득원가 300,000,000 불변 (fifo)", () => {
    const r = calculateStockTransferTax(
      base({
        acquisitionLots: lots,
        transferLots,
        capitalAdjustments: adjustments,
        costAllocationMethod: "fifo",
      }),
    );
    expect(r.acquisitionPrice).toBe(300_000_000);
  });

  it("LOT-CA-2: 매칭 3종이 같은 취득가액을 낸다 (매수 lot 1건이면 방법이 갈릴 이유가 없다)", () => {
    const fifo = calculateStockTransferTax(
      base({
        acquisitionLots: lots,
        transferLots,
        capitalAdjustments: adjustments,
        costAllocationMethod: "fifo",
      }),
    );
    const movingAvg = calculateStockTransferTax(
      base({
        acquisitionLots: lots,
        transferLots,
        capitalAdjustments: adjustments,
        costAllocationMethod: "moving_avg",
      }),
    );
    const specific = calculateStockTransferTax(
      base({
        acquisitionLots: lots,
        transferLots,
        capitalAdjustments: adjustments,
        costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: "t1", acquisitionLotId: "a", shareCount: 20_000 }],
      }),
    );
    expect(movingAvg.acquisitionPrice).toBe(fifo.acquisitionPrice);
    expect(specific.acquisitionPrice).toBe(fifo.acquisitionPrice);
  });

  it("LOT-CA-3: 형식감자 50% — 증여자 총취득원가 불변 (과대과세 방향)", () => {
    // 10,000주 → 5,000주. 증여자 단가 30,000 → 60,000. 총원가 300,000,000 불변.
    const r = calculateStockTransferTax(
      base({
        shareCount: 5_000,
        acquisitionLots: [carryoverLot(10_000)],
        transferLots: [trn("t1", "2025-12-01", 5_000, 50_000)],
        capitalAdjustments: [
          { type: "reduction_proportional", eventDate: new Date("2025-07-01"), ratio: 0.5 },
        ],
        costAllocationMethod: "fifo",
      }),
    );
    expect(r.acquisitionPrice).toBe(300_000_000);
  });

  it("LOT-CA-4: 이월과세가 아닌 lot은 종전과 같다 (회귀 가드)", () => {
    const r = calculateStockTransferTax(
      base({
        shareCount: 200,
        perShareTransferPrice: 8_000,
        acquisitionLots: [
          {
            id: "a",
            acquisitionDate: new Date("2020-01-01"),
            shareCount: 100,
            perShareAcquisitionPrice: 10_000,
            acquisitionCause: "purchase",
          },
        ],
        transferLots: [trn("t1", "2025-12-01", 200, 8_000)],
        capitalAdjustments: [bonus100("2022-01-01")],
        costAllocationMethod: "fifo",
      }),
    );
    expect(r.acquisitionPrice).toBe(1_000_000); // 200 × 5,000
  });
});

// ============================================================
// #11 — 이동평균법 × §97의2① 1년 요건
// ============================================================

describe("LOT-MA (#11): 이동평균 단가는 매도마다 1년 요건을 재판정한다", () => {
  // 이월과세 lot 10,000주(증여 2025-06-01) → ① 4,000주 2025-12-01(6개월·승계 30,000)
  //                                        → ② 6,000주 2026-07-01(13개월·미승계 80,000)
  const lots = [carryoverLot(10_000)];
  const transferLots = [
    trn("t1", "2025-12-01", 4_000, 50_000),
    trn("t2", "2026-07-01", 6_000, 50_000),
  ];
  const twoSaleBase: Partial<StockTransferInput> = {
    shareCount: 10_000,
    transferDate: new Date("2026-07-01"),
    filingDate: new Date("2026-09-30"),
    acquisitionLots: lots,
    transferLots,
  };

  it("LOT-MA-1: 매수 lot 1건이면 moving_avg 취득가액 = fifo 취득가액", () => {
    const fifo = calculateStockTransferTax(
      base({ ...twoSaleBase, costAllocationMethod: "fifo" }),
    );
    const movingAvg = calculateStockTransferTax(
      base({ ...twoSaleBase, costAllocationMethod: "moving_avg" }),
    );
    expect(fifo.acquisitionPrice).toBe(600_000_000); // 4,000×30,000 + 6,000×80,000
    expect(movingAvg.acquisitionPrice).toBe(fifo.acquisitionPrice);
  });

  it("LOT-MA-2: 1년 경계 이후 매도분의 단가는 수증 평가액(80,000)이다", () => {
    const r = calculateStockTransferTax(
      base({ ...twoSaleBase, costAllocationMethod: "moving_avg" }),
    );
    const late = r.lotMatchingDetail!.matched.filter(
      (m) => m.saleDate.getTime() === new Date("2026-07-01").getTime(),
    );
    expect(late.length).toBeGreaterThan(0);
    for (const m of late) expect(m.perShareBuyPrice).toBe(80_000);
  });

  it("LOT-MA-3: 이월과세가 아니면 종전 이동평균 그대로 (회귀 가드)", () => {
    const plain: AcquisitionLot[] = [
      {
        id: "a",
        acquisitionDate: new Date("2025-01-02"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
      {
        id: "b",
        acquisitionDate: new Date("2025-02-02"),
        shareCount: 100,
        perShareAcquisitionPrice: 30_000,
        acquisitionCause: "purchase",
      },
    ];
    const r = calculateStockTransferTax(
      base({
        shareCount: 200,
        acquisitionDate: new Date("2025-01-02"),
        acquisitionCause: "purchase",
        acquisitionLots: plain,
        transferLots: [trn("t1", "2025-06-01", 100, 50_000), trn("t2", "2025-09-01", 100, 50_000)],
        costAllocationMethod: "moving_avg",
      }),
    );
    // 두 매도 모두 잔고 평균 20,000 (평균 보존)
    for (const m of r.lotMatchingDetail!.matched) expect(m.perShareBuyPrice).toBe(20_000);
    expect(r.acquisitionPrice).toBe(4_000_000);
  });
});

// ============================================================
// #22 — specific 매칭 부족
// ============================================================

describe("LOT-SP (#22): specific 매칭 합계가 매도 수량에 못 미치면 경고한다", () => {
  const lots: AcquisitionLot[] = [
    {
      id: "a",
      acquisitionDate: new Date("2025-06-01"),
      shareCount: 100,
      perShareAcquisitionPrice: 10_000,
      acquisitionCause: "purchase",
    },
  ];

  it("LOT-SP-1: 200주 매도에 100주만 배정 → 경고", () => {
    const r = calculateStockTransferTax(
      base({
        shareCount: 200,
        acquisitionLots: lots,
        transferLots: [trn("t1", "2025-12-01", 200, 50_000)],
        capitalAdjustments: [bonus100("2025-07-01")],
        costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: "t1", acquisitionLotId: "a", shareCount: 100 }],
      }),
    );
    const warns = r.lotMatchingDetail!.warnings;
    expect(warns.some((w) => w.includes("매칭 부족"))).toBe(true);
  });

  it("LOT-SP-2: fifo와 같은 문구를 쓴다 (매도 lot별 대조)", () => {
    const fifoShort = calculateStockTransferTax(
      base({
        shareCount: 200,
        acquisitionLots: lots,
        transferLots: [trn("t1", "2025-12-01", 200, 50_000)],
        costAllocationMethod: "fifo",
      }),
    );
    const specificShort = calculateStockTransferTax(
      base({
        shareCount: 200,
        acquisitionLots: lots,
        transferLots: [trn("t1", "2025-12-01", 200, 50_000)],
        capitalAdjustments: [bonus100("2025-07-01")],
        costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: "t1", acquisitionLotId: "a", shareCount: 100 }],
      }),
    );
    const fifoWarn = fifoShort.lotMatchingDetail!.warnings.find((w) => w.includes("매칭 부족"));
    const specWarn = specificShort.lotMatchingDetail!.warnings.find((w) => w.includes("매칭 부족"));
    expect(fifoWarn).toBeDefined();
    expect(specWarn).toBe(fifoWarn);
  });
});

// ============================================================
// #23 — 매도일보다 나중에 취득한 lot
// ============================================================

describe("LOT-NEG (#23): 매도일 이후 취득 lot은 그 매도의 원가가 될 수 없다", () => {
  const lots: AcquisitionLot[] = [
    {
      id: "a",
      acquisitionDate: new Date("2025-01-02"),
      shareCount: 100,
      perShareAcquisitionPrice: 10_000,
      acquisitionCause: "purchase",
    },
    {
      id: "b",
      acquisitionDate: new Date("2025-12-20"),
      shareCount: 100,
      perShareAcquisitionPrice: 30_000,
      acquisitionCause: "purchase",
    },
  ];
  const transferLots = [trn("t1", "2025-06-01", 150, 50_000)];
  const negBase: Partial<StockTransferInput> = {
    shareCount: 150,
    acquisitionDate: new Date("2025-01-02"),
    acquisitionCause: "purchase",
    acquisitionLots: lots,
    transferLots,
  };

  it("LOT-NEG-1: moving_avg — 보유일수가 음수인 sub-lot이 없다", () => {
    const r = calculateStockTransferTax(base({ ...negBase, costAllocationMethod: "moving_avg" }));
    for (const m of r.lotMatchingDetail!.matched) expect(m.holdingDays).toBeGreaterThanOrEqual(0);
  });

  it("LOT-NEG-2: fifo — 매도일 이후 취득 lot이 소진되면 경고한다", () => {
    const r = calculateStockTransferTax(base({ ...negBase, costAllocationMethod: "fifo" }));
    const warns = r.lotMatchingDetail!.warnings;
    expect(warns.some((w) => w.includes("매도일"))).toBe(true);
    for (const m of r.lotMatchingDetail!.matched) expect(m.holdingDays).toBeGreaterThanOrEqual(0);
  });

  it("LOT-NEG-3: 정상 시계열이면 경고 0건 (회귀 가드)", () => {
    const ok: AcquisitionLot[] = [
      {
        id: "a",
        acquisitionDate: new Date("2025-01-02"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
      {
        id: "b",
        acquisitionDate: new Date("2025-03-02"),
        shareCount: 100,
        perShareAcquisitionPrice: 30_000,
        acquisitionCause: "purchase",
      },
    ];
    const r = calculateStockTransferTax(
      base({ ...negBase, acquisitionLots: ok, costAllocationMethod: "fifo" }),
    );
    expect(r.lotMatchingDetail!.warnings).toEqual([]);
  });
});

// ============================================================
// #22·#23 — 차단 정본 (⑧ validate + ⑫ Zod)
//   엔진 경고는 백스톱일 뿐이다. 엔진 anchor는 validate·Zod를 태우지 않으므로
//   막는 쪽을 별도로 고정한다.
// ============================================================

describe("LOT-VAL (#22·#23): 차단은 ⑧ validate·⑫ Zod가 한다", () => {
  const lotsOnlyForm = (overrides: Record<string, unknown> = {}) => ({
    ...createInitialStockFormData(),
    marketType: "unlisted" as const,
    acquisitionMode: "actual" as const,
    acquisitionActualInputMode: "lots" as const,
    lotsMode: "single" as const,
    costAllocationMethod: "fifo" as const,
    shareCount: "200",
    transferActualInputMode: "per_share" as const,
    perShareTransferPrice: "50000",
    transferDate: "2025-12-01",
    acquisitionDate: "2025-06-01",
    totalIssuedShares: "1000000",
    acquisitionLots: [
      {
        id: "a",
        acquisitionDate: "2025-06-01",
        shareCount: "200",
        perShareAcquisitionPrice: "10000",
        acquisitionCause: "purchase" as const,
      },
    ],
    ...overrides,
  });

  it("LOT-VAL-1 (#22): 자본조정이 있어도 배정 합계 ≠ 양도 주식수는 차단한다", () => {
    // 양변이 모두 희석 후 단위라 면제할 이유가 없다 — 부족분은 그대로 양도가액을 깎는다.
    const form = lotsOnlyForm({
      costAllocationMethod: "specific" as const,
      specificMatchings: [
        { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: "100" },
      ],
      capitalAdjustments: [
        { type: "bonus_capital_reserve" as const, eventDate: "2025-07-01", ratio: "1.0", notes: "" },
      ],
    });
    const errors = validateStep2Domestic(form).filter(
      (e) => e.severity === "error" && e.field === "specificMatchings",
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("LOT-VAL-2 (#22): 배정 합계가 맞으면 자본조정 여부와 무관하게 통과 (회귀 가드)", () => {
    const form = lotsOnlyForm({
      costAllocationMethod: "specific" as const,
      specificMatchings: [
        { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: "200" },
      ],
      capitalAdjustments: [
        { type: "bonus_capital_reserve" as const, eventDate: "2025-07-01", ratio: "1.0", notes: "" },
      ],
    });
    const errors = validateStep2Domestic(form).filter(
      (e) => e.severity === "error" && e.field === "specificMatchings",
    );
    expect(errors).toHaveLength(0);
  });

  it("LOT-VAL-3 (#23): lots-only — 양도일 이후 취득한 매수 lot을 차단한다", () => {
    const form = lotsOnlyForm({
      acquisitionLots: [
        {
          id: "a",
          acquisitionDate: "2026-03-01", // 양도일(2025-12-01) 이후
          shareCount: "200",
          perShareAcquisitionPrice: "10000",
          acquisitionCause: "purchase" as const,
        },
      ],
    });
    const errors = validateStep1(form).filter((e) => e.severity === "error");
    expect(errors.some((e) => e.message.includes("이전에 취득한 매수 lot이 없습니다"))).toBe(true);
  });

  it("LOT-VAL-4 (#23): 분할 모드 — 매도 시점 누적 보유수량 초과를 차단한다", () => {
    // lot a 100주(2025-01-02) + lot b 100주(2025-12-20), 매도 150주(2025-06-01)
    const form = {
      ...lotsOnlyForm(),
      lotsMode: "split" as const,
      acquisitionLots: [
        { id: "a", acquisitionDate: "2025-01-02", shareCount: "100", perShareAcquisitionPrice: "10000", acquisitionCause: "purchase" as const },
        { id: "b", acquisitionDate: "2025-12-20", shareCount: "100", perShareAcquisitionPrice: "30000", acquisitionCause: "purchase" as const },
      ],
      transferLots: [
        { id: "t1", transferDate: "2025-06-01", shareCount: "150", perShareTransferPrice: "50000" },
      ],
    };
    const errors = validateStep1(form).filter((e) => e.severity === "error");
    expect(errors.some((e) => e.message.includes("누적 매도"))).toBe(true);
    // 총수량만 보던 종전 검사는 150 ≤ 200 이라 통과했다 — 그래서 놓쳤다.
    expect(errors.some((e) => e.message.includes("총 매도 수량"))).toBe(false);
  });

  it("LOT-VAL-5 (#23): ⑫ Zod도 같은 규칙을 건다", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse({
      ...base({
        shareCount: 150,
        acquisitionDate: new Date("2025-01-02"),
        transferDate: new Date("2025-06-01"),
        filingDate: new Date("2025-08-31"),
      }),
      acquisitionActualInputMode: "lots",
      costAllocationMethod: "fifo",
      acquisitionLots: [
        { id: "a", acquisitionDate: "2025-01-02", shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
        { id: "b", acquisitionDate: "2025-12-20", shareCount: 100, perShareAcquisitionPrice: 30_000, acquisitionCause: "purchase" },
      ],
      transferLots: [
        { id: "t1", transferDate: "2025-06-01", shareCount: 150, perShareTransferPrice: 50_000 },
      ],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message.includes("누적 매도"))).toBe(true);
    }
  });
});
