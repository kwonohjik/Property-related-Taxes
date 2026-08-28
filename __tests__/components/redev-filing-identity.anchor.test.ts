/**
 * anchor: 재개발 신고서 양식이 **위에서 아래로 검산된다** (결과탭 코드리뷰 Lane 3 · V3 — #010 #024 #025).
 *
 * ## 두 항등식
 *
 *   (1) 양도가액 − 취득가액 − 필요경비 = 「전체 양도차익」 행
 *   (2) 「전체 양도차익」 = 「비과세 양도차익」 + 「과세대상 양도차익」  (열마다·합계 모두)
 *
 * ## 무엇이 깨져 있었나
 *
 * · #010 #024 — 합계 취득가액 역산이 분기 `gain`(12억 안분 **후** 과세대상)을 base로 썼다.
 *   그런데 바로 위 「전체 양도차익」 행은 `gainBeforeAllocation`(안분 **전**) 합이다.
 *   실측(재개발APT·1세대1주택 20억): 2,000,000,000 − 1,317,112,601 − 0 = 682,887,399인데
 *   다음 행이 1,707,218,500 — **비과세 양도차익만큼**(1,024,331,101) 어긋났다.
 *
 * · 청산금 **수령** 동시신고(사례 47)는 신고 단위가 **두 개의 양도**인데 폼 양도가액은 신축APT
 *   분만 담는다. 그대로 역산하면 취득가액이 **음수**(−100,000,000)가 된다.
 *   ⇒ 엔진이 `settlementSeparateConsideration`을 echo하고 표시 계층이 합계에 더한다.
 *
 * · #025 — §89①4호 청산금 비과세액(70,000,000)이 「비과세 양도차익」 행에 없었다. 붉은 주석
 *   문장으로만 남아 (2)가 정확히 그만큼 깨졌다.
 *
 * ## 검산 (두 격자 모두 역산값이 납세자의 실제 취득원가와 일치한다)
 *
 *   G1 292,781,500 = 실가 200,000,000 + 납부청산금 92,781,500
 *   G2 100,000,000 = 실가 100,000,000 (청산금은 수령이라 취득원가가 아니다)
 *
 * 법령: 소득세법 시행령 §166 (단계별 의제) · §160 12억 초과 안분 · 소득세법 §89①4호
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import {
  case44RedevelopmentInfo,
  case47RedevelopmentInfo,
} from "../tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();

interface Grid {
  id: string;
  input: TransferTaxInput;
  subject: "apt" | "right";
  dir: "pay" | "receive";
  price: number;
  tDate: string;
  aDate: string;
  /** 12억 안분이 실제로 걸리는 격자인가 — 구별력 가드(I-0)가 확인한다. */
  allocated: boolean;
  /** 역산 취득가액 실측 고정 = 납세자의 실제 취득원가 */
  expectedAcq: number;
}

const GRIDS: Grid[] = [
  {
    id: "G1 apt+pay · 1세대1주택 20억 (12억 안분)",
    subject: "apt", dir: "pay", price: 2_000_000_000,
    tDate: "2026-02-16", aDate: "2002-04-09", allocated: true,
    expectedAcq: 292_781_500, // 실가 200,000,000 + 납부청산금 92,781,500
    input: baseTransferInput({
      expenses: 0, propertyType: "redevelopment_apt",
      transferPrice: 2_000_000_000, transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2002-04-09"), acquisitionPrice: 200_000_000,
      useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1,
      residencePeriodMonths: 252, redevelopment: case44RedevelopmentInfo(),
    } as Partial<TransferTaxInput>),
  },
  {
    id: "G2 C47 apt+receive · 청산금 수령 동시신고 (12억 안분 + §89①4호)",
    subject: "apt", dir: "receive", price: 2_000_000_000,
    tDate: "2022-03-01", aDate: "2001-01-01", allocated: true,
    expectedAcq: 100_000_000, // 실가 그대로 — 수령 청산금은 취득원가가 아니다
    input: baseTransferInput({
      expenses: 0, propertyType: "redevelopment_apt",
      transferPrice: 2_000_000_000, transferDate: new Date("2022-03-01"),
      acquisitionDate: new Date("2001-01-01"), acquisitionPrice: 100_000_000,
      useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1,
      residencePeriodMonths: 252, redevelopment: case47RedevelopmentInfo(),
    } as Partial<TransferTaxInput>),
  },
  {
    id: "G3 대조군 C44 apt+pay · 2주택 (안분 없음)",
    subject: "apt", dir: "pay", price: 525_000_000,
    tDate: "2026-02-16", aDate: "2002-04-09", allocated: false,
    expectedAcq: 292_781_500,
    input: baseTransferInput({
      expenses: 0, propertyType: "redevelopment_apt",
      transferPrice: 525_000_000, transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2002-04-09"), acquisitionPrice: 200_000_000,
      useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2,
      residencePeriodMonths: 0, redevelopment: case44RedevelopmentInfo(),
    } as Partial<TransferTaxInput>),
  },
];

const BRANCH_COLS = ["preApproval", "postApprovalExistingHouse", "settlement"] as const;

function cards(g: Grid) {
  const result = calculateTransferTax(g.input, rates);
  const { mode } = deriveColumns(result, undefined, g.subject, g.dir);
  const fd = {
    transferDate: g.tDate,
    filingDate: "2026-04-30",
    contractTotalPrice: String(g.price),
    assets: [{ ...makeDefaultAsset(1), acquisitionDate: g.aDate }],
  } as unknown as TransferFormData;
  const rows = buildRows(result, mode, fd) as never as {
    label: string;
    values: Record<string, unknown>;
  }[];
  const n = (label: string, col = "total") => {
    const row = rows.find((x) => x.label === label);
    expect(row, `행 「${label}」이 없다`).toBeDefined();
    return Number((row!.values[col] as number) ?? 0);
  };
  const items = buildStatementItems(result, fd, undefined, undefined, undefined);
  return {
    result,
    n,
    stmt: {
      transfer: Number(items.get("transferPrice")?.value ?? 0),
      acq: Number(items.get("acquisitionPrice")?.value ?? 0),
      exp: Number(items.get("expenses")?.value ?? 0),
      gain: Number(items.get("transferGain")?.value ?? 0),
      exempt: Number(items.get("exemptGain")?.value ?? 0),
      taxable: Number(items.get("taxableGain")?.value ?? 0),
    },
  };
}

// ── I-0 구별력 ───────────────────────────────────────────────────────
describe("I-0 격자 — 12억 안분·§89①4호가 실제로 걸린다", () => {
  for (const g of GRIDS) {
    it(`${g.id}`, () => {
      const d = cards(g).result.redevelopmentDetail!;
      const before =
        (d.preApproval.gainBeforeAllocation ?? d.preApproval.gain) +
        (d.postApprovalExistingHouse.gainBeforeAllocation ?? d.postApprovalExistingHouse.gain) +
        (d.settlement.gainBeforeAllocation ?? d.settlement.gain);
      const after = d.preApproval.gain + d.postApprovalExistingHouse.gain + d.settlement.gain;
      if (g.allocated) {
        expect(before, "안분이 없으면 두 base가 같아 이 anchor는 아무것도 구별하지 못한다").toBeGreaterThan(after);
      } else {
        expect(before).toBe(after);
      }
    });
  }

  it("G2는 §89①4호 청산금 비과세가 실제로 발동한다 (#025의 전제)", () => {
    const d = cards(GRIDS[1]).result.redevelopmentDetail!;
    expect(d.settlementExemptionApplied).toBe(true);
    expect(d.exemptedGain ?? 0).toBeGreaterThan(0);
    expect(d.settlement.gain, "마스킹돼 과세대상이 0이다").toBe(0);
  });
});

// ── I-1 항등식 (1) ───────────────────────────────────────────────────
describe("I-1 신고서 합계 — 양도가액 − 취득가액 − 필요경비 = 전체 양도차익", () => {
  for (const g of GRIDS) {
    it(`${g.id}`, () => {
      const { n } = cards(g);
      expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
    });
  }
});

// ── I-2 항등식 (2) ───────────────────────────────────────────────────
describe("I-2 신고서 — 전체 양도차익 = 비과세 + 과세대상", () => {
  for (const g of GRIDS) {
    it(`${g.id} — 합계 열`, () => {
      const { n } = cards(g);
      expect(n("비과세 양도차익") + n("과세대상 양도차익")).toBe(n("전체 양도차익"));
    });

    it(`${g.id} — 분기 열마다`, () => {
      const { n } = cards(g);
      for (const col of BRANCH_COLS) {
        expect(
          n("비과세 양도차익", col) + n("과세대상 양도차익", col),
          `${col} 열이 어긋난다`,
        ).toBe(n("전체 양도차익", col));
      }
    });
  }
});

// ── I-3 두 카드 일치 ─────────────────────────────────────────────────
describe("I-3 신고서 ↔ 계산명세서", () => {
  for (const g of GRIDS) {
    it(`${g.id} — 양도가액·취득가액·필요경비·전체 양도차익·비과세·과세대상`, () => {
      const { n, stmt } = cards(g);
      expect(stmt.transfer).toBe(n("양도가액"));
      expect(stmt.acq).toBe(n("취득가액"));
      expect(stmt.exp).toBe(n("필요경비"));
      expect(stmt.gain).toBe(n("전체 양도차익"));
      expect(stmt.exempt).toBe(n("비과세 양도차익"));
      expect(stmt.taxable).toBe(n("과세대상 양도차익"));
    });

    it(`${g.id} — 명세서도 자기일관`, () => {
      const { stmt } = cards(g);
      expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
    });
  }
});

// ── I-4 역산값이 실제 취득원가와 같다 ────────────────────────────────
describe("I-4 역산 취득가액 = 납세자의 실제 취득원가", () => {
  for (const g of GRIDS) {
    it(`${g.id} → ${g.expectedAcq.toLocaleString()}`, () => {
      const acq = cards(g).n("취득가액");
      // ⚠️ I-1만으로는 부족하다 — 청산금 echo를 빼도 항등식은 「양도가 − (−100,000,000) = 차익」으로
      //   여전히 성립한다. 「음수 취득가액」이 화면에 나오는 것이 실제 결함이므로 따로 못박는다.
      expect(acq, "취득가액이 음수면 서식으로 성립하지 않는다").toBeGreaterThan(0);
      expect(acq).toBe(g.expectedAcq);
    });
  }
});
