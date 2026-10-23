/**
 * PR-7b-3 ⑤⑦ — 증여세 계산기 부담부증여 양도세 × 의제취득일(1985.1.1.) 전 상속 자산 화면 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * 시가 평가(담보 패)면 산정방식 라디오 대신 ① 칸·「확인할 수 없음」 선언·실비 칸(Q-24·Q-32), 기준시가 평가면 의제취득일 기준시가 안내(Q-25),
 * 범위 안 토지는 §164④ 등급 카드와 그 환산값 표시, 취득시 기준시가 칸 라벨은 「의제취득일(1985.1.1.)」.
 * 결과 카드는 엔진 echo `preDeemed`로 ①②③과 채택을 그린다(S-1 — 종전에는 ② 채택도 「실지취득가액 (K-4)」).
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BurdenedGiftTransferSection } from "@/components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection";
import { BurdenedTransferPreDeemedLines } from "@/components/calc/results/BurdenedTransferPreDeemedLines";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const GRADE: Partial<BurdenedGiftTransferTaxInput> = {
  pre1990Enabled: true,
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990Grade_atAcq: "200",
  pre1990PricePerSqm_1990: "1100000",
  pre1990GradeMode: "number",
};
/** §164⑥ 8칸 + §164⑤ 준용 확인 — 취득당시 기준시가 509,090,909(anchor `gift-burdened-pre-deemed-pr7b3b`와 같다) */
const C164: Partial<BurdenedGiftTransferTaxInput> = {
  c164ExclusiveArea: "50",
  c164SharedArea: "20",
  c164LandArea: "100",
  c164UnitPriceAtFirst: "10000000",
  c164LandPricePerSqmAtAcq: "500000",
  c164LandPricePerSqmAtFirst: "700000",
  c164BuildingStdPriceAtAcq: "30000000",
  c164BuildingStdPriceAtFirst: "40000000",
  c164AcqBuildingStdBy164_5: true,
};
function item(bgt: Partial<BurdenedGiftTransferTaxInput>, o: { market?: boolean; category?: string; acqDate?: string } = {}): EstateItem {
  return {
    id: "x-1",
    category: o.category ?? "real_estate_land",
    name: "테스트",
    standardPrice: 1_243_350_000,
    areaSqm: 184.2,
    ...(o.market ? { marketValue: 920_000_000 } : {}),
    leaseDeposit: 0,
    mortgageAmount: 460_000_000,
    assumedDebtForGift: 460_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date(o.acqDate ?? "1983-07-26"),
      standardPriceAtAcquisition: 202_620_000,
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "1970-01-01",
      ...bgt,
    },
  } as unknown as EstateItem;
}
function view(it: EstateItem) {
  const { container } = render(
    <BurdenedGiftTransferSection item={it} onChange={() => {}} hasOtherBurdenedGiftTransfer={false} transferDate="2023-02-16" />,
  );
  const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);
  const out = {
    text: container.textContent ?? "",
    radio: q("bg-acq-method-actual") !== null,
    reported: q("bg-pre-deemed-reported") !== null,
    unconfirmed: q("bg-pre-deemed-unconfirmed") !== null,
    stdNotice: q("bg-pre-deemed-std-notice") !== null,
    grade: q("bg-pre-deemed-land-grade") !== null,
    gradeValue: q("bg-transfer-acq-stdprice-grade")?.textContent ?? null,
    directStd: q("bg-transfer-acq-stdprice") !== null,
  };
  cleanup();
  return out;
}

describe("PR-7b-3 ⑤ 증여세 계산기 부담부증여 × 의제취득일 전 상속", () => {
  it("U-1 시가 평가 · ① 없음 — 라디오 없음 · ① 칸 · 선언 토글 · 라벨 「의제취득일」 · 등급 카드", () => {
    const v = view(item({}, { market: true }));
    expect(v.radio).toBe(false);
    expect(v.reported).toBe(true);
    expect(v.unconfirmed).toBe(true);
    expect(v.grade).toBe(true);
    expect(v.text).toContain("의제취득일(1985.1.1.) 개별공시지가");
    expect(v.text).toContain("①②③ 중 큰 금액 × 채무비율");
  });

  it("U-2 시가 평가 · ① 있음 — 선언 토글이 사라진다", () => {
    const v = view(item({ reportedValueAtInheritance: 300_000_000 }, { market: true }));
    expect(v.reported).toBe(true);
    expect(v.unconfirmed).toBe(false);
  });

  it("U-3 시가 평가 · 등급 환산(②) — 선언 토글 없음 · 직접 칸 대신 환산값 84,443,174 표시", () => {
    const v = view(item({ ...GRADE, standardPriceAtAcquisition: 0 }, { market: true }));
    expect(v.unconfirmed).toBe(false);
    expect(v.directStd).toBe(false);
    expect(v.gradeValue).toBe("84,443,174");
  });

  it("U-4 기준시가 평가 — ① 칸·라디오 없이 의제취득일 기준시가 안내", () => {
    const v = view(item({}));
    expect(v.stdNotice).toBe(true);
    expect(v.reported).toBe(false);
    expect(v.radio).toBe(false);
  });

  it("U-5 아파트 · 시가 — 등급 카드 없음 · ① 칸 · 라벨 「의제취득일(1985.1.1.) 공동주택공시가격」", () => {
    const v = view(item({}, { market: true, category: "real_estate_apartment" }));
    expect(v.grade).toBe(false);
    expect(v.reported).toBe(true);
    expect(v.text).toContain("의제취득일(1985.1.1.) 공동주택공시가격");
  });

  it("U-5b 주택 건물 · 시가 — ②(§164⑤~⑦)가 비교에서 빠진다는 고지(리뷰 F3) · 비주택 건물은 §164⑥ 칸이 있어 고지 없음(PR-7b-3b) · 토지도 없음", () => {
    const has = (it_: EstateItem, id: string) => {
      const { container } = render(<BurdenedGiftTransferSection item={it_} onChange={() => {}} hasOtherBurdenedGiftTransfer={false} transferDate="2023-02-16" />);
      const found = container.querySelector(`[data-testid="${id}"]`) !== null;
      cleanup();
      return found;
    };
    const bld = { market: true, category: "real_estate_building" };
    expect(has(item({ isHousing: true }, bld), "bg-pre-deemed-no-sec164")).toBe(true);
    expect(has(item({ isHousing: false }, bld), "bg-pre-deemed-no-sec164")).toBe(false);
    expect(has(item({}, { market: true }), "bg-pre-deemed-no-sec164")).toBe(false);
  });

  it("U-7 비주택 건물 — §164⑥ 8칸 블록 · 안내에 「② §164⑥」 · 주택 건물·토지·범위 밖은 블록 없음", () => {
    const html = (it_: EstateItem) => {
      const { container } = render(<BurdenedGiftTransferSection item={it_} onChange={() => {}} hasOtherBurdenedGiftTransfer={false} transferDate="2023-02-16" />);
      const out = { block: container.querySelector('[data-testid="bg-c164"]') !== null, text: container.textContent ?? "" };
      cleanup();
      return out;
    };
    const bld = { market: true, category: "real_estate_building" };
    const nonHousing = html(item({ isHousing: false }, bld));
    expect(nonHousing.block).toBe(true);
    expect(nonHousing.text).toContain("② §164⑥ 취득당시 기준시가");
    expect(nonHousing.text).toContain("② 후보");
    expect(html(item({ isHousing: true }, bld)).block).toBe(false);
    expect(html(item({}, { market: true })).block).toBe(false);
    expect(html(item({ isHousing: false }, { ...bld, acqDate: "1990-07-26" })).block).toBe(false);
  });

  it("U-8 비주택 건물 · 기준시가 평가 · 8칸 — §164⑥ 값 509,090,909 표시 · 선언 없음 · 의제취득일 기준시가 칸이 필수가 아니다(⑧ K-2와 같다)", () => {
    const { container } = render(
      <BurdenedGiftTransferSection item={item({ ...C164, isHousing: false, standardPriceAtAcquisition: 0 }, { category: "real_estate_building" })} onChange={() => {}} hasOtherBurdenedGiftTransfer={false} transferDate="2023-02-16" />,
    );
    expect(container.querySelector('[data-testid="bg-c164-std"]')?.textContent).toBe("509,090,909");
    expect(container.querySelector('[data-testid="bg-c164-note"]')?.textContent).toContain("의제취득일(1985.1.1.) 기준시가로 씁니다");
    expect(container.textContent).toContain("이 칸은 입력하지 않아도 됩니다");
    cleanup();
  });

  it("U-9 비주택 건물 · 시가 · 8칸 — ②가 있어 「확인할 수 없음」 선언이 사라진다", () => {
    const v = view(item({ ...C164, isHousing: false }, { market: true, category: "real_estate_building" }));
    expect(v.unconfirmed).toBe(false);
  });

  it("U-6 범위 밖(1990 상속 · 시가) — 종전 화면(산정방식 라디오 · 「취득시」 라벨)", () => {
    const v = view(item({}, { market: true, acqDate: "1990-07-26" }));
    expect(v.radio).toBe(true);
    expect(v.reported).toBe(false);
    expect(v.grade).toBe(false);
    expect(v.text).toContain("취득시 개별공시지가");
    expect(v.text).not.toContain("의제취득일(1985.1.1.) 개별공시지가");
  });
});

describe("PR-7b-3 ⑦ 결과 카드 의제 분기 (S-1)", () => {
  const brkd = (p: TransferBurdenedGiftBreakdown["preDeemed"], over: object = {}) =>
    ({
      preDeemed: p,
      debtRatio: 0.5,
      giftValuation: { max: 920_000_000 },
      perAsset: { land: { acquisitionPrice: 42_221_587, estimatedDeduction: 1_000_000 }, building: { acquisitionPrice: 0, estimatedDeduction: 0 } },
      ...over,
    }) as unknown as TransferBurdenedGiftBreakdown;

  it("R-1 ② 채택 — 「← 채택」이 ②에 · K-4 문구 없음", () => {
    const { container } = render(
      <BurdenedTransferPreDeemedLines
        brkd={brkd({ basis: "three_way", stdAtDeemed: 84_443_174, reported: null, sec164: 84_443_174, converted: 62_486_000, selected: "sec164", wholeAcquisition: 84_443_174 })}
      />,
    );
    const sec164 = container.querySelector('[data-candidate="sec164"]')?.textContent ?? "";
    expect(sec164).toContain("← 채택");
    // 토지 §164④ · 상가 §164⑥(PR-7b-3b) 둘 다 이 줄이다 — 양도세 결과 행(`BgPreDeemedAcqRows`)과 같은 문구
    expect(sec164).toContain("② §164④~⑦ 취득당시 기준시가(의제취득일)");
    expect(container.querySelector('[data-candidate="reported"]')).toBeNull();
    expect(container.textContent).not.toContain("K-4");
    expect(container.textContent).toContain("①·② 채택");
    cleanup();
  });

  it("R-0 카드 본체 — 엔진이 ② 채택(acquisitionMethodUsed는 actual)이어도 「실지취득가액 (K-4)」 대신 의제 분기를 그린다", () => {
    const result = {
      isExempt: false, transferGain: 1, taxableGain: 1, longTermHoldingDeduction: 0, longTermHoldingRate: 0, basicDeduction: 0, taxBase: 1,
      calculatedTax: 0, appliedRate: 0.06, reductionAmount: 0, determinedTax: 0, penaltyTax: 0, localIncomeTax: 0, totalTax: 0, progressiveDeduction: 0,
      transferBurdenedGiftBreakdown: {
        ...brkd({ basis: "three_way", stdAtDeemed: 84_443_174, reported: null, sec164: 84_443_174, converted: 62_486_000, selected: "sec164", wholeAcquisition: 84_443_174 }),
        acquisitionMethodUsed: "actual",
      },
    } as unknown as TransferTaxResult;
    const { container } = render(<BurdenedTransferTaxResultCard transferTaxResults={[result]} />);
    expect(container.querySelector('[data-testid="gift-bg-pre-deemed-three-way"]')).not.toBeNull();
    expect(container.textContent).not.toContain("K-4");
    cleanup();
  });

  it("R-3 ③ 채택 · §97②2호 단서 — 취득가액 줄이 0이 아니라 스왑 전 값 · 실비 대체 문구(리뷰 F1)", () => {
    const { container } = render(
      <BurdenedTransferPreDeemedLines
        brkd={brkd(
          { basis: "three_way", stdAtDeemed: 202_620_000, reported: null, sec164: null, converted: 149_925_925, selected: "converted", wholeAcquisition: 149_925_925 },
          {
            perAsset: { land: { acquisitionPrice: 0, estimatedDeduction: 80_000_000 }, building: { acquisitionPrice: 0, estimatedDeduction: 0 } },
            convertedAcquisitionBeforeSwap: { land: 74_962_962, building: 0 },
            necessaryExpenseSwap: { estimatedSide: 78_002_262, directSide: 80_000_000, chosen: "direct" },
          },
        )}
      />,
    );
    expect(container.textContent).toContain("= 74,962,962");
    expect(container.textContent).not.toContain("50.0000% = 0");
    expect(container.querySelector('[data-testid="gift-bg-pre-deemed-expense"]')?.textContent).toContain("자본적지출·양도비 80,000,000가 커서");
    cleanup();
  });

  it("R-4 ①·② 채택 — 공제한 실비 금액을 보인다(채무비율을 곱한 값)", () => {
    const { container } = render(
      <BurdenedTransferPreDeemedLines
        brkd={brkd({ basis: "three_way", stdAtDeemed: 202_620_000, reported: 300_000_000, sec164: null, converted: 149_925_925, selected: "reported", wholeAcquisition: 300_000_000 })}
      />,
    );
    expect(container.querySelector('[data-testid="gift-bg-pre-deemed-expense"]')?.textContent).toContain("채무비율을 곱한 1,000,000");
    cleanup();
  });

  it("R-2 기준시가 평가 — 의제취득일 기준시가 × 채무비율", () => {
    const { container } = render(<BurdenedTransferPreDeemedLines brkd={brkd({ basis: "deemed_std", stdAtDeemed: 202_620_000 })} />);
    expect(container.textContent).toContain("의제취득일(1985.1.1.) 기준시가 202,620,000 × 채무비율 50.0000%");
    cleanup();
  });
});
