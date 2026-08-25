/**
 * anchor: 「주택 계열 자산」 술어의 **단일 소스화** — ⑤ 렌더 ↔ ④ 전송 (2026-08-25 · Q-3(b))
 *
 * ## 종전 결함 — 같은 이름 술어가 **3벌**, 정의는 **2:1**
 *
 * | 위치 | `redevelopment_apt` | 통제 대상 |
 * |---|---|---|
 * | `lib/calc/transfer-tax-api-helpers.ts` | ❌ | ④ 단건 `houses[]`·분양권 목록 전송 |
 * | `lib/calc/multi-transfer-tax-api.ts` | ❌ | ④ 다건 `houses[]` 전송 |
 * | `app/calc/transfer-tax/steps/Step4.tsx` | ✅ | ⑤ `HousesListSection` 렌더 |
 *
 * ⇒ 사용자는 재개발APT에서 세대 주택 목록을 **화면에서 채울 수 있는데 ④가 서버로 보내지
 *   않아** 그 값이 조용히 버려졌다. 다주택 중과 정밀 판정이 아예 돌지 않았다.
 *
 * 🔴 **착수 전 안전망 0건** — ④ 단건 술어에서 `right_to_move_in`을 빼도, 다건 복제본에서
 *    `housing`을 빼도 5,925건이 **전건 통과**했다.
 *
 * ## ⚠️ 엔진의 중과 술어와 합치지 않는다
 *
 * `SURCHARGE_FALLBACK_PROPERTY_TYPES`(엔진)와 현재 원소가 같지만 **축이 다르다**.
 * §104⑦은 「주택」만 대상이라 조합원입주권이 엔진 집합에서 빠질 예정인데(별건),
 * **이 집합에서는 빠지면 안 된다** — 입주권 양도자도 세대 주택 수를 세야 한다.
 */
import { describe, it, expect } from "vitest";
import { isHousingLike, HOUSING_LIKE_ASSET_KINDS } from "@/lib/calc/housing-like-asset";
import { isHousingLike as fromApiHelpers } from "@/lib/calc/transfer-tax-api-helpers";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { SURCHARGE_SUBJECT_PROPERTY_TYPES } from "@/lib/tax-engine/transfer-tax-surcharge-predicate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const houses = [
  { id: "h2", regionCode: "1168010100", acquisitionDate: "2015-01-01" },
  { id: "h3", regionCode: "1168010100", acquisitionDate: "2018-01-01" },
] as unknown as HouseEntry[];

const asset = (kind: AssetForm["assetKind"]): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: kind,
    acquisitionDate: "2005-04-09",
    regionCode: "1168010100",
  }) as AssetForm;

describe("주택 계열 술어 — 단일 소스", () => {
  it("HL-01: 🔴 **재개발APT가 포함된다** (종전 ④ 두 벌에서 누락)", () => {
    expect(isHousingLike("redevelopment_apt")).toBe(true);
  });

  it("HL-02: 주택·입주권·분양권 포함 · 토지·건물 제외", () => {
    for (const k of ["housing", "right_to_move_in", "presale_right"] as const) {
      expect(isHousingLike(k), k).toBe(true);
    }
    for (const k of ["land", "building", "commercial_building", "general_building"] as const) {
      expect(isHousingLike(k), k).toBe(false);
    }
  });

  it("HL-03: 🔑 ④ 단건 재export가 **같은 함수**다 (복제본 부활 봉인)", () => {
    expect(fromApiHelpers).toBe(isHousingLike);
  });

  it("HL-04: 🔴 ④가 재개발APT에 `houses[]`를 **싣는다** (종전 undefined)", () => {
    const payload = buildHousesPayload(asset("redevelopment_apt"), houses, 0, undefined);
    expect(payload).toBeDefined();
    expect(payload).toHaveLength(3); // 양도주택(selling) + 보유 2채
  });

  it("HL-05: 대조군 — 토지는 여전히 미전송 (게이트를 통째로 연 것이 아니다)", () => {
    expect(buildHousesPayload(asset("land"), houses, 0, undefined)).toBeUndefined();
    expect(buildHousesPayload(asset("building"), houses, 0, undefined)).toBeUndefined();
  });

  it("HL-06: ⚠️ 엔진 §104⑦ 집합과 **원소가 갈린다** — 합치면 정정이 입력 경로를 끊는다", () => {
    // 2026-08-25 승격: 종전엔 원소가 같아 `.not.toBe`(객체 동일성)로만 고정했다.
    // §104⑦ 정정으로 **실제로 갈렸다** — 이제 차집합을 직접 단언한다.
    expect(HOUSING_LIKE_ASSET_KINDS).not.toBe(SURCHARGE_SUBJECT_PROPERTY_TYPES);

    // 🔑 입주권·분양권은 **④⑤에는 있고 엔진 §104⑦에는 없다**.
    //    입주권 양도자도 세대 주택 수를 세야 하므로 ④에서 빼면 입력 경로가 끊긴다.
    for (const k of ["right_to_move_in", "presale_right"] as const) {
      expect(HOUSING_LIKE_ASSET_KINDS.has(k), `④⑤: ${k}`).toBe(true);
      expect(SURCHARGE_SUBJECT_PROPERTY_TYPES.has(k), `§104⑦: ${k}`).toBe(false);
    }

    // 반대 방향 — 겸용주택은 **엔진에는 있고 ④ 자산종류 축에는 없다**
    // (`assetKind === "housing"` + `isMixedUseHouse`로 파생되므로 이 집합의 원소가 아니다).
    expect(SURCHARGE_SUBJECT_PROPERTY_TYPES.has("mixed-use-house")).toBe(true);
    expect(HOUSING_LIKE_ASSET_KINDS.has("mixed-use-house")).toBe(false);
  });
});
