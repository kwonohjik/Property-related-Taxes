/**
 * anchor(d2 → 접근 B 전환): 집합건물 동/호를 폼에 저장하되, 전유면적은 floorArea에 넣지 않는다.
 *
 * 국세청 「건물 기준시가 계산방법 고시」 §3① + 엔진 정의(types.ts:63-64 "공동주택=전유+공용")로,
 * NED prvuseAr(전용면적=전유만)을 floorArea에 넣으면 공용면적 누락 → 과소산정.
 * 따라서 buildAddressPatch는 동/호(집합건물 판정)만 저장하고 floorArea는 건드리지 않는다.
 * 정본 전유+공용 연면적은 건축HUB getBrExposPubuseAreaInfo로 확보(접근 B, 후속·env 실측 필요).
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

describe("buildAddressPatch — 집합건물 동/호 저장, 전유면적 floorArea 미반영", () => {
  it("동/호 선택 시 unitDong·unitHo 저장하되 floorArea는 넣지 않음(전유면적만으론 과소산정)", () => {
    const p = buildAddressPatch({
      ...BASE,
      dong: "201동",
      ho: "3204",
      exclusiveArea: 84.99,
      standardPrice: 534_000_000,
    });
    // 전유면적(전용면적)만으론 공용 누락 → floorArea 자동채움 금지
    expect(p.floorArea).toBeUndefined();
    expect(p.unitDong).toBe("201동");
    expect(p.unitHo).toBe("3204");
    // 주소 필드는 정상 반영
    expect(p.pnu).toBe("4146310300106620000");
    expect(p.addressDetail).toBe("201동 3204");
  });

  it("일반건축물(동/호 없음)도 floorArea 미포함 + unitDong/Ho 공란", () => {
    const p = buildAddressPatch({ ...BASE, detail: "", exclusiveArea: undefined });
    expect(p.floorArea).toBeUndefined();
    expect(p.unitDong).toBe("");
    expect(p.unitHo).toBe("");
  });
});
