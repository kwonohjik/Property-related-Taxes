/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-1a — 철거 후 재산세 한시 지위 **고지 연혁화 · 빈집 셀 고지 · 상수 항 번호 정정** anchor. 입력 0 · 판정·세액 불변.
 *
 *   A  연혁 경계 쌍(계획서 K-19~K-22): 양도일 2016-05-31/06-01 · 2019-05-31/06-01 · 2024-05-31/06-01 · 2026-05-31/06-01에서 문구가 갈린다 — 시행본 본문은 KoreanLaw 실독(MST 178638 · 206456 · 257499 · 262781 · 282549 · 290815).
 *   B  양도일 ≥ 2026-06-01 문구는 종전과 같은 문장(상수 항 번호 정정만 다르다 — **E3f-1b가 끝 문장만 반전**: «철거일은 판정하지 않았습니다» → «한시 기간이 확실히 지났는지만 판정했고…») · 양도일 미입력(`undefined` · Invalid Date) = 연혁 한 줄 변형(K-30 · D-5).
 *   C  빈집 셀 고지(K-23): 철거일 [2021-06-01, 2022-06-01] × 양도일 [2024-06-01, 2025-03-21) 4축 경계 쌍 · 주택 철거 사건 또는 9호 기산일 · 꼬리 근거 «철거ㆍ멸실»을 선언한 입력은 제외.
 *   D  판정·세액 불변: 셀 고지가 붙는 입력도 판정·일수·세액이 고지를 뺀 것과 같다(E3f-0 표의 `current` 열 전수는 predo anchor가 계속 고정한다).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.engine.plan.md v4 §1.2 · §1.3 · §5.8 · §7.3
 */
import { describe, it, expect } from "vitest";
import { E35_B, E35_N, e35Base, e35Tail, e35VacantCell } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-5-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { demolishedStatusEra, hasDemolishedStatusEraDate, isVacantHouseThreeYearCell } from "@/lib/tax-engine/data/nbl-historical-values-era";
import { NBL } from "@/lib/tax-engine/legal-codes";
import {
  NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE,
  NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE,
  demolishedStatusNotice,
  demolishedVacantHouseCellNotices,
  demolitionGraceAnchorDates,
} from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { stateHistoryHouseRemovalDates } from "@/lib/tax-engine/non-business-land/other-land-state-history-apply";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { parseISO } from "@/lib/tax-engine/utc-date";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = parseISO;
const notice = (t: string) => demolishedStatusNotice(d(t));
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const taxOf = (input: NonBusinessLandInput) =>
  calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;

/** 종전(E3f-1a 전) `NBL_PTAX_DEMOLISHED_STATUS_NOTICE` 원문 — 항 번호 정정(«§103의2 ① 1호» → «§103의2 1호»)과 E3f-1b의 끝 문장(철거일 한도 판정)이 다르다. */
const OLD_NOTICE =
  "지방세법 §106 ① 2호 다목 + 지방세법 시행령 §103의2 ① 1호은 철거ㆍ멸실된 날부터 1년이 지나지 않은 건축물(빈집정비사업 등으로 철거된 빈집은 3년)의 부속토지이고, 건축 용도 외의 다른 용도로 쓰는 부분과 " +
  "허가·사용승인을 받지 않은 건축물의 부속토지는 제외됩니다. 철거일(한시 지위)과 이 요건들은 판정하지 않았습니다 — 확인 필요.";

describe("E3f-1a A — 연혁 경계 쌍 (양도일 ≥ 6.1. 경계 상수)", () => {
  it("era 경계 4개: 하루 전/당일에서 정확히 갈린다", () => {
    const era = (t: string) => demolishedStatusEra(d(t));
    expect([era("2016-05-31"), era("2016-06-01")]).toEqual(["not_yet", "six_month"]);
    expect([era("2019-05-31"), era("2019-06-01")]).toEqual(["six_month", "permit"]);
    expect([era("2024-05-31"), era("2024-06-01")]).toEqual(["permit", "vacant_house"]);
    expect([era("2026-05-31"), era("2026-06-01")]).toEqual(["vacant_house", "one_year"]);
  });

  it("K-19 양도 2016-05-31/06-01 — 05-31: 최초 적용 과세기준일(2016.6.1.) 안내 · 06-01: 6개월", () => {
    expect(notice("2016-05-31")).toContain("최초 과세기준일은 2016.6.1.입니다");
    expect(notice("2016-05-31")).not.toContain("6개월이 지나지 않은");
    expect(notice("2016-06-01")).toContain("철거ㆍ멸실된 날부터 6개월이 지나지 않은 건축물 또는 주택의 부속토지");
    expect(notice("2016-06-01")).not.toContain("최초 과세기준일");
  });

  it("K-20 양도 2019-05-31/06-01 — 허가·사용승인 요건 문언 유무", () => {
    const ONLY_IN_2019 = "허가·사용승인을 받지 않은 건축물 또는 주택의 부속토지는 제외됩니다";
    expect(notice("2019-05-31")).not.toContain(ONLY_IN_2019);
    expect(notice("2019-05-31")).toContain("허가·사용승인 요건");
    expect(notice("2019-06-01")).toContain(ONLY_IN_2019);
  });

  it("K-21 양도 2024-05-31/06-01 — 빈집 3년 · 건축 외 용도 제외 · 배율 문언 유무", () => {
    const VACANT = "빈집정비사업 등으로 철거된 빈집은 3년";
    const OTHER_USE = "건축 용도 외의 다른 용도로 쓰는 부분";
    expect(notice("2024-05-31")).not.toContain(VACANT);
    expect(notice("2024-05-31")).not.toContain(OTHER_USE);
    // E3f-1b 연혁 정정 — 면적 범위 문언이 없는 시행본(2024.6.1. 전)은 이 계산기도 그 범위를 적용하지 않는다(사용자 결정 2026-11-24).
    expect(notice("2024-05-31")).toContain("바닥면적에 용도지역별 적용배율을 곱한 면적 범위 문언이 없어 이 계산기는 그 범위를 적용하지 않고 부속토지 전체를 별도합산 범위로 보았습니다");
    expect(notice("2024-05-31")).not.toContain("계산기는 그 범위를 적용했습니다");
    expect(notice("2024-06-01")).toContain(VACANT);
    expect(notice("2024-06-01")).toContain(OTHER_USE);
    expect(notice("2024-06-01")).not.toContain("면적 범위 문언이 없어");
    expect(notice("2024-06-01")).toContain("6개월이 지나지 않은");
  });

  it("K-22 양도 2026-05-31/06-01 — 6개월(+빈집 3년) ↔ 1년", () => {
    expect(notice("2026-05-31")).toContain("6개월이 지나지 않은");
    expect(notice("2026-05-31")).not.toContain("1년이 지나지 않은");
    expect(notice("2026-06-01")).toContain("1년이 지나지 않은");
    expect(notice("2026-06-01")).not.toContain("6개월");
  });

  it("2026.6.1. 전 변형은 «양도일 기준 시행본 근사» 한계를 밝힌다 — 과세기준일마다 그날 시행본(판정에는 쓰지 않음)", () => {
    for (const t of ["2016-06-01", "2019-06-01", "2024-06-01", "2026-05-31"]) expect(notice(t), t).toContain("과세기준일마다 그날의 시행본으로 정해지는데 양도일 기준 시행본으로 안내했고");
  });

  it("모든 변형이 «확인 필요»로 끝나고 한시 지위를 판정하지 않았음을 밝힌다(E3f-1b: 철거ㆍ멸실일은 «확실히 지났는지»만 판정) · 전 시행본이 서로 다른 문구", () => {
    const dates = ["2016-05-31", "2016-06-01", "2019-06-01", "2024-06-01", "2026-06-01"];
    for (const t of dates) {
      expect(notice(t), t).toMatch(/확인 필요\.$/);
      expect(notice(t), t).toContain(t === "2016-05-31" ? "철거일(한시 지위)과 요건은 판정하지 않았습니다" : "철거ㆍ멸실일은 한시 기간이 양도일 직전 과세기준일까지 확실히 지났는지만 판정했고");
    }
    expect(new Set(dates.map(notice)).size).toBe(dates.length);
  });

  it("조문 인용: 호 구분 전(2024.5.28. 전) 시행본은 «§103의2» 본문 — 2024.6.1.~는 «§103의2 1호» · 어디에도 «①»(항) 인용이 없다", () => {
    for (const t of ["2016-06-01", "2019-06-01"]) {
      expect(notice(t), t).toContain(NBL.PTAX_BASIS_DEMOLISHED_BODY);
      expect(notice(t), t).not.toContain("§103의2 1호");
    }
    expect(notice("2024-06-01")).toContain(NBL.PTAX_BASIS_DEMOLISHED);
    for (const t of ["2016-05-31", "2016-06-01", "2019-06-01", "2024-06-01", "2026-06-01"]) expect(notice(t), t).not.toContain("§103의2 ①");
    expect(NBL.PTAX_BASIS_DEMOLISHED).toBe("지방세법 §106 ① 2호 다목 + 지방세법 시행령 §103의2 1호");
    expect(NBL.PTAX_BASIS_DEMOLISHED_VACANT_HOUSE).toBe("지방세법 §106 ① 2호 다목 + 지방세법 시행령 §103의2 2호");
  });
});

describe("E3f-1a B — 현행 시행본 문구 · 양도일 미입력 변형", () => {
  it("양도일 ≥ 2026-06-01 문구 = 종전 문구(항 번호 정정 + E3f-1b 끝 문장만 다름) — 경계 이후 어느 날이든 같다", () => {
    const expected = OLD_NOTICE.replace("§103의2 ① 1호", "§103의2 1호").replace(
      "철거일(한시 지위)과 이 요건들은 판정하지 않았습니다 — 확인 필요.",
      "철거ㆍ멸실일은 한시 기간이 양도일 직전 과세기준일까지 확실히 지났는지만 판정했고(지났으면 이 근거를 인정하지 않고 종합합산으로 보았습니다) 한시 지위 자체와 이 요건들은 판정하지 않았습니다 — 확인 필요.",
    );
    expect(expected).not.toBe(OLD_NOTICE);
    for (const t of ["2026-06-01", "2026-12-31", "2030-01-01"]) expect(notice(t), t).toBe(expected);
    expect(NBL.PTAX_BASIS_DEMOLISHED).toBe("지방세법 §106 ① 2호 다목 + 지방세법 시행령 §103의2 1호");
  });

  it("K-30: `demolishedStatusNotice(undefined)` · Invalid Date = 연혁 한 줄 변형 — 단일 시행본을 단정하지 않는다", () => {
    expect(demolishedStatusNotice(undefined)).toBe(NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE);
    expect(demolishedStatusNotice(d("not-a-date"))).toBe(NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE);
    expect(hasDemolishedStatusEraDate(undefined)).toBe(false);
    expect(hasDemolishedStatusEraDate(d("not-a-date"))).toBe(false);
    for (const need of ["2016.6.1.~ 6개월", "2019.6.1.~ 허가·사용승인 요건", "2024.6.1.~ 빈집정비사업 철거 빈집 3년·건축 외 용도 제외", "2026.6.1.~ 1년", "양도일을 입력하면 해당 시행본으로 안내합니다", "확인 필요"]) {
      expect(NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE, need).toContain(need);
    }
    expect(notice("2026-06-01")).not.toBe(NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE);
  });
});

describe("E3f-1a B′ — 엔진 배선: 꼬리 근거 «철거ㆍ멸실» 고지가 실제 양도일 시행본으로 나온다", () => {
  // 한시 안(양도 직전 과세기준일에 한시 기간이 안 지남)인 철거일을 쓴다 — E3f-1b: 지났으면 근거가 접혀 이 고지가 아니라 «기간 경과» 고지가 나온다.
  const tailNotices = (removedOn: string, transfer: string) => judge(fromRaw(e35Tail(removedOn, transfer, undefined))).warnings.filter((w) => w.includes("철거ㆍ멸실일은 한시 기간이"));

  it("양도 2018-12-01 → 6개월 시행본 문구 1건 · 양도 2026-06-01 → 1년 문구 1건 — 종전의 «1년 고정»(F-1)이 사라졌다", () => {
    expect(tailNotices("2018-03-01", "2018-12-01")).toEqual([notice("2018-12-01")]);
    expect(tailNotices("2018-03-01", "2018-12-01")[0]).toContain("6개월이 지나지 않은");
    expect(tailNotices("2026-03-01", "2026-06-01")).toEqual([notice("2026-06-01")]);
    expect(tailNotices("2026-03-01", "2026-06-01")[0]).toContain("1년이 지나지 않은");
  });

  it("고지 외 판정·일수는 E3f-0 표가 전수 고정한다 — 철거 4년 전(2020-01-01) 꼬리 근거는 한시 기간이 확실히 지나 접힌다(E3f-1b): 비사업용 365 · 접힘 고지는 «기간 경과» 한 줄, 시행본 고지는 없다", () => {
    const j = judge(fromRaw(e35Tail("2020-01-01", "2024-01-01", "2019-01-01")));
    expect([j.isNonBusinessLand, j.effectiveBusinessDays]).toEqual([true, 365]);
    expect(j.warnings.some((w) => w.includes("철거ㆍ멸실일은 한시 기간이"))).toBe(false);
  });

  it("법 인용 상수(appliedLawArticles · warnings)도 정정된 «§103의2 1호» — 항(①) 인용이 남지 않는다", () => {
    const j = judge(fromRaw(e35Tail("2023-12-01", "2024-01-01", undefined))); // 한시 안 — 근거가 인정돼 조문·고지가 실린다
    expect(j.appliedLawArticles).toContain(NBL.PTAX_BASIS_DEMOLISHED);
    const blob = JSON.stringify([j.appliedLawArticles, j.warnings, j.judgmentReason]);
    expect(blob).not.toContain("§103의2 ①");
    expect(blob).not.toContain("§103의2①");
  });
});

describe("E3f-1a C — 빈집 3년 셀 고지 (K-23 4축 경계 쌍)", () => {
  const cell = (r: string, t: string) => isVacantHouseThreeYearCell(d(r), d(t));

  it("철거일 축: 2021-05-31 ✗ · 2021-06-01 ✓ · 2021-06-02 ✓ · 2022-06-01 ✓ · 2022-06-02 ✗ (양도 2024-09-01) — 아래쪽 경계는 3년 만료일 당일 포함(2026-11-24 정정: 철거 2021-06-01 → 만료일 2024-06-01 = 과세기준일 → 한시 안)", () => {
    expect(["2021-05-31", "2021-06-01", "2021-06-02", "2022-06-01", "2022-06-02"].map((r) => cell(r, "2024-09-01"))).toEqual([false, true, true, true, false]);
  });

  it("양도일 축: 2024-05-31 ✗ · 2024-06-01 ✓ · 2025-03-20 ✓ · 2025-03-21 ✗ (철거 2021-12-01)", () => {
    expect(["2024-05-31", "2024-06-01", "2025-03-20", "2025-03-21"].map((t) => cell("2021-12-01", t))).toEqual([false, true, true, false]);
  });

  it("Invalid Date는 셀이 아니다", () => {
    expect(cell("not-a-date", "2024-09-01")).toBe(false);
    expect(cell("2021-12-01", "not-a-date")).toBe(false);
  });

  const nineRow = (anchorDate: string) => ({ nblGracePeriods: [{ reasonCode: "demolition", anchorDate }] });
  const cellRaw = (removedOn: string, transfer: string, extra: Record<string, unknown> = {}) =>
    e35Base({
      acquisitionDate: "2018-06-01",
      transferDate: transfer,
      nblOtherPropertyTaxType: "comprehensive",
      nblOtherHasBuilding: false,
      nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [{ kind: "building_built", date: "2020-06-01" }, { kind: "building_removed", date: removedOn, propertyTaxTypeBefore: "separate" }],
      ...nineRow(removedOn),
      ...extra,
    });
  const has = (raw: Record<string, unknown>) => judge(fromRaw(raw)).warnings.includes(NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE);

  it("9호 기산일 경로 — 철거 2021-06-02 · 양도 2024-09-01(K-7 시료 + 9호): 고지 1건 · 철거 2021-05-31·2022-06-02 또는 양도 2024-05-31·2025-03-21이면 없다(철거 2021-06-01은 3년 만료일 당일이라 있다)", () => {
    expect(judge(fromRaw(e35VacantCell(nineRow("2021-06-02")))).warnings.filter((w) => w === NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE)).toHaveLength(1);
    expect(has(cellRaw("2021-05-31", "2024-09-01"))).toBe(false);
    expect(has(cellRaw("2021-06-01", "2024-09-01"))).toBe(true);
    expect(has(cellRaw("2022-06-01", "2024-09-01"))).toBe(true);
    expect(has(cellRaw("2022-06-02", "2024-09-01"))).toBe(false);
    expect(has(cellRaw("2021-12-01", "2024-05-31"))).toBe(false);
    expect(has(cellRaw("2021-12-01", "2024-06-01"))).toBe(true);
    expect(has(cellRaw("2021-12-01", "2025-03-20"))).toBe(true);
    expect(has(cellRaw("2021-12-01", "2025-03-21"))).toBe(false);
  });

  it("주택 철거 사건 경로(9호 없이도): `buildingKindBefore: house` 철거 행이 셀이면 고지 · 주택이 아닌 철거 행(종류 없음)은 고지 없음 — 빈집은 주택", () => {
    const withHouse = (kind: string, removedOn = "2021-12-01") =>
      cellRaw(removedOn, "2024-09-01", {
        nblGracePeriods: [],
        nblOtherStateEvents: [
          { kind: "building_built", date: "2020-06-01" },
          { kind: "building_removed", date: removedOn, propertyTaxTypeBefore: "separate", ...(kind ? { buildingKindBefore: kind, houseFootprintBefore: "100" } : {}) },
        ],
      });
    expect(has(withHouse("house"))).toBe(true);
    expect(has(withHouse(""))).toBe(false);
    expect(has(withHouse("house", "2021-05-31"))).toBe(false);
    expect(has(withHouse("house", "2021-06-01"))).toBe(true);
  });

  it("이력 질문이 «변경 없음/미선택»이면 사건을 읽지 않는다(stale 사건 무시) — 9호 행만 본다", () => {
    const input = fromRaw(cellRaw("2021-12-01", "2024-09-01", { nblGracePeriods: [], nblOtherStateHistoryMode: "unchanged" }));
    expect(judge(input).warnings).not.toContain(NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE);
    const asNine = fromRaw(cellRaw("2021-12-01", "2024-09-01", { nblOtherStateHistoryMode: "unchanged" }));
    expect(judge(asNine).warnings).toContain(NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE);
  });

  it("엔진 입력에 사건이 남아 있어도 모드가 `changed`가 아니면(직접 호출) 사건 날짜를 읽지 않는다 — 9호 없이는 고지 없음", () => {
    const withEvents = fromRaw(cellRaw("2021-12-01", "2024-09-01", { nblGracePeriods: [], nblOtherStateEvents: [{ kind: "building_removed", date: "2021-12-01", propertyTaxTypeBefore: "separate", buildingKindBefore: "house", houseFootprintBefore: "100" }] }));
    const events = withEvents.landStateHistory!.events;
    expect(stateHistoryHouseRemovalDates(withEvents)).toEqual([d("2021-12-01")]);
    for (const mode of ["", "unchanged", "unknown"] as const) {
      expect(stateHistoryHouseRemovalDates({ landStateHistory: { mode, events } }), mode).toEqual([]);
    }
    expect(stateHistoryHouseRemovalDates({})).toEqual([]);
  });

  it("꼬리 근거 «철거ㆍ멸실»을 선언한 입력은 제외 — 그 고지(`demolishedStatusNotice`)가 이미 3년 문언을 싣는다", () => {
    const dem = e35Tail("2021-12-01", "2024-09-01", "2020-06-01", { acquisitionDate: "2018-06-01", ...nineRow("2021-12-01") });
    const j = judge(fromRaw(dem));
    expect(j.warnings).not.toContain(NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE);
    expect(j.warnings).toContain(notice("2024-09-01"));
    const inCell = { transferDate: d("2024-09-01"), removedOn: [d("2021-12-01")] };
    expect(demolishedVacantHouseCellNotices(inCell, true)).toEqual([]);
    expect(demolishedVacantHouseCellNotices(inCell, false)).toEqual([NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE]);
    expect(demolishedVacantHouseCellNotices({ transferDate: d("2024-09-01"), removedOn: [] }, false)).toEqual([]);
    expect(demolitionGraceAnchorDates(fromRaw(cellRaw("2021-12-01", "2024-09-01")))).toEqual([d("2021-12-01")]);
  });

  it("고지 문구: 2호 인용 · 9호 2년 · 과세기준일 2024.6.1. · 판정하지 않았음 · 확인 필요 — 조문 인용은 상수", () => {
    expect(NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE).toContain(NBL.PTAX_BASIS_DEMOLISHED_VACANT_HOUSE);
    for (const need of ["과세기준일 2024.6.1.", "3년이 지나지 않은 빈집의 부속토지", "유예기간(9호)은 2년", "판정하지 않았고", "확인 필요"]) expect(NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE, need).toContain(need);
  });
});

describe("E3f-1a D — 판정·세액 불변: 셀 고지는 고지 한 줄만 더한다", () => {
  it("K-7 시료(+9호 · 셀) — 고지를 빼면 입력만 달리한 셀 밖(철거 2022-06-02) 시료와 같은 구조 · 판정·일수는 현행(비사업용 1,096/2,283)", () => {
    const j = judge(fromRaw(e35VacantCell({ nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2021-06-02" }] })));
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([true, 1096, 2283]);
    expect(j.warnings.filter((w) => w === NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE)).toHaveLength(1);
  });

  it("세액: 기본 취득·양도일 시료 — 고지가 있어도 B/N 세액 그대로(전량 사업용 198,210,000 · 전량 비사업용 253,960,000)", () => {
    const n = fromRaw(e35Tail("2023-12-01", "2024-01-01", undefined)); // 꼬리 근거 · 한시 안 → B
    expect(taxOf(n)).toBe(E35_B);
    const folded = fromRaw(e35Base({
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [{ kind: "building_removed", date: "2018-01-01", propertyTaxTypeBefore: "separate" }], nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2018-01-01" }],
    }));
    expect(taxOf(folded)).toBe(E35_N);
  });
});
