/**
 * PSA-S1 — 철거 요건 사슬 걷기 케이스 anchor (계획서 property-separate-demolished-sequential.engine.plan.md §4.1 SK-1~SK-25 · §2.1 단계 표).
 * Pre-Do 우선 셀: 현행과 **달라야 하는** SK-1·SK-3·SK-12(종류 불요 · 빈집정비 관문 · 일반 기간 안 주택은 허가 먼저)부터.
 * 판정(접힘/성립 · 사유 · 면적)은 동결 복제본과 같다는 것은 격자(`separate-demolished-chain-grid.anchor.test.ts`)가 전수 대조한다 — 여기는 읽는 칸(`order`)·`next`·`resolved`·빈집정비 자리를 값으로 고정한다.
 */
import { describe, expect, it } from "vitest";
import { judgePropertyDemolishedLand, propertyDemolishedChain, propertyDemolishedFactIssue, PROPERTY_DEMOLISHED_ISSUE_MESSAGE } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedAskField, PropertyDemolishedFacts, PropertyDemolishedKind } from "../../../lib/tax-engine/property-separate-requirements";
import { propertyDemolishedVerdictLines } from "../../../lib/calc/property-demolished-verdict-text";
import { parseISO } from "../../../lib/tax-engine/utc-date";

const d = parseISO;
const F = {
  kind: "demolishedKind", vac: "demolishedVacantHouse", permit: "demolishedPermit", other: "demolishedOtherUse",
  pub: "demolishedPublicUse", paid: "demolishedPublicUsePaid", area: "buildingFloorArea",
} as const satisfies Record<string, PropertyDemolishedAskField>;

interface Case {
  sk: string;
  s: string;
  r: string;
  kind?: PropertyDemolishedKind | "";
  facts?: PropertyDemolishedFacts;
  area?: boolean;
  order: PropertyDemolishedAskField[];
  next: PropertyDemolishedAskField | null;
  /** 판정 — fold 사유 / "holds" / null(미답으로 멈춤 — 직접 호출은 혜택 불성립으로 접힌다) */
  fold?: string;
  holds?: true;
  pos?: "gate" | "proviso" | null;
  months?: number;
}
const CASES: Case[] = [
  { sk: "SK-1 종류 불요(36개월 밖)", s: "2026-06-01", r: "2023-05-31", order: [], next: null, fold: "period" },
  { sk: "SK-2 36개월 당일 · 종류 미답", s: "2026-06-01", r: "2023-06-01", order: [F.kind], next: F.kind },
  { sk: "SK-3 주택 → 빈집정비(관문)", s: "2026-06-01", r: "2023-06-01", kind: "house", order: [F.kind, F.vac], next: F.vac, pos: "gate", fold: "period" },
  { sk: "SK-4 관문 «아니오» → period", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "no" }, order: [F.kind, F.vac], next: null, fold: "period", pos: "gate" },
  { sk: "SK-5 관문 «모름» → period + 연장 미확인", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "unknown" }, order: [F.kind, F.vac], next: null, fold: "period", pos: "gate" },
  { sk: "SK-6 관문 «예» → 허가", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes" }, order: [F.kind, F.vac, F.permit], next: F.permit, pos: "gate" },
  { sk: "SK-7 관문 «예» · 허가 «아니오» → permit · 36", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "no" }, order: [F.kind, F.vac, F.permit], next: null, fold: "permit", pos: "gate", months: 36 },
  { sk: "SK-8 허가 «예» → 건축 외 용도", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes" }, order: [F.kind, F.vac, F.permit, F.other], next: F.other, pos: "gate" },
  { sk: "SK-9 건축 외 «아니오» → 성립(주택 — 바닥면적 안 물음)", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes", otherUse: "no" }, order: [F.kind, F.vac, F.permit, F.other], next: null, holds: true, pos: "gate", months: 36 },
  { sk: "SK-10 건축 외 «예» → 공용(빈집정비는 이미 읽음)", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes", otherUse: "yes" }, order: [F.kind, F.vac, F.permit, F.other, F.pub], next: F.pub, pos: "gate" },
  { sk: "SK-11a 공용 «예» → 유료", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes", otherUse: "yes", publicUse: "yes" }, order: [F.kind, F.vac, F.permit, F.other, F.pub, F.paid], next: F.paid, pos: "gate" },
  { sk: "SK-11b 유료 «예» → 성립(단서)", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes", otherUse: "yes", publicUse: "yes", publicUsePaid: "yes" }, order: [F.kind, F.vac, F.permit, F.other, F.pub, F.paid], next: null, holds: true, pos: "gate" },
  { sk: "SK-11c 유료 «아니오» → public_use_unpaid", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes", otherUse: "yes", publicUse: "yes", publicUsePaid: "no" }, order: [F.kind, F.vac, F.permit, F.other, F.pub, F.paid], next: null, fold: "public_use_unpaid", pos: "gate" },
  { sk: "SK-11d 유료 «모름» → other_use", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes", otherUse: "yes", publicUse: "yes", publicUsePaid: "unknown" }, order: [F.kind, F.vac, F.permit, F.other, F.pub, F.paid], next: null, fold: "other_use", pos: "gate" },
  { sk: "SK-11e 공용 «아니오» → other_use(유료 안 물음)", s: "2026-06-01", r: "2023-06-01", kind: "house", facts: { vacantHouse: "yes", permit: "yes", otherUse: "yes", publicUse: "no" }, order: [F.kind, F.vac, F.permit, F.other, F.pub], next: null, fold: "other_use", pos: "gate" },
  { sk: "SK-12 일반 기간 안 주택 — 허가 먼저(빈집정비 안 물음)", s: "2026-06-01", r: "2025-06-01", kind: "house", order: [F.kind, F.permit], next: F.permit, pos: null },
  { sk: "SK-12b 허가 «예» · 건축 외 «아니오» → 성립(빈집정비 안 물음)", s: "2026-06-01", r: "2025-06-01", kind: "house", facts: { permit: "yes", otherUse: "no" }, order: [F.kind, F.permit, F.other], next: null, holds: true, pos: null },
  { sk: "SK-13 허가 «예» · 건축 외 «예» → 빈집정비(단서 하위)", s: "2026-06-01", r: "2025-06-01", kind: "house", facts: { permit: "yes", otherUse: "yes" }, order: [F.kind, F.permit, F.other, F.vac], next: F.vac, pos: "proviso" },
  { sk: "SK-14 단서 하위 빈집정비 «아니오» → other_use", s: "2026-06-01", r: "2025-06-01", kind: "house", facts: { permit: "yes", otherUse: "yes", vacantHouse: "no" }, order: [F.kind, F.permit, F.other, F.vac], next: null, fold: "other_use", pos: "proviso" },
  { sk: "SK-14b 빈집 «예» · 공용 «예» · 유료 «예» → 성립 · 36", s: "2026-06-01", r: "2025-06-01", kind: "house", facts: { permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" }, order: [F.kind, F.permit, F.other, F.vac, F.pub, F.paid], next: null, holds: true, pos: "proviso", months: 36 },
  { sk: "SK-15 건축물 · 허가 «아니오» → permit(건축 외·바닥면적 안 물음)", s: "2026-06-01", r: "2025-06-01", kind: "building", facts: { permit: "no" }, order: [F.kind, F.permit], next: null, fold: "permit" },
  { sk: "SK-16 건축물 · 건축 외 «예» → other_use(빈집정비·바닥면적 안 물음)", s: "2026-06-01", r: "2025-06-01", kind: "building", facts: { permit: "yes", otherUse: "yes" }, order: [F.kind, F.permit, F.other], next: null, fold: "other_use" },
  { sk: "SK-17 건축물 · 건축 외 «모름» → other_use", s: "2026-06-01", r: "2025-06-01", kind: "building", facts: { permit: "yes", otherUse: "unknown" }, order: [F.kind, F.permit, F.other], next: null, fold: "other_use" },
  { sk: "SK-18 건축물 · 건축 외 «아니오» → 용도지역·바닥면적(미답)", s: "2026-06-01", r: "2025-06-01", kind: "building", facts: { permit: "yes", otherUse: "no" }, order: [F.kind, F.permit, F.other, F.area], next: F.area, fold: "area_input" },
  { sk: "SK-18b 같은 · 면적 입력 → 성립", s: "2026-06-01", r: "2025-06-01", kind: "building", facts: { permit: "yes", otherUse: "no" }, area: true, order: [F.kind, F.permit, F.other, F.area], next: null, holds: true },
  { sk: "SK-19b 건축물 · 1년 밖 → 종류만 읽고 period", s: "2026-06-01", r: "2025-05-31", kind: "building", order: [F.kind], next: null, fold: "period" },
  { sk: "SK-19h 주택 · 1년 밖 → 빈집정비 관문", s: "2026-06-01", r: "2025-05-31", kind: "house", order: [F.kind, F.vac], next: F.vac, pos: "gate" },
  { sk: "SK-20 2024.6.1. · 건축물 · 허가 «예» · 건축 외 «아니오» → 면적까지", s: "2024-06-01", r: "2023-12-01", kind: "building", facts: { permit: "yes", otherUse: "no" }, area: true, order: [F.kind, F.permit, F.other, F.area], next: null, holds: true },
  { sk: "SK-21 2019.6.1. · 허가 «예» → 성립(건축 외 문언 없음)", s: "2019-06-01", r: "2018-12-01", kind: "building", facts: { permit: "yes" }, order: [F.kind, F.permit], next: null, holds: true },
  { sk: "SK-21b 같은 · 허가 «아니오» → permit", s: "2019-06-01", r: "2018-12-01", kind: "building", facts: { permit: "no" }, order: [F.kind, F.permit], next: null, fold: "permit" },
  { sk: "SK-22 2016.6.1. · 종류만 → 성립(허가·건축 외 문언 없음)", s: "2016-06-01", r: "2015-12-01", kind: "building", order: [F.kind], next: null, holds: true },
  { sk: "SK-23 2015.6.1.(시행 전) · 종류 불요 → not_yet", s: "2015-06-01", r: "2015-01-01", order: [], next: null, fold: "not_yet" },
  { sk: "SK-24 2016.6.1. · 6개월 밖 · 종류 불요 → period", s: "2016-06-01", r: "2015-11-30", order: [], next: null, fold: "period" },
];

describe("PSA-S1 SK — 읽는 칸(order) · next · resolved · 빈집정비 자리", () => {
  for (const c of CASES) {
    it(c.sk, () => {
      const input = {
        taxBaseDate: d(c.s),
        removedOn: d(c.r),
        kind: c.kind ?? ("" as const),
        facts: c.facts ?? {},
        ...(c.area ? { buildingFloorArea: 100, zoningDistrict: "commercial" } : {}),
      };
      const chain = propertyDemolishedChain(input);
      expect(chain.order).toEqual(c.order);
      expect(chain.next).toBe(c.next);
      expect(chain.vacantHousePosition).toBe(c.pos ?? null);
      for (const f of Object.values(F)) expect(chain.asked[f]).toBe(c.order.includes(f));
      const v = judgePropertyDemolishedLand({ ...input, landArea: 400 });
      if (c.holds) {
        expect(v.kind).toBe("holds");
        expect(chain.resolved).toEqual({ kind: "holds" });
      } else if (c.fold) {
        expect(v.kind).toBe("fold");
        // 직접 호출에서 미답 칸은 «예 아님»으로 접힌다 — 사유가 그 칸의 접힘 사유
        if (c.next === null) expect(v.foldReason).toBe(c.fold);
        if (c.next === null && c.fold) {
          expect(chain.resolved?.kind).toBe("fold");
          if (chain.resolved?.kind === "fold") expect(chain.resolved.foldReason).toBe(c.fold);
        }
      } else {
        expect(chain.resolved).toBeNull();
      }
      if (c.months !== undefined) expect(v.periodMonths).toBe(c.months);
      // 첫 결함 문구가 next에서 파생된다
      const issue = propertyDemolishedFactIssue(input);
      expect(issue === null).toBe(c.next === null);
    });
  }

  it("SK-5 «모름»만 3년 연장 미확인 고지 · «아니오»는 없음", () => {
    const at = (vacantHouse: "no" | "unknown") => judgePropertyDemolishedLand({ taxBaseDate: d("2026-06-01"), removedOn: d("2023-06-01"), kind: "house", facts: { vacantHouse }, landArea: 400 });
    expect(at("unknown").vacantHouseExtensionUnconfirmed).toBe(true);
    expect(at("unknown").notices.join("")).toContain("3년 연장");
    expect(at("no").vacantHouseExtensionUnconfirmed).toBe(false);
  });

  it("SK-25 철거일 > 과세기준일 → 날짜 결함: order [] · next null · resolved null · ⑧ 문구는 철거일", () => {
    const input = { taxBaseDate: d("2026-06-01"), removedOn: d("2026-06-02"), kind: "building" as const, facts: {} };
    const chain = propertyDemolishedChain(input);
    expect(chain).toMatchObject({ order: [], next: null, resolved: null });
    expect(propertyDemolishedFactIssue(input)).toEqual({ field: "demolishedDate", message: PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedAfterBaseDate });
    expect(propertyDemolishedFactIssue({ ...input, removedOn: undefined })?.field).toBe("demolishedDate");
  });

  it("공장용지 ∧ 종류 «주택»(종류를 읽는 구간) → order [종류] · next 종류 — 고칠 칸(종류 라디오)이 남는다 · ⑧ 모순 문구", () => {
    const input = { taxBaseDate: d("2026-06-01"), removedOn: d("2026-01-01"), kind: "house" as const, isFactory: true, facts: { permit: "yes" as const, otherUse: "no" as const } };
    const chain = propertyDemolishedChain(input);
    expect(chain).toMatchObject({ order: [F.kind], next: F.kind, resolved: null, vacantHousePosition: null });
    expect(propertyDemolishedFactIssue(input)).toEqual({ field: "demolishedKind", message: PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedFactoryHouse });
    // 날짜만으로 접힘이 확정이면 종류를 읽지 않으므로 모순도 걸지 않는다
    const settled = { ...input, removedOn: d("2023-05-31") };
    expect(propertyDemolishedChain(settled)).toMatchObject({ order: [], next: null });
    expect(propertyDemolishedFactIssue(settled)).toBeNull();
    // 종류가 건축물이면 모순 아님
    expect(propertyDemolishedChain({ ...input, kind: "building" }).order).toEqual([F.kind, F.permit, F.other, F.area]);
  });

  it("SQ-5 날짜 확정 기간 접힘 고지 — 2024.6.1.~는 일반·빈집 기간 병기 · 그 전 시행본은 기존 문장 · SQ-6 종류 없이도 period/not_yet", () => {
    const at = (s: string, r: string) => judgePropertyDemolishedLand({ taxBaseDate: d(s), removedOn: d(r), kind: undefined, facts: {}, landArea: 400 });
    const a = at("2026-06-01", "2023-05-31");
    expect(a.foldReason).toBe("period");
    expect(a.periodMonths).toBe(36);
    expect(a.notices[0]).toContain("일반 한시 기간(1년)과 빈집정비사업 철거 빈집 한시 기간(3년)이 모두 지나");
    const b = at("2024-06-01", "2021-05-31");
    expect(b.notices[0]).toContain("일반 한시 기간(6개월)과 빈집정비사업 철거 빈집 한시 기간(3년)이 모두 지나");
    const c = at("2023-06-01", "2022-11-30");
    expect(c.foldReason).toBe("period");
    expect(c.notices[0]).toContain("6개월(과세기준일 시행본 기준");
    expect(c.notices[0]).not.toContain("빈집정비사업");
    const n = at("2015-06-01", "2015-01-01");
    expect(n.foldReason).toBe("not_yet");
    expect(n.periodMonths).toBe(0);
  });

  it("카드·PDF 한시 기간 줄 — 날짜 확정 접힘은 일반·빈집 두 기간 병기(빈집 3년만 보이지 않는다) · 그 밖은 기존 문장", () => {
    const at = (s: string, r: string, kind?: PropertyDemolishedKind) => judgePropertyDemolishedLand({ taxBaseDate: d(s), removedOn: d(r), kind, facts: {}, landArea: 400 });
    const period = (v: ReturnType<typeof at>) => propertyDemolishedVerdictLines({ ...v }).find((l) => l.key === "period")!.text;
    // 과세기준일 2026-06-01 · 철거 2021-01-01 · 종류 없음 — 종류·빈집정비를 묻지 않았다
    const a = at("2026-06-01", "2021-01-01");
    expect(a.periodAllKinds).toEqual({ general: 12, vacantHouse: 36 });
    expect(period(a)).toBe("철거ㆍ멸실일부터 일반 한시 기간(1년)과 빈집정비사업 철거 빈집 한시 기간(3년) 모두 경과(과세기준일 시행본)");
    expect(period(a)).not.toContain("3년(빈집정비사업 철거 빈집)");
    expect(period(at("2024-06-01", "2021-05-31"))).toContain("일반 한시 기간(6개월)과 빈집정비사업 철거 빈집 한시 기간(3년) 모두 경과");
    // 일반·빈집 기간이 같은 시행본(2024.6.1. 전)은 병기 값이 없고 기존 문장 그대로
    const old = at("2023-06-01", "2022-11-30");
    expect(old.periodAllKinds).toBeUndefined();
    expect(period(old)).toBe("철거ㆍ멸실일부터 6개월(과세기준일 시행본)");
    // 종류·빈집정비를 물은 접힘은 병기하지 않는다 — 빈집정비 «예» 3년 안 성립 / 건축물 1년 밖 접힘
    expect(at("2026-06-01", "2023-06-01", "house").periodAllKinds).toBeUndefined();
    const b = at("2026-06-01", "2025-05-31", "building");
    expect(b.periodAllKinds).toBeUndefined();
    expect(period(b)).toBe("철거ㆍ멸실일부터 1년(과세기준일 시행본)");
    // 고지와 같은 사실을 말한다(둘 다 1년·3년)
    expect(a.notices[0]).toContain("일반 한시 기간(1년)과 빈집정비사업 철거 빈집 한시 기간(3년)이 모두 지나");
  });

  it("T4 stale 무해 — 읽히지 않은 빈집정비 «예»는 36을 만들지 못한다(현행은 36)", () => {
    const base = { taxBaseDate: d("2026-06-01"), removedOn: d("2025-12-01"), kind: "house" as const, landArea: 400 };
    const a = judgePropertyDemolishedLand({ ...base, facts: { permit: "no", vacantHouse: "yes" } });
    const b = judgePropertyDemolishedLand({ ...base, facts: { permit: "no", vacantHouse: "no" } });
    expect(a).toEqual(b);
    expect(a.periodMonths).toBe(12);
    expect(a.required.vacantHouse).toBe(false);
  });
});
