/**
 * §164⑧ 연도 교차 opt-in — **폼에서 엔진까지 도달하는가**.
 *
 * 리뷰 실측(2026-08-25): 엔진 게이트를 `transferYear <= acquisitionYear + 1`로 넓혔지만
 * 폼(`buildInput`)이 **같은 연도일 때만** `holdingMonths`를 채워 새 조건절이 **어떤 실제
 * 입력으로도 진입할 수 없었다**. 집행기준 계산사례 2건(2005 취득 → 2006 양도)이 여전히
 * 미해결이었던 것 — 「게이트를 넓혔다」와 「입력이 그 게이트에 닿는다」는 다르다.
 */
import { describe, it, expect } from "vitest";
import { toEngineInput, initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";
import { validateBuildingStdPriceForm } from "@/lib/calc/building-std-price-validate";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

/** 2005 취득 → 2006 양도 (집행기준 사례1 연도축) */
function crossYearForm(over: Partial<BuildingStdPriceFormState> = {}): BuildingStdPriceFormState {
  return {
    ...initialBuildingStdPriceForm,
    taxType: "transfer",
    floorArea: "200",
    builtYear: "2000",
    acquisitionYear: "2005",
    transferYear: "2006",
    acqStructureKey: "rc",
    acqUsageNo: "1",
    acqLandPrice: "1,000,000",
    holdingMonths: "8",
    adjustMonths: "12",
    sameYearFormula: "prev",
    prevLandPrice: "900,000",
    ...over,
  } as BuildingStdPriceFormState;
}

describe("§164⑧ 연도 교차 opt-in", () => {
  it("OFF면 종전과 같다 — 환산 입력이 엔진에 실리지 않는다", () => {
    const input = toEngineInput(crossYearForm({ crossYearSameAdjust: false }));
    expect(input.holdingMonths).toBeUndefined();
    expect(input.prevLandPricePerM2).toBeUndefined();
  });

  it("★ ON이면 엔진 게이트에 도달한다 — holdingMonths가 실린다", () => {
    const input = toEngineInput(crossYearForm({ crossYearSameAdjust: true }));
    expect(input.holdingMonths).toBe(8);
    expect(input.adjustMonths).toBe(12);
    expect(input.sameYearFormula).toBe("prev");
    expect(input.prevLandPricePerM2).toBe(900_000);
  });

  it("ON이면 검증도 같은 필수 입력을 요구한다 (④↔⑧ 동일 축)", () => {
    const missing = crossYearForm({ crossYearSameAdjust: true, holdingMonths: "" });
    expect(validateBuildingStdPriceForm(missing)).toContain("보유월수");
  });

  it("창(취득연도+1년)을 넘으면 ON이어도 실리지 않는다", () => {
    const input = toEngineInput(crossYearForm({ crossYearSameAdjust: true, transferYear: "2008" }));
    expect(input.holdingMonths).toBeUndefined();
  });
});

/**
 * Pre-Do anchor — **F-16**(기준시가 코드리뷰 2026-08-26, 🟠 high · SPLIT) **잔존 반쪽**.
 *
 * F-12 수정(`isSameAdjustmentPeriodConversion` 신설)이 엔진·④변환·단일시점 ⑧검증·UI 를
 * 한 leaf 로 묶으면서 **하한(양도 ≥ 취득)** 을 leaf 안에 넣었다. 그런데
 * `building-std-price-validate.ts:221` 의 `crossYearAdjust` **한 곳만** 술어를 손으로
 * 다시 적은 채 남아 하한이 빠져 있다 — 같은 파일이 leaf 를 이미 import 하고 있는데도.
 *
 * ## 실측 (2026-09-12 · 취득 2022 · 양도 2021 · 토글 ON)
 *
 * | 층 | 판정 | 결과 |
 * |---|---|---|
 * | ⑧ validate `crossYearAdjust` | **true**(하한 없음) | 보유월수·조정월수를 요구, 양도 구조·용도·공시지가는 **면제** |
 * | ④ `toEngineInput` (leaf) | false | `transfer: {structureKey:"", usageNo:0, landPricePerM2:0}` 를 싣는다 |
 * | 엔진 (leaf) | false | **「양도시: 구조 미선택」 throw** |
 * | UI `sec1648Active` (leaf) | false | §164⑧ 섹션(보유월수 칸) **미렌더** |
 * | UI 토글 `crossYearWindow` | false | 토글 **미렌더** — 켜진 플래그를 끌 수 없다 |
 *
 * ⇒ 보유월수를 안 넣은 상태로 역순이 되면 **「보유월수를 입력하세요」로 차단되는데
 *    그 칸도 토글도 화면에 없다** — 해소 불가 dead-end.
 *
 * 법령: 「소득세법 시행규칙」 제80조 제1항 제1호 본문 *"취득일이 속하는 연도의 다음 연도
 * 말일 이전에 양도하는 경우"* — 양도가 취득 뒤라는 사실이 요건에 흡수돼 있다.
 *
 * ⚠️ 「양도연도 < 취득연도」 **자체**를 차단하는 것은 **별건**이다(리뷰 F-16 제안 말미).
 *    이 anchor 는 역순을 차단하지 않고, 역순일 때 §164⑧ 축이 **네 층에서 같은 답**을
 *    내는지만 고정한다.
 */
describe("F-16 · §164⑧ 술어는 ④·⑧·엔진·UI 가 같은 leaf 를 쓴다 (역순 연도)", () => {
  /** 취득 2022 → 양도 2021 (역순) */
  const reversed = (over: Partial<BuildingStdPriceFormState> = {}) =>
    crossYearForm({ acquisitionYear: "2022", transferYear: "2021", crossYearSameAdjust: true, ...over });

  it("★ 역순이면 ⑧검증도 §164⑧ 축에서 빠진다 — 보유월수를 묻지 않는다", () => {
    // 수정 전: "동일조정기간 양도는 보유월수를 입력하세요(1개월 미만=1)."
    //   그 입력 칸은 UI 가 leaf 로 숨기므로 화면에 없다 ⇒ 해소 불가 차단.
    expect(validateBuildingStdPriceForm(reversed({ holdingMonths: "" }))).not.toContain("보유월수");
  });

  /**
   * 🔑 **이 축의 구별력은 「연도 순서」 가드로 이관됐다** (2026-09-12).
   *
   * 역순 연도를 `transferYearVisible` 모드에서 **더 앞에서** 차단하므로, 아래 두 건은
   * §164⑧ 손술어를 복원해도 **같은 메시지로 실패한다**(뮤테이션 실측: 손술어 복원 →
   * 동일 2건 실패 = 구별력 0). 따라서 이 둘은 이제 **「어느 층이 먼저 막는가」의 계약**을
   * 고정하는 것이지 손술어 잔존을 잡지 못한다.
   *
   * ⇒ 손술어 잔존을 실제로 잡는 것은 위 「보유월수를 묻지 않는다」 1건과
   *   ④·엔진이 공유하는 leaf 다. `building-std-year-order.anchor.test.tsx` 가 가드 축을 맡는다.
   */
  it("★ 역순은 「연도 순서」 가드가 먼저 막는다 — §164⑧ 축에 도달하지 않는다", () => {
    expect(validateBuildingStdPriceForm(reversed())).toContain("취득 후에만 양도할 수 있습니다");
  });

  it("역방향 가드 — 정상 교차(취득2005 → 양도2006)는 종전 그대로 §164⑧ 축이다", () => {
    expect(validateBuildingStdPriceForm(crossYearForm({ crossYearSameAdjust: true, holdingMonths: "" })))
      .toContain("보유월수");
    expect(validateBuildingStdPriceForm(crossYearForm({ crossYearSameAdjust: true }))).toBeNull();
  });

  it("역방향 가드 — 동일연도는 opt-in 과 무관하게 §164⑧ 축이다", () => {
    const same = crossYearForm({ transferYear: "2005", crossYearSameAdjust: false, holdingMonths: "" });
    expect(validateBuildingStdPriceForm(same)).toContain("보유월수");
  });

  it("역방향 가드 — 양도 입력을 채워도 역순 자체는 통과하지 않는다 (연도 순서 가드)", () => {
    const filled = reversed({
      transStructureKey: "rc", transUsageNo: "1", transLandPrice: "1,100,000",
    });
    expect(validateBuildingStdPriceForm(filled)).toContain("취득 후에만 양도할 수 있습니다");
  });
});
