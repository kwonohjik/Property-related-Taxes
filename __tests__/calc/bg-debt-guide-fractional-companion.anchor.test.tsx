/**
 * 입력 화면 채무 안내 문구 — 공유지분 × 함께 부담부증여 (계획서 `docs/00-pm/bg-single-fractional-and-debt-excess.plan.md` 3).
 *
 * 종전: 지분 컴패니언 카드에 「이 지분에 대응하는 인수분」(축 A)과 「이 물건에 설정된 금액」(컴패니언) 두 문단이 따로 떠 다른 지시처럼 읽혔다(#2758 BV-1 실측).
 * 두 규약은 모순이 아니다 — 컴패니언 채무는 그 물건에 설정된 금액이고, 지분 자산은 그중 본인 인수분을 넣는다(#2750). 한 문단으로 합친다.
 *
 * · GD-1 지분 컴패니언(축 A) — 합친 한 문단만. 옛 두 문단은 없다.
 * · GD-2 대조 — 단건 지분은 축 A 문단만 · 컴패니언 100%는 컴패니언 문단만 · 축 B는 물건 전체 문단만(각각 종전 그대로).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";

afterEach(cleanup);

const house = (o: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", useEstimatedAcquisition: false, transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1000000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400000000",
    bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", ...o,
  }) as AssetForm;
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const text = (el: React.ReactElement) => (render(el).container.textContent ?? "").replace(/\s+/g, " ");
const count = (s: string, sub: string) => s.split(sub).length - 1;

const MERGED = "이 물건에 설정된 금액 중 이 지분에 대응하는 인수분을 입력하세요";
const AXIS_A_ONLY = "공유지분(50%) 부담부증여 — 아래 채무·보증금·임대료는 이 지분에 대응하는 인수분";
const COMPANION_ONLY = "이 물건에 설정된 금액을 입력하세요";
const AXIS_B = "물건 전체(100%) 기준으로 입력하세요";

describe("GD-1 지분 컴패니언 — 합친 한 문단", () => {
  it("합친 문단 1건 · 옛 축 A 단독 문단 없음 · 옛 컴패니언 단독 문단 없음 · 지분 라벨 유지", () => {
    const t = text(<BurdenedGiftBlock asset={house(HALF)} onChange={() => {}} isCompanionBundle />);
    expect(count(t, MERGED)).toBe(1);
    expect(t).not.toContain(AXIS_A_ONLY);
    expect(t).not.toContain(COMPANION_ONLY);
    expect(t).toContain("공유지분(50%) 여러 물건 함께 부담부증여");
    expect(t).toContain("담보차입금 (지분 인수분)");
  });
});

describe("GD-2 대조 — 다른 조합은 종전 그대로", () => {
  it("단건 지분(축 A) — 축 A 문단만", () => {
    const t = text(<BurdenedGiftBlock asset={house(HALF)} onChange={() => {}} />);
    expect(t).toContain(AXIS_A_ONLY);
    expect(t).not.toContain(MERGED);
    expect(t).not.toContain(COMPANION_ONLY);
  });
  it("컴패니언 100% — 컴패니언 문단만", () => {
    const t = text(<BurdenedGiftBlock asset={house()} onChange={() => {}} isCompanionBundle />);
    expect(t).toContain(COMPANION_ONLY);
    expect(t).not.toContain(MERGED);
    expect(t).not.toContain(AXIS_A_ONLY);
  });
  it("축 B(지분 분할) — 물건 전체 문단만", () => {
    const t = text(<BurdenedGiftBlock asset={house(HALF)} onChange={() => {}} isFractionalSplit />);
    expect(t).toContain(AXIS_B);
    expect(t).not.toContain(MERGED);
    expect(t).not.toContain(AXIS_A_ONLY);
  });
});
