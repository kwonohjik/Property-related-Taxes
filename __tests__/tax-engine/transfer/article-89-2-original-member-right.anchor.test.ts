/**
 * anchor — 원조합원 조합원입주권은 §156의2③·④가 아니라 §155①로 판정한다 (2026-10-08 사용자 결정)
 *
 * · 「소득세법 시행령」 §156의2③·④ 본문 「국내에 1주택을 소유한 1세대가 그 주택을 양도하기 전에 조합원입주권을
 *   **취득함으로써** 일시적으로 1주택과 1조합원입주권을 소유하게 된 경우」 — 승계취득 전용(현행 본문 실독).
 * · 사전-2018-법령해석재산-0620(2019.9.19.) — A주택 보유 중 B주택 취득 → B가 관리처분계획 인가로 입주권 전환 →
 *   「B주택을 취득한 날부터 3년 이내에 A주택을 양도하는 경우에는 「소득세법 시행령」 제155조제1항에 따른 1세대1주택
 *   특례가 적용」(taxlaw.nts.go.kr 원문).
 *
 * 원조합원 행의 `acquisitionDate` = 기존주택(B) 취득일.
 */
import { describe, it, expect } from "vitest";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { clause2SurchargeDeemed } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import { ORIGINAL_MEMBER_BASE_DEADLINE_YEARS } from "@/lib/tax-engine/one-house/original-member-right";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { memberOriginErrors } from "@/lib/calc/right-member-origin-scope";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

function right(over: Partial<PresaleRight> = {}): PresaleRight {
  return { id: "r1", type: "redevelopment_right", acquisitionDate: D("2021-06-01"), region: "capital", ...over };
}

/** A 취득 2018-01-01 · B(입주권 행) 2021-06-01 · 양도 2024-03-01 — 2023-01-12 이후 양도라 조정대상지역과 무관하게 3년. */
function input(r: Partial<PresaleRight>, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    acquisitionDate: D("2018-01-01"),
    transferDate: D("2024-03-01"),
    presaleRights: [right(r)],
    ...over,
  });
}
const verdict = (i: TransferTaxInput) => resolveArticle89Clause2(i, undefined);

const NEW_HOUSE = {
  rightThreeYearException: {
    kind: "new_house" as const,
    completionDate: D("2024-01-15"),
    movedInWithin3Years: true,
    residedOneYearOrMore: true,
  },
};

describe("기존주택 원조합원 — §155① 일시적 2주택(0620)", () => {
  it("기존주택 취득일부터 3년 이내 양도 → §155① 예외 · 기한 = 기존주택 취득일부터 3년", () => {
    const v = verdict(input({ memberOrigin: "original_house" }));
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe(TRANSFER.ORIGINAL_MEMBER_RIGHT_TEMP_TWO_HOUSE);
    expect(v.exception).toBe("소득세법 시행령 §155 ①");
    // 말일 2024-06-01(토) → 민법 §161 익일 만료(월 06-03) — 일시적 2주택과 같은 leaf
    expect(iso(v.deadline)).toBe("2024-06-03");
    expect(v.byTimingClause).toBeUndefined();
  });

  it("중과 배제 의제(§167의11①13호)는 받지 않는다 — 13호는 제155조를 인용하지 않는다 · 승계취득 ③은 받는다(짝)", () => {
    expect(clause2SurchargeDeemed(verdict(input({ memberOrigin: "original_house" })))).toBeUndefined();
    expect(clause2SurchargeDeemed(verdict(input({ memberOrigin: "successor" })))?.basis).toBe(
      "house_with_redevelopment_right",
    );
  });

  it("3년을 넘기면 §156의2④(신축주택 이사·거주) 선언이 있어도 적용하지 않는다 — 승계취득이면 ④ 성립(짝)", () => {
    const late = { transferDate: D("2024-08-01"), ...NEW_HOUSE };
    expect(verdict(input({ memberOrigin: "original_house" }, late)).status).toBe("excluded");
    const succ = verdict(input({ memberOrigin: "successor" }, late));
    expect(succ.status).toBe("exception_met");
    expect(succ.exception).toBe(TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4);
  });

  it("상가·토지 원조합원은 ③·④ 그대로(재산세과-1708 · 서면-2015-법령해석재산-2306) — 3년 경과 + ④ 선언 → ④ 성립", () => {
    const v = verdict(input({ memberOrigin: "original_non_house" }, { transferDate: D("2024-08-01"), ...NEW_HOUSE }));
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe(TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4);
    expect(verdict(input({ memberOrigin: "original_non_house" })).exception).toBe("소득세법 시행령 §156의2 ③");
  });

  it("양도 주택이 기존주택보다 뒤에 취득됐으면(양도 주택 = 신규 주택) 불성립", () => {
    expect(verdict(input({ memberOrigin: "original_house" }, { acquisitionDate: D("2021-07-01") })).status).toBe("excluded");
  });

  describe("처분기한 — 기존주택 취득일 현재 두 주택의 조정대상지역 여부(일시적 2주택과 같은 leaf)", () => {
    // B 취득 2020-03-01(2019-12-17 이후 신규) · 양도 2021-06-01(2020-02-11 ~ 2022-05-09) — 조정→조정이면 1년 + 전입 요건
    const era = { acquisitionDate: D("2018-01-01"), transferDate: D("2021-06-01") };
    const rightAt = { memberOrigin: "original_house" as const, acquisitionDate: D("2020-03-01") };

    it("둘 다 비조정(소재지 코드) → 본문 3년 → 성립", () => {
      const v = verdict(input({ ...rightAt, regionCode: "47130" }, { ...era, regionCode: "47130" }));
      expect(v.status).toBe("exception_met");
      // 말일 2023-03-01(삼일절) → 민법 §161 익일 만료
      expect(iso(v.deadline)).toBe("2023-03-02");
    });

    it("둘 다 조정(강남) → 1년 체제의 전입 요건을 입력받지 않아 특례 불성립 + 확인 필요", () => {
      const v = verdict(input({ ...rightAt, regionCode: "11680" }, { ...era, regionCode: "11680" }));
      expect(v.status).toBe("excluded");
      expect(v.confirmNotes?.join(" ")).toContain("§155①2호 가목");
    });

    it("소재지를 모르면 두 경우를 모두 계산해 결론이 갈리면 특례 불성립 + 확인 필요", () => {
      const v = verdict(input(rightAt, era));
      expect(v.status).toBe("excluded");
      expect(v.confirmNotes?.length).toBe(1);
    });
  });

  it("2주택 축 준용(⑩ 문화유산 주택)은 원조합원 경로를 판정하지 않는다 — 판정 보류(§155① 확인 안내)", () => {
    const v = verdict(input({ memberOrigin: "original_house" }, { householdHousingCount: 2, culturalHeritageHouse: true }));
    expect(v.status).toBe("undetermined");
    expect(v.openArticles?.join(" ")).toContain("§155 ①");
    expect(v.openArticles?.join(" ")).toContain("§156의2 ⑩");
  });

  it("처분기한 3년 상수 = 규칙 행 temporary_two_house.disposalDeadlineYears", () => {
    const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
    expect(ORIGINAL_MEMBER_BASE_DEADLINE_YEARS).toBe(rules.temporary_two_house?.disposalDeadlineYears);
  });
});

describe("취득 경위 미입력 — 결론이 같으면 그대로, 갈리면 특례 불성립 + 확인 필요", () => {
  it("두 갈래 모두 성립(3년 이내) → 종전 결론(§156의2③) 유지", () => {
    const v = verdict(input({}));
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의2 ③");
    expect(v.confirmNotes).toBeUndefined();
  });

  it("승계취득이면 ④ 성립 · 원조합원이면 불성립 → 배제 + 취득 경위 확인 필요", () => {
    const v = verdict(input({}, { transferDate: D("2024-08-01"), ...NEW_HOUSE }));
    expect(v.status).toBe("excluded");
    expect(v.confirmNotes?.join(" ")).toContain("취득 경위를 선택하세요");
  });

  it("두 갈래 모두 불성립 → 배제(확인 필요 없음)", () => {
    const v = verdict(input({}, { transferDate: D("2024-08-01") }));
    expect(v.status).toBe("excluded");
    expect(v.confirmNotes).toBeUndefined();
  });

  it("분양권은 취득 경위와 무관 — §156의3② 그대로", () => {
    const v = resolveArticle89Clause2(input({ type: "presale_right", memberOrigin: "original_house" }), D("2021-01-01"));
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의3 ②");
  });
});

describe("⑧·④ — 취득 경위 입력", () => {
  const row = (over: object) => ({ id: "p1", type: "redevelopment_right" as const, acquisitionDate: "2021-06-01", region: "capital" as const, ...over });

  it("조합원입주권 행에서 비우면 오류 · 분양권 행은 묻지 않는다", () => {
    expect(memberOriginErrors([row({})]).map((e) => e.field)).toEqual(["presaleRights.0.memberOrigin"]);
    expect(memberOriginErrors([row({ memberOrigin: "original_house" })])).toEqual([]);
    expect(memberOriginErrors([row({ type: "presale_right" })])).toEqual([]);
  });

  it("payload는 조합원입주권 행에만 싣는다(분양권 행에 남은 값은 버린다)", () => {
    const p = buildPresaleRightsPayload("housing", [
      row({ memberOrigin: "original_house" }),
      row({ id: "p2", type: "presale_right", memberOrigin: "successor" }),
    ]);
    expect(p?.map((x) => x.memberOrigin)).toEqual(["original_house", undefined]);
  });
});
