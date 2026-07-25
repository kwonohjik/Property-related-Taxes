/**
 * §155⑳ 임대주택 유닛 sessionStorage 마이그레이션 (능동형 UI 개편, 2026-07-25)
 *
 * 구 스키마(registrationDate·rentalType 5값·region 3값) → 신 스키마 분해 검증.
 * silent-strip 방어: 구 데이터가 신 필드로 정상 이전되는지 anchor.
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";

type RhUnit = Record<string, unknown>;
function migrateUnit(oldUnit: RhUnit): RhUnit {
  const migrated = migrateAsset({
    rentalHousingException: {
      applyException: true,
      scenario: "A",
      rentalUnits: [oldUnit],
    },
  }) as unknown as { rentalHousingException: { rentalUnits: RhUnit[] } };
  return migrated.rentalHousingException.rentalUnits[0];
}

describe("임대주택 유닛 마이그레이션 — 구→신 스키마 분해", () => {
  it("registrationDate → rentalRegistrationDate 이전 + businessRegistrationDate 빈값", () => {
    const u = migrateUnit({ registrationDate: "2019-05-01", rentalType: "long-8", region: "seoul-metro" });
    expect(u.rentalRegistrationDate).toBe("2019-05-01");
    expect(u.businessRegistrationDate).toBe("");
    expect(u.registrationDate).toBeUndefined();
  });

  it("rentalType long-8/long-10 → long_general", () => {
    expect(migrateUnit({ rentalType: "long-8" }).rentalCategory).toBe("long_general");
    expect(migrateUnit({ rentalType: "long-10" }).rentalCategory).toBe("long_general");
  });

  it("rentalType short-6 → short_6y, pre-2018 → pre_2018", () => {
    expect(migrateUnit({ rentalType: "short-6" }).rentalCategory).toBe("short_6y");
    expect(migrateUnit({ rentalType: "pre-2018" }).rentalCategory).toBe("pre_2018");
  });

  it("rentalType short-4 → pre_2018 (의무기간 4→5년 상향·재입력 유도)", () => {
    const u = migrateUnit({ rentalType: "short-4" });
    expect(u.rentalCategory).toBe("pre_2018");
    expect(u.rentalType).toBeUndefined();
  });

  it("region regulated-area → seoul-metro + isExcluded918Rule=true 분해", () => {
    const u = migrateUnit({ region: "regulated-area" });
    expect(u.region).toBe("seoul-metro");
    expect(u.isExcluded918Rule).toBe(true);
  });

  it("region seoul-metro/non-metro → 유지 + isExcluded918Rule=false", () => {
    expect(migrateUnit({ region: "non-metro" }).isExcluded918Rule).toBe(false);
    expect(migrateUnit({ region: "non-metro" }).region).toBe("non-metro");
  });

  it("신규 필드 backfill (면적·2호 자기확인)", () => {
    const u = migrateUnit({ registrationDate: "2019-01-01", rentalType: "long-8", region: "seoul-metro" });
    expect(u.rentalLandArea).toBe("");
    expect(u.rentalTotalFloorArea).toBe("");
    expect(u.hasMinimum2Units).toBe(false);
  });

  it("C4 rename: Phase 1 isRegulatedAreaNewAcq(구 필드명) → isExcluded918Rule 값 보존·구 필드 삭제", () => {
    const u = migrateUnit({ isRegulatedAreaNewAcq: true, region: "seoul-metro" });
    expect(u.isExcluded918Rule).toBe(true);
    expect(u.isRegulatedAreaNewAcq).toBeUndefined();
  });

  it("C4 신규 필드 backfill (취득당시 기준시가·국민주택·계약금증빙·단→장변경)", () => {
    const u = migrateUnit({ region: "seoul-metro" });
    expect(u.acquisitionOfficialPrice).toBe("");
    expect(u.isNationalSizeHousing).toBe(false);
    expect(u.hasContractDepositProof).toBe(false);
    expect(u.isExcludedShortToLongChange).toBe(false);
  });
});
