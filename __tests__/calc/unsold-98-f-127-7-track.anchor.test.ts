/**
 * anchor — §98·§98의2의 §127⑦ 트랙 분류 (§98 시리즈 리뷰 US-45 Q-8 (a) · US-84)
 *
 * 결정: §98(세율 20%)·§98의2(장특 표2·세율 특칙)도 §127⑦ 「둘 이상의 양도소득세의 감면규정」에 든다.
 * 보유연수(5년 분기)와 무관하게 다른 감면과 병용을 ⑧이 막는다. 메시지는 효과 유형(세율 특례·장특 표2 특칙)을 쓴다.
 * 전: §98의2+§77 — 보유 3년 통과 / 7년 차단. §98+§99 — 5년 후 통과(엔진이 §98을 말없이 버림). 문구 「(양도소득금액 차감)」.
 */
import { describe, it, expect } from "vitest";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { findTrack127_7Conflict } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { REDUCTION_METADATA } from "@/lib/tax-engine/transfer-reductions/metadata";
import { REDUCTION_TYPE_LABELS } from "@/lib/tax-engine/transfer-reduction-type-labels";

type Types = string[];
function formOf(acq: string, transfer: string, types: Types): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: transfer, contractTotalPrice: "600,000,000", householdHousingCount: "1" });
  const asset = {
    ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq,
    actualSalePrice: "600000000", fixedAcquisitionPrice: "300000000",
    reductions: types.map((t) => getReductionDefault(t as never)),
  } as AssetForm;
  f.assets[0] = { ...f.assets[0], ...asset, assetId: f.assets[0].assetId };
  return withTestAddress(f);
}
const msg = (acq: string, transfer: string, types: Types) => String(validateStep(2, formOf(acq, transfer, types)) ?? "");
const blocked = (acq: string, transfer: string, types: Types) => msg(acq, transfer, types).includes("§127⑦ 중복배제");

describe("US-45 — §98의2 + §77: 보유연수와 무관하게 차단", () => {
  it.each([
    ["보유 3년", "2010-06-01", "2013-06-01"],
    ["보유 7년", "2010-06-01", "2017-06-01"],
    ["보유 14년", "2010-06-01", "2024-06-03"],
  ])("%s", (_n, acq, tr) => {
    expect(blocked(acq, tr, ["unsold_98_2", "public_expropriation"])).toBe(true);
  });
});

describe("US-45 — §98 + 다른 감면: 보유연수와 무관하게 차단", () => {
  it.each([
    ["§98+§77 5년 이내", "2018-01-01", "2022-08-01", ["unsold_98", "public_expropriation"]],
    ["§98+§77 5년 후", "1996-06-15", "2022-08-01", ["unsold_98", "public_expropriation"]],
    ["§98+§97①본문 5년 후", "1996-06-15", "2022-08-01", ["unsold_98", "rental_97_main"]],
    ["§98+§99 5년 후(엔진이 §98을 버리던 조합)", "1998-06-15", "2022-08-01", ["unsold_98", "new_99"]],
    ["§98+§99 5년 이내", "1998-06-15", "2000-08-01", ["unsold_98", "new_99"]],
  ])("%s", (_n, acq, tr, types) => {
    expect(blocked(acq, tr, types)).toBe(true);
  });
});

describe("US-45 — 대조(불변): 단독 선택·기존 교차는 그대로", () => {
  it("§98의2 단독 · §98 단독은 차단하지 않는다", () => {
    expect(blocked("2010-06-01", "2017-06-01", ["unsold_98_2"])).toBe(false);
    expect(blocked("1996-06-15", "2022-08-01", ["unsold_98"])).toBe(false);
  });
  it("기존: §99의3(차감) + §77(세액) 차단", () => {
    expect(blocked("2010-06-01", "2017-06-01", ["new_99_3", "public_expropriation"])).toBe(true);
  });
  it("기존: §99의3 + §98의3 5년 후는 둘 다 차감형이라 교차 아님", () => {
    expect(findTrack127_7Conflict(["new_99_3", "unsold_98_3"], false)).toBeNull();
  });
});

describe("US-45·US-84 — 메시지는 효과 유형으로 표기하고 「양도소득금액 차감」을 쓰지 않는다", () => {
  it("§98 + §77", () => {
    const m = msg("1996-06-15", "2022-08-01", ["unsold_98", "public_expropriation"]);
    expect(m).toContain("세율 20% 특례");
    expect(m).toContain("산출세액 감면");
    expect(m).not.toContain("양도소득금액 차감");
    expect(m).not.toContain("분리과세");
  });
  it("§98의2 + §77", () => {
    const m = msg("2010-06-01", "2013-06-01", ["unsold_98_2", "public_expropriation"]);
    expect(m).toContain("장기보유특별공제 표2");
    expect(m).not.toContain("양도소득금액 차감");
  });
  it("§99(차감형) + §77은 종전 문구 유지", () => {
    expect(msg("2010-06-01", "2017-06-01", ["new_99", "public_expropriation"])).toContain("(양도소득금액 차감)");
  });
});

describe("US-84 — 라벨에 법문에 없는 「분리과세」가 없다", () => {
  it("metadata·type-labels", () => {
    expect(REDUCTION_METADATA.unsold_98.uiLabel).toBe("§98 — 미분양 국민주택 세율 20% 특례");
    expect(REDUCTION_TYPE_LABELS.unsold_98).toBe("미분양 국민주택 세율 20% 특례 (§98)");
  });
});
