/**
 * S02-2 · G6-5 anchor — 「소득세법 시행령」 제154조제1항제2호 가목 괄호·나·다목 기한 (대통령령 제19327호, 2006.2.9. 개정)
 *
 * (S02-2) 가목 괄호 「사업인정 고시일 전에 취득한 주택 및 그 부수토지에 한한다」는 혜택 요건 사실이다. 고시일을 모르면(공란)
 *   단서를 적용하지 않고 — 결론을 가를 때만 「확인 필요」를 알린다(모름 = 불성립). 고시 전 취득을 입력하면 적용한다(긍정 짝).
 * (G6-5) 나·다목 「출국일부터 2년 이내에 양도」도 같은 개정이 신설했다. 2006.1.1. 시행본(MST 72432)은 「국외이주 기타 재정경제부령이
 *   정하는 경우」 + 규칙 §71②(MST 72767) — 양도 기한이 없다.
 * 두 문언의 적용 범위는 같은 영 부칙이 정한다(DRF 부칙 원문 2026-10-11, MST 72871):
 *   제3조 「양도소득세에 관한 개정규정은 이 영 시행 후 최초로 양도하는 분부터」 /
 *   제30조① 「시행당시 사업인정 고시일 이후에 취득한 … 주택 및 그 부수토지를 2007년 12월 31일까지 양도하는 경우 … 종전의 규정」 /
 *   제30조② 「시행당시 … 세대전원이 출국한 경우로서 2007년 12월 31일까지 주택을 양도하는 경우 … 나목 및 다목의 개정규정에 불구하고 종전의 규정」.
 * 경로: 판정 메뉴 ⑧→④→⑫⑭ (계산기와 같은 `resolveExemptionProviso` leaf).
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";
import {
  expropriationNoticeDateRequirementApplies,
  overseasTwoYearDeadlineApplies,
} from "@/lib/tax-engine/data/one-house-154-1-proviso-era";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOTICE_ID = "154-1-expropriation-notice-date-unverified";

function expropriation(o: { acq: string; transfer: string; approval?: string; houses?: boolean }): RulingCase {
  return {
    id: "S02-2",
    docNo: "-",
    docDate: "-",
    basis: "current",
    today: o.transfer,
    summary: "",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: o.transfer,
      contractTotalPrice: "500000000",
      provisoReason: "expropriation",
      provisoExpropriationDate: o.transfer,
      ...(o.approval ? { provisoBusinessApprovalDate: o.approval } : {}),
      asset: {
        assetKind: "housing",
        acquisitionDate: o.acq,
        regionCode: "4377037000", // 충북 음성 — 조정 이력 없음
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "0",
      },
    } as RulingCase["form"],
  };
}

function overseas(o: { transfer: string; departure: string }): RulingCase {
  return {
    id: "G6-5",
    docNo: "-",
    docDate: "-",
    basis: "current",
    today: o.transfer,
    summary: "",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: o.transfer,
      contractTotalPrice: "300000000",
      provisoReason: "overseas_migration",
      provisoDepartureDate: o.departure,
      provisoDepartureOnlyHouse: "yes",
      asset: {
        assetKind: "housing",
        acquisitionDate: "1999-03-15",
        regionCode: "1168010100",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "12",
      },
    } as RulingCase["form"],
  };
}

describe("S02-2 — 사업인정 고시일 공란 = 불성립 (현행 구간)", () => {
  const base = { acq: "2023-09-01", transfer: "2024-06-01" };

  it("고시일 공란: 단서 미적용 · 비과세 아님 · 확인 필요 고지", async () => {
    const o = await observeCase(expropriation(base));
    expect(o.status).toBe(200);
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain("154-1-proviso:expropriation");
    expect(o.undetermined).toContain(NOTICE_ID);
  });

  it("(긍정 짝) 고시 전 취득(고시일 2024-01-01)을 입력하면 적용 · 고지 없음", async () => {
    const o = await observeCase(expropriation({ ...base, approval: "2024-01-01" }));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("154-1-proviso:expropriation");
    expect(o.undetermined).not.toContain(NOTICE_ID);
  });

  it("고시 후 취득(고시일 2023-01-01)이면 적용하지 않고 — 고시일을 알았으므로 고지도 없다", async () => {
    const o = await observeCase(expropriation({ ...base, approval: "2023-01-01" }));
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain("154-1-proviso:expropriation");
    expect(o.undetermined).not.toContain(NOTICE_ID);
  });

  it("결론을 가르지 않으면 고지하지 않는다 — 보유 2년을 이미 채워 단서와 무관하게 비과세", async () => {
    const o = await observeCase(expropriation({ acq: "2020-01-01", transfer: "2024-06-01" }));
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).not.toContain(NOTICE_ID);
  });

  it("결론을 가르지 않으면 고지하지 않는다 — 수용일이 없어 어느 쪽이든 단서 불성립인 과세", async () => {
    const c = expropriation(base);
    (c.form as { provisoExpropriationDate?: string }).provisoExpropriationDate = "";
    const o = await observeCase(c);
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).not.toContain(NOTICE_ID);
  });
});

describe("S02-2 연혁 — 가목 괄호는 2006.2.9. 이후 양도분부터 (부칙 제3조·제30조①)", () => {
  it("2006.2.9. 전 양도: 고시일 공란이어도 단서 적용 (괄호 없음)", async () => {
    const o = await observeCase(expropriation({ acq: "2004-09-01", transfer: "2005-06-15" }));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("154-1-proviso:expropriation");
    expect(o.undetermined).not.toContain(NOTICE_ID);
  });

  it("2006.2.9. 전 양도: 고시 후 취득(고시일 2004-01-01)도 단서 적용 — 종전 규정", async () => {
    const o = await observeCase(expropriation({ acq: "2004-09-01", transfer: "2005-06-15", approval: "2004-01-01" }));
    expect(o.isExempt).toBe(true);
  });

  it("경과조치: 시행 전 취득 + 2007.12.31.까지 양도는 고시 후 취득이어도 종전 규정 → 적용", async () => {
    const o = await observeCase(expropriation({ acq: "2005-09-01", transfer: "2007-06-01", approval: "2005-01-01" }));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("154-1-proviso:expropriation");
  });

  it("(부정 짝) 경과조치 밖 — 같은 취득의 2008.1.15. 양도는 괄호 적용 → 고시 후 취득이라 불성립", async () => {
    const o = await observeCase(expropriation({ acq: "2005-09-01", transfer: "2008-01-15", approval: "2005-01-01" }));
    expect(o.isExempt).toBe(false);
  });

  it("(부정 짝) 시행 후 취득(2006-03-01)은 2007년 양도여도 괄호 적용", async () => {
    const o = await observeCase(expropriation({ acq: "2006-03-01", transfer: "2007-06-01", approval: "2005-01-01" }));
    expect(o.isExempt).toBe(false);
  });

  it("leaf 경계: 양도 2006-02-08 false / 02-09 true(경과조치 없는 시행 후 취득) · 경과조치 말일 2007-12-31 false / 2008-01-01 true", () => {
    const acqBefore = D("2005-09-01");
    expect(expropriationNoticeDateRequirementApplies({ acquisitionDate: D("2005-01-01"), transferDate: D("2006-02-08") })).toBe(false);
    expect(expropriationNoticeDateRequirementApplies({ acquisitionDate: D("2006-02-09"), transferDate: D("2006-02-09") })).toBe(true);
    expect(expropriationNoticeDateRequirementApplies({ acquisitionDate: acqBefore, transferDate: D("2007-12-31") })).toBe(false);
    expect(expropriationNoticeDateRequirementApplies({ acquisitionDate: acqBefore, transferDate: D("2008-01-01") })).toBe(true);
  });
});

describe("G6-5 — 나·다목 「출국일부터 2년 이내」는 2006.2.9. 이후 양도분부터 (부칙 제3조·제30조②)", () => {
  it.each(["2005-06-15", "2006-01-15"])("신설 전 양도(%s): 출국 3년 뒤 양도여도 해외이주 단서 적용", async (transfer) => {
    const o = await observeCase(overseas({ transfer, departure: "2002-03-15" }));
    expect(o.status).toBe(200);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("154-1-proviso:overseas_migration");
  });

  it("경과조치: 시행 전(2002-03-15) 출국 + 2007-12-31까지 양도(2007-11-15)는 종전 규정", async () => {
    const o = await observeCase(overseas({ transfer: "2007-11-15", departure: "2002-03-15" }));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("154-1-proviso:overseas_migration");
  });

  it("(긍정 짝) 시행 후 출국은 2년 기한 — 출국 2006-03-01: 2007-11-15 양도 적용(2년 이내)", async () => {
    const o = await observeCase(overseas({ transfer: "2007-11-15", departure: "2006-03-01" }));
    expect(o.isExempt).toBe(true);
  });

  it("(부정 짝) 시행 후 출국은 2년 기한 — 출국 2006-03-01: 2008-06-15 양도는 2년 초과 → 과세", async () => {
    const o = await observeCase(overseas({ transfer: "2008-06-15", departure: "2006-03-01" }));
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain("154-1-proviso:overseas_migration");
  });

  it("(부정 짝) 경과조치 밖 — 시행 전 출국이어도 2008-06-15 양도는 2년 기한 적용 → 과세", async () => {
    const o = await observeCase(overseas({ transfer: "2008-06-15", departure: "2002-03-15" }));
    expect(o.isExempt).toBe(false);
  });

  it("leaf 경계: 양도 2006-02-08 false / 02-09 true(시행 후 출국) · 말일 2007-12-31 false / 2008-01-01 true(시행 전 출국)", () => {
    expect(overseasTwoYearDeadlineApplies({ departureDate: D("2006-03-01"), transferDate: D("2006-02-08") })).toBe(false);
    expect(overseasTwoYearDeadlineApplies({ departureDate: D("2006-02-09"), transferDate: D("2006-02-09") })).toBe(true);
    expect(overseasTwoYearDeadlineApplies({ departureDate: D("2006-02-08"), transferDate: D("2007-12-31") })).toBe(false);
    expect(overseasTwoYearDeadlineApplies({ departureDate: D("2006-02-08"), transferDate: D("2008-01-01") })).toBe(true);
  });
});
