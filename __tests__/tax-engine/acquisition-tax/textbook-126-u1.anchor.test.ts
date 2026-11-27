/**
 * 취득세 교재 대조 U1 — 부담부증여 증여자 관계 단일 소스 (지방세법 §7⑫ 단서·§7⑪)
 *
 * 종전 화면은 같은 사실(증여자가 배우자·직계존비속인지)을 「증여자의 신분」 라디오(giftorRelation)와
 * 「부담부증여 — 배우자·직계존비속 관계」 토글(giftRelation)에서 따로 물어, 라디오만 「배우자」로 고르면
 * 채무 부분을 유상으로 계산했다(66,000,000). 이제 giftorRelation이 단일 소스다.
 * 계부모(직계존속의 배우자)·의붓자녀는 인척이라 §7⑪ 「직계존비속」이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

// 교재 p25 형태: 조정·시가 10억·공시 7억·채무 6억 (수증자 무주택)
const BURDENED: Partial<AcquisitionTaxInput> = {
  propertyType: "housing",
  acquisitionCause: "burdened_gift",
  acquiredBy: "individual",
  reportedPrice: 0,
  marketValue: 1_000_000_000,
  standardValue: 700_000_000,
  wholeHouseStandardValue: 700_000_000,
  encumbrance: 600_000_000,
  isRegulatedArea: true,
  isMetropolitanRegion: true,
  houseCountAfter: 1,
  contractDate: "2026-06-01",
};
const run = (o: Partial<AcquisitionTaxInput>) => calcAcquisitionTax({ ...BURDENED, ...o } as AcquisitionTaxInput);

describe("U1 부담부증여 — 증여자 신분(giftorRelation) 하나로 §7⑫ 단서 판정", () => {
  it("증여자 배우자 → 전체 무상 10억 × 12% = 120,000,000 (종전: 라디오만 고르면 66,000,000)", () => {
    const r = run({ giftorRelation: "spouse" });
    expect(r.acquisitionTax).toBe(120_000_000);
    expect(r.taxBaseMethod).not.toBe("split_onerous");
    expect(r.legalBasis).toContain("지방세법 §7⑫ 단서"); // U7 — 종전 「§7④」(지목변경 조항) 오기
  });

  it("직계존속·직계비속도 같다", () => {
    expect(run({ giftorRelation: "lineal_ascendant" }).acquisitionTax).toBe(120_000_000);
    expect(run({ giftorRelation: "lineal_descendant" }).acquisitionTax).toBe(120_000_000);
  });

  it("의붓자녀·계부모·기타 → 채무 부분 유상 분리 = 66,000,000", () => {
    expect(run({ giftorRelation: "lineal_descendant_step" }).acquisitionTax).toBe(66_000_000);
    expect(run({ giftorRelation: "lineal_ascendant_spouse" }).acquisitionTax).toBe(66_000_000);
    expect(run({ giftorRelation: "other" }).acquisitionTax).toBe(66_000_000);
  });

  it("직접 API의 giftRelation은 giftorRelation이 없을 때만 쓴다", () => {
    expect(run({ giftRelation: "spouse_or_lineal" }).acquisitionTax).toBe(120_000_000);
    expect(run({ giftorRelation: "other", giftRelation: "spouse_or_lineal" }).acquisitionTax).toBe(66_000_000);
  });

  it("API(④): 화면은 giftorRelation만 보낸다", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      propertyType: "housing",
      acquisitionCause: "burdened_gift",
      marketValue: "1,000,000,000",
      encumbrance: "600,000,000",
      giftorRelation: "spouse",
    };
    const body = buildAcquisitionTaxBody(form);
    expect(body.giftorRelation).toBe("spouse");
    expect(body.giftRelation).toBeUndefined();
  });
});
