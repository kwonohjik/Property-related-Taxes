/**
 * 완전 지분 번들(축 B) floor 절사 잔액 흡수 — 서버(`prepareBundledApportionment`)와 사이드바(`computeApportionedSaleMap`)가 같이 쓰는 순수 함수.
 * 흡수자 = 확정 양도가액 > 0 자산 중 (배열 위치 0 = 주 자산을 뺀) assetId 사전순 최대, 컴패니언이 없으면 주 자산. 나머지 값은 그대로.
 * 계획서: `docs/02-design/features/sidebar-axis-b-sale-residual.plan.md` Q-1 b.
 */
import { describe, expect, it } from "vitest";
import { absorbFractionalResidual } from "@/lib/tax-engine/bundled-sale-apportionment";

const a = (assetId: string, fixedSalePrice: number) => ({ assetId, fixedSalePrice });
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

describe("absorbFractionalResidual", () => {
  it("🔑 잔액은 컴패니언 중 assetId 사전순 최대가 흡수 — 합 = 총액", () => {
    const r = absorbFractionalResidual([a("A1", 333_333_333), a("A2", 333_333_333), a("A3", 333_333_333)], 1_000_000_001);
    expect(r).toEqual([333_333_333, 333_333_333, 333_333_335]);
    expect(sum(r)).toBe(1_000_000_001);
  });

  it("🔑 위치가 아니라 사전순 — 가운데 컴패니언 A9가 흡수(마지막 행이 아니다)", () => {
    const r = absorbFractionalResidual([a("A1", 333_300_000), a("A9", 333_300_000), a("A2", 333_300_000)], 1_000_000_000);
    expect(r).toEqual([333_300_000, 333_400_000, 333_300_000]);
    expect(sum(r)).toBe(1_000_000_000);
  });

  it("🔑 주 자산(위치 0)은 id가 사전순 최대여도 흡수자가 아니다", () => {
    const r = absorbFractionalResidual([a("primary", 500), a("c1", 500)], 1_001);
    expect(r).toEqual([500, 501]);
  });

  it("🔑 확정 가액 0인 컴패니언은 흡수자에서 제외 — 양수 컴패니언 중 최대", () => {
    const r = absorbFractionalResidual([a("A1", 500), a("A2", 500), a("A9", 0)], 1_001);
    expect(r).toEqual([500, 501, 0]);
  });

  it("컴패니언이 모두 0이면 양수인 주 자산이 흡수", () => {
    const r = absorbFractionalResidual([a("A1", 1_000), a("A2", 0), a("A3", 0)], 1_001);
    expect(r).toEqual([1_001, 0, 0]);
  });

  it("합이 이미 총액이면 값이 그대로", () => {
    const r = absorbFractionalResidual([a("A1", 500), a("A2", 300), a("A3", 200)], 1_000);
    expect(r).toEqual([500, 300, 200]);
  });

  it("합이 총액을 넘어도(100.03%) 같은 규칙 — 흡수자가 음의 잔액을 받는다(서버와 같다)", () => {
    const r = absorbFractionalResidual([a("A1", 142_900_000), a("A2", 142_900_000), a("A3", 142_900_000)], 400_000_000);
    expect(r).toEqual([142_900_000, 142_900_000, 114_200_000]);
    expect(sum(r)).toBe(400_000_000);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const input = [a("A1", 1), a("A2", 1)];
    absorbFractionalResidual(input, 5);
    expect(input).toEqual([a("A1", 1), a("A2", 1)]);
  });
});
