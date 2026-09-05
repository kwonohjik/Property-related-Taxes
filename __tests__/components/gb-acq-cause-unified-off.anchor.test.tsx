/**
 * @vitest-environment jsdom
 *
 * anchor U-1~U-7 — 일반건물 취득 카드: **분리 OFF는 단일 「취득」 카드**
 *
 * ## 왜 바꾸는가 (사용자 보고 2026-08-07)
 *
 * 종전에는 분리 토글이 OFF여도 「토지 취득」·「건물 취득」 두 카드가 각각 취득원인 라디오를
 * 그렸다. 세 가지가 어긋나 있었다:
 *
 *   ① 토글 설명문은 "취득일·**취득원인**·취득가액 산정 방식을 토지·건물 각각 입력합니다"인데
 *      취득원인은 OFF에서도 이미 각각이었다 — 문구와 화면 불일치.
 *   ② 자산 전체 축인 「취득일」·「취득가액 산정 방식」이 **토지 카드 안**에 그려져
 *      토지 전용 값으로 읽혔다(라벨도 "취득일" — `CompanionAcqPurchaseBlock:190`의
 *      `isSplit`이 GB에서는 항상 false라 "건물 취득일"로 갈라지지 않는다).
 *   ③ OFF에서 건물 원인만 다르게 고르면 조합에 따라 조용히 차단되거나(한쪽만 상속 —
 *      `transfer-tax-validate-gb.ts:145`) 입력 칸 없이 통과했다.
 *
 * ## 고정 계약
 *
 *   U-1  OFF — 취득원인 라디오는 **1개**다 (토지·건물 카드 제목이 없다)
 *   U-2  OFF — 취득원인 변경은 토지·건물 두 필드를 **한 배치**로 기록한다 (불변식)
 *   U-3  OFF — 이월과세는 건물 축에 없으므로 건물 원인은 `purchase`로 기록한다
 *              (마이그레이션 M-2 `calc-wizard-asset-migrate-phase3.ts:61-75`와 같은 규칙)
 *   U-4  OFF — 「건물 신축(자가건축)」은 분리를 **같은 배치로 자동 ON** 한다 (진입 경로 보존)
 *   U-5  토글 OFF 전환은 날짜와 **취득원인**을 함께 되맞춘다
 *   U-6  ON  — 종전대로 토지·건물 카드가 각각 취득원인을 갖는다 (회귀 0)
 *   U-7  OFF — 「취득일」·「취득가액 산정 방식」이 토지 카드가 아니라 공통 영역에 있다
 *
 * ⚠️ **두 필드를 한 번의 `onChange`로** 넘기는 것이 핵심이다 — 나눠 부르면 뒤 호출이 앞의
 *    patch를 stale spread로 덮어쓴다(memory `feedback_multikey_patch_stale_spread_overwrite`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import { migrateGeneralBuildingFields } from "@/lib/stores/calc-wizard-asset-migrate-phase3";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const LAND = "1999-05-24";
const BUILDING = "2015-03-01";

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: LAND,
    landAcquisitionDate: LAND,
    hasSeperateLandAcquisitionDate: false,
    ...over,
  } as AssetForm;
}

function renderCards(over: Partial<AssetForm> = {}) {
  const onChange = vi.fn();
  render(
    <GeneralBuildingAcquisitionCards
      asset={gbAsset(over)}
      onChange={onChange}
      transferDate="2026-02-16"
    />,
  );
  return onChange;
}

/** 마지막 patch — 한 배치인지 함께 본다. */
function lastPatch(onChange: ReturnType<typeof vi.fn>): Partial<AssetForm> {
  return (onChange.mock.calls.at(-1)?.[0] ?? {}) as Partial<AssetForm>;
}

describe("U-1 — 분리 OFF는 카드가 하나다", () => {
  it("토지·건물 카드 제목이 없다", () => {
    renderCards();
    expect(screen.queryByText("토지 취득")).toBeNull();
    expect(screen.queryByText("건물 취득")).toBeNull();
  });

  it("취득원인 라디오가 1개다 — 종전엔 2개였다", () => {
    renderCards();
    expect(screen.getAllByText("취득원인", { exact: true })).toHaveLength(1);
  });

  it("토글은 여전히 최상단에 있다 — 상속이어도 끌 수 있어야 한다 (A-6-1 승계)", () => {
    renderCards({ acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance" });
    expect(screen.getByText("토지·건물 취득일 다름")).toBeTruthy();
  });
});

describe("U-2·U-3 — OFF의 취득원인은 두 축을 함께 기록한다", () => {
  it("상속 선택 — 토지·건물 원인이 한 배치로 함께 간다", () => {
    const onChange = renderCards();
    fireEvent.click(screen.getByText("상속"));
    expect(lastPatch(onChange)).toMatchObject({
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
    });
  });

  it("증여 선택 — 마찬가지로 두 축", () => {
    const onChange = renderCards();
    fireEvent.click(screen.getByText("증여"));
    expect(lastPatch(onChange)).toMatchObject({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
    });
  });

  /**
   * 🔄 **U-3은 2026-09-05(Q09)에 결론이 뒤집혔다.** 종전 전제였던 「건물 축에 이월과세가
   * 없다」가 사실이 아니다 — `BUILDING_CAUSE_OPTIONS`에 이미 있고, 법 §97의2①도
   * 「**토지·건물** 등」이다. 강등의 결과는 조용했다: 화면은 이월과세인데 건물만 매매로
   * 계산돼 토지분만 증여자 취득가액·증여세 상당액을 승계했다.
   */
  it("U-3(정정) 이월과세 — 건물 축도 함께 이월과세로 간다", () => {
    const onChange = renderCards();
    fireEvent.click(screen.getByText("이월과세(증여)"));
    expect(lastPatch(onChange)).toMatchObject({
      acquisitionCause: "carryover_gift",
      gbBuildingAcquisitionCause: "carryover_gift",
    });
  });
});

describe("U-4 — 신축 진입 경로는 사라지지 않는다", () => {
  it("「건물 신축(자가건축)」은 분리를 같은 배치로 자동 ON 한다", () => {
    const onChange = renderCards();
    fireEvent.click(screen.getByText("건물 신축(자가건축)"));
    expect(lastPatch(onChange)).toMatchObject({
      gbBuildingAcquisitionCause: "newConstruction",
      hasSeperateLandAcquisitionDate: true,
    });
  });

  it("토지 취득원인은 신축으로 덮어쓰지 않는다 — 토지는 살 수밖에 없다", () => {
    const onChange = renderCards({ acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance" });
    fireEvent.click(screen.getByText("건물 신축(자가건축)"));
    expect(lastPatch(onChange)).not.toHaveProperty("acquisitionCause");
  });
});

describe("U-5 — 토글 OFF 전환은 날짜와 원인을 함께 되맞춘다", () => {
  it("건물 원인이 달랐으면 토지 원인으로 되맞춘다", () => {
    const onChange = renderCards({
      hasSeperateLandAcquisitionDate: true,
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "newConstruction",
      landAcquisitionDate: LAND,
      acquisitionDate: BUILDING,
    });
    // 이름으로 특정 — 이월과세 블록도 자체 switch를 갖는다(무방어 getByRole은 strict 위반)
    fireEvent.click(screen.getByRole("switch", { name: /토지·건물 취득일 다름/ }));
    expect(lastPatch(onChange)).toMatchObject({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: BUILDING,
      gbBuildingAcquisitionCause: "inheritance",
    });
  });

  it("토지 원인이 이월과세면 건물도 이월과세로 되맞춘다 (U-3 정정과 같은 규칙)", () => {
    const onChange = renderCards({
      hasSeperateLandAcquisitionDate: true,
      acquisitionCause: "carryover_gift",
      gbBuildingAcquisitionCause: "newConstruction",
      landAcquisitionDate: LAND,
      acquisitionDate: BUILDING,
    });
    // 이름으로 특정 — 이월과세 블록도 자체 switch를 갖는다(무방어 getByRole은 strict 위반)
    fireEvent.click(screen.getByRole("switch", { name: /토지·건물 취득일 다름/ }));
    expect(lastPatch(onChange)).toMatchObject({ gbBuildingAcquisitionCause: "carryover_gift" });
  });
});

describe("U-6 — 분리 ON은 종전 구조를 유지한다 (회귀 0)", () => {
  const on = { hasSeperateLandAcquisitionDate: true, acquisitionDate: BUILDING } as Partial<AssetForm>;

  it("토지·건물 카드가 각각 나타난다", () => {
    renderCards(on);
    expect(screen.getByText("토지 취득")).toBeTruthy();
    expect(screen.getByText("건물 취득")).toBeTruthy();
  });

  it("취득원인이 2개다", () => {
    renderCards(on);
    expect(screen.getAllByText("취득원인", { exact: true })).toHaveLength(2);
  });

  it("건물 카드의 원인 변경은 건물 축만 건드린다", () => {
    const onChange = renderCards(on);
    const buildingCard = screen.getByText("건물 취득").closest("div.rounded-lg") as HTMLElement;
    fireEvent.click(within(buildingCard).getByText("상속"));
    expect(lastPatch(onChange)).toEqual({ gbBuildingAcquisitionCause: "inheritance" });
  });

  it("건물 취득일 칸이 나타난다 (A-6-3 승계)", () => {
    renderCards(on);
    expect(screen.getByText("건물 취득일")).toBeTruthy();
  });
});

/**
 * U-8 — **초기 상태부터** 불변식이 성립한다 (dead-end 가드).
 *
 * `makeDefaultAsset`이 건물 축을 `undefined`로 두면, 사용자가 취득원인 라디오를 한 번도
 * 건드리지 않고 분리를 켰을 때 건물 취득원인이 빈 채로 남는다. 그 상태로 환산 모드를 고르면
 * `transfer-tax-validate-gb.ts:365`가 막는데 **OFF에는 고칠 칸이 없다**.
 */
describe("U-8 — 신규 자산의 두 취득원인은 처음부터 같다", () => {
  it("makeDefaultAsset이 건물 축을 비워두지 않는다", () => {
    const a = makeDefaultAsset(1);
    expect(a.gbBuildingAcquisitionCause).toBe("purchase");
    expect(a.acquisitionCause).toBe("purchase");
  });

  it("라디오를 건드리지 않고 분리를 켜도 건물 취득원인이 선택돼 있다", () => {
    // 폼 기본값 그대로 — over로 덮지 않는다
    const onChange = vi.fn();
    render(
      <GeneralBuildingAcquisitionCards
        asset={{ ...makeDefaultAsset(1), assetKind: "general_building", hasSeperateLandAcquisitionDate: true } as AssetForm}
        onChange={onChange}
        transferDate="2026-02-16"
      />,
    );
    // 취득원인 그룹으로 좁힌다 — 건물 카드에는 「산정 방식」 라디오도 있다
    const checked = document.querySelectorAll(
      'input[name="gbBuildingAcquisitionCause"]:checked',
    );
    expect(checked).toHaveLength(1);
    expect((checked[0] as HTMLInputElement).value).toBe("purchase");
  });
});

/**
 * U-9 — legacy 세션의 「OFF + 원인 불일치」를 마이그레이션이 정리한다.
 *
 * 종전 UI는 OFF에서도 두 라디오를 그려 「토지 매매 + 건물 증여」를 저장할 수 있었다. 새 UI에는
 * 그 상태를 표현할 칸이 없으므로 그대로 두면 **화면에 없는 값이 payload를 가른다**.
 */
describe("U-9 — 마이그레이션이 OFF 불변식을 복원한다", () => {
  const gb = (over: Record<string, unknown>) => {
    const a: Record<string, unknown> = {
      assetKind: "general_building",
      acquisitionCause: "purchase",
      hasSeperateLandAcquisitionDate: false,
      ...over,
    };
    migrateGeneralBuildingFields(a);
    return a;
  };

  /**
   * 🔴 **되맞추지 않는다 — 분리를 켠다.**
   *
   * 건물 원인을 토지 원인으로 덮으면 사용자가 저장한 사실이 조용히 바뀌고, 「토지 상속 + 건물
   * 매매」가 「둘 다 상속」이 되어 **취득가액 산정 자체가 달라진다**. 실제로 그 구현은 부분 상속
   * 가드(V-5)를 무력화시켰다 — E2E `general-building-partial-inheritance` PI-4가 잡았다.
   */
  it("OFF + 건물만 증여 → 값을 보존하고 분리를 켠다", () => {
    const a = gb({ gbBuildingAcquisitionCause: "gift" });
    expect(a.gbBuildingAcquisitionCause).toBe("gift");
    expect(a.hasSeperateLandAcquisitionDate).toBe(true);
  });

  it("OFF + 토지 상속 · 건물 매매 → 부분 상속을 지운 채 통과시키지 않는다", () => {
    const a = gb({ acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "purchase" });
    expect(a.gbBuildingAcquisitionCause).toBe("purchase"); // 되맞추지 않는다
    expect(a.hasSeperateLandAcquisitionDate).toBe(true);
  });

  it("OFF + 건물 신축도 같은 규칙 (UI의 Q4와 동일)", () => {
    const a = gb({ gbBuildingAcquisitionCause: "newConstruction" });
    expect(a.gbBuildingAcquisitionCause).toBe("newConstruction");
    expect(a.hasSeperateLandAcquisitionDate).toBe(true);
  });

  it("OFF + 원인이 이미 같으면 분리를 켜지 않는다 (정상 세션 무변경)", () => {
    const a = gb({ gbBuildingAcquisitionCause: "purchase" });
    expect(a.hasSeperateLandAcquisitionDate).toBe(false);
  });

  it("분리 ON은 건드리지 않는다 — 파트별 원인이 정당한 상태다 (회귀 0)", () => {
    const a = gb({
      hasSeperateLandAcquisitionDate: true,
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "gift",
    });
    expect(a.gbBuildingAcquisitionCause).toBe("gift");
  });

  it("종전 M-2 — 미입력이면 토지 원인을 복사한다 (회귀 0)", () => {
    expect(gb({ acquisitionCause: "gift" }).gbBuildingAcquisitionCause).toBe("gift");
    // 🔄 carryover_gift도 건물 축의 유효값이다 (Q09 정정 — UI `toBuildingCause`와 같이 움직인다)
    expect(gb({ acquisitionCause: "carryover_gift" }).gbBuildingAcquisitionCause).toBe(
      "carryover_gift",
    );
  });
});

describe("U-7 — OFF의 취득일·산정방식은 공통 영역이다", () => {
  it("「취득일」이 렌더되고, 그것을 감싸는 토지 카드가 없다", () => {
    renderCards();
    // 자산 전체 축이므로 「토지 취득일」이 아니라 「취득일」이다
    expect(screen.getAllByText("취득일", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryByText("토지 취득")).toBeNull();
  });

  it("「취득가액 산정 방식」도 공통 영역에 있다", () => {
    renderCards();
    expect(screen.getAllByText("취득가액 산정 방식", { exact: true }).length).toBeGreaterThan(0);
    // 파트별 라디오는 OFF에서 나오지 않는다 (A-6-7 승계)
    expect(screen.queryByText("토지 취득가액 산정 방식")).toBeNull();
    expect(screen.queryByText("건물 취득가액 산정 방식")).toBeNull();
  });
});
