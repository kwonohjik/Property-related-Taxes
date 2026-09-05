/**
 * anchor: 중과 한시유예 입력 범위 — ⑤·④·⑧이 같은 술어를 쓴다 (2026-09-05 · 코드리뷰 Q03)
 *
 * ## 종전 결함 — 세 게이트가 갈라져 Zod 400이 났다
 *
 * | 층 | 종전 조건 |
 * |---|---|
 * | ⑤ 위젯 | `isOneHousehold && 주택수≥2 && (houses>0 ‖ 분양권>0)` |
 * | ④ 전송 | `housesPayload` = `isHousingLike(주자산) && (houses>0 ‖ 분양권>0)` |
 * | ⑧ validate | `!한시배제창 && **houses.length>0**` |
 *
 * 1. **분양권·입주권만** 있으면 ⑤는 열리고 ④는 보내는데 ⑧이 검증하지 않는다 →
 *    매매계약일을 비운 채 계산하면 ⑫ Zod가 `contractDate`를 요구해 **400**.
 * 2. **한시배제 창 안**에서는 ⑤가 숨고 ⑧이 건너뛰는데 ④에는 그 게이트가 없다 →
 *    창 밖에서 넣어 둔 stale 값이 전송돼 같은 400.
 *
 * ⚠️ 「법령 질문」이 아니었다 — §167의3①12의2 본문에는 1세대 요건이 없지만, 각 호가 놓인
 *    §167의3① **각 호 외의 부분**이 「…3개 이상 소유하고 있는 **1세대**가 소유하는 주택으로서」로
 *    시작하므로 1세대 항은 유지가 맞다(A축 Q03 조문 확인 결과). 결함은 게이트 정렬이다.
 */
import { describe, it, expect } from "vitest";
import { gracePeriodInScope } from "../../lib/calc/grace-period-scope";
import { createDefaultTransferFormData } from "../../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "../../lib/stores/calc-wizard-store";

/** 한시배제 창 **밖** 양도 — 2026-05-09 종료 이후 */
const OUT_OF_WINDOW = "2026-06-01";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: OUT_OF_WINDOW,
    assets: [
      { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-03-01" },
    ],
    isOneHousehold: true,
    householdHousingCount: "3",
    houses: [{ id: "h1", acquisitionDate: "2016-01-01" }],
    presaleRights: [],
    ...over,
  } as unknown as TransferFormData;
}

describe("gracePeriodInScope — 세 층 공용 술어", () => {
  it("보유 주택 1건 이상 → 범위 안 (종전에도 세 층 모두 동의하던 케이스)", () => {
    expect(gracePeriodInScope(form())).toBe(true);
  });

  it("🔴 분양권·입주권만 있고 보유 주택 0건 → **범위 안** (종전에는 ⑧만 빠져 400이 났다)", () => {
    expect(
      gracePeriodInScope(
        form({
          houses: [],
          presaleRights: [{ id: "p1", acquisitionDate: "2021-05-01" }],
        } as unknown as Partial<TransferFormData>),
      ),
    ).toBe(true);
  });

  it("🔴 한시배제 창 안 → 범위 밖 (종전에는 ④에만 이 게이트가 없어 stale 값이 전송됐다)", () => {
    // 창 안에서는 `checkGracePeriodExemption`의 가목 우선 게이트가 내용과 무관하게
    // `suspended: true`를 내므로 이 입력은 **증명 가능한 no-op**이다.
    expect(gracePeriodInScope(form({ transferDate: "2024-06-01" }))).toBe(false);
  });

  it("주택 계열이 아닌 자산 → 범위 밖 (④가 이미 요구하던 조건)", () => {
    expect(
      gracePeriodInScope(
        form({
          assets: [{ ...makeDefaultAsset(1), assetKind: "land", acquisitionDate: "2015-03-01" }],
        } as unknown as Partial<TransferFormData>),
      ),
    ).toBe(false);
  });

  it("1세대 미해당 → 범위 밖 (§167의3① 각 호 외의 부분이 「1세대가 소유하는 주택」)", () => {
    expect(gracePeriodInScope(form({ isOneHousehold: false }))).toBe(false);
  });

  it("세대 주택 1채 → 범위 밖 (중과 축 자체가 없다)", () => {
    expect(gracePeriodInScope(form({ householdHousingCount: "1" }))).toBe(false);
  });

  it("보유 항목이 하나도 없으면 범위 밖 (엔진이 houses[] 경로에서만 소비한다)", () => {
    expect(
      gracePeriodInScope(form({ houses: [], presaleRights: [] } as unknown as Partial<TransferFormData>)),
    ).toBe(false);
  });
});
