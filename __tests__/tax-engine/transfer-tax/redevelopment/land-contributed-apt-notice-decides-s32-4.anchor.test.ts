/**
 * #32-4 anchor — 토지만 출자한 원조합원 완공APT의 「확인 필요」 고지 셋은 **그 사실을 다른 독법으로 읽어 판정 전체를 다시 돌려도 결론이 같으면 내지 않는다**.
 *
 *   N1 주소(법정동코드) 없음 — 인가일 조정 여부를 몰라 입주권 전환 시점 예외를 적용하지 않았다
 *   N2 인가일 조정 · 사용승인일 해제 — 법문대로 거주요건을 적용하지 않았는데 정면 해석례가 없다
 *   N3 세대원 건물 출자 통산 — 정면 해석례 없는 유추
 *
 * 종전 게이트는 거주 개월·보유 개월 근사(N3)이거나 아예 없어서(N1·N2), 3주택·보유 1년 미만·거주 24개월 충족처럼 **다른 사유가 따로 정한 사안**에도 붙었다.
 * 긍정 짝(결론을 가를 때 고지 유지)은 `land-contributed-apt-residence-basis-12`·`-household-building-carryover-12`가 지킨다 — 여기서도 한 벌씩 다시 둔다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const YUSEONG = "3020000000";

function landApt(
  p: { region: string | undefined; approval: string; completion: string; transfer: string },
  over: Partial<TransferTaxInput> = {},
  rOver: Partial<RedevelopmentInfo> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: D(p.transfer),
    acquisitionDate: D("2005-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    regionCode: p.region,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D(p.approval),
      rightsValue: 250_000_000,
      settlementDirection: "pay",
      settlementAmount: 136_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "land",
      completionDate: D(p.completion),
      ...rOver,
    } as RedevelopmentInfo,
    ...over,
  });
}
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const warn = (r: { warnings?: string[] }) => (r.warnings ?? []).join("\n");
const N1 = /주소가 없어 입주권 전환 시점 예외를 적용하지 않았습니다/;
const N2 = /인가일에는 조정대상지역이었으나 사용승인일.*해제되어 거주요건을 적용하지 않았습니다/;
const N3 = /세대원 건물 출자 통산을 적용했습니다/;

describe("#32-4 N2 — 인가 조정 · 사용승인 해제 (유성 인가 2021-03-15 · 사용승인 2023-03-15 · 양도 2025-06-01)", () => {
  const base = { region: YUSEONG, approval: "2021-03-15", completion: "2023-03-15", transfer: "2025-06-01" };

  it("긍정 — 거주 0개월: 해제 독법은 비과세, 거주요건을 적용하면 과세 → 결론을 가르므로 고지 유지", () => {
    const r = calc(landApt(base));
    expect(r.isExempt).toBe(true);
    expect(warn(r)).toMatch(N2);
  });
  it("같은 결론 — 거주 24개월을 채웠으면 어느 독법이든 비과세 → 고지 없음", () => {
    const r = calc(landApt(base, { residencePeriodMonths: 24 }, { newHouseResidenceMonths: 24 }));
    expect(r.isExempt).toBe(true);
    expect(warn(r)).not.toMatch(N2);
  });
  it("같은 결론 — 사용승인 후 보유 2년 미만(양도 2024-09-01)이라 어느 독법이든 과세 → 고지 없음", () => {
    const r = calc(landApt({ ...base, transfer: "2024-09-01" }));
    expect(r.isExempt).toBe(false);
    expect(warn(r)).not.toMatch(N2);
  });
  it("같은 결론 — 3주택이라 어느 독법이든 과세 → 고지 없음", () => {
    const r = calc(landApt(base, { householdHousingCount: 3 }));
    expect(r.isExempt).toBe(false);
    expect(warn(r)).not.toMatch(N2);
  });
});

describe("#32-4 N1 — 주소 없음 (인가 2019-03-15 · 사용승인 2021-02-15 · 양도 2024-06-01)", () => {
  const base = { region: undefined, approval: "2019-03-15", completion: "2021-02-15", transfer: "2024-06-01" };
  const reg = { wasRegulatedAtAcquisition: true };

  it("긍정 — 거주요건만 모자라 과세: 주소가 있어 인가일이 비조정이면 비과세 → 고지 유지", () => {
    const r = calc(landApt(base, reg));
    expect(r.isExempt).toBe(false);
    expect(warn(r)).toMatch(N1);
  });
  it("같은 결론 — 사용승인 후 보유 2년 미만(양도 2021-10-01)이라 거주요건과 무관하게 과세 → 고지 없음", () => {
    const r = calc(landApt({ ...base, transfer: "2021-10-01" }, reg));
    expect(r.isExempt).toBe(false);
    expect(warn(r)).not.toMatch(N1);
  });
  it("같은 결론 — 3주택이라 거주요건과 무관하게 과세 → 고지 없음", () => {
    const r = calc(landApt(base, { ...reg, householdHousingCount: 3 }));
    expect(r.isExempt).toBe(false);
    expect(warn(r)).not.toMatch(N1);
  });
});

describe("#32-4 N3 — 세대원 건물 출자 통산 (강남 · 인가 2017-09-01 · 사용승인 2023-03-15 · 양도 2024-05-20)", () => {
  const apt = (over: Partial<TransferTaxInput> = {}) =>
    landApt(
      { region: "1168010100", approval: "2017-09-01", completion: "2023-03-15", transfer: "2024-05-20" },
      { transferPrice: 1_500_000_000, ...over },
      { newHouseResidenceMonths: 12, householdBuilding: { acquisitionDate: D("2010-05-01"), residenceMonths: 36 } },
    );

  it("긍정 — 통산이 있어야 비과세(통산 없이는 거주 12개월 미달 과세) → 고지 유지", () => {
    const r = calc(apt());
    expect(r.isPartialExempt || r.isExempt).toBe(true);
    expect(warn(r)).toMatch(N3);
  });
  it("같은 결론 — 3주택이라 통산 유무와 무관하게 과세 → 고지 없음 (종전 보유 개월 근사는 이 사안에도 고지를 붙였다)", () => {
    const r = calc(apt({ householdHousingCount: 3 }));
    expect(r.isExempt || r.isPartialExempt).toBe(false);
    expect(warn(r)).not.toMatch(N3);
  });
});
