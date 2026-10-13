/**
 * #32-4 anchor — 기존주택 원조합원 입주권이 2주택 축 준용(§156의2⑦·⑩·⑪)에 걸려 판정 보류(`undetermined`)가 된 사안의
 * 「해당 조문을 직접 확인하세요」 고지는 **비과세가 실제로 선 사안에서만** 낸다(결론을 가를 때만).
 *
 * 판정 보류는 §89② 배제를 적용하지 않고 본체 판정을 그대로 두는 상태다. 본체가 과세면(보유 2년 미달 · 3주택 등) 그 조문을 확인해 예외가
 * 성립해도 결론이 같다. 성립 여부로 결론이 갈리는 것은 본체가 비과세로 선 사안(배제를 적용하면 과세)뿐이다.
 *
 * 시료 — A 2018-01-01 취득 · 원조합원 입주권(기존주택 B) 2021-06-01 · 문화유산 주택 보유(§156의2⑩ 경로) · 양도 2024-03-01.
 * 메뉴(`checkExemption`)와 계산기 경고(`calculateTransferTax`)가 같은 규약이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { article89Clause2Notices } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { isOriginalMemberOpenArticle } from "@/lib/tax-engine/one-house/original-member-right";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const rules = parseRatesFromMap(rates).oneHouseSpecialRules;
const OPEN_ID = /^89-2-open:.*원조합원 입주권/;
const OPEN_WARNING = /아래 조문의 요건 충족 여부를 직접 확인하세요/;

function mk(over: Partial<TransferTaxInput> = {}, memberOrigin: "original_house" | "successor" = "original_house"): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    culturalHeritageHouse: true,
    acquisitionDate: D("2018-01-01"),
    transferDate: D("2024-03-01"),
    transferPrice: 900_000_000,
    acquisitionPrice: 500_000_000,
    presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: D("2021-06-01"), region: "capital", memberOrigin }],
    ...over,
  });
}
const menu = (i: TransferTaxInput) => checkExemption(i as never, rules);
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const openIds = (i: TransferTaxInput) => menu(i).undetermined.filter((u) => OPEN_ID.test(u.id));
const openWarn = (i: TransferTaxInput) => (calc(i).warnings ?? []).filter((w) => OPEN_WARNING.test(w));

describe("#32-4 원조합원 입주권 2주택 축 준용 판정 보류 — 비과세가 선 사안에서만 고지", () => {
  it("긍정 — 본체가 비과세로 서면 판정 메뉴·계산기 모두 고지(예외 성립 여부가 결론을 가른다)", () => {
    const i = mk();
    expect(menu(i).isExempt).toBe(true);
    expect(openIds(i)).toHaveLength(1);
    expect(calc(i).isExempt).toBe(true);
    expect(openWarn(i)).toHaveLength(1);
  });

  it("양도 주택 보유 2년 미달 — 어느 쪽으로 읽어도 과세 → 판정 메뉴·계산기 고지 없음", () => {
    const i = mk({ acquisitionDate: D("2023-06-01") });
    expect(menu(i).isExempt).toBe(false);
    expect(openIds(i)).toHaveLength(0);
    expect(calc(i).isExempt).toBe(false);
    expect(openWarn(i)).toHaveLength(0);
  });

  it("3주택 일반 판정 보류(원조합원 표지 없음)는 이 변경이 건드리지 않는다 — 종전대로 고지", () => {
    const i = mk({ householdHousingCount: 3 });
    expect(menu(i).undetermined.some((u) => u.id.startsWith("89-2-open:"))).toBe(true);
    expect((calc(i).warnings ?? []).some((w) => OPEN_WARNING.test(w))).toBe(true);
  });

  it("술어 — 원조합원 표지가 있는 항목만 고른다", () => {
    expect(isOriginalMemberOpenArticle("소득세법 시행령 §155 ①(원조합원 입주권 — 소득세법 시행령 §156의2 ⑩ 경로)")).toBe(true);
    expect(isOriginalMemberOpenArticle("소득세법 시행령 §156의2 ⑦·⑩·⑪")).toBe(false);
  });

  it("leaf — 과세·중과 무관이면 원조합원 항목만 빠지고, 섞여 있으면 나머지는 남는다", () => {
    const orig = "소득세법 시행령 §155 ①(원조합원 입주권 — 소득세법 시행령 §156의2 ⑩ 경로)";
    const other = "소득세법 시행령 §156의3 ⑤·⑦·⑧";
    const clause2 = { status: "undetermined" as const, openArticles: [orig, other] };
    const gate = { coreWouldPass: false, surchargeDeclarationMatters: false };
    const t = D("2024-03-01");
    const w = article89Clause2Notices(clause2, false, t, gate).join("\n");
    expect(w).toContain(other);
    expect(w).not.toContain(orig);
    expect(article89Clause2Notices({ status: "undetermined", openArticles: [orig] }, false, t, gate)).toEqual([]);
    expect(article89Clause2Notices({ status: "undetermined", openArticles: [orig] }, true, t, gate)).toHaveLength(1);
    // 구 중과 배제 시대 + 중과 대상이면 과세여도 그 조문이 중과 배제를 가른다
    expect(
      article89Clause2Notices({ status: "undetermined", openArticles: [orig] }, false, t, { ...gate, surchargeDeclarationMatters: true }),
    ).toHaveLength(1);
  });
});
