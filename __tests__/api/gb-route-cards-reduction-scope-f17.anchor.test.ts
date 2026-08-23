/**
 * anchor: 일반건물 카드에 감면을 실을 때의 **파트 범위** (F17-A leaf, 2026-08-23)
 *
 * ## §77·§77의2 — 건물 파트도 대상이다
 *
 * 조특법 §77①의 「**토지등**」은 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」
 * §2 1호 → §3 2호로 위임되어 「토지와 함께 … 필요한 입목, **건물**, 그 밖에 토지에 정착된
 * 물건」을 명문에 담는다. 조특령 §72에 자산 종류를 좁히는 문언이 없다.
 *
 * ## §77의3 — **건물은 §20 협의매수 경로에서만** 대상이다 ⇒ `purchaseRoute`가 가른다
 *
 * 조특법 §77의3①은 「해당 토지등을 같은 법 **제17조**에 따른 토지매수의 청구 또는 같은 법
 * **제20조**에 따른 협의매수를 통하여 … 양도」로 두 경로를 병렬 열거하는데, 대상 범위가 다르다
 * (「개발제한구역의 지정 및 관리에 관한 특별조치법」 원문 · MST 286509):
 *
 * | 경로 | 문언 | 대상 |
 * |---|---|---|
 * | §17① | 「… 그 효용이 현저히 감소된 토지나 … 사실상 불가능하게 된 토지(이하 "**매수대상토지**")」 | **토지만** |
 * | §20① | 「개발제한구역의 **토지와 그 토지의 정착물**(이하 "토지등")」 | 토지 + **건물** |
 *
 * 🔴 **정정 (2026-08-24)** — F17-A 당시 이 파일은 두 가지를 잘못 적었다:
 * 1. 「입력축이 §17/§20을 구분하지 못한다」 ⇒ **`purchaseRoute` 축을 신설**해 구분한다.
 *    `claim`(§17)일 때만 건물 파트에서 빠지고, `negotiated`(§20)·②는 건물분도 대상이다.
 * 2. 「§77의3은 세부 입력 위젯이 없어 ⑧에서 차단된다」 ⇒ **사실이 아니었다.** 서브패널은
 *    `app/calc/transfer-tax/steps/Step5.tsx`에 처음부터 있었고, 값을 채우면 ⑧을 통과해
 *    엔진까지 도달한다(P-0 실측: land 자산 감면 174,774,000원). 당시 관측한 차단은
 *    **기본값이 비어 있어서**였지 위젯 부재가 아니다.
 */
import { describe, it, expect } from "vitest";
import { buildProperties } from "@/app/api/calc/transfer/general-building-route-cards";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";
import type { TransferReduction } from "@/lib/tax-engine/transfer-tax";

const D = (s: string) => new Date(s);

function card(id: string, type: "land" | "general_building_unit"): AssetCardForAggregate {
  return {
    propertyId: id,
    propertyLabel: id,
    propertyType: type,
    transferPrice: 500_000_000,
    acquisitionPrice: 100_000_000,
    expenses: 0,
    usedEstimatedAcquisition: false,
    estimatedBase: 0,
    estimatedDeduction: 0,
    acquisitionDate: D("2009-03-01"),
    transferDate: D("2024-03-01"),
    isNonBusinessLand: false,
  } as AssetCardForAggregate;
}

const CARDS = [card("land", "land"), card("building", "general_building_unit")];

const RED_77: TransferReduction = {
  type: "public_expropriation",
  cashCompensation: 800_000_000,
  bondCompensation: 0,
  bondHoldingYears: null,
  businessApprovalDate: D("2024-01-01"),
};

/** ① §17 토지매수 청구 — 「매수대상토지」라 건물분은 대상이 아니다. */
const RED_77_3: TransferReduction = {
  type: "gb_designated_land",
  branch: "in_zone",
  purchaseRoute: "claim",
  designationDate: D("2000-01-01"),
  triggerDate: D("2024-01-01"),
  residedFromAcqToTrigger: true,
};

/** ① §20 협의매수 — 「토지와 그 토지의 정착물」이라 건물분도 대상이다. */
const RED_77_3_NEGOTIATED: TransferReduction = { ...RED_77_3, purchaseRoute: "negotiated" };

/** ② 해제 후 — 공익사업법 협의매수·수용이라 §17/§20 축 자체가 없다(「토지등」). */
const RED_77_3_RELEASED: TransferReduction = {
  type: "gb_designated_land",
  branch: "released",
  designationDate: D("2000-01-01"),
  triggerDate: D("2024-01-01"),
  releasedDate: D("2023-06-01"),
  residedFromAcqToTrigger: true,
};

const byId = (props: ReturnType<typeof buildProperties>, id: string) =>
  props.find((p) => p.propertyId === id)!;

describe("F17-A leaf · 카드별 감면 범위", () => {
  it("GBS-01: 🔴 감면 배열이 **카드에 실린다** (종전 `reductions: []` 하드코딩)", () => {
    const props = buildProperties(CARDS, 0, undefined, undefined, [RED_77]);
    expect(byId(props, "land").reductions).toHaveLength(1);
    expect(byId(props, "building").reductions).toHaveLength(1);
  });

  it("GBS-02: §77은 **토지·건물 모두** 대상이다 (「토지등」에 건물 포함)", () => {
    const props = buildProperties(CARDS, 0, undefined, undefined, [RED_77]);
    expect(byId(props, "building").reductions![0].type).toBe("public_expropriation");
  });

  it("GBS-03: 🔴 §17 매수청구면 §77의3이 **건물 카드에서 빠진다** (매수대상토지 = 토지만)", () => {
    const props = buildProperties(CARDS, 0, undefined, undefined, [RED_77_3]);
    expect(byId(props, "land").reductions).toHaveLength(1);
    expect(byId(props, "building").reductions).toHaveLength(0);
  });

  it("GBS-06: 🔴 §20 협의매수면 **건물 카드에도 남는다** (「토지와 그 토지의 정착물」)", () => {
    const props = buildProperties(CARDS, 0, undefined, undefined, [RED_77_3_NEGOTIATED]);
    expect(byId(props, "land").reductions).toHaveLength(1);
    expect(byId(props, "building").reductions!.map((r) => r.type)).toEqual(["gb_designated_land"]);
  });

  it("GBS-07: ② 해제 후(공익사업법)도 건물 카드에 남는다 — §17/§20 축 대상이 아니다", () => {
    const props = buildProperties(CARDS, 0, undefined, undefined, [RED_77_3_RELEASED]);
    expect(byId(props, "building").reductions).toHaveLength(1);
  });

  it("GBS-08: ① 경로 미상은 **좁은 쪽(제외)** 으로 남긴다 (⑧이 앞서 차단하지만 방어)", () => {
    const noRoute = { ...RED_77_3, purchaseRoute: undefined };
    const props = buildProperties(CARDS, 0, undefined, undefined, [noRoute]);
    expect(byId(props, "building").reductions).toHaveLength(0);
  });

  it("GBS-04: 섞여 있으면 §77만 건물에 남는다 (전량 배제가 아니다)", () => {
    const props = buildProperties(CARDS, 0, undefined, undefined, [RED_77, RED_77_3]);
    expect(byId(props, "land").reductions).toHaveLength(2);
    expect(byId(props, "building").reductions!.map((r) => r.type)).toEqual([
      "public_expropriation",
    ]);
  });

  it("GBS-05: 미전달이면 빈 배열 — 기존 호출부 무변경 (회귀 0)", () => {
    const props = buildProperties(CARDS, 0);
    expect(byId(props, "land").reductions).toEqual([]);
    expect(byId(props, "building").reductions).toEqual([]);
  });
});
