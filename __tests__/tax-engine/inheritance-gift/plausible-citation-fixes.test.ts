/**
 * Anchor — PLAUSIBLE 인용 정합 (P-10·P-13, 표시 전용)
 *
 * - P-10 gift_public_trust: 공익신탁 출연재산 증여세 과세가액 불산입은 상증법 §52.
 *     종전 lawRef가 §48①(공익법인 출연)·설명 §46 1호(국가·지자체 증여)로 오기.
 * - P-13 inh_forest_burial: 금양임야 비과세(상증법 §12 3호·상증령 §8③1호·민법 §1008의3)는
 *     피상속인 소유 분묘 금양임야를 제사주재 상속인이 승계하는 것 — '종중 소유·직접 관리'는
 *     조문 취지와 정반대 오안내였음.
 */
import { describe, it, expect } from "vitest";
import { findExemptionRuleById } from "@/lib/tax-engine/exemption-rules";

describe("P-10 공익신탁 출연재산 lawRef = §52", () => {
  it("gift_public_trust lawRef·설명이 §52 (§48①/§46 아님)", () => {
    const rule = findExemptionRuleById("gift_public_trust");
    expect(rule?.lawRef).toBe("상증법 §52");
    expect(rule?.description).toContain("§52");
    expect(rule?.lawRef).not.toBe("상증법 §48①");
  });
});

describe("P-13 금양임야 요건 — 개인(피상속인) 상속재산 전제", () => {
  const rule = findExemptionRuleById("inh_forest_burial");

  it("lawRef = §12 (불변)", () => {
    expect(rule?.lawRef).toBe("상증법 §12");
  });

  it("요건·제외에 '종중 소유/관리'·'개인 소유 제외' 오안내 없음", () => {
    const reqs = rule?.requirements ?? [];
    const excls = rule?.exclusions ?? [];
    expect(reqs.some((r) => r.includes("종중"))).toBe(false);
    expect(excls.some((e) => e.includes("개인 소유"))).toBe(false);
    // 제사주재 상속인 승계(개인 상속재산) 명시
    expect(reqs.some((r) => r.includes("제사를 주재"))).toBe(true);
  });
});
