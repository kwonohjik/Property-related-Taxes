/**
 * anchor: R-4 — 레거시 `long_term_rental` 감면 입력의 **이관**(→ `rental_97_3`).
 *
 * 종전에는 레거시 타입을 그대로 보존했고, 엔진이 **시한·등록일·기준시가·규모 게이트 없이**
 * 8년 50%를 적용했다(`transfer-tax-reductions-calc.ts` 구 :497 분기). 보류 사유였던
 * 「§97의3 8년 50% 부칙 미확보」가 해소돼(법률 제19199호 부칙 §38 + 2022-12-08 시행본
 * mst 237393) 그 경로를 걷어내고 현행 §97의3 평가기로 합류시킨다.
 *
 * 🔴 **조용한 소실이 이 anchor의 존재 이유다** — 폼 union·④·⑫에서 레거시 타입을 빼면,
 *    이미 그 타입이 들어 있는 세션은 감면이 **아무 사유 없이 사라진다**. 두 진입점
 *    (폼-전역 구버전 · 자산 폼 normalize)이 **모두** 이관해야 한다.
 *
 * ⚠️ 등록일·임대개시일은 **만들지 않는다** — 구 폼에는 연수(`rentalYears`)뿐이라 날짜를
 *    역산하면 추정 입력이 된다. 비워 두고 ⑧이 묻는다.
 */
import { describe, it, expect } from "vitest";
import { migrateLegacyForm } from "@/lib/stores/calc-wizard-migration";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

describe("R-4 — 폼-전역 구버전 세션 (진입점 ①)", () => {
  function migrate(over: Record<string, unknown> = {}) {
    const form = migrateLegacyForm(
      {
        transferDate: "2030-06-01",
        reductionType: "long_term_rental",
        rentalYears: "9",
        rentIncreaseRate: "3",
        ...over,
      },
      createDefaultTransferFormData(),
    );
    return (form.assets?.[0]?.reductions ?? [])[0] as Record<string, unknown> | undefined;
  }

  it("R4-1: 레거시 타입이 사라지고 rental_97_3가 남는다 (감면 자체는 보존)", () => {
    const r = migrate();
    expect(r?.type).toBe("rental_97_3");
  });

  it("R4-2: 임대료 5% 요건은 승계된다 — 3% → 위반 없음 / 7% → 위반", () => {
    expect(migrate({ rentIncreaseRate: "3" })?.rentIncreaseViolationMode).toBe("none");
    expect(migrate({ rentIncreaseRate: "7" })?.rentIncreaseViolationMode).toBe("has_violation");
  });

  it("R4-3: 등록일·임대개시일은 비어 있다 (연수로 날짜를 만들지 않는다)", () => {
    const r = migrate({ rentalYears: "12" });
    expect(r?.registrationDate).toBe("");
    expect(r?.rentalStartDate).toBe("");
  });

  it("R4-4: 3-state 미선택은 null로 남는다 (미입력을 충족으로 읽지 않는다)", () => {
    const r = migrate();
    expect(r?.hasVacancyOverGrace).toBeNull();
    expect(r?.rentalContinuesToTransfer).toBeNull();
    expect(r?.isNationalHousingScale).toBe(false);
  });
});

describe("R-4 — 이미 레거시 타입이 들어 있는 자산 폼 (진입점 ②)", () => {
  it("R4-5: `migrateAsset`이 이관한다 — 이 경로가 없으면 감면이 조용히 사라진다", () => {
    const asset = migrateAsset({
      assetKind: "housing",
      reductions: [{ type: "long_term_rental", rentalYears: "10", rentIncreaseRate: "4" }],
    });
    const r = (asset.reductions ?? [])[0] as unknown as Record<string, unknown>;
    expect(r.type).toBe("rental_97_3");
    expect(r.rentIncreaseViolationMode).toBe("none");
  });

  it("R4-6: 이미 rental_97_3인 값은 건드리지 않는다", () => {
    const asset = migrateAsset({
      assetKind: "housing",
      reductions: [
        { type: "rental_97_3", registrationDate: "2019-05-01", rentalStartDate: "2019-05-01" },
      ],
    });
    const r = (asset.reductions ?? [])[0] as unknown as Record<string, unknown>;
    expect(r.type).toBe("rental_97_3");
    expect(r.registrationDate).toBe("2019-05-01");
  });
});

describe("R-4 — ⑫ Zod가 레거시 입력을 더는 받지 않는다", () => {
  it("R4-7: `long_term_rental` 입력은 거부된다 (게이트 없는 8년 50% 경로 소멸)", () => {
    const parsed = reductionSchema.safeParse({
      type: "long_term_rental",
      rentalYears: 9,
      rentIncreaseRate: 0.03,
    });
    expect(parsed.success).toBe(false);
  });

  it("R4-8: rental_97_3 입력은 그대로 통과한다 (대조군)", () => {
    const parsed = reductionSchema.safeParse({
      type: "rental_97_3",
      registrationDate: "2019-05-01",
      rentalStartDate: "2019-05-01",
      isTaxRegistered: true,
      rentIncreaseViolated: false,
      officialPriceAtStart: 400_000_000,
      isNationalHousingScale: true,
      region: "capital",
      rentalHousingType: "long_term_private",
      isConvertedFromShortTerm: false,
      isPrivateConstructionRental: false,
    });
    expect(parsed.success).toBe(true);
  });
});
