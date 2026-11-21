/**
 * anchor — 조특법 §77의3 감면 상세 카드의 적용 항 표시 (결과뷰 리뷰 2026-11-21 R-c06-02)
 *
 * §77의3①은 개발제한구역 **안** 토지의 매수청구·협의매수, ②는 개발제한구역에서 **해제된** 토지의
 * 협의매수·수용이다(MST 284389 본문). 두 항 모두 1호 40%·2호 25%라 세액은 같지만 인용 항은 다르다.
 * 종전 카드는 `(§77의3① N호)`를 고정 출력해 해제 토지(②)도 ①로 적었다.
 *
 * 엔진을 실제로 돌린 detail을 렌더한다 — 손으로 만든 detail은 「엔진이 항을 싣는가」를 확인하지 못한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferReduction } from "@/lib/tax-engine/types/transfer-reduction-input.types";
import { GbDesignatedLand77_3DetailCard } from "@/components/calc/results/transfer/GbDesignatedLand77_3DetailCard";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();

const landBase = {
  propertyType: "land" as const,
  isOneHousehold: false,
  householdHousingCount: 0,
  transferPrice: 1_000_000_000,
  acquisitionPrice: 300_000_000,
  acquisitionDate: new Date("2010-01-01"),
  transferDate: new Date("2024-06-01"),
};

type GbReduction = Extract<TransferReduction, { type: "gb_designated_land" }>;

function run(reduction: Omit<GbReduction, "type">) {
  return calculateTransferTax(
    baseTransferInput({ ...landBase, reductions: [{ type: "gb_designated_land", ...reduction }] }),
    rates,
  );
}

/** 「① 적용 감면율 …」 줄의 텍스트 */
function rateLine(): string {
  return screen.getByText(/① 적용 감면율/).textContent ?? "";
}

const IN_ZONE: Omit<GbReduction, "type"> = {
  branch: "in_zone",
  designationDate: new Date("2015-01-01"),
  triggerDate: new Date("2024-01-01"),
  residedFromAcqToTrigger: true,
};

/** 해제일 2023-06-01 → 사업인정고시 2024-01-01 (해제일부터 1년 이내 — ② 단서 충족) */
const RELEASED: Omit<GbReduction, "type"> = {
  branch: "released",
  designationDate: new Date("2015-01-01"),
  triggerDate: new Date("2024-01-01"),
  releasedDate: new Date("2023-06-01"),
  residedFromAcqToTrigger: true,
};

describe("R-c06-02 — §77의3 적용 항(①/②)을 엔진 echo로 표시한다", () => {
  it("해제 토지(②항) 1호 → 「§77의3② 1호」 · ①로 적지 않는다", () => {
    const r = run(RELEASED);
    const d = r.gbDesignatedLandDetail!;
    expect(d.isEligible).toBe(true);
    expect(d.appliedClause).toBe("1호");
    expect(d.branch).toBe("released");
    render(<GbDesignatedLand77_3DetailCard detail={d} calculatedTax={r.calculatedTax} taxBase={r.taxBase} />);
    expect(rateLine()).toContain("§77의3② 1호");
    expect(rateLine()).not.toContain("§77의3①");
  });

  it("구역 안 토지(①항) 1호 → 「§77의3① 1호」", () => {
    const r = run(IN_ZONE);
    const d = r.gbDesignatedLandDetail!;
    expect(d.branch).toBe("in_zone");
    render(<GbDesignatedLand77_3DetailCard detail={d} calculatedTax={r.calculatedTax} taxBase={r.taxBase} />);
    expect(rateLine()).toContain("§77의3① 1호");
    expect(rateLine()).not.toContain("§77의3②");
  });

  it("세액은 두 항이 같다(1호 40%) — 항 표시만 바뀐다", () => {
    expect(run(RELEASED).gbDesignatedLandDetail!.reductionAmount).toBe(run(IN_ZONE).gbDesignatedLandDetail!.reductionAmount);
  });

  it("항 echo가 없는 종전 저장 결과 → 항 번호 없이 「§77의3 1호」(①로 단정하지 않는다)", () => {
    const r = run(RELEASED);
    const { branch: _omit, ...legacy } = r.gbDesignatedLandDetail!;
    void _omit;
    render(<GbDesignatedLand77_3DetailCard detail={legacy} calculatedTax={r.calculatedTax} taxBase={r.taxBase} />);
    expect(rateLine()).toContain("§77의3 1호");
    expect(rateLine()).not.toMatch(/§77의3[①②]/);
  });
});
