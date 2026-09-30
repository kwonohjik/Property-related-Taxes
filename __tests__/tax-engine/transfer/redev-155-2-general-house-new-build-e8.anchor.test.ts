/**
 * anchor (E-8) — 재개발·재건축 신축주택(완공APT)을 「일반주택」으로 양도할 때 §155② 괄호의 **취득일 축**.
 *
 * 법령(KoreanLaw MCP 실독):
 *   · 소득세법 시행령 §155② 괄호(2014-02-21 시행본 MST 151424) — 「그 밖의 주택(상속개시 당시 보유한 주택
 *     또는 상속개시 당시 보유한 조합원입주권에 의하여 사업시행 완료 후 취득한 신축주택만 해당한다 …)」
 *   · 대통령령 제24356호 부칙 제20조 — 「… 이 영 시행(2013-02-15) 후 취득하여 양도하는 분부터」
 *   · 대통령령 제25193호 부칙 제2조② — 입주권 신축주택 포함은 2014-02-21 이후 양도분부터
 *   · 소득세법 시행령 §162①4호 — 자기가 건설한 건축물의 취득시기 = 사용승인서 교부일
 *     (승계조합원 신축주택 — 사전-2019-법령해석재산-0649 · 서면-2019-부동산-4508)
 *
 * 해석례(taxlaw.nts.go.kr 원문):
 *   · 서면-2021-부동산-5845(2023.03.23) — 「… 일반주택을 멸실하고 재건축한 경우에는 **기존주택의 취득일을
 *     일반주택의 취득일로 보아** 같은 영 제155조제2항을 적용하는 것입니다」
 *
 * 규칙:
 *   · 원조합원 — 신축주택은 종전주택의 연장 ⇒ 엔진 `acquisitionDate`(종전주택 취득일)가 그대로 일반주택 취득일
 *     (5845). 종전 동작 유지.
 *   · 승계조합원 — 종전주택을 보유한 적이 없다. 일반주택(신축주택) 취득일 = 준공일(§162①4호), 상속개시 당시
 *     보유 여부는 **입주권 승계일 ≤ 상속개시일**(= 「상속개시 당시 보유한 조합원입주권」)로 판정한다.
 *     종전에는 입주권 승계일을 일반주택 취득일로 읽어 2013-02-15 전 승계 · 이후 준공 · 상속 **후** 승계인
 *     신축주택이 부칙 제20조로 한정을 벗어나 비과세됐다(과소과세).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { baseTransferInput, makeMockRates, makeHouseInfo } from "../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 별도세대 단독상속 주택(상속개시 inh) + 승계조합원 신축주택 양도 8억 · 비조정 · 2주택 */
function successor(p: { rightAcq: string; approval: string; completion: string; inh: string; transfer?: string }): TransferTaxInput {
  const redevelopment: RedevelopmentInfo = {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: D(p.approval),
    rightsValue: 0,
    settlementDirection: "pay",
    settlementAmount: 0,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    isSuccessorMember: true,
    completionDate: D(p.completion),
  };
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 800_000_000,
    transferDate: D(p.transfer ?? "2018-06-01"),
    acquisitionDate: D(p.rightAcq),
    acquisitionPrice: 400_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    isSuccessorRightToMoveIn: true,
    sellingHouseId: "selling",
    houses: [
      makeHouseInfo("selling", { acquisitionDate: D(p.completion) }),
      makeHouseInfo("inh", { isInherited: true, inheritedDate: D(p.inh), acquisitionDate: D(p.inh) }),
    ],
    redevelopment,
  });
}

/** 원조합원 — 종전주택 2005 취득 · 인가 2010 · 상속개시 2012 · 양도 2014-01-15(입주권 신축 포함 규정 시행 전) */
function original(transfer: string, acq = "2005-03-01"): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 800_000_000,
    transferDate: D(transfer),
    acquisitionDate: D(acq),
    acquisitionPrice: 300_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    sellingHouseId: "selling",
    houses: [
      makeHouseInfo("selling", { acquisitionDate: D(acq) }),
      makeHouseInfo("inh", { isInherited: true, inheritedDate: D("2012-06-01"), acquisitionDate: D("2012-06-01") }),
    ],
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2010-06-01"),
      rightsValue: 500_000_000,
      settlementDirection: "pay",
      settlementAmount: 0,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
    },
  });
}

const excluded = (i: TransferTaxInput) => resolveInheritedHouseExclusionFromInput(i).excludedCount;

describe("E-8 승계조합원 — 일반주택 취득일 = 준공일 · 상속개시 당시 보유 = 입주권 승계일", () => {
  // 상속 2011-06-01 → 인가 2011-12-01 → 입주권 승계 2012-06-01(상속 후 · 2013-02-15 전) → 준공 2015-06-01
  const late = successor({ inh: "2011-06-01", approval: "2011-12-01", rightAcq: "2012-06-01", completion: "2015-06-01" });

  it("🔴 상속 후 승계한 입주권의 신축주택(준공 2015)은 일반주택이 아니다 — 상속주택 제외 0 → 과세", () => {
    expect(excluded(late)).toBe(0);
    const r = calculateTransferTax(late, rates);
    expect(r.isExempt).toBe(false);
    // 종전 비과세 0 (입주권 승계일 2012-06-01을 주택 취득일로 읽어 부칙 제20조 한정을 벗어남)
    expect(r.determinedTax).toBe(123_460_000);
  });

  it("긍정 짝 — 상속개시 전 승계한 입주권(상속개시 당시 보유)의 신축주택 → 제외 1 → 비과세", () => {
    const early = successor({ inh: "2011-06-01", approval: "2010-12-01", rightAcq: "2011-03-01", completion: "2015-06-01" });
    expect(excluded(early)).toBe(1);
    expect(calculateTransferTax(early, rates).isExempt).toBe(true);
  });

  it("확인 필요 고정 — 승계일 = 상속개시일은 보유로 본다(기존 leaf와 같은 `<=`)", () => {
    expect(excluded(successor({ inh: "2011-06-01", approval: "2010-12-01", rightAcq: "2011-06-01", completion: "2015-06-01" }))).toBe(1);
  });

  it("부칙 제20조 ±1일 — 상속 후 승계: 준공 2013-02-14 → 한정 없음 1 / 2013-02-15 → 0", () => {
    const at = (completion: string) =>
      excluded(successor({ inh: "2011-06-01", approval: "2011-12-01", rightAcq: "2012-06-01", completion }));
    expect(at("2013-02-14")).toBe(1);
    expect(at("2013-02-15")).toBe(0);
  });

  it("제25193호 부칙 제2조② — 상속개시 당시 보유한 입주권 신축주택: 양도 2014-02-20 제외 0 / 2014-02-21 제외 1", () => {
    const at = (transfer: string) =>
      excluded(successor({ inh: "2011-06-01", approval: "2010-12-01", rightAcq: "2011-03-01", completion: "2013-06-01", transfer }));
    expect(at("2014-02-20")).toBe(0);
    expect(at("2014-02-21")).toBe(1);
  });

  it("선언은 보지 않는다 — 날짜가 사실을 정한다(「해당 없음」 선언이어도 상속개시 전 승계면 제외 1)", () => {
    const early = successor({ inh: "2011-06-01", approval: "2010-12-01", rightAcq: "2011-03-01", completion: "2015-06-01" });
    expect(excluded({ ...early, generalHouseRightAtInheritance: "none" })).toBe(1);
    expect(excluded({ ...late, generalHouseRightAtInheritance: "redevelopment_right" })).toBe(0);
  });

  it("준공일 미상(API 직접 호출) — 종전 동작(입주권 승계일) 유지", () => {
    const i = { ...late, redevelopment: { ...late.redevelopment!, completionDate: undefined } };
    expect(excluded(i)).toBe(1);
  });
});

describe("E-8 원조합원 — 종전주택 취득일이 일반주택 취득일(서면-2021-부동산-5845) · 종전 동작 고정", () => {
  it("2013-02-15 전 종전주택 취득 → 부칙 제20조로 한정 없음 → 2014-02-21 전 양도도 제외 1 → 비과세", () => {
    expect(excluded(original("2014-01-15"))).toBe(1);
    expect(calculateTransferTax(original("2014-01-15"), rates).isExempt).toBe(true);
  });
});
