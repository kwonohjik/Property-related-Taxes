/**
 * anchor: ③ 일시적 2주택·합가 특례 섹션 — ⑤ 렌더 게이트와 ⑧ 검증 게이트가 **같은 술어**다.
 *
 * 종전에는 세 층이 각자 다른 술어를 써서 **양방향**으로 어긋났다.
 *
 * | 방향 | 조합 | 종전 (실측) |
 * |---|---|---|
 * | 화면엔 없는데 ⑧이 요구 | 2채 → 1채 정정 후 `replacementHouseSpecial` 잔존 | 차단 메시지 **4건** — 채울 칸도, 토글을 끌 컨트롤도 없다 |
 * | 화면엔 있는데 ⑧이 안 봄 | 입주권 2채 + 일시적 2주택 ON + 신규 취득일 미입력 | 메시지 **0건** — ④가 키를 안 만들어 §155①이 조용히 누락 |
 *
 * ⑧의 종전 게이트 `provisoGate(...).mode === "temporary_two_house"`는 **§154① 단서 카드**의
 * 맥락(1세대 + `assetKind === "housing"` + 정확히 2채)이라 이 섹션의 노출 조건보다 좁았다.
 */
import { describe, it, expect } from "vitest";
import { temporaryTwoHouseSectionVisible } from "@/lib/calc/temporary-two-house-section-scope";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-03-01",
    acquisitionPrice: "600000000",
    actualSalePrice: "2000000000",
    ...over,
  }) as AssetForm;

const form = (over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [asset()],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "2000000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "36",
    ...over,
  }) as unknown as TransferFormData;

/** ③ 섹션은 4단계(내부 step 1)에서 검증된다. */
const msgs = (f: TransferFormData) => collectStepIssues(1, f).map((i) => i.message);

describe("③ 일시적 2주택 섹션 — 노출 게이트 = 검증 게이트", () => {
  it("T-1: 술어 — 주택 계열 4종 × 2채 이상에서만 참", () => {
    const v = (kind: string, n: string | undefined) =>
      temporaryTwoHouseSectionVisible({ primaryAssetKind: kind, householdHousingCount: n });
    expect(v("housing", "2")).toBe(true);
    expect(v("right_to_move_in", "2")).toBe(true);
    expect(v("presale_right", "3")).toBe(true);
    expect(v("redevelopment_apt", "2")).toBe(true);
    // 1채·비주택·미입력은 섹션이 없다.
    expect(v("housing", "1")).toBe(false);
    expect(v("land", "2")).toBe(false);
    expect(v("commercial_building", "3")).toBe(false);
    expect(v("housing", undefined)).toBe(false);
  });

  it("🔑 T-2: 1채로 정정 후 stale 대체주택 플래그 → 화면에 없는 4필드를 요구하지 않는다", () => {
    const stale = form({ householdHousingCount: "1", replacementHouseSpecial: true });
    expect(msgs(stale).filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(0);
    // 섹션이 보이는 2채에서는 **종전대로 4건 전부** 요구한다(축을 죽인 게 아니다).
    const visible = form({ householdHousingCount: "2", replacementHouseSpecial: true });
    expect(msgs(visible).filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(4);
  });

  it("🔑 T-3: 자산 종류를 주택 외로 바꿔도 대체주택 4필드가 계산을 막지 않는다", () => {
    const land = form({
      assets: [asset({ assetKind: "land" })],
      householdHousingCount: "2",
      replacementHouseSpecial: true,
    });
    expect(msgs(land).filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(0);
  });

  it("🔑 T-4: 입주권 2채 + 일시적 2주택 ON + 신규 취득일 미입력 → 이제 침묵하지 않는다", () => {
    const right = form({
      assets: [asset({ assetKind: "right_to_move_in" })],
      householdHousingCount: "2",
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "",
    });
    expect(msgs(right)).toContain("일시적 2주택: 신규 주택 취득일을 입력하세요.");
  });

  it("🔑 T-5: 3주택 이상 세대에서도 요구한다 (종전 게이트는 정확히 2채만 봤다)", () => {
    const three = form({
      householdHousingCount: "3",
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "",
    });
    expect(msgs(three)).toContain("일시적 2주택: 신규 주택 취득일을 입력하세요.");
  });

  it("T-6: 섹션이 없으면(1채) 일시적 2주택 stale 플래그도 차단하지 않는다", () => {
    const stale = form({
      householdHousingCount: "1",
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "",
    });
    expect(msgs(stale).filter((m) => m.startsWith("일시적 2주택:"))).toHaveLength(0);
  });

  it("T-7: 날짜를 채우면 통과한다 — 요건 미달 판정은 엔진 몫이다", () => {
    const ok = form({
      householdHousingCount: "2",
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "2023-06-01",
    });
    expect(msgs(ok).filter((m) => m.startsWith("일시적 2주택:"))).toHaveLength(0);
  });
});
