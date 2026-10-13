/**
 * anchor(저장값 복원 ③ · 다건 거절 ⑫ · 컴패니언 shape ⑫) — 증여 세대 통산의 사망·재결합 사실 (결정 #34 조건 · #38-6) 안전망 보강.
 *
 * 선행 anchor(`gift-household-death-rejoin-38-6.anchor.test.ts`)는 ④·⑧·route·핸드오프를 지킨다. 뮤테이션 점검에서 아래 층은 줄을 지워도
 * 아무 테스트도 실패하지 않았다 — 코드는 맞게 동작했지만 회귀 안전망이 없었다.
 *
 * | # | 층 | 주장 | 지우면 |
 * |---|---|---|---|
 * | GD-1 | ③ 이월과세 폼 복원 | 「재결합」 답이 복원 뒤에도 남는다(알 수 없는 값만 미답) | 재결합 답이 ""로 지워져 ⑧이 다시 묻는다 |
 * | GD-2 | ③ 자산 복원 | 구형 자산은 giftDonorDeceased false · 「재결합」·사망 true는 보존 | (factory 채움이 받쳐 줘 줄 하나만으로는 안 깨진다 — 동작을 고정) |
 * | GD-3 | ⑫ 다건 | 두 키는 값이 있으면 거절 · 없으면 통과 | 다건에서 사실이 침묵 strip |
 * | GD-4 | ⑫ 컴패니언 shape | donorRejoinedAfterDivorce를 보존하고 단건 인라인 shape과 키가 같다 | 컴패니언 이월과세의 재결합이 침묵 strip |
 *
 * 부정형 단언에는 긍정 짝을 둔다.
 */
import { mapGiftHouseholdBasis } from "@/lib/api/gift-household-basis-route-map";
import { describe, it, expect } from "vitest";
import type { z } from "zod";
import { migrateCarryoverFields } from "@/lib/stores/calc-wizard-asset-carryover";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { propertyItemSchema } from "@/lib/api/transfer-tax-schema";
import { MULTI_REJECT_RULES, refineMultiUnsupported } from "@/lib/api/transfer-tax-schema-multi-refines";
import { carryoverTaxationEngineShape } from "@/lib/api/transfer-tax-building-schemas";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const restoredCarryover = (donorSameHousehold: unknown) => {
  const a = { acquisitionCause: "carryover_gift", carryover: { donorSameHousehold } } as Record<string, unknown>;
  migrateCarryoverFields(a);
  return (a.carryover as NonNullable<AssetForm["carryover"]>).donorSameHousehold;
};

describe("GD-1 ③ 이월과세 폼 복원", () => {
  it("[GD-1a] 「재결합」 답은 복원 뒤에도 남는다 · 긍정 짝: 예·아니오도 그대로", () => {
    expect(restoredCarryover("rejoined")).toBe("rejoined");
    expect(restoredCarryover("yes")).toBe("yes");
    expect(restoredCarryover("no")).toBe("no");
  });
  it("[GD-1b] 부정 짝: 알 수 없는 값·값 없음은 미답으로 돌린다(재결합을 아무 값에나 열어 두지 않는다)", () => {
    expect(restoredCarryover("maybe")).toBe("");
    expect(restoredCarryover(undefined)).toBe("");
  });
});

describe("GD-2 ③ 자산 복원", () => {
  it("[GD-2a] 구형 자산(칸 없음) → 증여자 사망 false · 세대 답 미답", () => {
    const a = migrateAsset({});
    expect(a.giftDonorDeceased).toBe(false);
    expect(a.giftSameHousehold).toBe("");
  });
  it("[GD-2b] 긍정 짝: 저장된 사망 true·재결합 답은 복원 뒤에도 그대로", () => {
    const a = migrateAsset({ giftDonorDeceased: true, giftSameHousehold: "rejoined" });
    expect(a.giftDonorDeceased).toBe(true);
    expect(a.giftSameHousehold).toBe("rejoined");
  });
});

describe("GD-3 ⑭ 다건도 사망·재결합을 같은 함수로 매핑한다 (#38-3 병합 후)", () => {
  const base = { acquisitionCause: "gift", acquisitionDate: "2023-06-01", donorAcquisitionDate: "2000-06-01" };
  it("[GD-3a] 다건 ⑫는 사망·재결합 사실을 거절하지 않는다(단건과 같은 사실을 받는다) · 긍정 짝: 비어 있어도 통과", () => {
    const out: string[] = [];
    const ctx = { addIssue: (i: { path?: (string | number)[] }) => out.push(String(i.path?.[0])) } as unknown as z.RefinementCtx;
    refineMultiUnsupported({ giftDonorDeceased: true, giftRejoinedAfterDivorce: true }, ctx);
    refineMultiUnsupported({}, ctx);
    expect(out).toEqual([]);
    expect(Object.keys(MULTI_REJECT_RULES)).not.toEqual(expect.arrayContaining(["giftDonorDeceased"]));
    expect(Object.keys(MULTI_REJECT_RULES)).not.toEqual(expect.arrayContaining(["giftRejoinedAfterDivorce"]));
  });
  it("[GD-3b] 공용 매핑이 사망·재결합을 엔진 basis에 싣는다(단건 ⑭·다건 ⑭ 공통) · 긍정 짝: 사실이 없으면 undefined", () => {
    expect(mapGiftHouseholdBasis({ ...base, giftDonorDeceased: true })).toMatchObject({ donorDeceased: true });
    expect(mapGiftHouseholdBasis({ ...base, giftSameHouseholdContinuous: false, giftRejoinedAfterDivorce: true })).toMatchObject({
      continuousSameHousehold: false,
      rejoinedAfterDivorce: true,
    });
    expect(mapGiftHouseholdBasis({ ...base })).toBeUndefined();
  });
});

describe("GD-4 ⑫ 컴패니언 이월과세 shape", () => {
  const part = (over: Record<string, unknown>) =>
    carryoverTaxationEngineShape.parse({
      giftRegistryDate: "2023-06-01",
      donorAcquisitionDate: "2000-06-01",
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: 1_500_000_000,
      ...over,
    });
  it("[GD-4a] 재결합 사실을 보존한다 · 긍정 짝: 보내지 않으면 undefined", () => {
    expect(part({ donorSameHouseholdContinuous: false, donorRejoinedAfterDivorce: true }).donorRejoinedAfterDivorce).toBe(true);
    expect(part({ donorSameHouseholdContinuous: false }).donorRejoinedAfterDivorce).toBeUndefined();
  });
  it("[GD-4b] 단건 인라인 shape과 키 집합이 같다(V-5 parity)", () => {
    const inline = propertyItemSchema.shape.carryoverTaxation as unknown as { unwrap?: () => z.ZodObject<Record<string, z.ZodType>> };
    const obj = (inline.unwrap ? inline.unwrap() : inline) as z.ZodObject<Record<string, z.ZodType>>;
    expect(Object.keys(obj.shape).sort()).toEqual(Object.keys(carryoverTaxationEngineShape.shape).sort());
  });
});
