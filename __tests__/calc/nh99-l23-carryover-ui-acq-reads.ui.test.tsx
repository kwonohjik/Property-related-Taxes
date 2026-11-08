/**
 * @vitest-environment jsdom
 *
 * 이월과세 자산 — 화면(⑤)이 읽는 취득일 (레인 L23). ⑧·leaf 단언은 `nh99-l23-carryover-ui-acq-reads.anchor.test.ts`.
 * 셀: 잔재(S) ≠ 증여 등기접수일(G) 양방향 · S 빔 · 매매 대조(불변). 부정형(안 뜬다)에는 같은 렌더의 긍정 짝을 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExemptionAtApprovalCard, SuccessorMemberSection } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { houseRow } from "./_helpers/redev-one-house-route";
import { calcRentalResidenceFacts } from "@/lib/calc/rental-residence-form-facts";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const carry = (G: string) => ({ ...CARRYOVER_DEFAULTS, giftRegistryDate: G, donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: "100000000", giftDateValuation: "400000000", donorRelation: "lineal" });
const redev = (S: string, G: string, cause: "carryover_gift" | "purchase" = "carryover_gift", over: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(1), assetKind: "redevelopment_apt", redevSubject: "apt", redevSettlementDirection: "receive", redevIsSuccessorMember: "no",
    acquisitionCause: cause, acquisitionDate: S, redevApprovalDate: "2022-03-01", redevRightsValue: "900000000", redevExemptionEligibleAtApproval: "",
    ...(cause === "carryover_gift" ? { carryover: carry(G) } : {}), ...over,
  }) as AssetForm;
const text = () => document.body.textContent ?? "";

describe("① ExemptionAtApprovalCard — 참고 기간은 증여 등기접수일부터 인가일까지", () => {
  it("🔑 잔재 2015(7년)·등기접수일 2021-12-01(3개월) → 「미충족」 (수정 전: 잔재로 「충족」)", () => {
    render(<ExemptionAtApprovalCard asset={redev("2015-03-01", "2021-12-01")} onChange={() => {}} />);
    expect(text()).toContain("0년 3개월 → 2년 요건 미충족");
  });
  it("🔑 잔재 2021-12-01(3개월)·등기접수일 2015(7년) → 「충족」 (수정 전: 잔재로 「미충족」)", () => {
    render(<ExemptionAtApprovalCard asset={redev("2021-12-01", "2015-03-01")} onChange={() => {}} />);
    expect(text()).toContain("7년 0개월 → 2년 요건 충족");
  });
  it("🔑 잔재 빔·등기접수일 2015 → 참고 기간이 계산된다 (수정 전: 없는 칸을 입력하라는 안내)", () => {
    render(<ExemptionAtApprovalCard asset={redev("", "2015-03-01")} onChange={() => {}} />);
    expect(text()).toContain("7년 0개월 → 2년 요건 충족");
    expect(text()).not.toContain("모두 입력하면 참고 기간이 계산됩니다");
  });
  it("등기접수일 빔 → 잔재로 채우지 않고 입력 안내", () => {
    render(<ExemptionAtApprovalCard asset={redev("2015-03-01", "")} onChange={() => {}} />);
    expect(text()).toContain("모두 입력하면 참고 기간이 계산됩니다");
  });
  it("대조(불변) — 매매는 취득일 기준", () => {
    render(<ExemptionAtApprovalCard asset={redev("2015-03-01", "", "purchase")} onChange={() => {}} />);
    expect(text()).toContain("7년 0개월 → 2년 요건 충족");
  });
});

describe("② SuccessorMemberSection — 승계조합원 권장 배너", () => {
  const RECOMMEND = "승계조합원 모드 사용을 권장합니다";
  const AMBIGUOUS = "동일 날짜";
  it("🔑 잔재 인가 전(2015)·등기접수일 인가 뒤(2023) → 권장 배너 (수정 전: 숨김)", () => {
    render(<SuccessorMemberSection asset={redev("2015-03-01", "2023-03-01")} onChange={() => {}} />);
    expect(text()).toContain(RECOMMEND);
  });
  it("🔑 잔재 인가 뒤(2023)·등기접수일 인가 전(2015) → 배너 없음 (수정 전: 잘못 뜸)", () => {
    render(<SuccessorMemberSection asset={redev("2023-03-01", "2015-03-01")} onChange={() => {}} />);
    expect(text()).not.toContain(RECOMMEND);
  });
  it("🔑 잔재 빔·등기접수일 인가 뒤 → 권장 배너 (수정 전: 숨김)", () => {
    render(<SuccessorMemberSection asset={redev("", "2023-03-01")} onChange={() => {}} />);
    expect(text()).toContain(RECOMMEND);
  });
  it("등기접수일 = 인가일 → 경계(동일 날짜) 경고", () => {
    render(<SuccessorMemberSection asset={redev("2015-03-01", "2022-03-01")} onChange={() => {}} />);
    expect(text()).toContain(AMBIGUOUS);
  });
  it("대조(불변) — 매매 취득일이 인가 뒤면 권장 배너", () => {
    render(<SuccessorMemberSection asset={redev("2023-03-01", "", "purchase")} onChange={() => {}} />);
    expect(text()).toContain(RECOMMEND);
  });
});

describe("③ UnifiedReductionPanel — §127⑦ 트랙 교차 배너", () => {
  const BANNER = "조특법 §127⑦ — 두 감면은 택일입니다";
  const r993 = { type: "new_99_3" } as unknown as AssetReductionForm;
  const r983 = { type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: "2009-06-01", isOverconcentration983: false } as unknown as AssetReductionForm;
  const housing = (S: string, G: string, cause: "carryover_gift" | "purchase" = "carryover_gift") =>
    ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: cause, acquisitionDate: S, reductions: [r993, r983], ...(cause === "carryover_gift" ? { carryover: carry(G) } : {}) }) as AssetForm;
  it("🔑 잔재 2010(5년 경과)·등기접수일 2023(5년 이내) → 배너 (수정 전: 숨김)", () => {
    render(<UnifiedReductionPanel asset={housing("2010-01-01", "2023-01-01")} transferDate="2024-06-01" onChange={() => {}} />);
    expect(text()).toContain(BANNER);
  });
  it("🔑 잔재 2023(5년 이내)·등기접수일 2010(5년 경과) → 배너 없음 (수정 전: 잘못 뜸)", () => {
    render(<UnifiedReductionPanel asset={housing("2023-01-01", "2010-01-01")} transferDate="2024-06-01" onChange={() => {}} />);
    expect(text()).not.toContain(BANNER);
  });
  it("대조(불변) — 매매 취득일 2023이면 배너", () => {
    render(<UnifiedReductionPanel asset={housing("2023-01-01", "", "purchase")} transferDate="2024-06-01" onChange={() => {}} />);
    expect(text()).toContain(BANNER);
  });
});

describe("⑦ Step4 — 다주택 중과 한시 배제기간 카드(엔진과 같은 방향)", () => {
  const CARD = "surcharge-suspended-notice";
  const form = (S: string, G: string, cause: "carryover_gift" | "purchase" = "carryover_gift") => {
    const base = createDefaultTransferFormData();
    return {
      ...base, transferDate: "2023-03-01", isOneHousehold: true, householdHousingCount: "2",
      houses: [houseRow("h1", "2015-01-01")],
      assets: [{ ...base.assets[0], assetKind: "housing", acquisitionCause: cause, acquisitionDate: S, ...(cause === "carryover_gift" ? { carryover: carry(G) } : {}) }],
    } as ReturnType<typeof createDefaultTransferFormData>;
  };
  it("🔑 잔재 2018(보유 2년↑)·등기접수일 2022-03-01(보유 1년) → 카드 없음 (수정 전: 엔진은 중과인데 「일반세율」 카드)", () => {
    render(<Step4 form={form("2018-05-05", "2022-03-01")} onChange={() => {}} />);
    expect(screen.queryByTestId(CARD)).toBeNull();
  });
  it("🔑 잔재 2022-03-01·등기접수일 2018-05-05(보유 2년↑) → 카드 (수정 전: 숨김)", () => {
    render(<Step4 form={form("2022-03-01", "2018-05-05")} onChange={() => {}} />);
    expect(screen.queryByTestId(CARD)).not.toBeNull();
  });
  it("🔑 잔재 빔·등기접수일 2018-05-05 → 카드", () => {
    render(<Step4 form={form("", "2018-05-05")} onChange={() => {}} />);
    expect(screen.queryByTestId(CARD)).not.toBeNull();
  });
  it("대조(불변) — 매매 취득일 2018 → 카드, 2022-03-01 → 없음", () => {
    render(<Step4 form={form("2018-05-05", "", "purchase")} onChange={() => {}} />);
    expect(screen.queryByTestId(CARD)).not.toBeNull();
    cleanup();
    render(<Step4 form={form("2022-03-01", "", "purchase")} onChange={() => {}} />);
    expect(screen.queryByTestId(CARD)).toBeNull();
  });
});

describe("⑥ N4 장기임대 거주주택 특례 카드 — 시나리오 B 「취득 당시 기준시가」 조회 기준일은 증여 등기접수일", () => {
  const YEAR = "phrp-stdprice-acq-year-select";
  // 시나리오 B · 임대 0호(§154⑩ 표준 경로) · 환산 연동 아님 → 카드가 공시가격 연도 조회(기준일 = 거주주택 취득일)를 그린다
  const rhB = () => ({ ...RENTAL_HOUSING_EXCEPTION_DEFAULTS, applyException: true, scenario: "B", rentalUnits: [] }) as AssetForm["rentalHousingException"];
  const housing = (S: string, G: string) =>
    ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: S, carryover: carry(G), rentalHousingException: rhB() }) as AssetForm;
  const renderCard = (a: AssetForm) =>
    render(<AssetSectionExtras asset={a} assetIndex={0} onChange={() => {}} transferDate="2024-06-01" />);
  it("🔑 잔재 있음·등기접수일 빔 → 「기준일 미입력」 (수정 전: 잔재 연도가 추천됨)", () => {
    renderCard(housing("2010-01-01", ""));
    expect(screen.getByTestId(YEAR).textContent).toContain("기준일 미입력");
  });
  it("🔑 잔재 빔·등기접수일 2020-01-01 → 연도가 추천된다 (수정 전: 「기준일 미입력」)", () => {
    renderCard(housing("", "2020-01-01"));
    expect(screen.getByTestId(YEAR).textContent).not.toContain("기준일 미입력");
    expect(screen.getByTestId(YEAR).textContent).toMatch(/20\d\d년/);
  });
});

describe("⑥ N4 상생임대 ①1호 날짜 하한 — 취득일 = 증여 등기접수일 (`calcRentalResidenceFacts`)", () => {
  // 상생 계약일 2022-06-01(체결기간 2021.12.20.~2024.12.31. 안): 등기접수일 2020-01-01 뒤라 성립 / 등기접수일 2023-01-01 앞이라 불성립 (소령 §155의3①)
  const fx = { winWinRentalSpecial: true, winWinRentalContractDate: "2022-06-01", winWinRentalIncreaseRatePct: "3", winWinRentalPriorLeaseMonths: "24", winWinRentalLeaseMonths: "24", winWinRentalLeaseEndDate: "" };
  const exempt = (S: string, G: string) => {
    const a = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: S, carryover: carry(G) } as AssetForm;
    const f = { ...createDefaultTransferFormData(), transferDate: "2024-06-01", importedOneHouseFacts: fx, assets: [a] } as unknown as Parameters<typeof calcRentalResidenceFacts>[0];
    return calcRentalResidenceFacts(f, a, 0).winWinResidenceExempt;
  };
  it("🔑 잔재 2023-01-01(계약 뒤)·등기접수일 2020-01-01(계약 앞서 취득) → 성립 (수정 전: 불성립)", () => {
    expect(exempt("2023-01-01", "2020-01-01")).toBe(true);
  });
  it("🔑 잔재 2020-01-01·등기접수일 2023-01-01(계약 뒤 취득) → 불성립 (수정 전: 성립)", () => {
    expect(exempt("2020-01-01", "2023-01-01")).toBe(false);
  });
  it("잔재 빔·등기접수일 2020-01-01 → 성립", () => {
    expect(exempt("", "2020-01-01")).toBe(true);
  });
});
