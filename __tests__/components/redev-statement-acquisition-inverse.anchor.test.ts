/**
 * 재개발 계산명세서 취득가액·필요경비 — 신고서 양식과 동일 기준 통일 anchor.
 *
 * 계획서: docs/02-design/features/redev-statement-acquisition-inverse.plan.md
 *
 * 결함: 신고서 양식은 합계 취득가액을 **역산**(양도 − 경비 − 차익)으로 얻는데
 *   계산명세서는 **파트 합**(sumAcq)을 썼다. §166은 파트가 단계별 의제라 파트 합이
 *   실제 취득가액이 아니므로, 같은 화면에서 두 카드가 취득가액을 다르게 표시했다
 *   (C44 실측: 292,781,500 vs 512,000,000). 필요경비도 어긋나 있었다
 *   (명세서는 개산공제만, 신고서는 분할별 합).
 *
 * 법령: 소득세법 시행령 §166 — 파트는 단계별 의제(인가전 = 권리가액 의제 등)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import {
  case44RedevelopmentInfo,
  case45RedevelopmentInfo,
  case46RedevelopmentInfo,
  case47RedevelopmentInfo,
} from "../tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();

interface Scenario {
  id: string;
  input: TransferTaxInput;
  subject: "apt" | "right";
  dir: "pay" | "receive";
  price: number;
  tDate: string;
  aDate: string;
  /** 기대 취득가액 — 실측 고정 */
  expectedAcq: number;
  /** 기대 필요경비 — 실측 고정 */
  expectedExp: number;
}

const mk = (
  id: string,
  o: Partial<TransferTaxInput> & { redevelopment: RedevelopmentInfo },
  subject: "apt" | "right", dir: "pay" | "receive",
  price: number, tDate: string, aDate: string,
  expectedAcq: number, expectedExp: number,
): Scenario => ({ id, subject, dir, price, tDate, aDate, expectedAcq, expectedExp, input: baseTransferInput({ expenses: 0, ...o }) });

const SCENARIOS: Scenario[] = [
  mk("S1 C44 apt+pay", { propertyType: "redevelopment_apt", transferPrice: 525_000_000, transferDate: new Date("2026-02-16"), acquisitionDate: new Date("2002-04-09"), acquisitionPrice: 200_000_000, useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0, redevelopment: case44RedevelopmentInfo() },
    "apt", "pay", 525_000_000, "2026-02-16", "2002-04-09", 292_781_500, 0),
  mk("S2 C45 apt+pay", { propertyType: "redevelopment_apt", transferPrice: 900_000_000, transferDate: new Date("2024-01-26"), acquisitionDate: new Date("2002-04-09"), acquisitionPrice: 200_000_000, useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0, redevelopment: case45RedevelopmentInfo() },
    // 🔴 2026-08-25 기대값 정정 (E1-03) — 432,000,000 → 491,000,000.
    //    사례 45는 인가후양도차익이 **음수**인 케이스다:
    //      분양가 950,000,000(= 권리가액 650,000,000 + 납부청산금 300,000,000)
    //      인가후양도차익 = 900,000,000 − 950,000,000 − 인가후 필요경비 9,000,000 = **−59,000,000**
    //    종전 `splitAptPay`는 이 음수를 0으로 clamp해 통째로 버렸고, 그만큼 양도차익이 부풀어
    //    **역산 취득가액이 59,000,000 낮게** 나왔다. 차이가 정확히 그 금액이다.
    //    §166②1호는 clamp 없는 대수적 합이므로 음수가 흘러야 하고, 그 결과 역산 취득가액은
    //    실제 취득가액(실가 200,000,000 + 납부청산금 300,000,000 = 500,000,000)에 **더 가까워진다**.
    // 🔴 2026-08-26 2차 정정 (E1-06) — 491,000,000/18,000,000 → 500,000,000/**9,000,000**.
    //    인가후 필요경비 9,000,000이 기존주택분·청산금분 **두 열에 각각 전액** 붙어 있었다
    //    (§166②1호는 나누기 **전에** 한 번만 차감한다). 합계 필요경비가 정확히 2배였고,
    //    역산 취득가액은 그만큼 낮게 나왔다.
    //    ⇒ 정정 후 역산값이 **실제 취득가액과 정확히 일치**한다:
    //      실가 200,000,000 + 납부청산금 300,000,000 = **500,000,000**.
    //      위 E1-03 주석이 「더 가까워진다」고 적어 둔 방향의 나머지 9,000,000이 이것이었다.
    "apt", "pay", 900_000_000, "2024-01-26", "2002-04-09", 500_000_000, 9_000_000),
  mk("S3 C47 apt+receive", { propertyType: "redevelopment_apt", transferPrice: 2_000_000_000, transferDate: new Date("2022-03-01"), acquisitionDate: new Date("2001-01-01"), acquisitionPrice: 100_000_000, useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 252, redevelopment: case47RedevelopmentInfo() },
    "apt", "receive", 2_000_000_000, "2022-03-01", "2001-01-01", 1_230_000_000, 0),
  mk("S4 C38 right+receive", { propertyType: "right_to_move_in", transferPrice: 320_000_000, transferDate: new Date("2023-03-02"), acquisitionDate: new Date("2009-04-09"), acquisitionPrice: 180_000_000, useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    redevelopment: { subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2016-10-23"), rightsValue: 300_000_000, settlementDirection: "receive", settlementAmount: 50_000_000, settlementSaleDate: new Date("2023-03-02"), preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing", acquisitionRounding: "floor" } },
    "right", "receive", 320_000_000, "2023-03-02", "2009-04-09", 150_000_000, 0),
  mk("S5 C46 receiveOnly", { propertyType: "redevelopment_apt", transferPrice: 500_000_000, transferDate: new Date("2023-02-17"), acquisitionDate: new Date("2016-05-06"), acquisitionPrice: 400_000_000, useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 0, redevelopment: case46RedevelopmentInfo() },
    "apt", "receive", 500_000_000, "2023-02-17", "2016-05-06", 133_333_333, 0),
  // S6·S7 — 취득가액은 **불변**, 필요경비만 정정된다(계획서 V-6)
  mk("S6 C37 land 출자", { propertyType: "right_to_move_in", transferPrice: 520_000_000, transferDate: new Date("2023-03-02"), acquisitionDate: new Date("2007-04-09"), acquisitionPrice: 0, useEstimatedAcquisition: true, isOneHousehold: false, householdHousingCount: 0, householdRightCount: 1, residencePeriodMonths: 0,
    redevelopment: { subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2014-10-23"), rightsValue: 300_000_000, settlementDirection: "pay", settlementAmount: 100_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "land", landStdPriceAtAcq: 100_000_000, landStdPriceAtApproval: 150_000_000, acquisitionRounding: "floor" } },
    "right", "pay", 520_000_000, "2023-03-02", "2007-04-09", 200_000_000, 103_000_000),
  mk("S7 C48 승계조합원", { propertyType: "redevelopment_apt", transferPrice: 920_000_000, transferDate: new Date("2023-02-16"), acquisitionDate: new Date("2020-04-15"), acquisitionPrice: 450_000_000, useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 0,
    redevelopment: { subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2020-10-23"), rightsValue: 450_000_000, settlementDirection: "pay", settlementAmount: 0, preApprovalExpenses: 0, postApprovalExpenses: 150_000_000, originalAssetType: "housing", completionDate: new Date("2022-12-02"), isSuccessorMember: true } },
    "apt", "pay", 920_000_000, "2023-02-16", "2020-04-15", 450_000_000, 150_000_000),
];

const fd = (s: Scenario): TransferFormData => ({
  transferDate: s.tDate, filingDate: "2026-04-30", contractTotalPrice: String(s.price),
  assets: [{ ...makeDefaultAsset(1), acquisitionDate: s.aDate }],
} as unknown as TransferFormData);

function cards(s: Scenario) {
  const result = calculateTransferTax(s.input, rates);
  const { mode } = deriveColumns(result, undefined, s.subject, s.dir);
  const rows = buildRows(result, mode, fd(s));
  const g = (l: string) => {
    const r = rows.find((x) => x.label === l);
    const v = r?.values["total" as keyof typeof r.values];
    return typeof v === "number" ? v : 0;
  };
  const items = buildStatementItems(result, fd(s), undefined, undefined, undefined);
  return {
    result,
    filing: { transfer: g("양도가액"), acq: g("취득가액"), exp: g("필요경비") },
    stmt: {
      transfer: Number(items.get("transferPrice")?.value ?? 0),
      acq: Number(items.get("acquisitionPrice")?.value ?? 0),
      exp: Number(items.get("expenses")?.value ?? 0),
      gain: Number(items.get("transferGain")?.value ?? 0),
    },
  };
}

describe("재개발 명세서 — 취득가액·필요경비를 신고서와 같은 기준으로", () => {
  for (const s of SCENARIOS) {
    it(`${s.id} — A-1~A-4·A-7 명세서 취득가액 = ${s.expectedAcq.toLocaleString()} · 필요경비 = ${s.expectedExp.toLocaleString()}`, () => {
      const { stmt } = cards(s);
      expect(stmt.acq).toBe(s.expectedAcq);
      expect(stmt.exp).toBe(s.expectedExp);
    });

    it(`${s.id} — A-6 두 카드 취득가액·필요경비 일치`, () => {
      const { filing, stmt } = cards(s);
      expect(stmt.acq).toBe(filing.acq);
      expect(stmt.exp).toBe(filing.exp);
      expect(stmt.transfer).toBe(filing.transfer);
    });

    it(`${s.id} — A-5 명세서 자기일관 (양도 − 취득 − 경비 == 차익)`, () => {
      const { stmt } = cards(s);
      expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
    });
  }

  // ★ M-3 실측(2026-08-24): `redevBranchTotals`의 승계조합원 분기를 제거해도 anchor가 울리지 않았다.
  //   원인은 **엔진이 승계 시 인가전·청산금을 0으로 강제**하기 때문이다(사례 48 실측:
  //   preApproval {exp 0, gain 0} · settlement {exp 0, gain 0}) — 「인가후 분만」과 「전체 합」이 같은 값이 된다.
  //   ⇒ 그 분기는 **방어적 중복**이다. 분기 자체는 anchor로 구별할 수 없으므로,
  //     대신 **그것이 no-op이게 만드는 엔진 계약**을 여기서 고정한다. 계약이 깨지면 이 anchor가 잡는다.
  it("A-9 승계조합원 — 엔진이 인가전·청산금 분을 0으로 강제한다 (분기 no-op의 전제)", () => {
    const s = SCENARIOS.find((x) => x.id.startsWith("S7"))!;
    const d = calculateTransferTax(s.input, rates).redevelopmentDetail!;
    expect(d.successorMemberApplied).toBe(true);
    expect(d.preApproval.expenses ?? 0).toBe(0);
    expect(d.preApproval.gain).toBe(0);
    expect(d.settlement.expenses ?? 0).toBe(0);
    expect(d.settlement.gain).toBe(0);
  });

  it("A-8 신고서 양식은 전 케이스 자기일관 (회귀 가드 — 정본이 흔들리지 않는다)", () => {
    for (const s of SCENARIOS) {
      const { result, filing } = cards(s);
      expect(filing.transfer - filing.acq - filing.exp).toBe(result.transferGain);
    }
  });
});
