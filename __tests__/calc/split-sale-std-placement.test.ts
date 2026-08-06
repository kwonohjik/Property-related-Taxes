/**
 * `saleStdPlacement` / `needsSaleStdPart` — 양도시 기준시가 배치 술어.
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md §5.1 (A8)
 *        · general-building-sale-split-mode.plan.md §12.7 (R-7 · Phase 1-D)
 *
 * 이 술어가 UI 노출·validate 요구의 **단일 소스**다. 어긋나면 "입력 칸이 없는데 차단"
 * (dead-end)이 되거나, 같은 카드가 두 곳에 동시 노출돼 E2E strict mode가 깨진다.
 *
 * ## 🔴 2026-08-06 (Phase 1-D) — 계약이 **뒤집혔다**
 *
 * 종전 계약: 「일괄양도 → 축 A · 구분양도 → **환산 파트만**」. 그 전제는 「구분양도에서 이 값은
 * 파트 환산 분모로만 쓰인다」였다.
 *
 * 「소득세법」 제100조 **제3항**이 구분 기장 가액을 **안분계산한 가액과 비교**하도록 요구하고,
 * 안분값은 양도시 토지·건물 기준시가 **양쪽**에서 나온다(부가령 §64①1호) ⇒ 전제가 깨졌다.
 * **구분양도에서도 양쪽이 필수**이며, 배치는 불변(항상 축 A)이 됐다.
 *
 * ⚠️ 종전 테스트 「구분양도 + 양쪽 실가 → 어느 파트도 요구하지 않는다」는 **의도적으로 뒤집었다**.
 *    그 상태를 허용하면 사용자가 기준시가 칸을 비워 30% 가드를 우회할 수 있다 —
 *    계획서 §12.7이 「기준시가 없으면 판정 건너뛰기」를 명시적으로 기각한 이유다.
 */
import { describe, it, expect } from "vitest";
import { saleStdPlacement, needsSaleStdPart } from "@/lib/calc/transfer-tax-split-acq-mode";

describe("A8 — 배치는 불변이다 (Phase 1-D)", () => {
  it("항상 축 A — 파트 카드는 뜨지 않는다", () => {
    expect(saleStdPlacement()).toEqual({ saleAxis: true, landPart: false, buildingPart: false });
  });

  it("`saleAxis && (landPart || buildingPart)` 불변식을 지킨다", () => {
    const p = saleStdPlacement();
    expect(
      p.saleAxis && (p.landPart || p.buildingPart),
      "축 A와 파트 카드가 동시에 뜨면 같은 폼 필드를 두 곳에서 편집하고 testid도 중복된다",
    ).toBe(false);
  });
});

describe("needsSaleStdPart — UI 노출과 validate 요구가 같은 값에서 나온다", () => {
  it("파생 형태를 유지한다 (dead-end 0)", () => {
    const p = saleStdPlacement();
    expect(needsSaleStdPart("land")).toBe(p.saleAxis || p.landPart);
    expect(needsSaleStdPart("building")).toBe(p.saleAxis || p.buildingPart);
  });

  it("🔴 구분양도 + 양쪽 실가에서도 **양쪽 다 요구**한다 — 종전 계약의 반대다", () => {
    // 종전에는 이 조합에서 두 값 모두 false였다. 그러면 30% 판정의 분모(안분값)를 만들 수 없고,
    // 칸을 비워 두는 것만으로 §100③ 가드를 우회할 수 있다.
    expect(needsSaleStdPart("land")).toBe(true);
    expect(needsSaleStdPart("building")).toBe(true);
  });
});
