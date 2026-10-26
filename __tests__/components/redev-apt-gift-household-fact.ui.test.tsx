/**
 * ⑤ 렌더 anchor — 증여받은 종전주택으로 원조합원이 된 완공APT에 「증여자와의 세대 관계」 카드가 열린다
 * (계획서 `docs/00-pm/redev-apt-gift-household-fact.plan.md` Q-1·Q-2 a). ④⑧과 같은 술어(`calcGiftHouseholdFactAsked`)다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { RedevelopmentResidenceSplitSection } from "@/components/calc/transfer/RedevelopmentResidenceSplitSection";
import { calcEffectiveWasRegulatedAtAcquisition, GIFT_HOUSEHOLD_SCOPE_PRIMARY } from "@/lib/calc/effective-regulated-at-acquisition";
import { giftPriorResidenceAsked } from "@/lib/calc/gift-household-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

const GIFT = {
  acquisitionCause: "gift",
  acquisitionDate: "2018-01-01",
  donorAcquisitionDate: "2008-01-01",
  giftDonorRelation: "spouse",
  giftSameHousehold: "yes",
  giftHouseholdHoldingStartDate: "2008-01-01",
};
const ORIGINAL = { assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "no", redevOriginalAssetType: "housing" };
const asset = (over: Record<string, unknown>) => ({ ...makeDefaultAsset(1), ...GIFT, ...over }) as unknown as AssetForm;

function cardFields(a: AssetForm) {
  const { container } = render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2024-12-01" isNewConstruction={false} />);
  return {
    householdStart: container.querySelectorAll('[data-testid="one-house-gift-household-start"]').length,
    priorResidence: container.querySelectorAll('[data-testid="one-house-gift-prior-residence"]').length,
  };
}

describe("⑤ 세대 관계 카드 — 축별", () => {
  it.each([
    ["일반 주택(대조군)", { assetKind: "housing" }, 1],
    ["주택을 출자한 원조합원 완공APT", ORIGINAL, 1],
    ["원조합원 — 출자 자산 미선택(엔진과 같이 주택 출자로 본다)", { ...ORIGINAL, redevOriginalAssetType: "" }, 1],
    ["토지만 출자한 원조합원 완공APT", { ...ORIGINAL, redevOriginalAssetType: "land" }, 0],
    ["승계조합원 완공APT", { ...ORIGINAL, redevIsSuccessorMember: "yes", acquisitionDate: "2020-01-01" }, 0],
    ["청산금 수령 단독신고", { ...ORIGINAL, redevReceiveOnlyMode: "yes" }, 0],
  ] as const)("%s", (_l, over, n) => {
    const got = cardFields(asset(over));
    expect(got.householdStart).toBe(n);
    expect(got.priorResidence).toBe(n);
    // 증여 전 동일세대 거주 칸을 묻는가 — 칸 노출과 같은 값(거주 구간 오류 안내가 이 칸을 가리켜도 되는가)
    expect(giftPriorResidenceAsked(asset(over))).toBe(n === 1);
  });
});

describe("⑤ 종전주택 거주 칸 안내 (Q-2 a)", () => {
  it("증여받은 원조합원 — 증여일 이후 거주만 · 증여 전 세대 거주는 세대 관계 카드로", () => {
    render(<RedevelopmentResidenceSplitSection asset={asset(ORIGINAL)} onChange={() => {}} transferDate="2024-12-01" />);
    expect(screen.getByText(/증여받은 날~관리처분/)).toBeTruthy();
  });

  it("매매 원조합원 — 종전 안내 그대로", () => {
    render(<RedevelopmentResidenceSplitSection asset={asset({ ...ORIGINAL, acquisitionCause: "purchase" })} onChange={() => {}} transferDate="2024-12-01" />);
    expect(screen.queryByText(/증여받은 날~관리처분/)).toBeNull();
    expect(screen.getByText(/종전주택 취득일~관리처분/)).toBeTruthy();
  });
});

describe("⑤ 「취득 당시 조정대상지역」 화면값 — 엔진과 같은 basis (V-2)", () => {
  it("세대 보유 시작일(2008 · 지정 전)이면 증여일(2018 · 강남 지정 중)이 조정이어도 「아님」 — RG-1 엔진 비과세와 같다", () => {
    const a = asset({ ...ORIGINAL, regionCode: "1168010100" });
    expect(calcEffectiveWasRegulatedAtAcquisition(a, false, undefined, GIFT_HOUSEHOLD_SCOPE_PRIMARY)).toBe(false);
    expect(calcEffectiveWasRegulatedAtAcquisition({ ...a, giftSameHousehold: "no" } as AssetForm, false, undefined, GIFT_HOUSEHOLD_SCOPE_PRIMARY)).toBe(true);
  });
});
