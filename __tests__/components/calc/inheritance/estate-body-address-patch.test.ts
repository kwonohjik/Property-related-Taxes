/**
 * estate-body-address-patch — 소재지 onChange race 차단 + 동/호 자동채움 (Part A)
 *
 * Plan: docs/01-plan/features/rtms-similar-sales-expansion.plan.md §3
 *
 * 이미지 버그: 소재지·동/호 입력했는데 RTMS "자동조회" 비활성 + "소재지를 먼저 입력해주세요".
 *   원인 — EstateBodyRealEstate onChange 가 ① set({estateAddress}) 후
 *   await resolveSigunguCode → ② set({estateSigunguCode}) 로 2번 호출했는데,
 *   makePatcher 가 진입 시점 stale item 을 캡처 → ②가 estateAddress 를 undefined 로 덮어씀
 *   → hasAddress=false → 버튼 비활성. (estateSigunguCode 만 채워지는 이미지 상황과 일치)
 *
 * 수정: buildAddressPatch 로 전체 패치를 만들어 set() 단일 호출.
 */

import { describe, it, expect } from "vitest";

import {
  buildAddressPatch,
  makePatcher,
} from "@/components/calc/inheritance/estate-card/variants/EstateBodyHelpers";
import type { AddressValue } from "@/components/ui/address-search";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const baseAddr: AddressValue = {
  road: "경기도 용인시 기흥구 기흥역로58번길 10",
  jibun: "구갈동 662",
  building: "기흥역 센트럴 푸르지오",
  detail: "202동 1004",
  lng: "127.119029",
  lat: "37.273993",
  pnu: "4146310300106620000",
};

function makeItem(): EstateItem {
  return { id: "re1", category: "real_estate_apartment", name: "" } as EstateItem;
}

describe("[APATCH] buildAddressPatch — 소재지 race 차단 + 동/호 자동채움", () => {
  it("APATCH-1: estateAddress·estateSigunguCode·좌표를 단일 패치에 함께 담는다", () => {
    const patch = buildAddressPatch(baseAddr, {
      fishing: false,
      sigunguCode: "41463",
    });
    expect(patch.estateAddress).toBeDefined();
    expect(patch.estateAddress?.road).toContain("기흥역로58번길");
    expect(patch.estateSigunguCode).toBe("41463");
    expect(patch.estateLatLng).toEqual({ lat: 37.273993, lng: 127.119029 });
  });

  it("APATCH-2: 단일 set 적용 시 hasAddress 판정 보존 — 버튼 활성 조건 충족 (이미지 버그 수정)", () => {
    const item0 = makeItem();
    let stored = item0;
    const set = makePatcher(item0, (u) => {
      stored = u;
    });
    set(buildAddressPatch(baseAddr, { fishing: false, sigunguCode: "41463" }));

    const hasAddress = !!(
      stored.estateAddress?.jibun ||
      stored.estateAddress?.road ||
      stored.estateAddress?.pnu
    );
    expect(hasAddress).toBe(true); // 이미지 버그에서는 false 였음
    expect(stored.estateSigunguCode).toBe("41463"); // 동시에 보존
  });

  it("APATCH-3: 옛 2-set 경로는 estateAddress 를 잃는다 — 버그 메커니즘 실증(회귀 가드)", () => {
    const item0 = makeItem();
    let stored = item0;
    const set = makePatcher(item0, (u) => {
      stored = u;
    });
    set({ estateAddress: { road: baseAddr.road } }); // 1차
    set({ estateSigunguCode: "41463" }); // 2차 (진입 시점 stale item0 merge)
    expect(stored.estateAddress).toBeUndefined(); // ← stale closure 로 소실
  });

  it("APATCH-4: 동/호 선택(면적·공시가격 포함) 시 areaSqm·standardPrice 자동채움", () => {
    const patch = buildAddressPatch(
      { ...baseAddr, exclusiveArea: 84.97, standardPrice: 850_000_000 },
      { fishing: false, sigunguCode: "41463" },
    );
    expect(patch.areaSqm).toBe(84.97);
    expect(patch.standardPrice).toBe(850_000_000);
  });

  it("APATCH-5: 동/호 미선택 시 면적·공시가격·시군구코드 패치 없음", () => {
    const patch = buildAddressPatch(baseAddr, { fishing: false });
    expect(patch.areaSqm).toBeUndefined();
    expect(patch.standardPrice).toBeUndefined();
    expect(patch.estateSigunguCode).toBeUndefined();
  });

  it("APATCH-6: fishing 자산은 좌표·시군구코드를 fishingAnchor* 에 담는다", () => {
    const patch = buildAddressPatch(baseAddr, {
      fishing: true,
      sigunguCode: "41463",
    });
    expect(patch.fishingAnchorSigunguCode).toBe("41463");
    expect(patch.fishingAnchorLatLng).toEqual({
      lat: 37.273993,
      lng: 127.119029,
    });
    expect(patch.estateSigunguCode).toBeUndefined();
  });
});
