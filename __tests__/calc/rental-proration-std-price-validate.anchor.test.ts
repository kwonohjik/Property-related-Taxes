/**
 * anchor: §97의3⑤ 안분 기준시가 ⑧ 검증 (Q10 후속 — 리뷰 D-2).
 *
 * ④가 감면-수준 override를 받으면 ⑧도 같은 fallback을 알아야 한다
 * (memory `feedback_validation_sync_8th_point`). 모양은 §66⑦ 블록
 * (`transfer-tax-validate-reductions.ts:167`)을 그대로 본떴다.
 *
 * ⭐ **안분이 필요할 때만 묻는다** — `calcRentalGainRatio`는 「양도일까지 계속 임대 +
 *    임대개시 ≤ 취득일」이면 기준시가를 보지도 않고 비율 1을 준다
 *    (`rental-97-shared-helpers.ts:211`). 그 경우까지 막으면 필요 없는 값을 요구하는 오탐이다.
 */
import { describe, it, expect } from "vitest";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

function reduction(over: Record<string, unknown> = {}): AssetReductionForm {
  return {
    ...getReductionDefault("rental_97_3"),
    registrationDate: "2015-03-02",
    rentalStartDate: "2016-01-05", // 취득일보다 늦다 → 안분 필요
    isTaxRegistered: true,
    rentIncreaseViolationMode: "none",
    rentalContinuesToTransfer: true,
    hasVacancyOverGrace: false,
    officialPriceAtStart: "400,000,000",
    isNationalHousingScale: true,
    isPrivateConstructionRental: true,
    ...over,
  } as AssetReductionForm;
}

function check(
  reductionOver: Record<string, unknown> = {},
  assetOver: Record<string, unknown> = {},
) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "2015-02-01",
    reductions: [reduction(reductionOver)],
    ...assetOver,
  };
  return validateStep2Reductions(2, {
    assets: [asset],
    transferDate: "2027-03-10",
  } as unknown as TransferFormData);
}

const MSG = /취득 당시·양도 당시 기준시가/;

describe("§97의3⑤ 안분 기준시가 — ⑧ 검증", () => {
  it("안분이 필요한데 두 칸도 자산 카드도 비었으면 차단한다", () => {
    expect(check()?.message).toMatch(MSG);
  });

  it("감면-수준 두 칸을 채우면 통과한다", () => {
    const issue = check({
      stdPriceAtAcquisition: "400,000,000",
      stdPriceAtTransfer: "800,000,000",
    });
    expect(issue?.message ?? "").not.toMatch(MSG);
  });

  it("자산 카드(환산 모드) 값만 있어도 통과한다 — ④의 폴백과 같은 기준", () => {
    const issue = check(
      {},
      { standardPriceAtAcq: "400,000,000", standardPriceAtTransfer: "800,000,000" },
    );
    expect(issue?.message ?? "").not.toMatch(MSG);
  });

  it("한쪽만 채우면 여전히 차단한다 (분모가 반쪽)", () => {
    expect(check({ stdPriceAtAcquisition: "400,000,000" })?.message).toMatch(MSG);
  });

  it("🔑 취득 즉시 임대 + 양도일까지 계속 — 안분이 필요 없으므로 묻지 않는다", () => {
    // 비율이 항상 1이라 기준시가를 보지도 않는다. 여기서 막으면 오탐이다.
    const issue = check({ rentalStartDate: "2015-01-05" });
    expect(issue?.message ?? "").not.toMatch(MSG);
  });

  it("🔑 임대를 먼저 끝냈으면(B≠D) 취득 즉시 임대라도 묻는다", () => {
    const issue = check({
      rentalStartDate: "2015-01-05",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: "700,000,000",
    });
    expect(issue?.message).toMatch(MSG);
  });
});
