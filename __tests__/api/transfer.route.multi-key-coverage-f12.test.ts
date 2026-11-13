/**
 * F-12 가드 — 다건 스키마(⑫ `propertyItemSchema`)의 **모든 키**는 셋 중 하나다:
 *   ⑭ 매핑(`multi/route.ts`의 `p.<key>`) · ⑫ 거부 규칙 · 근거 있는 무효과 목록.
 *
 * 새 키를 스키마에 넣고 ⑭를 잊으면 여기서 실패한다 — 종전에는 69개 키가 이 분류 밖에서 조용히 버려졌고,
 * 그중 §164⑨·소유자 분리는 화면 입력까지 세액에 닿지 않았다(anchor `...-single-only-keys-f12`).
 * 매핑 판정은 route 원문의 정적 스캔이다(`p.<key>` 참조) — 매핑 식이 바뀌어도 키 참조가 남는 한 통과한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { z } from "zod";
import { propertyItemSchema } from "@/lib/api/transfer-tax-schema";
import {
  MULTI_REJECT_RULES,
  MULTI_IGNORED_KEYS,
  refineMultiUnsupported,
} from "@/lib/api/transfer-tax-schema-multi-refines";

// ⑭ 매핑은 두 파일에 있다 — 건별 엔진 입력(`route-property-input.ts` · route.ts에서 분리)과 일반건물 펼침 진입(`route.ts`의 `p.generalBuildingValuation`·`p.generalBuildingShares`).
const route =
  readFileSync("app/api/calc/transfer/multi/route.ts", "utf8") + readFileSync("app/api/calc/transfer/multi/route-property-input.ts", "utf8");
const mapped = new Set([...route.matchAll(/\bp\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));

// zod v4의 superRefine은 객체 스키마를 그대로 돌려준다(래퍼 없음) — `.shape`로 키를 읽는다.
const keys = Object.keys(propertyItemSchema.shape);
const rejected = new Set(Object.keys(MULTI_REJECT_RULES));
const ignored = new Set(Object.keys(MULTI_IGNORED_KEYS));
/** 스키마 자체가 값을 받지 않는 키(`z.never().optional()` — 폐지된 입력을 400으로 막는다, 예: `rentalReductionDetails`) */
const schemaRejected = new Set(
  keys.filter((k) => {
    const f = (propertyItemSchema.shape as Record<string, z.ZodType>)[k];
    return f instanceof z.ZodOptional && f.unwrap() instanceof z.ZodNever;
  }),
);

describe("F-12 다건 키 분류", () => {
  it("스키마 키가 스캔된다(가드 자체의 구별력)", () => {
    expect(keys.length).toBeGreaterThan(100);
    expect(mapped.has("transferPrice")).toBe(true);
  });

  it("모든 키가 매핑·거부·무효과 중 하나", () => {
    const unclassified = keys.filter((k) => !mapped.has(k) && !rejected.has(k) && !ignored.has(k) && !schemaRejected.has(k));
    expect(unclassified).toEqual([]);
  });

  it("무효과 목록은 매핑·거부와 겹치지 않는다(모순 분류 금지)", () => {
    expect([...ignored].filter((k) => mapped.has(k) || rejected.has(k))).toEqual([]);
  });

  it("거부·무효과 목록에 스키마에 없는 키가 없다(stale 금지)", () => {
    const known = new Set(keys);
    expect([...rejected, ...ignored].filter((k) => !known.has(k))).toEqual([]);
  });

  it("거부 규칙은 값이 있을 때만 걸린다 — 없는 값·기본값은 통과", () => {
    const issues = (data: Record<string, unknown>) => {
      const out: string[] = [];
      refineMultiUnsupported(data, { addIssue: (i: { path?: (string | number)[] }) => out.push(String(i.path?.[0])) } as unknown as z.RefinementCtx);
      return out;
    };
    expect(issues({})).toEqual([]);
    expect(issues({ transferType: "regular", acquisitionCause: "purchase", companionAssets: [] })).toEqual([]);
    // 부담부증여(소령 §159) — 자산 단위 info·표지는 ⑭가 옮긴다(트랙 BG). info 없는 표지는 공용 refine이 막는다(F12-R1).
    expect(issues({ transferType: "burdened_gift" })).toEqual([]);
    expect(issues({ acquisitionCause: "burdened_gift" })).toEqual([]);
    expect(issues({ transferType: "burdened_gift", burdenedGiftInfo: {} })).toEqual([]);
    expect(issues({ transferType: "burdened_gift", burdenedGiftInfo: {}, generalBuildingValuation: {} })).toEqual([]);
    // 일반건물 부담부증여 × 이월과세는 ⑭가 A·B 비교 단위로 펼친다 — 당초 증여자 신축·증축(§114조의2)도 받는다(트랙 GB-BG-CO-DNB).
    //   지분 + 증여자 신축은 단건·다건 공용 ⑫(`refineGbBgDonorBuilt`)가 거부한다(`__tests__/calc/multi-gb-bg-carryover-donor-built.anchor.test.ts` DNB-5). 묶음 명세는 값이 있으면 거부
    expect(issues({ transferType: "burdened_gift", burdenedGiftInfo: {}, generalBuildingValuation: {}, carryoverTaxation: {} })).toEqual([]);
    expect(issues({ transferType: "burdened_gift", propertyType: "general_building", burdenedGiftInfo: { carryoverDonorBasis: {} }, carryoverTaxation: {} })).toEqual([]);
    expect(issues({ transferType: "burdened_gift", propertyType: "general_building", burdenedGiftInfo: { carryoverDonorBasis: { donorBuilt: {} } }, carryoverTaxation: {} })).toEqual([]);
    // 주택·건물의 당초 증여자 신축은 단건 엔진 안 단계라 합산도 같다
    expect(issues({ transferType: "burdened_gift", propertyType: "housing", burdenedGiftInfo: { carryoverDonorBasis: { donorBuilt: {} } }, carryoverTaxation: {} })).toEqual([]);
    expect(issues({ burdenedGiftWholeInfo: {} })).toEqual(["burdenedGiftWholeInfo"]);
    // 물건 전체 명세는 일반건물 지분 × 부담부증여만 받는다 — 지분이 없거나(단건 자산·함께 양도) 부담부증여가 아니면 계속 거부
    expect(issues({ burdenedGiftWholeInfo: {}, transferType: "burdened_gift", burdenedGiftInfo: {}, generalBuildingShares: [{}, {}] })).toEqual([]);
    expect(issues({ burdenedGiftWholeInfo: {}, transferType: "burdened_gift", burdenedGiftInfo: {} })).toEqual(["burdenedGiftWholeInfo"]);
    expect(issues({ burdenedGiftWholeInfo: {}, generalBuildingShares: [{}, {}] })).toEqual(["burdenedGiftWholeInfo"]);
    expect(issues({ burdenedGiftWholeInfo: {}, transferType: "burdened_gift", generalBuildingShares: [{}] })).toEqual(["burdenedGiftWholeInfo"]);
    // 일반건물 지분 분할 취득(트랙 GS) — 지분 배열은 ⑭가 펼친다(부담부증여 지분 · 부담부증여 × 이월과세 지분 포함 · 증여자 신축은 지분 스키마가 거부)
    expect(issues({ generalBuildingShares: [{}, {}] })).toEqual([]);
    expect(issues({ generalBuildingShares: [{ burdenedGiftInfo: {} }, { burdenedGiftInfo: {} }], transferType: "burdened_gift", burdenedGiftInfo: {} })).toEqual([]);
    expect(issues({ generalBuildingShares: [{ burdenedGiftInfo: {} }, { burdenedGiftInfo: {}, carryoverTaxation: {} }], transferType: "burdened_gift" })).toEqual([]);
    expect(issues({ companionAssets: [{}] })).toEqual(["companionAssets"]);
    // 다필지(§114⑦) — 배열값 규칙: 필지가 1개 이상일 때만 거부, 빈 배열·값 없음은 통과(계획서 early-return-mixed-use-aggregate-audit Q-1 a).
    expect(issues({ parcels: [{}] })).toEqual(["parcels"]);
    expect(issues({ parcels: [] })).toEqual([]);
    expect(issues({ reductions: [{ type: "self_farming" }] })).toEqual([]);
    expect(issues({ reductions: [{ type: "unsold_98" }] })).toEqual(["reductions"]);
    expect(issues({ propertyType: "housing" })).toEqual([]);
    expect(issues({ propertyType: "redevelopment_apt" })).toEqual(["propertyType"]);
    expect(issues({ propertyType: "right_to_move_in" })).toEqual(["propertyType"]);
    // 이월과세(§97의2) — 자산 단위 사건은 ⑭가 옮긴다(트랙 CO). 당초 증여 때 인수한 채무 부분도 연다(트랙 CO-DEBT — 단건 = 연간 CO-4a).
    expect(issues({ carryoverTaxation: {} })).toEqual([]);
    expect(issues({ carryoverTaxation: { giftAssumedDebt: 0 } })).toEqual([]);
    expect(issues({ carryoverTaxation: { giftAssumedDebt: 100_000_000 } })).toEqual([]);
    // 파트 이월과세 3키도 ⑭가 단건과 같은 합성기로 옮긴다(트랙 CO-PART · Q-4 b) — 다건 전용 거부 없음. 남은 거부 규칙은 아래 `rejected` 순회가 본다.
    expect(issues({ landCarryoverPart: {}, buildingCarryoverPart: {}, carryoverGiftEvent: {} })).toEqual([]);
    expect(issues({ acquisitionCause: "carryover_gift" })).toEqual([]);
    const scalar = new Set(["transferType", "acquisitionCause", "companionAssets", "parcels", "reductions", "propertyType"]);
    for (const k of rejected) {
      if (scalar.has(k)) continue;
      expect(issues({ [k]: {} })).toEqual([k]);
    }
  });
});
