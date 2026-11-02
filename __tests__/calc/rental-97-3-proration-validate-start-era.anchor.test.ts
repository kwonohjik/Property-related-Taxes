/**
 * anchor — ⑧ validate가 엔진과 같은 축으로 안분 필요 여부를 판정한다 (PR-A: 계획서 #2·#4, 3중 패턴)
 *
 * - #2: 안분 기산 = 의제 개시일(임대일·등록일·사업자등록일 중 늦은 날). 종전 ⑧은 원 임대일만 봐서
 *   「취득 = 임대일, 등록이 늦은」 사안을 통과시킨 뒤 엔진이 `MISSING_PRORATION_PRICES`로 불적용 처리했다.
 * - #4: §97의3 양도 2020.12.31 이전은 안분이 없어 기준시가를 묻지 않는다(엔진 `prorationEra = whole_gain`).
 */
import { describe, it, expect } from "vitest";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { rental97EffectiveStartString } from "@/lib/calc/rental-97-effective-start";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

function reduction(over: Record<string, unknown> = {}): AssetReductionForm {
  return {
    ...getReductionDefault("rental_97_3"),
    rentalStartDate: "2010-01-01", // = 취득일 (원 임대일만 보면 안분 불필요)
    registrationDate: "2014-01-01", // 등록이 4년 늦다 → 의제 개시일 2014 > 취득 → 안분 필요
    isTaxRegistered: true,
    taxRegistrationDate: "2014-01-01",
    rentIncreaseViolationMode: "none",
    rentalContinuesToTransfer: true,
    hasVacancyOverGrace: false,
    officialPriceAtStart: "400,000,000",
    isNationalHousingScale: true,
    ...over,
  } as AssetReductionForm;
}

function check(reductionOver: Record<string, unknown> = {}, transferDate = "2025-06-01") {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "2010-01-01",
    reductions: [reduction(reductionOver)],
  };
  return validateStep2Reductions(2, { assets: [asset], transferDate } as unknown as TransferFormData);
}

const MSG = /취득 당시·양도 당시 기준시가/;

describe("#2 — ⑧ 안분 필요 판정은 의제 개시일 기준", () => {
  it("취득 = 임대일이어도 등록이 늦으면 기준시가를 요구한다 (종전: 통과 → 엔진 불적용)", () => {
    expect(check()?.message).toMatch(MSG);
  });

  it("기준시가 두 칸을 채우면 통과한다", () => {
    expect(check({ stdPriceAtAcquisition: "300,000,000", stdPriceAtTransfer: "900,000,000" })?.message ?? "").not.toMatch(MSG);
  });

  it("대조 — 등록·사업자등록도 취득일과 같으면 묻지 않는다 (엔진 비율 1 단축 분기)", () => {
    expect(check({ registrationDate: "2010-01-01", taxRegistrationDate: "2010-01-01" })?.message ?? "").not.toMatch(MSG);
  });

  it("사업자등록일만 늦어도 요구한다 — 단, 사업자등록 미확인이면 그 날짜를 보지 않는다(④와 같은 조건)", () => {
    const base = { registrationDate: "2010-01-01", taxRegistrationDate: "2014-01-01" };
    expect(check(base)?.message).toMatch(MSG);
    expect(rental97EffectiveStartString({ rentalStartDate: "2010-01-01", registrationDate: "2010-01-01", isTaxRegistered: false, taxRegistrationDate: "2014-01-01" })).toBe("2010-01-01");
  });
});

describe("#4 — §97의3 양도 2020.12.31 이전은 안분이 없다", () => {
  it("양도 2020-12-31 → 기준시가를 묻지 않는다", () => {
    expect(check({}, "2020-12-31")?.message ?? "").not.toMatch(MSG);
  });

  it("양도 2020-12-31 + 조기 종료 → 임대 종료일은 묻지만 B(임대 종료일 기준시가)는 묻지 않는다", () => {
    const ended = check({ rentalContinuesToTransfer: false, rentalEndDate: "2020-12-01" }, "2020-12-31");
    expect(ended?.message ?? "").not.toMatch(/임대 종료일 당시 기준시가/);
    expect(ended?.message ?? "").not.toMatch(MSG);
    expect(check({ rentalContinuesToTransfer: false, rentalEndDate: "" }, "2020-12-31")?.message).toMatch(/임대 종료일을 입력하세요/);
  });

  it("경계 — 양도 2021-01-01부터는 다시 요구한다", () => {
    expect(check({}, "2021-01-01")?.message).toMatch(MSG);
  });
});
