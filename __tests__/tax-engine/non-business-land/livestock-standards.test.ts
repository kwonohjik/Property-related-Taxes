/**
 * 축산용 토지 기준면적 정본 anchor
 *
 * 「소득세법 시행령」 [별표 1의3](개정 2008.2.22) = 「지방세법 시행령」 §102①3호 [표]
 * — 2026-08-06 원문 대조 결과 **값·비고 완전 동일**. 정본은 `lib/tax-engine/livestock-standard-area.ts`.
 *
 * # 기준면적은 **보유한 시설만** 더한다
 *
 * 표의 4개 열(축사·부대시설·초지·사료포)은 **항목별 인정 한도**다:
 *
 *   기준면적 = 축사 + (부대시설 有) + (초지 有) + (사료포 有)
 *
 * 열 묶음 제목의 「및」·「또는」은 통상적 구성을 적은 이름표이지 **산식을 정하는 것이 아니다**.
 * 산식은 그 농장이 실제로 무엇을 갖고 있느냐가 정한다.
 *
 * > 🔴 **정정 이력** — 이 파일은 두 번 틀렸다.
 * >   1차: 넷을 무조건 **합산** → 없는 시설의 몫까지 얹었다
 * >   2차: 「또는」을 조문 해석 문제로 보고 **max** → 사료포만 있는 농장에 초지 값을 줬다
 * >   ⇒ 둘 다 **실제 보유와 무관한 고정 산식**이라는 같은 오류였다.
 * >   문제는 접속사가 아니라 **보유 여부를 묻지 않은 것**이었다.
 */

import { describe, it, expect } from "vitest";
import {
  computeLivestockStandardArea,
  perUnitStandardArea,
  includedFacilityLabels,
  LIVESTOCK_STANDARD,
} from "@/lib/tax-engine/livestock-standard-area";
import { getLivestockStandardArea } from "@/lib/tax-engine/non-business-land/data/livestock-standards";

/** 축사만 (부대시설·초지·사료포 없음) */
const NONE = { hasFacility: false, hasGrassland: false, hasFodder: false };
/** 넷 다 보유 */
const ALL = { hasFacility: true, hasGrassland: true, hasFodder: true };

describe("보유한 시설만 더한다 — 한우(육우) 사육사업 1두당", () => {
  // 축사 7.5 · 부대시설 5 · 초지 0.5ha(5,000) · 사료포 0.25ha(2,500)
  it("AT-LIVESTOCK-1: 축사만 → 7.5", () => {
    expect(computeLivestockStandardArea("hanwoo_breeding", 1, NONE)).toBe(7.5);
  });

  it("AT-LIVESTOCK-2: 축사 + 부대시설 → 12.5", () => {
    expect(
      computeLivestockStandardArea("hanwoo_breeding", 1, { ...NONE, hasFacility: true }),
    ).toBe(12.5);
  });

  it("AT-LIVESTOCK-3: 축사 + 부대시설 + 초지 → 5,012.5 (방목 농가)", () => {
    expect(
      computeLivestockStandardArea("hanwoo_breeding", 1, { ...ALL, hasFodder: false }),
    ).toBe(5012.5);
  });

  it("AT-LIVESTOCK-4: 축사 + 부대시설 + 사료포 → 2,512.5 (사료 재배 농가)", () => {
    // 🔴 종전 max 구현은 여기서 5,012.5를 줬다 — 초지가 없는데 초지 값을 얹은 것이다.
    expect(
      computeLivestockStandardArea("hanwoo_breeding", 1, { ...ALL, hasGrassland: false }),
    ).toBe(2512.5);
  });

  it("AT-LIVESTOCK-5: 넷 다 보유 → 7,512.5 (초지·사료포 겸용)", () => {
    // 🔴 종전 max 구현은 5,012.5를 줬다 — 있는 사료포를 빼먹은 것이다.
    expect(computeLivestockStandardArea("hanwoo_breeding", 1, ALL)).toBe(7512.5);
  });
});

describe("두 종전 구현이 왜 둘 다 틀렸는가 — 보유 조합별로 갈린다", () => {
  it("AT-LIVESTOCK-6: 고정 산식으로는 4가지 조합을 구분할 수 없다", () => {
    const combos = [
      NONE,
      { ...NONE, hasFacility: true },
      { ...ALL, hasFodder: false },
      { ...ALL, hasGrassland: false },
      ALL,
    ];
    const areas = combos.map((f) => computeLivestockStandardArea("hanwoo_breeding", 1, f));
    // 5가지 조합이 5가지 다른 값을 낸다 — 하나의 상수로 대체할 수 없다는 증명
    expect(new Set(areas).size).toBe(5);
    expect(areas).toEqual([7.5, 12.5, 5012.5, 2512.5, 7512.5]);
  });
});

describe("축종별 — 초지·사료포가 「-」인 3종은 보유 플래그와 무관하다", () => {
  it("AT-LIVESTOCK-7: 돼지 5두 — 초지·사료포를 켜도 값이 같다 (표에 「-」)", () => {
    const withFacility = { ...NONE, hasFacility: true };
    expect(computeLivestockStandardArea("pig", 5, withFacility)).toBe(63); // 50 + 13
    expect(computeLivestockStandardArea("pig", 5, ALL)).toBe(63);
  });

  it("AT-LIVESTOCK-8: 가금 100수 → 49 (33 + 16)", () => {
    expect(computeLivestockStandardArea("poultry", 100, ALL)).toBe(49);
  });

  it("AT-LIVESTOCK-9: 밍크 5수 → 14 (7 + 7)", () => {
    expect(computeLivestockStandardArea("mink", 5, ALL)).toBe(14);
  });
});

describe("두수 단위 환산", () => {
  it("AT-LIVESTOCK-10: 양 100두 = 10두당 값 × 10 (넷 다 보유 시 7,511 × 10)", () => {
    expect(computeLivestockStandardArea("sheep", 100, ALL)).toBe(75110);
  });

  it("AT-LIVESTOCK-11: 사슴 10두 → 7,582 (66 + 16 + 5,000 + 2,500)", () => {
    expect(computeLivestockStandardArea("deer", 10, ALL)).toBe(7582);
  });
});

describe("표 정본 — 원문과 대조", () => {
  it("AT-LIVESTOCK-12: 미지원 축종 → 0 (호출부가 「추정 금지」로 처리)", () => {
    expect(computeLivestockStandardArea("unknown", 100, ALL)).toBe(0);
  });

  it("AT-LIVESTOCK-13: 9종이다", () => {
    expect(Object.keys(LIVESTOCK_STANDARD)).toHaveLength(9);
  });

  it("AT-LIVESTOCK-14: 헥타르 환산이 표와 맞는다 (0.5ha=5,000 · 0.25ha=2,500 · 0.2ha=2,000 · 0.1ha=1,000)", () => {
    expect(LIVESTOCK_STANDARD.hanwoo_breeding.grasslandM2).toBe(5000);
    expect(LIVESTOCK_STANDARD.hanwoo_breeding.fodderM2).toBe(2500);
    expect(LIVESTOCK_STANDARD.hanwoo_fattening.grasslandM2).toBe(2000);
    expect(LIVESTOCK_STANDARD.hanwoo_fattening.fodderM2).toBe(1000);
  });

  it("AT-LIVESTOCK-15: 축사는 항상 포함된다 (축산업의 전제)", () => {
    for (const [k, v] of Object.entries(LIVESTOCK_STANDARD)) {
      expect(perUnitStandardArea(v, NONE), `${k}`).toBe(v.barn);
    }
  });
});

describe("표시 — 무엇이 반영됐는지 드러낸다", () => {
  it("AT-LIVESTOCK-16: 포함 항목 라벨", () => {
    expect(includedFacilityLabels(NONE)).toEqual(["축사"]);
    expect(includedFacilityLabels({ ...ALL, hasGrassland: false })).toEqual([
      "축사",
      "부대시설",
      "사료포",
    ]);
    expect(includedFacilityLabels(ALL)).toEqual(["축사", "부대시설", "초지", "사료포"]);
  });
});

describe("하위 호환 — NBL 재수출 경로", () => {
  it("AT-LIVESTOCK-17: 종전 이름 `getLivestockStandardArea`가 같은 값을 준다", () => {
    expect(getLivestockStandardArea("dairy", 3, ALL)).toBe(
      computeLivestockStandardArea("dairy", 3, ALL),
    );
  });
});
