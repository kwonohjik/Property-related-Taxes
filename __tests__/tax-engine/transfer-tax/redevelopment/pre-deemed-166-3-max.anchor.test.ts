/**
 * 의제취득일(1985.1.1.) 전 상속·증여 재개발·재건축 종전자산 — 3자 max의 ③ = §166③ (calculateTransferTax 통합 · 원 단위).
 *
 * 종전자산 취득가액 = max(① 상증법 평가액, ② §164④~⑦ 기준시가, ③ §166③ 재개발 환산취득가액) — 동점 ①② 우선.
 * ③은 재개발 분기가 실제로 적용하는 §166③ 산식이다(Q-8 a). STEP 0.45가 같은 금액을 비교하므로
 * 「채택된 후보 = 적용된 금액」이어야 한다(PR-1까지는 ③을 §176조의2④로 비교해 카드와 계산이 갈렸고,
 * 증여는 ①보다 작은 §166③이 쓰였다 — 「종전」 열).
 * 근거: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §12.
 *
 * 시료: case44 재개발 정보 · 1980.1.1. 상속(증여) · 2026.2.16. 양도 525,000,000 · mock 세율표.
 *   §176조의2④ 입력(의제취득일 기준시가 2억 · 양도시 4억 → 262,500,000)을 일부러 함께 보낸다 — 재개발에서는 쓰지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveRedevelopment166_3AcquisitionPrice } from "@/lib/tax-engine/redevelopment-166-3-price";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const rates = makeMockRates();
const SEC166_3 = 141_221_534; // floor(219,218,500 × 85,034,988 ÷ 132,000,000)

function make(opts: {
  cause?: "inheritance" | "gift" | "purchase";
  reported?: number;
  useEst?: boolean;
  info?: RedevelopmentInfo;
  propertyType?: "redevelopment_apt" | "right_to_move_in";
}): TransferTaxInput {
  const cause = opts.cause ?? "inheritance";
  return baseTransferInput({
    propertyType: opts.propertyType ?? "redevelopment_apt",
    acquisitionCause: cause,
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("1980-01-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: opts.useEst ?? true,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: opts.info ?? case44RedevelopmentInfo(),
    ...(cause !== "purchase" && {
      inheritedAcquisition: {
        inheritanceDate: new Date("1980-01-01"),
        assetKind: "house_individual",
        ...(opts.reported !== undefined ? { reportedValue: opts.reported, reportedMethod: "supplementary" } : {}),
        transferPrice: 525_000_000,
        standardPriceAtDeemedDate: 200_000_000,
        standardPriceAtTransfer: 400_000_000,
        transferDate: new Date("2026-02-16"),
      },
    }),
  }) as TransferTaxInput;
}

const CASES = [
  // [id, 입력, 채택, 종전자산 취득가액, 결정세액, 종전(PR-1) 결정세액]
  { id: "I-1 ① 1억 < ③", in: { reported: 100_000_000 }, sel: "converted", acq: SEC166_3, tax: 61_420_275, before: 74_228_133 },
  { id: "I-2 ① 3억 > ③", in: { reported: 300_000_000 }, sel: "reported", acq: 300_000_000, tax: 11_040_084, before: 11_040_084 },
  { id: "I-3 ③만", in: {}, sel: "converted", acq: SEC166_3, tax: 61_420_275, before: 61_420_275 },
  { id: "I-4 ① 2억 > ③", in: { reported: 200_000_000 }, sel: "reported", acq: 200_000_000, tax: 44_968_133, before: 44_968_133 },
  { id: "I-5 ⑤ 실가 — ③ 없음(① 1억)", in: { reported: 100_000_000, useEst: false }, sel: "reported", acq: 100_000_000, tax: 74_228_133, before: 74_228_133 },
  { id: "G-1 증여 ① 1억 < ③", in: { cause: "gift", reported: 100_000_000 }, sel: "converted", acq: SEC166_3, tax: 61_420_275, before: 61_420_275 },
  { id: "G-4 증여 ① 2억 > ③", in: { cause: "gift", reported: 200_000_000 }, sel: "reported", acq: 200_000_000, tax: 44_968_133, before: 61_420_275 },
] as const;

describe("재개발 pre-deemed 3자 max — ③ = §166③ 통합 anchor", () => {
  for (const c of CASES) {
    it(`${c.id}: ${c.sel} · 종전자산 취득가액 ${c.acq.toLocaleString()} · 결정세액 ${c.tax.toLocaleString()} (종전 ${c.before.toLocaleString()})`, () => {
      const r = calculateTransferTax(make(c.in), rates);
      const b = r.inheritedAcquisitionDetail!.preDeemedBreakdown!;
      expect(b.selectedMethod).toBe(c.sel);
      // 카드의 채택 금액 = 재개발 분기가 적용한 금액
      expect(r.inheritedAcquisitionDetail!.acquisitionPrice).toBe(c.acq);
      expect(r.redevelopmentDetail!.preApproval.apportionedAcquisition).toBe(c.acq);
      expect(r.redevelopmentDetail!.valuationMeta?.method).toBe(
        c.sel === "converted" ? "estimated_post_disclosure_decree_166_3" : "actual",
      );
      expect(r.totalTax).toBe(c.tax);
    });
  }

  it("③은 §166③ 금액이고 §176조의2④(262,500,000)가 아니다 — 근거 표시 convertedBasis", () => {
    const b = calculateTransferTax(make({ reported: 100_000_000 }), rates).inheritedAcquisitionDetail!;
    expect(b.preDeemedBreakdown!.convertedAmount).toBe(SEC166_3);
    expect(b.preDeemedBreakdown!.convertedBasis).toBe("redevelopment_166_3");
    expect(b.formula).toContain("③ §166③ 재개발 환산취득가액: 141,221,534");
    expect(b.legalBasis).toContain("§166 ③");
  });

  it("⑤ 실가면 §166③ 칸이 남아 있어도 ③ = 0 — 화면에 없는 값을 쓰지 않는다", () => {
    const b = calculateTransferTax(make({ reported: 100_000_000, useEst: false }), rates).inheritedAcquisitionDetail!;
    expect(b.preDeemedBreakdown!.convertedAmount).toBe(0);
  });

  it("⑤ 실가 · ①② 없음 — 남은 §176조의2④ 값으로 환산 모드로 바꾸지 않는다(취득가액 0 · ⑧⑫가 막는 상태)", () => {
    const r = calculateTransferTax(make({ useEst: false }), rates);
    expect(r.redevelopmentDetail!.valuationMeta?.method).toBe("actual");
    expect(r.redevelopmentDetail!.preApproval.apportionedAcquisition).toBe(0);
  });

  it("③ 채택이면 개산공제(§163⑥) — 의제 취득 시 기준시가 × 3%", () => {
    const r = calculateTransferTax(make({ reported: 100_000_000 }), rates);
    expect(r.redevelopmentDetail!.estimatedLumpDeduction).toBe(Math.floor(85_034_988 * 0.03));
    expect(r.usedEstimatedAcquisition).toBe(true);
  });

  it("동점이면 ①② 우선(Q-5) — 실가 · 개산공제 없음", () => {
    const r = calculateTransferTax(make({ reported: SEC166_3 }), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown!.selectedMethod).toBe("reported");
    expect(r.redevelopmentDetail!.valuationMeta?.method).toBe("actual");
  });

  it("post-deemed 상속은 무변경 — ③이 없다(①만)", () => {
    const input = make({ reported: 100_000_000 });
    const post = {
      ...input,
      acquisitionDate: new Date("2005-04-09"),
      inheritedAcquisition: { inheritanceDate: new Date("2005-04-09"), assetKind: "house_individual", reportedValue: 100_000_000, reportedMethod: "supplementary" },
    } as TransferTaxInput;
    const r = calculateTransferTax(post, rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown).toBeUndefined();
    expect(r.redevelopmentDetail!.preApproval.apportionedAcquisition).toBe(100_000_000);
  });
});

/**
 * 리프가 `runRedevelopment`의 §166③ 분기를 그대로 따르는지 — 분기마다 「상속 ③ 채택 실행의 재개발 결과 =
 * 매매 환산 실행의 재개발 결과」와 「STEP 0.45의 ③ = 리프 값」을 함께 본다. 분기가 갈리면 둘 중 하나가 깨진다.
 */
describe("§166③ 리프 ↔ 재개발 엔진 분기 대조", () => {
  const BRANCHES: Array<{ id: string; info: RedevelopmentInfo; propertyType: "redevelopment_apt" | "right_to_move_in"; expected: number }> = [
    { id: "일반(완공 APT · 납부)", info: case44RedevelopmentInfo(), propertyType: "redevelopment_apt", expected: SEC166_3 },
    {
      id: "주택 출자 · 입주권 · 청산금 수령(PHD 2-point)",
      info: { ...case44RedevelopmentInfo(), subject: "right", settlementDirection: "receive", settlementAmount: 30_000_000, housingStdPriceAtAcq: 90_000_001, housingStdPriceAtApproval: 210_000_000 },
      propertyType: "right_to_move_in",
      expected: Math.floor((219_218_500 * 90_000_001) / 210_000_000),
    },
    {
      id: "토지 출자 · 입주권",
      info: { ...case44RedevelopmentInfo(), subject: "right", originalAssetType: "land", landStdPriceAtAcq: 120_000_001, landStdPriceAtApproval: 300_000_000 },
      propertyType: "right_to_move_in",
      expected: Math.floor((219_218_500 * 120_000_001) / 300_000_000),
    },
    {
      id: "토지 출자 · 완공 APT",
      info: { ...case44RedevelopmentInfo(), originalAssetType: "land", landStdPriceAtAcq: 120_000_001, landStdPriceAtApproval: 300_000_000 },
      propertyType: "redevelopment_apt",
      expected: Math.floor((219_218_500 * 120_000_001) / 300_000_000),
    },
  ];

  for (const br of BRANCHES) {
    it(`${br.id}: 리프 = ${br.expected.toLocaleString()} · 상속 ③ 채택 실행 = 매매 환산 실행`, () => {
      expect(resolveRedevelopment166_3AcquisitionPrice(br.info, new Date("1980-01-01"))).toBe(br.expected);
      const inherited = calculateTransferTax(make({ reported: 1_000_000, info: br.info, propertyType: br.propertyType }), rates);
      const purchase = calculateTransferTax(make({ cause: "purchase", info: br.info, propertyType: br.propertyType }), rates);
      expect(inherited.inheritedAcquisitionDetail!.preDeemedBreakdown!.convertedAmount).toBe(br.expected);
      expect(inherited.inheritedAcquisitionDetail!.preDeemedBreakdown!.selectedMethod).toBe("converted");
      expect(inherited.redevelopmentDetail).toEqual(purchase.redevelopmentDetail);
    });
  }

  it("승계조합원은 §166③이 없다 → null", () => {
    expect(resolveRedevelopment166_3AcquisitionPrice({ ...case44RedevelopmentInfo(), isSuccessorMember: true }, new Date("1980-01-01"))).toBeNull();
  });

  it("§166③ 칸이 비면 null", () => {
    const { managementDisposalHousingPrice: _d, ...noD } = case44RedevelopmentInfo();
    expect(resolveRedevelopment166_3AcquisitionPrice(noD as RedevelopmentInfo, new Date("1980-01-01"))).toBeNull();
  });
});

/** 리뷰 FAIL-2(2026-10-22): 승계조합원은 §166③ 대상이 아니다 — ③은 종전대로 §176조의2④(262,500,000). */
describe("승계조합원 — ③은 종전대로 §176조의2④", () => {
  it("완공 아파트 승계조합원: convertedBasis 없음 · ③ = §176조의2④", () => {
    const r = calculateTransferTax(
      make({ info: { ...case44RedevelopmentInfo(), isSuccessorMember: true }, reported: 100_000_000 }),
      rates,
    );
    const b = r.inheritedAcquisitionDetail!.preDeemedBreakdown!;
    expect(b.convertedBasis).toBeUndefined();
    expect(b.convertedAmount).toBe(262_500_000);
    // 적용은 PR-1과 같다(PR-1 엔진 실측 101,376,000 · 양도차익 = 525,000,000 − ① 100,000,000) — 이번 PR이 승계 경로를 바꾸지 않는다.
    expect(r.transferGain).toBe(425_000_000);
    expect(r.totalTax).toBe(101_376_000);
  });
});

/** 리뷰 「앵커 부재」 셀: ② 3-시점(§164⑦)이 함께 있는 재개발 ③ 채택 — ②보다 §166③이 크면 ③. */
describe("② §164⑦ 3-시점이 있는 재개발", () => {
  it("② 100,000,000 < §166③ → ③ 채택 · 재개발 분기 §166③ 적용", () => {
    const input = {
      ...make({}),
      inheritedHouseValuation: {
        inheritanceDate: new Date("1980-01-01"),
        transferDate: new Date("2026-02-16"),
        landArea: 100,
        landPricePerSqmAtTransfer: 3_000_000,
        landPricePerSqmAtFirstDisclosure: 1_000_000,
        housePriceAtTransfer: 400_000_000,
        housePriceAtFirstDisclosure: 150_000_000,
        buildingStdPriceAtFirstDisclosure: 30_000_000,
        buildingStdPriceAtInheritance: 20_000_000,
        landPricePerSqmAtInheritance: 500_000,
        housePriceAtInheritanceOverride: 100_000_000,
      },
    } as TransferTaxInput;
    const r = calculateTransferTax(input, rates);
    const b = r.inheritedAcquisitionDetail!.preDeemedBreakdown!;
    expect(b.sec164Amount).toBe(100_000_000);
    expect(b.selectedMethod).toBe("converted");
    expect(b.convertedAmount).toBe(SEC166_3);
    expect(r.redevelopmentDetail!.preApproval.apportionedAcquisition).toBe(SEC166_3);
    expect(r.inheritedHouseValuationDetail).toBeDefined();
  });
});
