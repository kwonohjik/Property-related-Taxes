/**
 * 인구감소지역 데이터 전수 정정 + 판정 로직 (소령 §167의3①12 다·라목).
 *
 * - 코드체계: house.regionCode = PNU 법정동코드(강원 51·전북 52). 구 42/45 폐기.
 * - N-6: regionCode 자동판정 시 populationAreaType 미입력이어도 kind(decline/interest)로
 *        가액 한도(다목 9억/라목 4억) 자동 도출.
 * - 수도권 접경(강화·옹진·연천·가평) 다목 포함 / 광역시 자치구 제외.
 *
 * 코드 출처: Vworld 실측(PNU 앞5).
 */

import { describe, it, expect } from "vitest";
import { countEffectiveHouses } from "@/lib/tax-engine/multi-house-surcharge";
import { defaultRules, makeHouse } from "../_helpers/multi-house-mock";

const TD = new Date("2026-06-01");

function run(house: Parameters<typeof makeHouse>[1]) {
  return countEffectiveHouses([makeHouse("h", house)], TD, [], defaultRules);
}

describe("§167의3①12 다·라목 — 인구감소지역 데이터·판정 정정", () => {
  it("D1 (N-6): 수도권밖 다목 9억↓ + populationAreaType 미입력 + regionCode 자동 → 배제(9억 자동도출)", () => {
    // 강원 고성 51820, 8억 — populationAreaType 미입력이면 과거엔 4억 게이트로 산입(버그).
    const { excluded } = run({
      region: "non_capital",
      regionCode: "51820",
      isSecondHomeRegistered: true,
      officialPrice: 800_000_000,
    });
    expect(excluded.find((e) => e.houseId === "h")?.reason).toBe("population_decline_second_home");
  });

  it("D2: 수도권밖 다목 9억 초과 → 산입", () => {
    const { count } = run({
      region: "non_capital",
      regionCode: "51820",
      isSecondHomeRegistered: true,
      officialPrice: 1_000_000_000,
    });
    expect(count).toBe(1);
  });

  it("D3: 수도권 접경(강화 28710) 4억↓ region=capital → 배제(다목 1호 단서)", () => {
    const { excluded } = run({
      region: "capital",
      regionCode: "28710",
      isSecondHomeRegistered: true,
      officialPrice: 300_000_000,
    });
    expect(excluded.find((e) => e.houseId === "h")?.reason).toBe("population_decline_second_home");
  });

  it("D3b: 수도권 접경(강화) 4억 초과 → 산입(수도권 4억 한도)", () => {
    const { count } = run({
      region: "capital",
      regionCode: "28710",
      isSecondHomeRegistered: true,
      officialPrice: 500_000_000,
    });
    expect(count).toBe(1);
  });

  it("D6: 광역시 자치구(부산 동구 26350) → 인구감소 미판정 → 산입(법령 제외)", () => {
    const { count } = run({
      region: "non_capital",
      regionCode: "26350",
      isSecondHomeRegistered: true,
      officialPrice: 300_000_000,
    });
    expect(count).toBe(1);
  });

  it("D7: 전북특별자치도 정정코드(남원 52190) 세컨드홈 → 배제(코드체계 정정 검증)", () => {
    const { excluded } = run({
      region: "non_capital",
      regionCode: "52190",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      officialPrice: 800_000_000,
    });
    expect(excluded.find((e) => e.houseId === "h")?.reason).toBe("population_decline_second_home");
  });

  it("D8: 구(舊) 강원 코드(42800) → 미판정 → 산입 (PNU 정합 정정 회귀)", () => {
    const { count } = run({
      region: "non_capital",
      regionCode: "42800",
      isSecondHomeRegistered: true,
      officialPrice: 300_000_000,
    });
    expect(count).toBe(1);
  });

  it("D9 (O-1 라목): 관심지역(강릉 51150) 4억↓ + populationAreaType 미입력 자동 → 배제(4억 게이트)", () => {
    // 라목 판정 경로 신설 전엔 INTEREST set 미사용 → 자동판정 false → 산입(버그). 이제 kind=interest → 배제.
    const { excluded } = run({
      region: "non_capital",
      regionCode: "51150",
      isSecondHomeRegistered: true,
      officialPrice: 300_000_000,
    });
    expect(excluded.find((e) => e.houseId === "h")?.reason).toBe("population_decline_second_home");
  });

  it("D10: 관심지역(라목) 4억 초과 → 산입 (라목 한도 4억)", () => {
    // 관심지역은 다목과 달리 수도권밖이어도 9억이 아닌 4억 한도 (autoKind=interest).
    const { count } = run({
      region: "non_capital",
      regionCode: "51150",
      isSecondHomeRegistered: true,
      officialPrice: 500_000_000,
    });
    expect(count).toBe(1);
  });

  it("D11: 광역시의 군(대구 군위군 27720) → 다목 포함 → 배제(9억 한도)", () => {
    const { excluded } = run({
      region: "non_capital",
      regionCode: "27720",
      isSecondHomeRegistered: true,
      officialPrice: 800_000_000,
    });
    expect(excluded.find((e) => e.houseId === "h")?.reason).toBe("population_decline_second_home");
  });

  it("D12: 무안군(구 데이터 오수록 — 행안부 89곳 아님) → 미판정 → 산입", () => {
    // 전남 무안(46840)은 인구감소지역 아님(도청소재지). 정정으로 decline set에서 제거됨.
    const { count } = run({
      region: "non_capital",
      regionCode: "46840",
      isSecondHomeRegistered: true,
      officialPrice: 300_000_000,
    });
    expect(count).toBe(1);
  });
});
