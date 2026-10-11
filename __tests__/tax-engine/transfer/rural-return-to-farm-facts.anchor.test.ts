/**
 * §155⑦3호 귀농주택 — ⑩4호(영농·영어 목적) · ⑪(귀농 후 최초 1개) · 귀농 전 취득 일반주택 (결정 #44 · G5-2).
 *
 * 종전에는 명부에서 「3호 귀농」을 고르기만 하면 ⑩4호를 묻지 않고 비과세했다(대지면적 빈칸도 0㎡로 통과).
 * 키가 없거나 「모름」이면 불성립이다(원칙 1). 「모름」이 결론을 가를 때만 확인 필요를 알린다.
 *
 * | # | 사실 | 기대 |
 * |---|---|---|
 * | F-1~F-3 | ⑩4호 목 | 가·나·다 + 본인 → 충족 / 해당 없음 → 확정 불충족 / 모름·미응답 → 확인 필요 |
 * | F-4~F-7 | 연혁 게이트 | 배우자 가·나목 2019-02-12 · 다목 2026-02-27 · 나목 취득 2016-03-31 (±1일) |
 * | F-8~F-9 | ⑪ · 귀농 전 취득 | 없음/예 → 충족 · 있음/아니오 → 불성립 · 모름·미응답 → 확인 필요 |
 * | R-1~R-6 | 판정 메뉴(route) | 비과세 ↔ 과세 짝 · 확인 필요 고지는 결론을 가를 때만 · ⑫ 고지 · 990㎡ 고지 |
 * | C-1~C-2 | 계산기(route) | 같은 사실 → 같은 결론 · ⑫ 고지가 판정 메뉴와 같은 문장 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkReturnToFarmFacts, returnToFarmPostManagementNotice, farmland990EraNotice } from "@/lib/tax-engine/one-house/rural-return-to-farm-facts";
import { qualifiesRuralHouse } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { ruralReturnToFarmFactsIssue } from "@/lib/calc/one-house-row-facts";
import { observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

type Rural = NonNullable<TransferTaxInput["ruralHouse"]>;
const D = (s: string) => new Date(s);
const OK = {
  farmlandBasis: "ga",
  farmlandHolder: "self",
  priorReturnFarmExemption: "none",
  generalHouseAcquiredBeforeReturn: "yes",
} as const;
const base = (over: Partial<Rural> = {}): Rural => ({
  kind: "return_to_farm",
  isOutsideCapitalEupMyeon: true,
  acquisitionDate: D("2023-05-15"),
  isHighPriceAtAcquisition: false,
  landAreaSqm: 500,
  wholeHouseholdMoved: true,
  ...OK,
  ...over,
});
const facts = (r: Partial<Rural>, transfer = "2026-11-16") => checkReturnToFarmFacts(base(r), D(transfer));
const judge = (r: Rural, transfer = "2026-11-16") =>
  qualifiesRuralHouse({ householdHousingCount: 2, transferDate: D(transfer), ruralHouse: r });

describe("정본 술어 — checkReturnToFarmFacts", () => {
  it("F-1 가·나·다목 + 본인 + ⑪ 없음 + 귀농 전 취득 → 충족", () => {
    for (const b of ["ga", "na", "da"] as const) expect(facts({ farmlandBasis: b }).qualified).toBe(true);
  });

  it("F-2 해당 없음 → 확정 불충족(확인 필요 아님)", () => {
    const f = facts({ farmlandBasis: "none" });
    expect(f.qualified).toBe(false);
    expect(f.failed).toHaveLength(1);
    expect(f.unconfirmed).toEqual([]);
  });

  it("F-3 모름·미응답 → 불성립 + 확인 필요 (해당 없음과 다르다)", () => {
    for (const b of ["unknown", undefined] as const) {
      const f = facts({ farmlandBasis: b });
      expect(f.qualified).toBe(false);
      expect(f.failed).toEqual([]);
      expect(f.unconfirmed).toHaveLength(1);
    }
    // 목은 골랐는데 본인/배우자를 답하지 않은 경우도 확인 필요
    expect(facts({ farmlandHolder: undefined }).unconfirmed).toHaveLength(1);
  });

  it("F-4 가·나목 배우자 — 양도일 2019-02-11 불충족 / 2019-02-12 충족 (대통령령 제29523호 부칙)", () => {
    expect(facts({ farmlandBasis: "ga", farmlandHolder: "spouse" }, "2019-02-11").qualified).toBe(false);
    expect(facts({ farmlandBasis: "ga", farmlandHolder: "spouse" }, "2019-02-12").qualified).toBe(true);
    expect(facts({ farmlandBasis: "na", farmlandHolder: "spouse" }, "2019-02-11").qualified).toBe(false);
  });

  it("F-5 다목 배우자 — 양도일 2026-02-26 불충족 / 2026-02-27 충족 (대통령령 제36129호 부칙)", () => {
    expect(facts({ farmlandBasis: "da", farmlandHolder: "spouse" }, "2026-02-26").qualified).toBe(false);
    expect(facts({ farmlandBasis: "da", farmlandHolder: "spouse" }, "2026-02-27").qualified).toBe(true);
    // 본인이 어업인이면 날짜와 무관
    expect(facts({ farmlandBasis: "da", farmlandHolder: "self" }, "2026-02-26").qualified).toBe(true);
  });

  it("F-6 다목 배우자 게이트는 가·나목 배우자 게이트(2019-02-12)와 다르다 — 가목 배우자 2026-02-26 양도는 충족", () => {
    expect(facts({ farmlandBasis: "ga", farmlandHolder: "spouse" }, "2026-02-26").qualified).toBe(true);
  });

  it("F-7 나목 — 귀농주택 취득 2016-03-31 이후면 나목 그대로, 2016-03-30 이전이면 종전 가목으로 읽는다(불성립 아님)", () => {
    // 2016-03-30 취득 + 나목 선택 → 종전 가목으로 충족 (나목을 불성립 처리하면 종전 가목 해당자를 과세하게 된다)
    expect(facts({ farmlandBasis: "na", acquisitionDate: D("2016-03-30") }).qualified).toBe(true);
    expect(facts({ farmlandBasis: "na", acquisitionDate: D("2016-03-31") }).qualified).toBe(true);
    // 종전 가목으로 읽으므로 ⑫ 고지의 「나목 귀농일」 문구도 2016-03-31 이후 취득분에만 붙는다
    expect(returnToFarmPostManagementNotice(base({ farmlandBasis: "na", acquisitionDate: D("2016-03-30") }))).not.toContain("농지를 취득한 날");
    expect(returnToFarmPostManagementNotice(base({ farmlandBasis: "na", acquisitionDate: D("2016-03-31") }))).toContain("농지를 취득한 날");
    expect(returnToFarmPostManagementNotice(base({ farmlandBasis: "ga" }))).not.toContain("농지를 취득한 날");
  });

  it("F-8 ⑪ — 없음 충족 / 있음 확정 불충족 / 모름·미응답 확인 필요", () => {
    expect(facts({ priorReturnFarmExemption: "none" }).qualified).toBe(true);
    const has = facts({ priorReturnFarmExemption: "has" });
    expect(has.failed).toHaveLength(1);
    expect(has.unconfirmed).toEqual([]);
    for (const v of ["unknown", undefined] as const) {
      const f = facts({ priorReturnFarmExemption: v });
      expect(f.qualified).toBe(false);
      expect(f.unconfirmed).toHaveLength(1);
    }
  });

  it("F-9 귀농 전 취득 일반주택 — 예 충족 / 아니오 확정 불충족 / 모름·미응답 확인 필요", () => {
    expect(facts({ generalHouseAcquiredBeforeReturn: "yes" }).qualified).toBe(true);
    expect(facts({ generalHouseAcquiredBeforeReturn: "no" }).failed).toHaveLength(1);
    for (const v of ["unknown", undefined] as const) {
      const f = facts({ generalHouseAcquiredBeforeReturn: v });
      expect(f.qualified).toBe(false);
      expect(f.unconfirmed).toHaveLength(1);
    }
  });

  it("F-10 정본 술어(qualifiesRuralHouse)는 키가 없는 레거시 입력을 불성립으로 본다", () => {
    expect(judge(base())).toBe(true);
    const legacy = base();
    delete legacy.farmlandBasis;
    delete legacy.farmlandHolder;
    delete legacy.priorReturnFarmExemption;
    delete legacy.generalHouseAcquiredBeforeReturn;
    expect(judge(legacy)).toBe(false);
  });

  it("F-11 990㎡ 표기 시기 — 가·나목 + 귀농주택 취득 2007-02-28 전이면 확인 필요, 이후·다목이면 없음", () => {
    expect(farmland990EraNotice({ farmlandBasis: "ga", acquisitionDate: D("2007-02-27") })).toContain("990㎡");
    expect(farmland990EraNotice({ farmlandBasis: "ga", acquisitionDate: D("2007-02-28") })).toBeNull();
    expect(farmland990EraNotice({ farmlandBasis: "da", acquisitionDate: D("2000-01-01") })).toBeNull();
  });
});

describe("⑧ — 답이 없으면 막고, 「모름」은 유효한 답이다", () => {
  const row = {
    oneHouseRuralHouse: true,
    ruralHouseKind: "return_to_farm",
    ruralLandAreaSqm: "500",
    ruralFarmlandBasis: "ga",
    ruralFarmlandHolder: "self",
    ruralPriorReturnFarmExemption: "none",
    ruralGeneralHouseBeforeReturn: "yes",
  } as const;
  it("완전한 답 → 오류 없음", () => expect(ruralReturnToFarmFactsIssue(row)).toBeNull());
  it("대지면적 빈 칸 → 오류(0㎡로 읽지 않는다)", () =>
    expect(ruralReturnToFarmFactsIssue({ ...row, ruralLandAreaSqm: "" })?.field).toBe("ruralLandAreaSqm"));
  it("⑩4호 미응답 → 오류 / 모름 → 오류 없음", () => {
    expect(ruralReturnToFarmFactsIssue({ ...row, ruralFarmlandBasis: undefined })?.field).toBe("ruralFarmlandBasis");
    expect(ruralReturnToFarmFactsIssue({ ...row, ruralFarmlandBasis: "unknown", ruralFarmlandHolder: undefined })).toBeNull();
  });
  it("가·나·다목을 골랐는데 본인/배우자 미응답 → 오류", () =>
    expect(ruralReturnToFarmFactsIssue({ ...row, ruralFarmlandHolder: undefined })?.field).toBe("ruralFarmlandHolder"));
  it("⑪·귀농 전 취득 미응답 → 오류", () => {
    expect(ruralReturnToFarmFactsIssue({ ...row, ruralPriorReturnFarmExemption: undefined })?.field).toBe("ruralPriorReturnFarmExemption");
    expect(ruralReturnToFarmFactsIssue({ ...row, ruralGeneralHouseBeforeReturn: undefined })?.field).toBe("ruralGeneralHouseBeforeReturn");
  });
  it("귀농 유형이 아니면 묻지 않는다", () =>
    expect(ruralReturnToFarmFactsIssue({ ...row, ruralHouseKind: "inherited", ruralFarmlandBasis: undefined })).toBeNull());
});

// ─── 판정 메뉴 route ────────────────────────────────────────────────────────────
const ROW_FACTS = {
  ruralFarmlandBasis: "ga",
  ruralFarmlandHolder: "self",
  ruralPriorReturnFarmExemption: "none",
  ruralGeneralHouseBeforeReturn: "yes",
};
const judgmentCase = (house: Record<string, unknown>, over: Record<string, unknown> = {}): RulingCase => ({
  id: "d44",
  docNo: "-",
  docDate: "-",
  basis: "era",
  today: "2026-10-10",
  summary: "귀농주택 ⑩4호·⑪",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: "2026-11-16",
    contractTotalPrice: "500000000",
    asset: { assetKind: "housing", acquisitionDate: "2021-09-15" },
    houses: [
      {
        id: "rural",
        region: "non_capital",
        acquisitionDate: "2023-05-15",
        ruralHouseKind: "return_to_farm",
        ruralLandAreaSqm: "500",
        ruralWholeHouseholdMoved: true,
        ruralHighPriceAtAcquisition: false,
        oneHouseRuralHouse: true,
        ruralOutsideCapitalEupMyeon: true,
        ruralReturnedToFarmExitHouse: false,
        acquisitionOrigin: "general",
        ...ROW_FACTS,
        ...house,
      },
    ],
    ...over,
  } as RulingCase["form"],
});

describe("판정 메뉴 — 비과세 ↔ 과세 짝", () => {
  it("R-1 (양성) 모든 요건 충족 → 비과세 · 귀농주택 특례 적용", async () => {
    const o = await observeCase(judgmentCase({}));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("155-7-rural:return_to_farm");
    expect(o.undetermined).not.toContain("155-7-3ho-farm-facts-unconfirmed");
  });

  it("R-2 (음성 짝) ⑩4호 해당 없음 → 과세 · 확정 불충족이라 확인 필요 고지는 없다", async () => {
    const o = await observeCase(judgmentCase({ ruralFarmlandBasis: "none", ruralFarmlandHolder: undefined }));
    expect(o.isExempt).toBe(false);
    expect(o.unmetExceptions).toContain("155-7-rural:return_to_farm");
    expect(o.unmetReasons["155-7-rural:return_to_farm"].join(" ")).toContain("§155⑩4호");
    expect(o.undetermined).not.toContain("155-7-3ho-farm-facts-unconfirmed");
  });

  it("R-3 (긍정 짝) ⑩4호 모름 → 과세 + 확인 필요 고지 / ⑪ 모름·귀농 전 취득 모름도 같다", async () => {
    for (const patch of [
      { ruralFarmlandBasis: "unknown", ruralFarmlandHolder: undefined },
      { ruralPriorReturnFarmExemption: "unknown" },
      { ruralGeneralHouseBeforeReturn: "unknown" },
    ]) {
      const o = await observeCase(judgmentCase(patch));
      expect(o.validationErrors).toEqual([]);
      expect(o.isExempt).toBe(false);
      expect(o.undetermined).toContain("155-7-3ho-farm-facts-unconfirmed");
    }
  });

  it("R-4 확인 필요는 결론을 가를 때만 — 대지면적 800㎡로 어차피 과세면 모름이어도 고지하지 않는다", async () => {
    const o = await observeCase(judgmentCase({ ruralLandAreaSqm: "800", ruralFarmlandBasis: "unknown", ruralFarmlandHolder: undefined }));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).not.toContain("155-7-3ho-farm-facts-unconfirmed");
  });

  it("R-5 ⑪ 있음 → 과세(확정) · 귀농 후 취득 일반주택 → 과세(확정)", async () => {
    for (const patch of [{ ruralPriorReturnFarmExemption: "has" }, { ruralGeneralHouseBeforeReturn: "no" }]) {
      const o = await observeCase(judgmentCase(patch));
      expect(o.isExempt).toBe(false);
      expect(o.undetermined).not.toContain("155-7-3ho-farm-facts-unconfirmed");
    }
  });

  it("R-6 연혁 — 배우자 어업인(다목): 양도 2026-02-26 과세 / 2026-02-27 비과세", async () => {
    const mk = (transferDate: string) =>
      // 귀농주택 2022-01-10 취득 → 신규주택 3년(2025-01-10)이 지난 양도라 §155① 일시적 2주택으로는 구제되지 않는다(⑦ 5년 안).
      observeCase(
        judgmentCase(
          { acquisitionDate: "2022-01-10", ruralFarmlandBasis: "da", ruralFarmlandHolder: "spouse" },
          { transferDate, asset: { assetKind: "housing", acquisitionDate: "2019-06-01" } },
        ),
      );
    expect((await mk("2026-02-26")).isExempt).toBe(false);
    expect((await mk("2026-02-27")).isExempt).toBe(true);
  });

  it("R-7 대지면적 빈 칸 → ⑧ 오류 + 엔진도 불성립(0㎡로 통과하지 않는다)", async () => {
    const o = await observeCase(judgmentCase({ ruralLandAreaSqm: "" }));
    expect(o.validationErrors.join(" ")).toContain("대지면적");
    expect(o.isExempt).toBe(false);
  });

  it("R-8 키 없음(레거시) → 불성립 + ⑧이 답을 요구", async () => {
    const o = await observeCase(
      judgmentCase({ ruralFarmlandBasis: undefined, ruralFarmlandHolder: undefined, ruralPriorReturnFarmExemption: undefined, ruralGeneralHouseBeforeReturn: undefined }),
    );
    expect(o.validationErrors.length).toBeGreaterThan(0);
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain("155-7-3ho-farm-facts-unconfirmed");
  });

  it("R-9 ⑫ 사후관리 고지가 판정 메뉴 결과에도 실린다(비과세를 받았을 때만)", async () => {
    const res = await judgmentJson(judgmentCase({}));
    expect(res.postManagementNotices.join(" ")).toContain("§155⑫");
    const taxed = await judgmentJson(judgmentCase({ ruralFarmlandBasis: "none", ruralFarmlandHolder: undefined }));
    expect((taxed.postManagementNotices ?? []).join(" ")).not.toContain("§155⑫");
  });

  it("R-10 990㎡ 표기 시기 고지 — 귀농주택 2006 취득 가목이면 있고, 2023 취득이면 없다", async () => {
    const old = await observeCase(judgmentCase({ acquisitionDate: "2006-05-15" }, { asset: { assetKind: "housing", acquisitionDate: "2001-09-15" } }));
    expect(old.undetermined).toContain("155-10-4-farmland-area-990-era-unverified");
    const recent = await observeCase(judgmentCase({}));
    expect(recent.undetermined).not.toContain("155-10-4-farmland-area-990-era-unverified");
  });
});

async function judgmentJson(c: RulingCase) {
  const { buildCaseForm } = await import("../../calc/one-house-rulings/harness");
  const { buildOneHouseExemptionApiBody } = await import("@/lib/calc/one-house-exemption-api");
  const { POST } = await import("@/app/api/calc/one-house-exemption/route");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(buildCaseForm(c))),
      }),
    );
    return (await res.json()).data.judgment as { postManagementNotices: string[] };
  } finally {
    vi.useRealTimers();
  }
}

// ─── 계산기 route ───────────────────────────────────────────────────────────────
describe("계산기 — 같은 사실, 같은 결론, 같은 ⑫ 문장", () => {
  const calc = async (house: Record<string, unknown>) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2026-11-16";
    f.isOneHousehold = true;
    f.contractTotalPrice = "500000000";
    f.householdNoPresaleRightsConfirmed = true;
    f.householdNoOtherHousesConfirmed = true;
    f.residencePeriodMonths = "0";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2021-09-15",
      actualSalePrice: "500000000",
      fixedAcquisitionPrice: "300000000",
      addressJibun: "테스트 주소 1",
      regionCode: "4377037000",
      residenceInputMode: "direct",
      residencePeriods: [],
      residencePeriodMonthsAsset: "0",
    });
    f.householdHousingCount = "2";
    f.houses = [
      {
        id: "rural",
        region: "non_capital",
        regionCode: "4377037000",
        acquisitionDate: "2023-05-15",
        officialPrice: "100000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
        ruralHouseKind: "return_to_farm",
        ruralLandAreaSqm: "500",
        ruralWholeHouseholdMoved: true,
        ruralHighPriceAtAcquisition: false,
        oneHouseRuralHouse: true,
        ruralOutsideCapitalEupMyeon: true,
        ruralReturnedToFarmExitHouse: false,
        ...ROW_FACTS,
        ...house,
      } as never,
    ];
    let body: Record<string, unknown> = {};
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }) as never;
    try {
      await callTransferTaxAPI(f);
    } catch {
      /* 본문만 본다 */
    } finally {
      globalThis.fetch = realFetch;
    }
    const res = await SINGLE(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as { data: { result: { isExempt: boolean; totalTax: number; warnings: string[] } } };
    return { status: res.status, body, result: json.data?.result };
  };

  it("C-1 요건 충족 → 비과세 + ⑫ 고지(판정 메뉴와 같은 문장) / 모름 → 과세 + 확인 필요 경고", async () => {
    const ok = await calc({});
    expect(ok.result.isExempt).toBe(true);
    expect(ok.result.warnings).toContain(returnToFarmPostManagementNotice({ farmlandBasis: "ga", acquisitionDate: new Date("2023-05-15") }));

    const unknown = await calc({ ruralFarmlandBasis: "unknown", ruralFarmlandHolder: undefined });
    expect(unknown.result.isExempt).toBe(false);
    expect(unknown.result.totalTax).toBeGreaterThan(0);
    expect(unknown.result.warnings.join(" ")).toContain("영농 또는 영어의 목적으로 취득");
  });

  it("C-2 body 가 새 사실을 싣는다(⑬ → ⑫ → ⑭ 침묵 strip 방지) · 대지면적 빈 칸은 키를 싣지 않는다", async () => {
    const ok = await calc({});
    const rural = (ok.body as { ruralHouse?: Record<string, unknown> }).ruralHouse!;
    expect(rural).toMatchObject({ farmlandBasis: "ga", farmlandHolder: "self", priorReturnFarmExemption: "none", generalHouseAcquiredBeforeReturn: "yes" });
    const blank = await calc({ ruralLandAreaSqm: "" });
    expect((blank.body as { ruralHouse?: Record<string, unknown> }).ruralHouse).not.toHaveProperty("landAreaSqm");
    expect(blank.result.isExempt).toBe(false);
  });
});
