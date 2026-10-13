/**
 * S07-8 anchor — §155②로 판정 주택 수가 1채가 된 세대에는 합가 특례(§155⑤) 미충족 항목을 만들지 않는다.
 * 1채면 「혼인함으로써 1세대가 2주택」 의제가 필요 없고 §154①이 바로 적용된다 — 요건 검토표(`requirement-review.ts`)가 1채를
 * `154-1-one-house`로 보내는 것과 같은 규칙. 결론(과세)은 그대로다.
 * 긍정 짝: 진짜 2주택이면 합가 항목이 §154① 사유로 남는다.
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

type Over = { residence?: string; marriage?: string | null; inh?: Record<string, unknown> | null; extra?: Record<string, unknown>[] };
function mc(label: string, o: Over = {}): RulingCase {
  const houses: Record<string, unknown>[] = [];
  if (o.inh !== null)
    houses.push({
      id: "inh",
      region: "capital",
      acquisitionDate: "2019-01-01",
      isInherited: true,
      inheritedDate: "2019-01-01",
      isCoInherited: false,
      decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true,
      mergeOrigin: "seller_side",
      ...(o.inh ?? {}),
    });
  houses.push(...(o.extra ?? []));
  return {
    id: label,
    docNo: "-",
    docDate: "-",
    basis: "current",
    today: "2026-06-15",
    summary: label,
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2026-06-15",
      contractTotalPrice: "900000000",
      ...(o.marriage === null ? {} : { marriageDate: o.marriage ?? "2019-05-01", isFirstTransferredInMerge: true }),
      asset: {
        assetKind: "housing",
        acquisitionDate: "2018-03-02",
        regionCode: "1168010100",
        residencePeriodMonthsAsset: o.residence ?? "0",
      },
      houses,
    } as RulingCase["form"],
  };
}


describe("S07-8 — 상속주택 제외로 1주택이 된 세대에는 합가 「1채」 사유를 내지 않는다", () => {
  it("상속 제외 1채 + 혼인 → 합가 항목 없음 · 결론은 과세 그대로", async () => {
    const o = await observeCase(mc("MC1"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.excludedHouses.map((x) => x.houseId)).toEqual(["inh"]);
    expect(o.unmetExceptions).not.toContain("155-5-marriage-merge");
  });
  it("긍정 짝 — 진짜 2주택이면 합가 항목이 §154① 사유로 남는다", async () => {
    const o = await observeCase(
      mc("C3", { inh: null, extra: [{ id: "sp", region: "capital", acquisitionDate: "2015-01-01", mergeOrigin: "counterpart_side" }] }),
    );
    expect(o.unmetReasons["155-5-marriage-merge"]?.[0]).toMatch(/§154① 보유 2년/);
  });
  it("긍정 짝 — 4주택은 상한 사유가 그대로 난다", async () => {
    const o = await observeCase(
      mc("C4", {
        inh: null,
        extra: [
          { id: "a", region: "capital", acquisitionDate: "2015-01-01", mergeOrigin: "counterpart_side" },
          { id: "b", region: "capital", acquisitionDate: "2015-02-01", mergeOrigin: "counterpart_side" },
          { id: "c", region: "capital", acquisitionDate: "2015-03-01", mergeOrigin: "seller_side" },
        ],
      }),
    );
    expect(o.unmetReasons["155-5-marriage-merge"]?.[0]).toMatch(/4채/);
  });
});
