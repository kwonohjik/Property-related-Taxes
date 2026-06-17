/**
 * 별표1의3 「축산용 토지 및 건물의 기준면적」 정본 anchor (소득세법 시행령 별표 1의3, 개정 2008.2.22)
 *
 * 사용자 제공 정본(2026-06-17)으로 재구현. 1두(수)당 = (축사 + 부대시설 + 초지㎡ + 사료포㎡) / 가축두수 단위.
 * (헥타르 = ×10,000㎡. 초지·사료포는 ㎡ 환산 저장.)
 */
import { describe, it, expect } from "vitest";
import { getLivestockStandardArea } from "@/lib/tax-engine/non-business-land/data/livestock-standards";

describe("별표1의3 축산용 토지 기준면적 (정본 — 개정 2008.2.22)", () => {
  // 한우(육우) 사육사업 1두당: 7.5 + 5 + 0.5ha(5000) + 0.25ha(2500) = 7,512.5
  it("AT-LIVESTOCK-1: 한우 육우 사육 1두 → 7,512.5", () => {
    expect(getLivestockStandardArea("hanwoo_breeding", 1)).toBe(7512.5);
  });
  // 한우(육우) 비육사업 1두당: 7.5 + 5 + 0.2ha(2000) + 0.1ha(1000) = 3,012.5
  it("AT-LIVESTOCK-2: 한우 육우 비육 1두 → 3,012.5", () => {
    expect(getLivestockStandardArea("hanwoo_fattening", 1)).toBe(3012.5);
  });
  // 유우 목장사업 1두당: 11 + 7 + 5000 + 2500 = 7,518
  it("AT-LIVESTOCK-3: 유우 1두 → 7,518", () => {
    expect(getLivestockStandardArea("dairy", 1)).toBe(7518);
  });
  // 양 목장사업 10두당: (8 + 3 + 5000 + 2500) = 7,511 / 10두 → 100두 = 75,110
  it("AT-LIVESTOCK-4: 양 100두 → 75,110 (10두당 7,511)", () => {
    expect(getLivestockStandardArea("sheep", 100)).toBe(75110);
  });
  // 사슴 목장사업 10두당: 66 + 16 + 5000 + 2500 = 7,582
  it("AT-LIVESTOCK-5: 사슴 10두 → 7,582", () => {
    expect(getLivestockStandardArea("deer", 10)).toBe(7582);
  });
  // 토끼 사육사업 100두당: 33 + 7 + 2000 + 1000 = 3,040
  it("AT-LIVESTOCK-6: 토끼 100두 → 3,040", () => {
    expect(getLivestockStandardArea("rabbit", 100)).toBe(3040);
  });
  // 돼지 양돈사업 5두당: 50 + 13 = 63
  it("AT-LIVESTOCK-7: 돼지 5두 → 63", () => {
    expect(getLivestockStandardArea("pig", 5)).toBe(63);
  });
  // 가금 양계사업 100수당: 33 + 16 = 49
  it("AT-LIVESTOCK-8: 가금 100수 → 49", () => {
    expect(getLivestockStandardArea("poultry", 100)).toBe(49);
  });
  // 밍크 사육사업 5수당: 7 + 7 = 14
  it("AT-LIVESTOCK-9: 밍크 5수 → 14", () => {
    expect(getLivestockStandardArea("mink", 5)).toBe(14);
  });
  // 미지원 축종 → 0 (방어)
  it("AT-LIVESTOCK-10: 미지원 축종 → 0", () => {
    expect(getLivestockStandardArea("unknown", 100)).toBe(0);
  });
});
