/**
 * 표시층 — 인쇄 잘림·원시 분수·거짓 등식·맥락 없는 안내 (W14 · RC-M·SC-O).
 *
 * 세액은 맞는데 화면·인쇄물이 틀린 것들이다. 공통 원인은 두 가지다:
 *   ① **UI가 엔진 값을 다시 계산**한다(SC-O — 반올림한 지분율로 재곱셈).
 *   ② **엔진의 내부 표현을 그대로 찍는다**(RC-5-a — 약분 전 원시 분수가 13자리라 열이 A4를 넘는다).
 *
 * ✅ **재측정 결과(W14 착수 시)**: RC-5-g(지수표기 `2e+23/1e+24`)는 **W10의 `reduceFracBig`로
 *    이미 해소**됐다 — 간접출자법인 7개까지 실측해도 `21/125`처럼 짧게 약분된다. 미결로
 *    재기재하지 않는다. 남은 것은 「거래비율차감후」 한 칸(약분이 걸리지 않는 경로)이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { RelatedCorpResultSection } from "@/components/calc/results/RelatedCorpResultSection";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import type { RelatedCorpInput, DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

const R = (pct: number) => ({ numer: Math.round(pct * 100), denom: 10_000 });

const INPUT: RelatedCorpInput = {
  enterpriseSize: "small",
  totalSales: 100_000_000_000,
  preTaxAdjOperatingIncome: 10_000_000_000,
  taxableIncome: 10_000_000_000,
  corporateTaxNet: 2_000_000_000,
  shareholders: [
    { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
    { id: "A", name: "A법인", relation: "other", directRatio: R(50), isCorporate: true },
    { id: "x", name: "기타", relation: "other", directRatio: R(30), isCorporate: false },
  ],
  intermediaryCorps: [
    { corpShareholderId: "A", stakeInBeneficiary: R(50), owners: [{ individualId: "gap", ratio: R(80) }] },
  ],
  salesPartners: [
    { id: "D", name: "D", salesAmount: 80_000_000_000, isRelated: true },
    { id: "E", name: "기타", salesAmount: 20_000_000_000, isRelated: false },
  ],
};

describe("RC-5-a — 비율 칸이 읽히는 형태로 나온다", () => {
  it("[D-0] 「거래비율차감후」가 13자리 원시 분수가 아니라 퍼센트로 찍힌다", () => {
    const result = calcRelatedCorpGift(INPUT) as DeemedGiftResult;
    render(<RelatedCorpResultSection result={result} />);
    const cell = screen.getByTestId("rc-trade-over-0");
    // 종전: "3000000000000/10000000000000" (14자리 분모) — 이 칸이 표 폭을 밀어냈다.
    expect(cell.textContent).toBe("30.00%");
    expect(cell.textContent).not.toContain("/");
  });

  it("[D-1] 정확분수는 버리지 않고 title로 보존한다 — 표시층 수정이 감사 가능성을 깎으면 안 된다", () => {
    const result = calcRelatedCorpGift(INPUT) as DeemedGiftResult;
    render(<RelatedCorpResultSection result={result} />);
    expect(screen.getByTestId("rc-trade-over-0").getAttribute("title")).toContain(
      "3,000,000,000,000/10,000,000,000,000",
    );
  });

  it("[D-2] 0이 아닌데 소수점 둘째 자리 아래로 사라지는 비율은 유효자리를 살린다", () => {
    // 이 분기에 **실제로 도달하는** 입력을 만드는 데 품이 든다 — ④의 `parseRatio`가 비율을
    // 0.01%p 격자(분모 10,000)에 올려 두기 때문이다. 격자 밖으로 나가려면 간접보유가
    // 곱셈으로 잘게 쪼개져야 한다:
    //   간접 = 소유주 30% × 법인의 수혜법인 지분 0.34% = 0.102% (§⑬ 하한 0.1% 초과 → 유지)
    //          ⚠️ 소유주 지분은 30% 이상이어야 한다 — 그래야 A법인이 §⑱1호 간접출자법인이 되어
    //             수증자 판정(recipient 모드)에서 이 경유가 살아난다.
    //   잔여 차감분 = 한계 10% − 0.102% = 9.898%
    //   직접초과   = 9.9% − 9.898% = **0.002%**  ← 0.01% 미만이지만 0이 아니다
    // 처음 쓴 fixture(10.0005%)는 격자에 걸려 10.00%로 접혔고, 그래서 이 분기를 한 번도
    // 밟지 못했다(뮤테이션 생존으로 드러났다).
    const tiny: RelatedCorpInput = {
      ...INPUT,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(9.9), isCorporate: false },
        { id: "A", name: "A법인", relation: "other", directRatio: R(50), isCorporate: true },
        { id: "x", name: "기타", relation: "other", directRatio: R(40.1), isCorporate: false },
      ],
      intermediaryCorps: [
        { corpShareholderId: "A", stakeInBeneficiary: R(0.34), owners: [{ individualId: "gap", ratio: R(30) }] },
      ],
    };
    const result = calcRelatedCorpGift(tiny) as DeemedGiftResult;
    const gap = result.recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap).toBeDefined(); // 직접 9.9% + 간접 0.102% > 한계 10% — 수증자로 남는다
    expect(gap!.directOwnershipOver.numer).toBeGreaterThan(0); // 0이 아니다
    render(<RelatedCorpResultSection result={result} />);
    // 「0.00%」로 접히면 「초과분 없음」으로 오독된다 — 0이 아니면 0이 아니게 찍혀야 한다.
    const cell = screen.getByTestId("rc-direct-over-0");
    expect(cell.textContent).not.toBe("0.00%");
    expect(cell.textContent).toContain("0.002");
  });
});

describe("RC-5-e — 맥락 없는 잔여 안내가 사라진다", () => {
  it("[D-3] 간접보유가 아예 없으면 「간접이익=0은 미작동이 아닙니다」 안내를 띄우지 않는다", () => {
    const noIndirect: RelatedCorpInput = {
      ...INPUT,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(60), isCorporate: false },
        { id: "x", name: "기타", relation: "other", directRatio: R(40), isCorporate: false },
      ],
      intermediaryCorps: [],
    };
    render(<RelatedCorpResultSection result={calcRelatedCorpGift(noIndirect) as DeemedGiftResult} />);
    expect(screen.queryByTestId("rc-indirect-zero-note")).toBeNull();
  });

  it("[D-4] 긍정 짝 — 간접보유가 있는데 간접이익이 0이면 그때는 띄운다", () => {
    // 간접 40%가 한계보유비율 차감(중소 10%)을 넘지만 §⑬ 후단대로 간접에서 먼저 빼므로
    // 간접초과가 남는다 — 남지 않는 사안을 만들려면 간접을 한계 이하로 둔다.
    const absorbed: RelatedCorpInput = {
      ...INPUT,
      intermediaryCorps: [
        { corpShareholderId: "A", stakeInBeneficiary: R(10), owners: [{ individualId: "gap", ratio: R(50) }] },
      ],
    };
    const r = calcRelatedCorpGift(absorbed) as DeemedGiftResult;
    const gap = r.recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap?.indirectRatioRaw.numer).toBeGreaterThan(0);
    expect(gap?.indirectGain).toBe(0);
    render(<RelatedCorpResultSection result={r} />);
    expect(screen.getByTestId("rc-indirect-zero-note")).toBeTruthy();
  });
});

// ── §45의5 ─────────────────────────────────────────────────────────────
import { SpecificCorpMultiResultView } from "@/components/calc/results/SpecificCorpMultiResultView";
import { calcSpecificCorpGiftMulti } from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

describe("SC-O — 「계산식」 열이 엔진 값을 재계산하지 않는다", () => {
  const SC: SpecificCorpInput = {
    transactionDate: "2025-12-31",
    counterparty: "ruling_shareholder",
    transactionType: "gratuitous",
    transactionBenefit: 3_000_000_000,
    corporateTaxComputed: 0,
    corporateTaxCredit: 0,
    annualIncome: 5_000_000_000,
    giftDeduction: 0,
    totalShares: 50_000,
    shareholders: [
      { id: "1", name: "갑", relation: "lineal_descendant", shares: 20_000, totalShares: 50_000, isDonor: true, isRelated: true },
      { id: "2", name: "을", relation: "lineal_descendant", shares: 30_000, totalShares: 50_000, isDonor: false, isRelated: true },
    ],
  } as unknown as SpecificCorpInput;

  function renderSc() {
    const r = calcSpecificCorpGiftMulti(SC);
    const multi = r.specificCorpMulti!;
    render(<SpecificCorpMultiResultView multi={multi} selectedDoneeIndex={0} onSelectDonee={() => {}} />);
    return multi;
  }

  it("[D-5] 증여자 본인 행은 곱셈을 그리지 않는다 — 「…×20.0%」 옆에 「0」이 찍히는 거짓 등식이었다", () => {
    const multi = renderSc();
    const donor = multi.donees.findIndex((d) => d.nonTaxableReason === "donor_self");
    expect(donor).toBeGreaterThanOrEqual(0);
    expect(multi.donees[donor].gain).toBe(0); // 엔진이 영점처리한다
    expect(screen.getByTestId(`sc-multi-formula-${donor}`).textContent).toBe("산입 제외");
  });

  it("[D-6] 과세 행은 반올림한 퍼센트가 아니라 **원천 주식수 분수**로 보인다 (반올림 재계산 금지)", () => {
    const multi = renderSc();
    const taxable = multi.donees.findIndex((d) => d.isTaxable);
    expect(taxable).toBeGreaterThanOrEqual(0);
    const text = screen.getByTestId(`sc-multi-formula-${taxable}`).textContent ?? "";
    expect(text).toContain("30,000/50,000"); // 정확 — 반올림이 없다
    expect(text).not.toContain("%"); // 간접분이 없으면 퍼센트를 쓰지 않는다
  });
});
