/**
 * anchor — 건축물 부속토지 기준면적 초과 판정 공용 헬퍼
 *
 * Phase A(계획서 `commercial-building-appurtenant-land-nbl.plan.md`)에서
 * GB 3경로(환산·증축·실거래가)에 흩어져 있던 동일 판정을 추출했다.
 * CB(상업용건물)가 Phase B에서 같은 헬퍼를 쓴다.
 *
 * 이 파일은 **헬퍼 자체의 계약**을 고정한다. GB 경로의 동작 불변은
 * 기존 `general-building-*.test.ts` 390건이 지킨다.
 */
import { describe, it, expect } from "vitest";
import { judgeAppurtenantLandExcess } from "@/lib/tax-engine/appurtenant-land-excess";

const base = { landArea: 1200, buildingFootprintArea: 200, context: "테스트" };

describe("AL-1 — 배율은 §101② 정본을 그대로 쓴다", () => {
  it.each([
    ["exclusive_residential", 5, 1000, 200],
    ["semi_residential", 3, 600, 600],
    ["commercial", 3, 600, 600],
    ["general_residential", 4, 800, 400],
    ["industrial", 4, 800, 400],
    ["green", 7, 1400, 0],
    ["unplanned", 4, 800, 400],
    ["management", 7, 1400, 0],
  ])("%s → %i배 · 기준면적 %i㎡ · 초과 %i㎡", (zone, mul, allowed, excess) => {
    const r = judgeAppurtenantLandExcess({ ...base, zoneType: zone as string });
    expect(r.multiplier).toBe(mul);
    expect(r.allowedLandArea).toBe(allowed);
    expect(r.nonBusinessArea).toBe(excess);
  });

  it("재산세 레거시 키(agricultural·nature_preserve)도 정본 별칭으로 7배", () => {
    expect(judgeAppurtenantLandExcess({ ...base, zoneType: "agricultural" }).multiplier).toBe(7);
    expect(judgeAppurtenantLandExcess({ ...base, zoneType: "nature_preserve" }).multiplier).toBe(7);
  });

  it("detail 문구는 정본이 만든 것을 그대로 전달한다 (결과 화면·기존 테스트 계약)", () => {
    expect(judgeAppurtenantLandExcess({ ...base, zoneType: "commercial" }).multiplierDetail).toBe(
      "상업지역 3배 (「지방세법 시행령」 제101조 제2항)",
    );
  });
});

describe("AL-2 — 초과 여부·비율", () => {
  it("기준면적 이내면 초과분 0 · 비율 0", () => {
    const r = judgeAppurtenantLandExcess({ ...base, landArea: 500, zoneType: "commercial" });
    expect(r.isWithinLimit).toBe(true);
    expect(r.nonBusinessArea).toBe(0);
    expect(r.nonBusinessRatio).toBe(0);
  });

  it("기준면적과 정확히 같으면 이내로 본다 (경계)", () => {
    const r = judgeAppurtenantLandExcess({ ...base, landArea: 600, zoneType: "commercial" });
    expect(r.isWithinLimit).toBe(true);
    expect(r.nonBusinessArea).toBe(0);
  });

  it("초과분 비율은 반올림하지 않는다 (안분은 면적 직접)", () => {
    const r = judgeAppurtenantLandExcess({ ...base, landArea: 700, zoneType: "commercial" });
    expect(r.nonBusinessArea).toBe(100);
    expect(r.nonBusinessRatio).toBeCloseTo(100 / 700, 12);
  });

  it("landArea 0이면 비율 0 (0 나눗셈 가드)", () => {
    expect(
      judgeAppurtenantLandExcess({ ...base, landArea: 0, zoneType: "commercial" }).nonBusinessRatio,
    ).toBe(0);
  });
});

describe("AL-3 — §101① 단서: 허가·사용승인 미이행 시 전량 비사업용", () => {
  it("배율·용도지역과 무관하게 기준면적 0 · 전량 초과", () => {
    const r = judgeAppurtenantLandExcess({ ...base, unapprovedBuilding: true });
    expect(r.multiplier).toBe(0);
    expect(r.allowedLandArea).toBe(0);
    expect(r.isWithinLimit).toBe(false);
    expect(r.nonBusinessArea).toBe(1200);
    expect(r.nonBusinessRatio).toBe(1);
  });

  it("용도지역이 없어도 차단하지 않는다 (단서가 배율 판정보다 앞선다)", () => {
    expect(() => judgeAppurtenantLandExcess({ ...base, unapprovedBuilding: true })).not.toThrow();
  });

  it("문구가 §101① 단서 범위(불법 용도변경 포함)를 반영한다 — 해석례 25-0823", () => {
    const detail = judgeAppurtenantLandExcess({ ...base, unapprovedBuilding: true }).multiplierDetail;
    expect(detail).toContain("허가·사용승인 미이행");
    expect(detail).toContain("제101조 제1항 단서");
  });
});

describe("AL-4 — 배율 결정 불가는 추정하지 않고 차단한다", () => {
  it("용도지역 미입력 → 예외", () => {
    expect(() => judgeAppurtenantLandExcess({ ...base })).toThrow(/용도지역/);
  });

  it("세분 전 주거지역(residential) → 예외 (전용 5·일반 4·준주거 3으로 갈린다)", () => {
    expect(() => judgeAppurtenantLandExcess({ ...base, zoneType: "residential" })).toThrow(
      /제101조 제2항/,
    );
  });

  it("오류 메시지에 호출 경로(context)가 들어간다", () => {
    expect(() => judgeAppurtenantLandExcess({ ...base, context: "일반건물(증축)" })).toThrow(
      /일반건물\(증축\)/,
    );
  });
});
