/**
 * 양도소득세 결과뷰 리뷰(2026-11-21) MAJOR 묶음 m6-redev — 재개발·입주권 결과 블록 anchor (세액 불변 · 표시만).
 *
 * | R-id | 수정 전 실측 |
 * |---|---|
 * | R-c05-05 | 개산공제 산식이 없는 조문 「시행령 §164④ 라목」을 인용 · 토지만 제공한 완공 APT(환산)도 「개별주택가격」으로 적음 |
 * | R-c05-06 | 입주권 분할 산식이 완공 APT 납부 문구로 떨어짐 — 납부 「520,000,000 × (300,000,000 ÷ 400,000,000) = 0」 ·
 * |          | 「520,000,000 − 0 = 220,000,000」 · 「②」 두 행 · 수령 「의제 양도가액 = 권리가액 = 200,000,000」(권리가액은 3억) ·
 * |          | 「의제 = 청산금 = 200,000,000」(청산금은 1억) · 「실제 취득가액 = 66,666,666 (실가 모드)」(안분값) |
 * | R-c08-01 | 입주권 납부 카드 ①·② 열에 필요경비 행 없음 — 500,000,000 − 200,000,000 ≠ 290,000,000 · 200,000,000 − 50,000,000 ≠ 145,000,000 |
 * | R-c08-02 | 입주권 수령(실가) 인가전 블록에 필요경비 행 없음 — 450,000,000 − 180,000,000 ≠ 261,000,000(9,000,000 누락) |
 * | R-c08-03 | 수령 안내 카드가 가목을 「청산금 수령액 − 안분 취득가액」(엔진이 폐기한 산식)으로 적음 |
 * | R-c08-05 | 표2 단일축(2020.12.31. 이전 양도 · 보유 연 8%)과 환산 표2를 「표1 40.0%」로 표시 |
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { runRedevelopment } from "@/lib/tax-engine/redevelopment";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { buildRedevPerAssetForTransfer } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { buildRedevPerAssetForAcquisition } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { buildRedevPerAssetForExpense } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { buildRedevPerAssetForGain } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);
const rates = makeMockRates();
const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 입주권(원조합원 · 주택 제공) — 실가는 화면 경로(calculateTransferTax) 그대로 */
function right(dir: "pay" | "receive", o: { rights: number; settle: number; tp: number; acq: number; pre?: number; post?: number; est?: boolean }) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "right_to_move_in", transferPrice: o.tp, transferDate: new Date("2023-03-02"), acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: o.acq, expenses: 0, useEstimatedAcquisition: o.est ?? false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      redevelopment: {
        subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2018-10-23"), rightsValue: o.rights,
        settlementDirection: dir, settlementAmount: o.settle, preApprovalExpenses: o.pre ?? 0, postApprovalExpenses: o.post ?? 0,
        originalAssetType: "housing", receiveOnlyMode: false, exemptionEligibleAtApproval: false,
        ...(o.est ? { housingStdPriceAtAcq: 120_000_000, housingStdPriceAtApproval: 200_000_000, managementDisposalHousingPrice: 300_000_000, acquisitionHousingPrice: 120_000_000 } : {}),
      },
    }),
    rates,
  ).redevelopmentDetail!;
}
const card = (d: RedevelopmentResult, dir: "pay" | "receive") =>
  render(<RedevelopmentDetailCard detail={d} subject="right" settlementDirection={dir} />).container.textContent ?? "";

const PAY = right("pay", { rights: 300_000_000, settle: 100_000_000, tp: 520_000_000, acq: 100_000_000 });
const RECV = right("receive", { rights: 300_000_000, settle: 100_000_000, tp: 520_000_000, acq: 100_000_000 });
const RECV_EST = right("receive", { rights: 300_000_000, settle: 100_000_000, tp: 520_000_000, acq: 100_000_000, est: true });
const PAY_EST = right("pay", { rights: 300_000_000, settle: 100_000_000, tp: 520_000_000, acq: 100_000_000, est: true });

describe("R-c05-06 입주권 분할 산식 — §166①1호·2호 구조", () => {
  it("납부: 인가후 기존건물분(0) 행이 없고 ② 한 행 · 산식이 값을 만든다", () => {
    const t = buildRedevPerAssetForTransfer(PAY, 520_000_000, "right", "pay");
    const a = buildRedevPerAssetForAcquisition(PAY, "right", "pay");
    expect(t.map((r) => r.label.slice(0, 2))).toEqual(["① ", "② "]);
    expect(t[1].formula).toContain(`양도가액 ${fmt(520_000_000)} − 평가액 ${fmt(300_000_000)} = ${fmt(220_000_000)}`);
    expect(a[1].formula).toContain(`납부한 청산금 = ${fmt(100_000_000)}`);
    for (const r of [...t, ...a]) {
      expect(String(r.formula)).not.toContain("분양가 안분");
      expect(String(r.formula)).not.toContain("의제 =");
    }
  });
  it("수령(실가): 인가전 의제 양도가액은 평가액 − 청산금 · 취득가액은 나목 안분 · 인가후 분 취득가액은 평가액 − 청산금", () => {
    const t = buildRedevPerAssetForTransfer(RECV, 520_000_000, "right", "receive");
    const a = buildRedevPerAssetForAcquisition(RECV, "right", "receive");
    expect(t).toHaveLength(2);
    expect(t[1].label.startsWith("② 인가후 분")).toBe(true);
    expect(t[0].formula).toContain(`평가액 − 지급받은 청산금 = ${fmt(200_000_000)}`);
    expect(t[0].formula).not.toContain("권리가액 =");
    expect(t[1].formula).toContain(`양도가액 = ${fmt(520_000_000)}`);
    expect(a[0].formula).toContain(`종전 취득가액 × (평가액 − 지급받은 청산금) ÷ (평가액) = ${fmt(66_666_666)}`);
    expect(a[0].formula).not.toContain("실가 모드");
    expect(a[1].formula).toContain(`평가액 − 지급받은 청산금 = ${fmt(200_000_000)}`);
    expect(a[1].formula).not.toContain("의제 =");
  });
  it("수령(환산): 「권리가액 ×」 자리에 평가액 − 청산금을 쓰지 않는다 — §166③ 원액 뒤 나목 안분", () => {
    const a = buildRedevPerAssetForAcquisition(RECV_EST, "right", "receive");
    expect(RECV_EST.housingContribDetail?.convertedAcquisition).toBe(180_000_000);
    expect(a[0].formula).toContain(`환산취득가 ${fmt(180_000_000)}`);
    expect(a[0].formula).toContain(`= ${fmt(120_000_000)}`);
    expect(a[0].formula).not.toContain(`환산취득가 = ${fmt(200_000_000)}`);
  });
  it("양도차익 행 수 = 양도가액 행 수 (같은 2행 구조)", () => {
    expect(buildRedevPerAssetForGain(PAY, "right", "pay")).toHaveLength(2);
    expect(buildRedevPerAssetForGain(RECV, "right", "receive")).toHaveLength(2);
  });
});

describe("R-c05-05 개산공제 근거 — 시행령 §163⑥ 1호(토지)·2호 가목(주택)", () => {
  it("주택 제공(환산) — §163⑥2호 가목 · §164④ 인용 없음", () => {
    const e = buildRedevPerAssetForExpense(PAY_EST, "right", "pay");
    expect(e[0].formula).toContain(REDEVELOPMENT.LUMP_DEDUCTION_HOUSE);
    expect(e[0].formula).not.toContain("§164④");
    expect(e[0].formula).toContain(`${fmt(120_000_000)} × 3% = ${fmt(3_600_000)}`);
  });
  it("토지만 제공한 완공 APT(환산) — 개별공시지가 · §163⑥1호", () => {
    const d = runRedevelopment({
      redevelopment: {
        subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2013-10-23"), rightsValue: 300_000_000,
        settlementDirection: "pay", settlementAmount: 50_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "land",
        landStdPriceAtAcq: 100_000_000, landStdPriceAtApproval: 200_000_000,
      },
      acquisitionDate: new Date("2008-04-09"), transferDate: new Date("2023-03-02"), transferPrice: 420_000_000, useEstimatedAcquisition: true,
    } as Parameters<typeof runRedevelopment>[0]);
    expect(d.landContribDetail).toBeUndefined();
    const e = buildRedevPerAssetForExpense(d, "apt", "pay");
    expect(e[0].formula).toContain(REDEVELOPMENT.LUMP_DEDUCTION_LAND);
    expect(e[0].formula).toContain("개별공시지가");
    expect(e[0].formula).not.toContain("개별주택가격");
  });
});

const C08_PAY = right("pay", { rights: 500_000_000, settle: 50_000_000, tp: 700_000_000, acq: 200_000_000, pre: 10_000_000, post: 5_000_000 });
const C08_RECV = right("receive", { rights: 500_000_000, settle: 50_000_000, tp: 700_000_000, acq: 200_000_000, pre: 10_000_000, post: 5_000_000 });

describe("R-c08-01 입주권 납부 카드 — 열마다 필요경비 행", () => {
  it("엔진 열 잔액 0 · ① 10,000,000 · ② 5,000,000 행이 보인다", () => {
    for (const c of [C08_PAY.preApproval, C08_PAY.settlement]) {
      expect(c.apportionedTransfer - c.apportionedAcquisition - (c.expenses ?? 0) - c.gain).toBe(0);
    }
    const t = card(C08_PAY, "pay");
    expect(t).toContain(`필요경비${fmt(10_000_000)}`);
    expect(t).toContain(`인가후 필요경비${fmt(5_000_000)}`);
  });
});

describe("R-c08-02 입주권 수령(실가) 인가전 블록 — 안분 필요경비 행", () => {
  it("9,000,000 행이 보이고 450,000,000 − 180,000,000 − 9,000,000 = 261,000,000", () => {
    const p = C08_RECV.preApproval;
    expect([p.apportionedTransfer, p.apportionedAcquisition, p.expenses, p.gain]).toEqual([450_000_000, 180_000_000, 9_000_000, 261_000_000]);
    expect(card(C08_RECV, "receive")).toContain(`− 필요경비(안분 후)${fmt(9_000_000)}`);
  });
  it("필요경비가 없으면 행도 없다", () => {
    expect(card(RECV, "receive")).not.toContain("− 필요경비(안분 후)");
  });
});

describe("R-c08-03 입주권 수령 안내 카드 — 가목 = 인가후 분", () => {
  it("가목 정의가 블록과 같고 폐기 산식·「보수적 적용」이 없다", () => {
    const t = card(RECV, "receive");
    expect(t).toContain("가목 (인가후 분):");
    expect(t).toContain("양도가액 − (평가액 − 지급받은 청산금) − 필요경비");
    expect(t).not.toContain("청산금 수령액 − 안분 취득가액");
    expect(t).not.toContain("보수적 적용");
    expect(t).not.toContain("§166①1호 산식 구조");
  });
});

describe("R-c08-05 입주권 수령 인가전 블록 — 표1/표2 라벨", () => {
  const run = (est: boolean, transferDate: string, res: number) =>
    runRedevelopment({
      redevelopment: {
        subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2018-10-23"), rightsValue: 500_000_000,
        settlementDirection: "receive", settlementAmount: 50_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing",
        receiveOnlyMode: false, priorHouseResidenceMonths: res,
        ...(est ? { housingStdPriceAtAcq: 120_000_000, housingStdPriceAtApproval: 200_000_000, managementDisposalHousingPrice: 300_000_000, acquisitionHousingPrice: 120_000_000 } : {}),
      },
      acquisitionDate: new Date("2013-04-09"), transferDate: new Date(transferDate), transferPrice: 1_500_000_000,
      actualAcquisitionPrice: est ? undefined : 200_000_000, useEstimatedAcquisition: est, isOneHouseSingle: true,
      residencePeriodMonths: res, priorHouseResidenceMonths: res,
    } as Parameters<typeof runRedevelopment>[0]);
  const label = (d: RedevelopmentResult) => card(d, "receive").match(/장기보유공제 \(([^·]*)·/)?.[1]?.trim();
  const cases: [string, boolean, string, number, string][] = [
    ["실가 · 2019 양도 · 표2 보유만", false, "2019-06-01", 0, "표2 40.0%"],
    ["환산 · 2019 양도 · 표2 보유만", true, "2019-06-01", 0, "표2 40.0%"],
    ["실가 · 2023 양도 · 거주 60개월", false, "2023-06-01", 60, "표2 40.0%"],
    ["환산 · 2023 양도 · 거주 60개월", true, "2023-06-01", 60, "표2 40.0%"],
    ["실가 · 2023 양도 · 거주 0 → 표1", false, "2023-06-01", 0, "표1 10.0%"],
  ];
  it.each(cases)("%s → %s", (_n, est, td, res, expected) => {
    expect(label(run(est, td, res))).toBe(expected);
  });
  it("환산 거주분 echo — 보유분 + 거주분 = 공제액 · 실가와 같은 비율", () => {
    const est = run(true, "2023-06-01", 60).preApproval;
    expect((est.lthdHoldingPart ?? 0) + (est.lthdResidencePart ?? 0)).toBe(est.lthd);
    expect(est.lthdResidencePart).toBeGreaterThan(0);
    const act = run(false, "2023-06-01", 60).preApproval;
    expect(act.lthdResidencePart).toBe(act.lthdHoldingPart);
    expect(est.lthdResidencePart).toBe(est.lthdHoldingPart);
  });
});

describe("R-c08-05 형제 경로 — 토지만 제공한 입주권(환산) 명세서 보유분 행의 표 근거", () => {
  it("2019 양도 · 표2 단일축 → 「표2」 근거", async () => {
    const { applyRedevelopmentOverrides } = await import("@/components/calc/results/transfer/DetailedStatementRedevOverrides");
    const d = runRedevelopment({
      redevelopment: {
        subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2018-10-23"), rightsValue: 500_000_000,
        settlementDirection: "pay", settlementAmount: 50_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "land",
        landStdPriceAtAcq: 100_000_000, landStdPriceAtApproval: 200_000_000, landHouseholdOwnedBuilding: true,
      },
      acquisitionDate: new Date("2013-04-09"), transferDate: new Date("2019-06-01"), transferPrice: 1_500_000_000,
      useEstimatedAcquisition: true, isOneHouseSingle: true, residencePeriodMonths: 0,
    } as Parameters<typeof runRedevelopment>[0]);
    expect(d.landContribDetail).toBeDefined();
    expect(d.preApproval.lthdHoldingOnlyTable2).toBe(true);
    const item = { key: "ltHoldingPart", label: "", value: 0 } as unknown as import("@/components/calc/results/transfer/DetailedStatementHelpers").StatementItem;
    const items = new Map([["ltHoldingPart", item]]);
    applyRedevelopmentOverrides(items, d, 1_500_000_000, "right", "pay");
    expect(item.legalBasis).toContain("표2");
  });
});
