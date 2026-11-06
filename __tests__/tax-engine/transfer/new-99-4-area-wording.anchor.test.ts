/**
 * §99의4 — ③ 연접 배제 비교 단위·소재지·고향 요건 문언의 시기 분기 (NH-18·NH-19·NH-21)
 *
 * ③ 문언(2026-11-05 시행본 실독): 2009.1.1.~ 「읍·면·시」(2009.1.1. 이후 취득분, 법률 제9272호 부칙 제22조) ·
 * 2015.1.1.~ 농어촌 「읍·면」·고향 「시」(양도분, 법률 제12853호 부칙 제2조③) · 2026.1.1.~ 농어촌 「읍·면·동」
 * (2026.1.1. 전 취득분은 종전, 법률 제21223호 부칙 제42조). 판정은 토글 그대로라 세액은 바뀌지 않는다 — 묻는 문언과 사유만.
 */
import { describe, it, expect } from "vitest";
import {
  resolveNew994AdjacentScope,
  new994RegulatedAreaLabel,
  new994OpportunityZoneApplies,
} from "@/lib/tax-engine/transfer-reductions/new-99-4-area";
import { evaluateNew994 } from "@/lib/tax-engine/transfer-reductions/new-99-4";
import type { New994EvaluationInput } from "@/lib/tax-engine/transfer-reductions/types";

const d = (s: string) => new Date(s);

describe("③ 비교 단위 — resolveNew994AdjacentScope", () => {
  const rural = (acq?: string, tr?: string) =>
    resolveNew994AdjacentScope({
      isHometown: false,
      ruralHouseAcquisitionDate: acq ? d(acq) : undefined,
      transferDate: tr ? d(tr) : undefined,
    });
  const hometown = (tr?: string) => resolveNew994AdjacentScope({ isHometown: true, transferDate: tr ? d(tr) : undefined });

  it.each([
    ["2026-01-01", "2026-10-01", "읍·면·동"],
    ["2025-12-31", "2026-10-01", "읍·면"],
    ["2015-03-01", "2024-06-01", "읍·면"],
    ["2010-03-01", "2014-12-31", "읍·면·시"],
    ["2010-03-01", "2015-01-01", "읍·면"],
    ["2005-03-01", "2009-06-01", "읍·면"],
    ["2005-03-01", "2013-06-01", "읍·면"],
    ["2005-03-01", "2019-06-01", "읍·면"],
  ])("농어촌 취득 %s × 양도 %s → %s", (acq, tr, unit) => {
    expect(rural(acq, tr)?.unit).toBe(unit);
  });

  it("2009.1.1. 전 취득 × 2010~2014 양도만 「확인 필요」를 단다", () => {
    expect(rural("2005-03-01", "2013-06-01")?.unsettled).toContain("확인 필요");
    expect(rural("2005-03-01", "2009-06-01")?.unsettled).toBeUndefined();
    expect(rural("2005-03-01", "2019-06-01")?.unsettled).toBeUndefined();
  });

  it("근거 — 2026 전 취득은 제21223호 부칙 제42조, 2015 전 양도는 제12853호 부칙 제2조③, 현행은 빈 근거", () => {
    expect(rural("2015-03-01", "2024-06-01")?.basis).toContain("조특법 법률 제21223호 부칙 제42조");
    expect(rural("2010-03-01", "2014-06-01")?.basis).toContain("조특법 법률 제12853호 부칙 제2조③");
    expect(rural("2005-03-01", "2013-06-01")?.basis).toContain("조특법 법률 제9272호 부칙 제22조");
    expect(rural("2026-03-01", "2026-10-01")?.basis).toBe("");
  });

  it("고향주택 — 2015.1.1. 전 양도 「읍·면·시」, 그 뒤 「시」", () => {
    expect(hometown("2014-06-01")?.unit).toBe("읍·면·시");
    expect(hometown("2024-06-01")?.unit).toBe("시");
  });

  it("날짜가 모자라면 단위를 정하지 않는다", () => {
    expect(rural(undefined, "2024-06-01")).toBeUndefined();
    expect(rural("2015-03-01", undefined)).toBeUndefined();
    expect(rural("2026-03-01", undefined)?.unit).toBe("읍·면·동");
    expect(rural("2005-03-01", undefined)?.unit).toBe("읍·면");
    expect(hometown(undefined)).toBeUndefined();
  });
});

describe("①1호가목·2호나목 시기 문언", () => {
  it("2021.1.1. 전 취득 → 지정지역, 이후 → 조정대상지역 (법률 제17759호 부칙 제21조①)", () => {
    expect(new994RegulatedAreaLabel(d("2020-12-31"))).toBe("지정지역");
    expect(new994RegulatedAreaLabel(d("2021-01-01"))).toBe("조정대상지역");
    expect(new994RegulatedAreaLabel(undefined)).toContain("2021.1.1. 전 취득분은 지정지역");
  });
  it("기회발전특구 — 2024.1.1. 이후 양도분부터 (법률 제19936호 부칙 제16조)", () => {
    expect(new994OpportunityZoneApplies(d("2023-12-31"))).toBe(false);
    expect(new994OpportunityZoneApplies(d("2024-01-01"))).toBe(true);
    expect(new994OpportunityZoneApplies(undefined)).toBeUndefined();
  });
});

describe("엔진 불적용 사유 문언", () => {
  const base = (o?: Partial<New994EvaluationInput>): New994EvaluationInput => ({
    id: "new_99_4_rural",
    generalHouseAcquisitionDate: d("2010-01-01"),
    transferDate: d("2024-06-01"),
    ruralHouseAcquisitionDate: d("2015-03-01"),
    ruralHouseStdPrice: 200_000_000,
    isRegisteredHanok: false,
    adjacentArea994: "no" as const,
    meetsLocationRequirement: true,
    ...o,
  });
  const msg = (r: ReturnType<typeof evaluateNew994>, code: string) =>
    r.isEligible ? undefined : r.ineligibleReasons.find((x) => x.code === code)?.message;

  it("ADJACENT_AREA — 2026 전 취득 농어촌은 「읍·면」으로 적고 「읍·면·동」이라 하지 않는다", () => {
    const m = msg(evaluateNew994(base({ adjacentArea994: "yes" as const })), "ADJACENT_AREA");
    expect(m).toContain("같은 읍·면 또는 연접한 읍·면");
    expect(m).not.toContain("읍·면·동");
  });
  it("ADJACENT_AREA — 2026 이후 취득 농어촌은 「읍·면·동」", () => {
    const r = evaluateNew994(
      base({ adjacentArea994: "yes" as const, ruralHouseAcquisitionDate: d("2026-02-01"), transferDate: d("2026-10-01") }),
    );
    expect(msg(r, "ADJACENT_AREA")).toContain("같은 읍·면·동 또는 연접한 읍·면·동");
  });
  it("ADJACENT_AREA — 2015.1.1. 전 양도 고향주택은 「읍·면·시」", () => {
    const r = evaluateNew994(
      base({
        id: "new_99_4_hometown",
        adjacentArea994: "yes" as const,
        meetsHometownRequirement: true,
        ruralHouseAcquisitionDate: d("2010-03-01"),
        transferDate: d("2014-06-01"),
      }),
    );
    expect(msg(r, "ADJACENT_AREA")).toContain("같은 읍·면·시 또는 연접한 읍·면·시");
  });
  it("HOMETOWN_UNCONFIRMED — 두 요건 「모두」와 연접한 시 지역을 적고 「또는 10년」이라 하지 않는다", () => {
    const r = evaluateNew994(base({ id: "new_99_4_hometown", meetsHometownRequirement: false }));
    const m = msg(r, "HOMETOWN_UNCONFIRMED");
    expect(m).toContain("모두");
    expect(m).toContain("10년 이상 등재된 등록기준지");
    expect(m).toContain("연접한 시 지역");
    expect(m).not.toContain("또는 10년");
  });
  it("LOCATION_UNCONFIRMED — 「취득 당시」·취득일별 지정지역/조정대상지역·양도일별 기회발전특구", () => {
    const old = msg(
      evaluateNew994(base({ meetsLocationRequirement: false, transferDate: d("2023-06-01") })),
      "LOCATION_UNCONFIRMED",
    );
    expect(old).toContain("취득 당시");
    expect(old).toContain("지정지역");
    expect(old).not.toContain("조정대상지역");
    expect(old).not.toContain("기회발전특구");
    const now = msg(
      evaluateNew994(
        base({ meetsLocationRequirement: false, ruralHouseAcquisitionDate: d("2022-03-01"), transferDate: d("2025-06-01") }),
      ),
      "LOCATION_UNCONFIRMED",
    );
    expect(now).toContain("조정대상지역");
    expect(now).toContain("기회발전특구");
  });
});
