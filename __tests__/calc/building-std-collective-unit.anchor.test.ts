/**
 * anchor(d2): 집합건물 동/호 선택 시 전유면적을 건물 연면적(floorArea)에 자동 반영.
 *
 * Vworld NED가 이미 조회한 exclusiveArea(전유면적)를 폼이 버리지 않고 floorArea로 흐르게 한다.
 * 상속·증여 카드 EstateBodyHelpers 패턴(exclusiveArea→areaSqm)을 건물 기준시가 폼에 이식.
 * 계획서: docs/02-design/features/building-std-collective-unit-exclusive-area-fix.plan.md
 */
import { describe, it, expect } from "vitest";
import { buildAddressPatch } from "@/lib/calc/building-std-price-form";
import type { AddressValue } from "@/components/ui/address-search";

const BASE: AddressValue = {
  road: "경기도 용인시 기흥구 기흥역로58번길 10",
  jibun: "경기도 용인시 기흥구 구갈동 662",
  building: "기흥역 센트럴 푸르지오",
  detail: "201동 3204",
  lng: "127.1",
  lat: "37.2",
  pnu: "4146310300106620000",
};

describe("buildAddressPatch — 집합건물 전유면적 반영", () => {
  it("전유면적 있으면 floorArea 자동채움 + 동/호 저장", () => {
    const p = buildAddressPatch({
      ...BASE,
      dong: "201동",
      ho: "3204",
      exclusiveArea: 84.99,
      standardPrice: 534_000_000,
    });
    expect(p.floorArea).toBe("84.99");
    expect(p.unitDong).toBe("201동");
    expect(p.unitHo).toBe("3204");
    // 주소 필드도 정상 반영
    expect(p.pnu).toBe("4146310300106620000");
    expect(p.addressDetail).toBe("201동 3204");
  });

  it("전유면적 없으면(일반건축물) floorArea 미포함 — 동 전체 면적 덮어쓰기 안 함", () => {
    const p = buildAddressPatch({ ...BASE, detail: "", exclusiveArea: undefined });
    expect(p.floorArea).toBeUndefined();
    expect(p.unitDong).toBe("");
    expect(p.unitHo).toBe("");
  });
});
