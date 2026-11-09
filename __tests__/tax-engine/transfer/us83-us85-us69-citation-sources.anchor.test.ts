/**
 * anchor — §98 시리즈 리뷰 3단계 그룹 I(법령 인용): US-83 · US-85 · US-69 · US-82
 *
 * 인용이 실제 결과(step legalBasis)에 실리는지 고정한다. 세액은 바뀌지 않는다(인용만).
 * - US-83: 농특세 단계 근거 — 세액감면형 §5①1호 / 소득금액 차감형 §5①1호·③ + 시행령 §5②
 * - US-85: 감면주택 중과 배제 근거 — 세대 구성(주택 수·산입 권리 수)별 조문
 * - US-69: 경정청구 환급 단계 지방소득세 근거
 * - US-82: 조특령 §98 계열 사유 legalBasis가 상수 값과 같다
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { computeAmendment } from "@/lib/tax-engine/transfer-tax-amendment";
import { TRANSFER, MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";
import { UNSOLD_98_DECREE } from "@/lib/tax-engine/legal-codes/transfer-house";
import {
  surchargeExclusionBasis,
  findSurchargeExclusionBasis,
  SURCHARGE_EXCLUSION_STEP_LABEL,
} from "@/lib/tax-engine/surcharge-exclusion-basis";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const UNSOLD_987 = {
  type: "unsold_98_7" as const,
  contractDate987: new Date("2012-10-15"),
  acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true,
  isFirstContract987: true,
  isNotOccupiedAtContract987: true,
  isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000,
  standardPriceAt5Years987: 300_000_000,
  standardPriceAtTransfer987: 400_000_000,
};

const run = (transferDate: string) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2013-01-15"),
      transferDate: new Date(transferDate),
      householdHousingCount: 2,
      reductions: [UNSOLD_987],
    }),
    makeMockRates(),
  );

describe("US-83 농특세 단계 근거 — 경로별 상수", () => {
  it("5년 후(소득금액 차감형) → 법 §5①1호·③ + 시행령 §5②", () => {
    const r = run("2022-08-01");
    const step = r.steps.find((s) => s.label.includes("농어촌특별세"));
    expect(step?.legalBasis).toBe(TRANSFER.RURAL_SURTAX_DEDUCTION);
    expect(TRANSFER.RURAL_SURTAX_DEDUCTION).toBe("농어촌특별세법 §5①1호·③, 같은 법 시행령 §5②");
    expect(r.unsold987Detail?.ruralSurtax).toBe(9_171_000); // 세액 불변(p2-hybrid CH-2)
  });
  it("5년 이내(세액감면형) → 법 §5①1호", () => {
    const r = run("2016-08-01");
    const step = r.steps.find((s) => s.label.includes("농어촌특별세"));
    expect(step?.legalBasis).toBe(TRANSFER.RURAL_SURTAX_REDUCTION);
    expect(TRANSFER.RURAL_SURTAX_REDUCTION).toBe("농어촌특별세법 §5①1호");
  });
});

describe("US-85 감면주택 중과 배제 근거 — 세대 구성별", () => {
  const H = "소득세법 시행령 §167의3①5호";
  it.each([
    ["기본(세대 구성 미상)", undefined, `${H}·§167의10①2호`],
    ["2주택", { countedRightCount: 0, effectiveHouseCount: 2 }, `${H}·§167의10①2호`],
    ["3주택 이상 — 직접(§167의10①2호는 2주택 전용)", { countedRightCount: 0, effectiveHouseCount: 3 }, H],
    ["주택 1 + 권리 1", { countedRightCount: 1, effectiveHouseCount: 2 }, `${H}·§167의11①2호`],
    ["주택 + 권리 합 3 이상", { countedRightCount: 1, effectiveHouseCount: 3 }, `${H}·§167의4③2호`],
  ])("%s", (_l, h, expected) => {
    expect(surchargeExclusionBasis("unsold_98_3", h)).toBe(expected);
  });
  it("§98은 정의 조항이 3호(감면대상장기임대주택)", () => {
    expect(surchargeExclusionBasis("unsold_98", { countedRightCount: 0, effectiveHouseCount: 3 })).toBe(
      MULTI_HOUSE.TAX_INCENTIVE_RENTAL_3_BASIS,
    );
    expect(surchargeExclusionBasis("unsold_98", { countedRightCount: 1, effectiveHouseCount: 2 })).toBe(
      "소득세법 시행령 §167의3①3호·§167의11①2호",
    );
  });
  it("카드는 결과 steps의 STEP 0.45 근거를 그대로 읽는다", () => {
    const steps = [
      { label: "다른 단계", legalBasis: "x" },
      { label: SURCHARGE_EXCLUSION_STEP_LABEL, legalBasis: `${H}·§167의11①2호` },
    ];
    expect(findSurchargeExclusionBasis(steps)).toBe(`${H}·§167의11①2호`);
    expect(findSurchargeExclusionBasis([{ label: "다른 단계" }])).toBeUndefined();
    expect(findSurchargeExclusionBasis(undefined)).toBeUndefined();
  });
});

describe("US-69 경정청구 환급 단계 지방소득세 근거", () => {
  it("잘린 「지방세법 제103조의」가 아니라 §103의9①·§96① / 지방세기본법 §50", () => {
    const r = computeAmendment(
      {
        originalDeterminedTax: 50_000_000,
        correctionKind: "refund_claim",
        claimReasonType: "ordinary",
        applyUnderReportingPenalty: false,
        underReportingReason: "normal",
        underReductionMode: "exempt",
        applyLatePaymentPenalty: false,
      },
      30_000_000,
    );
    const step = r.steps.find((s) => s.label.includes("지방소득세 환급"));
    expect(step?.legalBasis).toBe(TRANSFER.LOCAL_INCOME_TAX_CLAIM);
    expect(TRANSFER.LOCAL_INCOME_TAX_CLAIM).toBe("지방세법 §103의9①·§96①, 지방세기본법 §50");
    expect(step?.legalBasis).not.toBe("지방세법 제103조의");
    expect(r.refundLocalIncomeTax).toBe(2_000_000); // 세액 불변
  });
});

describe("US-82 조특령 §98 계열 legalBasis = 상수", () => {
  it("령 조번호는 법과 한 칸씩 어긋난다 — 값은 령 조번호", () => {
    expect(UNSOLD_98_DECREE.D98_5_ALLOC).toBe("조특령 §98의4③");
    expect(UNSOLD_98_DECREE.D98_6_ALLOC).toBe("조특령 §98의5④");
    expect(UNSOLD_98_DECREE.D98_7_ALLOC).toBe("조특령 §98의6④");
    expect(UNSOLD_98_DECREE.D98_3_ALLOC).toBe("조특령 §98의3③");
  });
  it("§98 계열 평가기에 legalBasis 조특령 §98·§98의2~§98의6 문자열 리터럴이 남지 않는다(상수만)", () => {
    const dir = path.resolve(__dirname, "../../../lib/tax-engine/transfer-reductions");
    for (const f of ["unsold-98-3", "unsold-98-5", "unsold-98-6", "unsold-hybrid", "unsold-hybrid-p4", "unsold-hybrid-p5", "unsold-98-period-gates"]) {
      const src = fs.readFileSync(path.join(dir, `${f}.ts`), "utf8");
      expect(src, f).not.toMatch(/[lL]egalBasis: "조특령 §(98|40)/);
    }
  });
});
