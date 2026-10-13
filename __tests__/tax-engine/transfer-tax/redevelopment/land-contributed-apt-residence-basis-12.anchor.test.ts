/**
 * #12 anchor — **토지만 출자한 원조합원** 완공APT의 §154① 거주요건 「취득 당시」 기준일.
 *
 * 사용자 결정 C(2026-10-11): 신축주택 취득시기는 사용승인일(「소득세법 시행령」 §162①4호)이고, 보유 2년 기산과
 * 「취득 당시」 조정대상지역 판정에 **같은 날**을 쓴다. 다만 입주권 전환일이 (가) 2017.8.2. 이전이거나 (나) 그 날 조정대상지역이
 * 아니었으면 거주요건을 적용하지 않는다(서면-2022-법규재산-4321 ← 재산세제과-584 · 서면-2018-법령해석재산-1711 · 서면-2021-부동산-0965).
 *
 * 🔑 **입주권 전환일 = 관리처분계획 인가일**이다(사용자 정정 2026-10-13). 원조합원(토지·건물 출자자)에게는 분양계약일이라는 개념이 없고,
 * 인가일에 보유 부동산이 입주권으로 바뀐다 — 종전에 두었던 「조합원 분양계약일」 입력(인가일·분양계약일 중 늦은 날)은 없앴다.
 *
 * ## 시료 (G3-4 브리프 P1~P4 — 토지 2005-01-01 · 1세대1주택 · 거주 0개월)
 * 조정대상지역 명부 실측: 대전 유성(3020000000) 2020-06-19 ~ 2023-01-04 / 서울 노원(1135000000) 2017-08-03 ~ 2022-말.
 *
 * | 시료 | 인가 | 사용승인 | 결과 |
 * |---|---|---|---|
 * | P1 유성 | 2019-03-15(비조정) | 2021-02-15 | 비과세(전환 시 비조정) |
 * | P2 유성 | 2020-09-15(조정) | 2022-06-15 | 과세 |
 * | P3 유성 | 2021-03-15 | 2023-03-15 | 비과세(사용승인 때 해제) + 확인 필요 |
 * | P4 노원 | 2015-02-15(2017.8.2. 이전) | 2019-08-15 | 비과세(경과규정) |
 *
 * ⚠️ 수치는 mock 세율표 실측값이 아니라 **판정**(비과세/과세)과 경고 문구가 단언 대상이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { runPreCalculationSteps } from "@/lib/tax-engine/transfer-tax-precalc";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const YUSEONG = "3020000000";
const NOWON = "1135000000";

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

const warn = (r: { warnings?: string[] }) => (r.warnings ?? []).join("\n");
const NOTICE_NO_CONTRACT = /분양계약일/; // 분양계약일 개념을 없앴다 — 어떤 고지에도 다시 나오지 않아야 한다
const NOTICE_NO_ADDRESS = /주소가 없어 입주권 전환 시점 예외를 적용하지 않았습니다/;
const NOTICE_DELISTED = /인가일에는 조정대상지역이었으나 사용승인일.*해제되어 거주요건을 적용하지 않았습니다/;

describe("#12 P1 대전 유성 — 인가 2019-03-15(비조정) · 사용승인 2021-02-15(조정) · 양도 2024-06-01", () => {
  const base = { region: YUSEONG, approval: "2019-03-15", completion: "2021-02-15", transfer: "2024-06-01" };

  it("🔑 인가일이 지정 공고(2020-06-19) 전 — 전환일 비조정이라 거주요건 없음 → 비과세 (분양계약일 입력 없이)", () => {
    const r = calculateTransferTax(landApt(base), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(warn(r)).not.toMatch(NOTICE_NO_CONTRACT);
  });

  it("주소(법정동코드)가 없으면 인가일의 조정대상지역 여부를 판정할 수 없다 → 과세 + 주소 고지", () => {
    const r = calculateTransferTax(landApt({ ...base, region: undefined }, { wasRegulatedAtAcquisition: true }), rates);
    expect(r.isExempt).toBe(false);
    expect(warn(r)).toMatch(NOTICE_NO_ADDRESS);
  });

  it("긍정 짝 — 거주 24개월(신축주택 거주)을 채우면 비과세, 고지 없음", () => {
    const r = calculateTransferTax(
      landApt(base, { residencePeriodMonths: 24 }, { newHouseResidenceMonths: 24 }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(warn(r)).not.toMatch(NOTICE_NO_ADDRESS);
  });
});

describe("#12 P2 — 인가·사용승인 모두 조정 (유성 인가 2020-09-15 · 사용승인 2022-06-15 · 양도 2024-08-01)", () => {
  const base = { region: YUSEONG, approval: "2020-09-15", completion: "2022-06-15", transfer: "2024-08-01" };
  it("인가일(전환일)도 조정 — 거주 2년이 필요한데 거주 0 → 과세, 고지 없음(모르는 사실이 없다)", () => {
    const r = calculateTransferTax(landApt(base), rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
    expect(warn(r)).not.toMatch(NOTICE_NO_ADDRESS);
  });
  it("대조군 — 주택 출자 원조합원은 종전주택 취득일(2005 비조정) 기준이라 같은 사실에서 비과세 (§154⑧1호 통산)", () => {
    const r = calculateTransferTax(landApt(base, {}, { originalAssetType: "housing", completionDate: undefined }), rates);
    expect(r.isExempt).toBe(true);
  });
});

describe("#12 P3 — 인가는 조정, 사용승인 때 해제 (유성 인가 2021-03-15 · 사용승인 2023-03-15 · 양도 2025-06-01)", () => {
  const base = { region: YUSEONG, approval: "2021-03-15", completion: "2023-03-15", transfer: "2025-06-01" };
  it("법문대로 사용승인 당시 비조정 → 거주요건 없음 → 비과세 유지 + 정면 해석례 없음 확인 필요", () => {
    const r = calculateTransferTax(landApt(base), rates);
    expect(r.isExempt).toBe(true);
    expect(warn(r)).toMatch(NOTICE_DELISTED);
    expect(warn(r)).toContain("확인 필요");
  });
  it("고지 부정 짝 — 인가 때도 비조정이면(유성 2019-03-15 인가 · 사용승인 2023-03-15) 고지가 없다", () => {
    const r = calculateTransferTax(landApt({ ...base, approval: "2019-03-15" }), rates);
    expect(r.isExempt).toBe(true);
    expect(warn(r)).not.toMatch(NOTICE_DELISTED);
  });
});

describe("#12 P4 서울 노원 — 인가 2015-02-15 · 사용승인 2019-08-15(조정) · 양도 2024-06-01 (2017.8.2. 이전 전환 경과규정)", () => {
  const base = { region: NOWON, approval: "2015-02-15", completion: "2019-08-15", transfer: "2024-06-01" };
  it("인가일이 2017.8.2. 이전 → 거주요건 없음 → 비과세 (재산세제과-584), 분양계약일 입력 불필요", () => {
    const r = calculateTransferTax(landApt(base), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(warn(r)).not.toMatch(NOTICE_NO_CONTRACT);
  });
  it("경계 — 인가 2017-08-02는 이전(면제), 2017-08-03은 이후(조정이라 과세)", () => {
    expect(calculateTransferTax(landApt({ ...base, approval: "2017-08-02" }), rates).isExempt).toBe(true);
    expect(calculateTransferTax(landApt({ ...base, approval: "2017-08-03" }), rates).isExempt).toBe(false);
  });
});

describe("#12 2017.8.3. 경과규정 축 — 주소(법정동코드)가 없어도 인가일로 판정", () => {
  const base = { region: undefined, approval: "2015-02-15", completion: "2019-08-15", transfer: "2024-06-01" };
  it("주소 없음 + 사용승인일 조정(사용자 선언) · 인가 2015-02-15 — 경과규정으로 거주요건 없음 → 비과세", () => {
    const r = calculateTransferTax(landApt(base, { wasRegulatedAtAcquisition: true }), rates);
    expect(r.isExempt).toBe(true);
  });
  it("부정 짝 — 인가 2017-08-03이면 경과규정 밖 → 과세", () => {
    const r = calculateTransferTax(landApt({ ...base, approval: "2017-08-03" }, { wasRegulatedAtAcquisition: true }), rates);
    expect(r.isExempt).toBe(false);
  });
});

describe("#12 — 보유 기산과 같은 날: 사용승인일 (조정 판정일 · 형제 판정)", () => {
  it("취득 당시 조정 판정이 토지 취득일이 아니라 사용승인일이다 — 강남(2017-08-03~ 조정) 인가 2017-09-01(전환일도 조정) · 2020-01-01 사용승인 · 거주 0 → 과세 (G3-4가 고정했던 비과세를 의도적으로 뒤집음)", () => {
    const r = calculateTransferTax(
      landApt({ region: "1168010100", approval: "2017-09-01", completion: "2020-01-01", transfer: "2024-05-20" }),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });
  it("사용승인일이 2017.8.2. 이전이면 그 자체로 경과규정 면제 (노원 2017-06-01 사용승인)", () => {
    const r = calculateTransferTax(
      landApt({ region: NOWON, approval: "2014-01-01", completion: "2017-06-01", transfer: "2024-06-01" }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });
  it("준공 전 거주는 세지 않는다 — 종전 거주 36개월 입력은 무시하고 신축 거주만 센다 (주택 출자는 prior+new 통산)", () => {
    const base = { region: YUSEONG, approval: "2020-09-15", completion: "2022-06-15", transfer: "2024-08-01" };
    const land = calculateTransferTax(
      landApt(base, {}, { priorHouseResidenceMonths: 36, newHouseResidenceMonths: 0 }),
      rates,
    );
    expect(land.isExempt).toBe(false);
    const housing = calculateTransferTax(
      landApt(base, {}, { priorHouseResidenceMonths: 36, newHouseResidenceMonths: 0, originalAssetType: "housing" }),
      rates,
    );
    expect(housing.isExempt).toBe(true);
  });
  it("1세대가 아니면 고지도 판정도 없다 (거주요건 판정이 결론에 쓰이지 않는다)", () => {
    const r = calculateTransferTax(
      landApt({ region: YUSEONG, approval: "2019-03-15", completion: "2021-02-15", transfer: "2024-06-01" }, { isOneHousehold: false, householdHousingCount: 2 }),
      rates,
    );
    expect(warn(r)).not.toMatch(NOTICE_NO_CONTRACT);
  });
});

describe("#12 — 상속주택 특례 §155②의 「상속개시 당시 입주권 보유」: 토지만 보유한 상태의 상속은 입주권 보유가 아니다", () => {
  /** 상속개시 inh · 인가 approval · 사용승인 completion(2015) · 양도 2018-06-01 · 비조정 · 2주택 */
  const withInherited = (inh: string, approval: string) =>
    landApt(
      { region: undefined, approval, completion: "2015-06-01", transfer: "2018-06-01" },
      {
        householdHousingCount: 2,
        sellingHouseId: "selling",
        houses: [
          makeHouseInfo("selling", { acquisitionDate: D("2015-06-01") }),
          makeHouseInfo("inh", { isInherited: true, inheritedDate: D(inh), acquisitionDate: D(inh) }),
        ],
      },
    );
  it("인가 전(토지만 보유) 상속개시 → 입주권 보유 아님 → 상속주택 제외 0", () => {
    expect(resolveInheritedHouseExclusionFromInput(withInherited("2011-06-01", "2011-12-01")).excludedCount).toBe(0);
  });
  it("긍정 짝 — 인가 후(입주권 보유) 상속개시 → 제외 1", () => {
    expect(resolveInheritedHouseExclusionFromInput(withInherited("2011-06-01", "2010-12-01")).excludedCount).toBe(1);
  });
  it("대조 — 주택 출자 원조합원은 종전주택 취득일 기준이라 종전 동작 그대로(제외 1)", () => {
    const i = withInherited("2011-06-01", "2011-12-01");
    const housing = { ...i, acquisitionDate: D("2005-03-01"), redevelopment: { ...i.redevelopment!, originalAssetType: "housing" as const } };
    expect(resolveInheritedHouseExclusionFromInput(housing).excludedCount).toBe(1);
  });
});

describe("#12 — 조특법 §99의4·§98의9 「취득 전 보유 주택」 판정의 일반주택 취득일도 사용승인일 (D4-05 입력 번역)", () => {
  const hceDate = (i: TransferTaxInput) =>
    runPreCalculationSteps(i, rates, undefined, [], [], calculateTransferTax).hceGeneralHouseAcquisitionDate;
  const base = { region: YUSEONG, approval: "2019-03-15", completion: "2021-02-15", transfer: "2024-06-01" };
  it("토지 출자 원조합원 완공APT — 사용승인일", () => {
    expect(hceDate(landApt(base)).toISOString().slice(0, 10)).toBe("2021-02-15");
  });
  it("부정 짝 — 주택 출자 원조합원은 종전주택 취득일 그대로", () => {
    expect(hceDate(landApt(base, {}, { originalAssetType: "housing" })).toISOString().slice(0, 10)).toBe("2005-01-01");
  });
});
