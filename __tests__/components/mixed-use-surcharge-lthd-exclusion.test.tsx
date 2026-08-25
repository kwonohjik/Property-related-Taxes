/**
 * anchor: `MixedUseResultCard` §95② 배제 표시 — **엔진 echo를 읽는다, 재도출 금지** (2026-08-25)
 *
 * 계획서: `docs/00-pm/transfer-mixed-use-surcharge-fallback.plan.md` §3.3
 *
 * ## 종전 결함 — 주석과 구현이 어긋나 있었다
 *
 * 카드는 「판정은 엔진 결과를 그대로 읽는다 — **재도출 금지**」라 적어 두고도 실제로는
 * `multiHouseSurcharge.surchargeType !== "none" && !isSurchargeSuspended`를 **다시 계산**했다.
 * 그래서 원시 플래그 fallback으로 배제된 경우(`multiHouseSurcharge`가 **아예 없다**) 카드가
 * 배제를 알아보지 못하고 **「장기보유공제 (표1, 0.0%)」**로 표시했다 —
 * 공제는 0인데 **보유기간이 짧아서 0인 것처럼** 읽혔다.
 *
 * ⇒ 엔진이 `surchargeLthdExclusion`을 확정해 싣고, 카드는 그것만 본다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRatesWithHouseEngine, makeHouseInfo } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const AFTER_SUSPENSION = new Date("2026-06-01");
const PRICE = 3_000_000_000;

function run(over: Partial<MixedUseAssetInput>) {
  return calcMixedUseTransferTax(
    PRICE,
    AFTER_SUSPENSION,
    { ...mixedUseCase14(), isOneHouseExempt: false, ...over },
    makeMockRatesWithHouseEngine(),
  );
}

/** 정밀 경로 — 양도 겸용주택 + 보유 1채 */
const precise = {
  houses: [makeHouseInfo("selling"), makeHouseInfo("h2", { acquisitionDate: new Date("2015-03-01") })],
  sellingHouseId: "selling",
  presaleRights: [],
  isOneHousehold: true,
  isRegulatedArea: true,
} as NonNullable<MixedUseAssetInput["multiHouse"]>;

describe("겸용 결과 카드 — §95② 배제 표시", () => {
  it("MC-01: 🔴 **fallback 경로**에서도 「장기보유공제 (배제)」가 뜬다 (종전 「표1, 0.0%」)", () => {
    const b = run({ surchargeFallback: { isRegulatedArea: true, householdHousingCount: 2 } });
    expect(b.multiHouseSurcharge).toBeUndefined(); // 전제 — 카드가 재도출하면 못 알아본다
    expect(b.housingPart.longTermDeductionAmount).toBe(0);

    render(<MixedUseResultCard breakdown={b} />);
    expect(screen.getByText("장기보유공제 (배제)")).toBeInTheDocument();
  });

  it("MC-01b: 🔑 **주택분만** 배제된다 — 상가분 라벨은 표1 그대로 (§104⑦ 대상은 「주택」)", () => {
    const b = run({ surchargeFallback: { isRegulatedArea: true, householdHousingCount: 2 } });
    expect(b.commercialPart.longTermDeductionAmount).toBeGreaterThan(0);

    render(<MixedUseResultCard breakdown={b} />);
    // 「배제」는 1개(주택분), 「표N」 라벨도 1개(상가분) — 둘이 공존하는 것이 정상이다.
    expect(screen.getAllByText("장기보유공제 (배제)")).toHaveLength(1);
    expect(screen.getAllByText(/장기보유공제 \(표\d/)).toHaveLength(1);
  });

  it("MC-02: 🔑 근사임을 **함께 말한다** — 목록 미입력 안내", () => {
    const b = run({ surchargeFallback: { isRegulatedArea: true, householdHousingCount: 2 } });
    render(<MixedUseResultCard breakdown={b} />);
    expect(screen.getByText(/세대 보유 주택 목록 미입력/)).toBeInTheDocument();
  });

  it("MC-03: 정밀 경로는 배제 표시는 같고 **근사 안내는 없다**", () => {
    const b = run({ multiHouse: precise });
    expect(b.multiHouseSurcharge?.surchargeType).toBe("multi_house_2");

    render(<MixedUseResultCard breakdown={b} />);
    expect(screen.getByText("장기보유공제 (배제)")).toBeInTheDocument();
    expect(screen.queryByText(/세대 보유 주택 목록 미입력/)).not.toBeInTheDocument();
  });

  it("MC-04: 대조 — 배제가 없으면 종전 라벨(표1/표2 + 공제율)이 그대로다", () => {
    const b = run({ surchargeFallback: { isRegulatedArea: false, householdHousingCount: 2 } });
    expect(b.housingPart.longTermDeductionAmount).toBeGreaterThan(0);

    render(<MixedUseResultCard breakdown={b} />);
    expect(screen.queryByText("장기보유공제 (배제)")).not.toBeInTheDocument();
    // 주택분 + 상가분 = 2개 (배제 시 1개로 줄어드는 것이 MC-01b)
    expect(screen.getAllByText(/장기보유공제 \(표\d/)).toHaveLength(2);
  });

  it("MC-05: 🔑 주택 수 표시는 **엔진이 확정한 값**이다 (카드가 세지 않는다)", () => {
    const b = run({ surchargeFallback: { isRegulatedArea: true, householdHousingCount: 3 } });
    render(<MixedUseResultCard breakdown={b} />);
    expect(screen.getByText(/조정대상지역 3주택 중과 대상 주택/)).toBeInTheDocument();
  });
});
