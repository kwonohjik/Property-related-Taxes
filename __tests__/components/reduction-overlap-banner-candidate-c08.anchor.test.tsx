/**
 * 결과뷰 리뷰 2026-11-21 c08 MINOR — 조특법 §127⑦ 중복배제 배너·배제 카드 표시 anchor. 세액 불변(엔진 값 그대로 · 표시 전용).
 *
 * R-c08-06 배너가 「승자가 자기 것이 아님」만 봐서 **부적격** detail(§77 취득시기 미충족 등) 위에도 붙었다 — 요건 미충족을 중복배제로 적었다.
 *   엔진은 적격·감면세액 > 0인 detail만 후보에 넣는다(`calcReductions`) → 배너도 그 조건에서만.
 * R-c08-07 하이브리드 세액감면(§98의4 등) 카드에 §127⑦ 판정이 없어 진 후보가 「113,060,000 × 10% = 0」으로 적용처럼 그려졌다.
 * R-c08-13 배너가 인라인 amber 톤 → `ToneCard tone="amber"`(톤 단일 소스).
 *
 * 수정 전 실측(주택 · 취득 2009.6.1. · 양도 2024.6.1. · 양도 9억 · 취득 4억 · 다주택):
 *   §98의4 + §77 채권 9억(만기 보유 표시 없음 15%) → 채택 §77 16,959,000 · §98의4 카드 「감면세액 (산출세액의 10%) 0」·「113,060,000 × 10% = 0」 · 배너 없음
 *   §98의4 + §77 현금 9억(사업인정 2010.1.1. — 2년 소급 미충족) → 채택 §98의4 11,306,000 · §77 「적용 불가」 카드 위에 §127⑦ 배너
 *   (뮤테이션: 후보 조건을 걷어 내면 R-c08-06 두 건이 실패한다)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TONE } from "@/components/calc/shared/tones";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const R984 = { type: "unsold_98_4", contractDate984: D("2009-04-01"), isNonResidentNoPe984: true, isNotUnsold983House984: true };
const BANNER = "⚠ 조세특례제한법 §127⑦ 중복배제";

function run(reductions: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = calculateTransferTax(
    baseTransferInput({
      transferPrice: 900_000_000, acquisitionPrice: 400_000_000, acquisitionDate: D("2009-06-01"), transferDate: D("2024-06-01"),
      isOneHousehold: false, householdHousingCount: 2, reductions,
    } as never),
    makeMockRates(),
  );
  const { container } = render(
    <ReductionDetailCards
      result={r}
      calculatedTax={r.calculatedTax}
      taxBase={r.taxBase}
      longTermHoldingDeduction={r.longTermHoldingDeduction}
      appliedReductionType={r.reductionTypeApplied}
      appliedReductionAmount={r.reductionAmount}
    />,
  );
  const banners = [...container.querySelectorAll("div")].filter((d) => d.textContent?.startsWith(BANNER));
  /** 배너 바로 뒤 형제 카드의 제목 일부 */
  const bannerTargets = banners.map((b) => b.nextElementSibling?.textContent ?? "");
  return { r, text: container.textContent ?? "", banners, bannerTargets };
}

describe("R-c08-07 하이브리드 세액감면 — 진 후보에 배너 + 「× 10% = 0」 산식 대신 배제 문구", () => {
  it("§98의4 + §77 채권 → 채택 §77 · §98의4 카드 앞 배너 · 「= 0」 산식 없음", () => {
    const { r, text, bannerTargets } = run([R984, { type: "public_expropriation", cashCompensation: 0, bondCompensation: 900_000_000, businessApprovalDate: D("2018-01-01") }]);
    expect([r.reductionTypeApplied, r.reductionAmount]).toEqual(["public_expropriation", 16_959_000]);
    expect(r.unsold984Detail).toMatchObject({ isEligible: true, effectCategory: "tax_amount", reductionAmount: 0 });
    expect(bannerTargets).toHaveLength(1);
    expect(bannerTargets[0]).toContain("§98의4");
    expect(text).not.toContain("113,060,000 × 10% = 0");
    expect(text).not.toContain("감면세액 (산출세액의 10%)0");
    expect(text).toContain("감면세액 — 조특법 §127⑦ 중복배제로 적용되지 않았습니다");
  });
  it("(짝) §98의4 단독 → 배너 없음 · 산식 「113,060,000 × 10% = 11,306,000」", () => {
    const { r, text, banners } = run([R984]);
    expect(r.reductionTypeApplied).toBe("unsold_98_4");
    expect(banners).toHaveLength(0);
    expect(text).toContain("113,060,000 × 10% = 11,306,000");
  });
});

describe("R-c08-06 부적격 detail에는 §127⑦ 배너를 붙이지 않는다", () => {
  it("§98의4 + §77 사업인정 2010.1.1.(2년 소급 미충족) → §77 「적용 불가」 카드에 배너 없음", () => {
    const { r, text, banners } = run([R984, { type: "public_expropriation", cashCompensation: 900_000_000, bondCompensation: 0, businessApprovalDate: D("2010-01-01") }]);
    expect(r.reductionTypeApplied).toBe("unsold_98_4");
    expect(r.publicExpropriationDetail.isEligible).toBe(false);
    expect(text).toContain("공익사업 수용 감면 (조특법 §77) — 적용 불가");
    expect(banners).toHaveLength(0);
  });
  it("부적격 §77 detail + 다른 승자 id(직접 주입) → 배너 없음 · 적격이면 배너(구별력)", () => {
    const base = run([{ type: "public_expropriation", cashCompensation: 900_000_000, bondCompensation: 0, businessApprovalDate: D("2018-01-01") }]).r;
    const show = (pe: object) => {
      cleanup();
      const { container } = render(
        <ReductionDetailCards result={{ ...base, publicExpropriationDetail: pe }} calculatedTax={base.calculatedTax} taxBase={base.taxBase}
          longTermHoldingDeduction={base.longTermHoldingDeduction} appliedReductionType="self_farming" appliedReductionAmount={base.reductionAmount} />,
      );
      return container.textContent ?? "";
    };
    expect(show({ ...base.publicExpropriationDetail, isEligible: false, reductionAmount: 0, notEligibleReason: "취득시기 요건 미충족" })).not.toContain(BANNER);
    const eligible = show(base.publicExpropriationDetail);
    expect(eligible).toContain(BANNER);
    expect(eligible).toContain("⑤ 감면세액 — 조특법 §127⑦ 중복배제로 적용되");
  });
});

describe("R-c08-13 배너는 ToneCard amber 톤", () => {
  it("배너 외곽이 TONE.amber.card 클래스를 쓴다", () => {
    const { banners } = run([R984, { type: "public_expropriation", cashCompensation: 0, bondCompensation: 900_000_000, businessApprovalDate: D("2018-01-01") }]);
    expect(banners).toHaveLength(1);
    for (const c of TONE.amber.card.split(" ")) expect(banners[0].className).toContain(c);
  });
});
