/**
 * anchor (A3 · OH-12 · OH-12b · OH-12c) — §155② 상속주택 특례의 「일반주택」 한정 요건과 연혁(부칙).
 *
 * 법령(KoreanLaw MCP · 법제처 DRF 부칙 실독):
 *   · §155② 괄호 「그 밖의 주택(상속개시 당시 보유한 주택 또는 상속개시 당시 보유한 조합원입주권이나
 *     분양권에 의하여 사업시행 완료 후 취득한 신축주택만 해당하며, 상속개시일부터 소급하여 2년 이내에
 *     피상속인으로부터 증여받은 주택 … 은 제외한다 …)」 (현행 MST 286211)
 *   · 대통령령 제24356호(MST 132503, 2013-02-15 시행) 부칙 제20조 — 「제155조제2항, 제156조의2제6항 및
 *     제7항의 개정규정은 이 영 시행 후 취득하여 양도하는 분부터 적용한다」 ⇒ 일반주택 취득일 ≥ 2013-02-15만
 *     「상속개시 당시 보유」로 한정된다(2013-01-16본은 한정 없음).
 *   · 대통령령 제25193호(2014-02-21) 부칙 제2조② 「양도소득에 관한 개정규정은 이 영 시행 후 최초로 양도하는
 *     분부터」 — 2014-02-21 시행본(MST 151424)부터 「조합원입주권에 의하여 … 신축주택」 포함(2014-02-20본에는 없음).
 *   · 대통령령 제31442호 부칙 제10조 ① 「2021년 1월 1일 이후 취득한 분양권부터」 ② 「2021년 1월 1일 이후
 *     양도하는 분부터」 — 분양권 신축주택 포함.
 *   · 대통령령 제28637호(MST 202148, 2018-02-13 시행) 부칙 제16조 — 「제155조제2항, 제156조의2제6항 및
 *     제7항의 개정규정은 이 영 시행 이후 주택 또는 조합원입주권을 **증여받은 분**부터 적용한다」
 *     (2018-02-09본 §155②에는 증여 제외 괄호가 없다).
 *
 * ⚠️ 확인 필요: 일반주택 취득일 = 상속개시일(같은 날)을 「상속개시 당시 보유」로 볼지 — 해석례 미확보.
 *    여기서는 **보유로 본다**(`<=`)고 고정한다(납세자에게 불리한 쪽으로 단정하지 않는다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { baseTransferInput, makeMockRates, makeHouseInfo } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 별도세대 단독상속 B(상속개시 inh) + 일반주택 A(취득 acq) 양도 2023-06-01 8억 · 비조정 2주택 */
function input(acq: string, inh: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    sellingHouseId: "selling",
    transferPrice: 800_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: D(acq),
    transferDate: D("2023-06-01"),
    houses: [
      makeHouseInfo("selling", { acquisitionDate: D(acq) }),
      makeHouseInfo("inh", { isInherited: true, inheritedDate: D(inh), acquisitionDate: D(inh) }),
    ],
    ...over,
  });
}
const excluded = (i: TransferTaxInput) => resolveInheritedHouseExclusionFromInput(i).excludedCount;

describe("OH-12 — 일반주택은 「상속개시 당시 보유한 주택」 (일반주택 취득일 ≥ 2013-02-15)", () => {
  it("🔴 리뷰 시나리오 — 상속 2015 · 일반주택 2018 취득 → 상속주택 제외 없음 → 2주택 과세", () => {
    const r = calculateTransferTax(input("2018-01-01", "2015-01-01"), rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("긍정 짝 — 상속개시 당시 이미 보유(2014 취득 · 2015 상속) → 제외 1 → 비과세", () => {
    const r = calculateTransferTax(input("2014-01-01", "2015-01-01"), rates);
    expect(r.isExempt).toBe(true);
  });

  it("부칙 제20조 — 2013-02-15 전 취득 일반주택은 상속 후 취득이어도 한정 없음(종전 규정)", () => {
    expect(excluded(input("2012-01-01", "2011-01-01"))).toBe(1);
  });

  it("±1일 — 상속 2013-01-01 뒤 취득: 2013-02-14 취득 → 제외 1 / 2013-02-15 취득 → 제외 0", () => {
    expect(excluded(input("2013-02-14", "2013-01-01"))).toBe(1);
    expect(excluded(input("2013-02-15", "2013-01-01"))).toBe(0);
  });

  it("확인 필요 고정 — 취득일 = 상속개시일은 보유로 본다", () => {
    expect(excluded(input("2016-03-01", "2016-03-01"))).toBe(1);
  });

  it("상속개시일 미상(API 직접 호출) — 판정할 수 없어 종전 동작(제외) 유지", () => {
    const i = input("2018-01-01", "2015-01-01");
    i.houses![1] = { ...i.houses![1], inheritedDate: undefined };
    expect(excluded(i)).toBe(1);
  });

  it("§155③ 공동상속 소수지분에는 이 한정이 없다(괄호가 ②에만) — 상속 후 취득이어도 제외", () => {
    const i = input("2018-01-01", "2015-01-01");
    i.houses![1] = { ...i.houses![1], isCoInherited: true, isLargestCoInheritedShareholder: false };
    expect(excluded(i)).toBe(1);
  });
});

describe("OH-12 — 상속개시 당시 보유한 권리로 사업시행 완료 후 취득한 신축주택", () => {
  const nb = (transfer: string, kind: "redevelopment_right" | "presale_right" | "none") =>
    excluded(
      input("2016-06-01", "2015-01-01", {
        transferDate: D(transfer),
        generalHouseRightAtInheritance: kind,
      } as Partial<TransferTaxInput>),
    );

  it("조합원입주권 신축 — 양도 2014-02-20 제외 0 / 2014-02-21 제외 1 (제25193호 부칙 제2조②)", () => {
    const i = (transfer: string) =>
      excluded(
        input("2013-06-01", "2013-03-01", {
          transferDate: D(transfer),
          generalHouseRightAtInheritance: "redevelopment_right",
        } as Partial<TransferTaxInput>),
      );
    expect(i("2014-02-20")).toBe(0);
    expect(i("2014-02-21")).toBe(1);
  });

  it("분양권 신축 — 양도 2020-12-31 제외 0 / 2021-01-01 제외 1 (제31442호 부칙 제10조)", () => {
    expect(nb("2020-12-31", "presale_right")).toBe(0);
    expect(nb("2021-01-01", "presale_right")).toBe(1);
  });

  it("「해당 없음」 선언 → 상속 후 새로 취득한 주택 → 제외 0", () => {
    expect(nb("2023-06-01", "none")).toBe(0);
  });
});

describe("OH-12c — 소급 2년 내 피상속인 증여주택 제외는 증여일 ≥ 2018-02-13 (제28637호 부칙 제16조)", () => {
  const gifted = (giftDate?: string) =>
    excluded(
      input("2016-06-01", "2017-06-01", {
        generalHouseGiftedFromDecedentWithin2yr: true,
        ...(giftDate ? { generalHouseGiftDate: D(giftDate) } : {}),
      } as Partial<TransferTaxInput>),
    );

  it("±1일 — 증여 2018-02-12 → 증여 제외 괄호 적용 전 → 제외 1 / 2018-02-13 → 특례 배제 → 제외 0", () => {
    expect(gifted("2018-02-12")).toBe(1);
    expect(gifted("2018-02-13")).toBe(0);
  });

  it("증여일 미입력(구 저장분) — 종전 동작(특례 배제) 유지: 조용한 비과세 금지", () => {
    expect(gifted()).toBe(0);
  });

  it("대조군 — 증여 아님 → 제외 1", () => {
    expect(excluded(input("2016-06-01", "2017-06-01"))).toBe(1);
  });
});

describe("OH-12b — §156의2⑦ 후단·⑥ 일반주택 요건도 같은 부칙 제20조", () => {
  const right: PresaleRight = {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: D("2013-09-01"),
    region: "capital",
  };
  /** ⑦1호 — 상속주택 + 일반주택 + 상속 외 입주권. §155② 제외를 마친 count 1로 술어를 부른다. */
  const seventh = (acq: string, inh: string) =>
    resolveArticle89Clause2(
      input(acq, inh, {
        householdHousingCount: 1,
        presaleRights: [{ ...right, acquisitionDate: D("2013-09-01") }],
        transferDate: D("2014-06-01"),
      }),
      undefined,
    );

  it("🔴 일반주택 2012-06-01 취득(상속 후 · 2013-02-15 전) · 선언 없음 → 한정 미적용 → 판정 불가로 막지 않는다", () => {
    const v = seventh("2012-06-01", "2012-03-01");
    expect(v.openArticles ?? []).not.toContain("소득세법 시행령 §156의2 ⑦");
  });

  it("🔴 상속개시 전 취득이 날짜로 확인되면 선언 없이도 ⑦ 후단 충족", () => {
    const v = seventh("2013-03-01", "2013-05-01");
    expect(v.openArticles ?? []).not.toContain("소득세법 시행령 §156의2 ⑦");
  });

  it("대조군 — 2013-02-15 이후 · 상속 후 취득 · 선언 없음 → 여전히 판정 불가", () => {
    const v = seventh("2013-06-01", "2013-05-01");
    expect(v.status).toBe("undetermined");
    expect(v.openArticles ?? []).toContain("소득세법 시행령 §156의2 ⑦");
  });

  const sixth = (acq: string, over: Partial<TransferTaxInput> = {}) =>
    resolveArticle89Clause2(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 1,
        acquisitionDate: D(acq),
        transferDate: D("2023-06-01"),
        presaleRights: [{ ...right, acquisitionDate: D("2020-01-01"), isInherited: true }],
        ...over,
      }),
      undefined,
    );

  it("🔴 ⑥ 상속받은 입주권 + 일반주택 2012 취득 · 선언 없음 → 부칙 제20조로 한정 미적용 → exception_met", () => {
    expect(sixth("2012-06-01").status).toBe("exception_met");
  });

  it("대조군 — ⑥ 일반주택 2016 취득 · 선언 없음 → 판정 불가(종전)", () => {
    expect(sixth("2016-06-01").status).toBe("undetermined");
  });

  it("🔴 OH-12c ⑥ — 증여일 2018-02-12이면 증여 제외 괄호 미적용 / 2018-02-13이면 부적격", () => {
    const g = (d: string) =>
      sixth("2016-06-01", {
        generalHouseHeldAtInheritance: true,
        generalHouseGiftedFromDecedentWithin2yr: true,
        generalHouseGiftDate: D(d),
      } as Partial<TransferTaxInput>);
    expect(g("2018-02-12").status).toBe("exception_met");
    expect(g("2018-02-13").status).not.toBe("exception_met");
  });
});
