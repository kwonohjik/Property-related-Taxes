/**
 * G1 — 사례 28 역방향 「주택을 첫 자산으로 바꾸기」 anchor: 순수 헬퍼(회전·T1·T2·라벨·가드) + **parity**(교환 결과 ≡ 주택 먼저 폼).
 *
 * 정본은 «처음부터 주택을 먼저 넣고 토지를 입력한 순서대로 둔 폼»이다 — 교환 폼은 그 폼과 자산 단위로 깊게 같아야 하고(`toEqual`),
 * 그래서 ⑧ 이슈·④ 본문·route 총세액·properties도 정확히 같다(안분 모드 비정수 시료의 ±1원 포함 — 순서가 같으므로 잔액 흡수 위치가 같다).
 * route 역방향 직접 비교(API 본문)는 `transfer.route.reverse-appurtenant-unit-g1.anchor.test.ts`가 정수 분할 시료에서 한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, allIssues, captureBody } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form, aggOf, blocked } from "./_helpers/g1-reverse-appurtenant-fixtures";
import {
  reverseAppurtenantSwapPatch,
  reverseAppurtenantSwapBlockReason,
  reverseAppurtenantSwapNewlyReflected,
} from "@/lib/calc/reverse-appurtenant-swap";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type F = TransferFormData;
const swapped = (f: F): F => {
  const p = reverseAppurtenantSwapPatch(f);
  if (!p) throw new Error("교환 패치가 null");
  return { ...f, ...p };
};
const ids = (f: { assets: { assetId: string }[] }) => f.assets.map((a) => a.assetId);
const L = (id: string, area = 300) => LAND(id, area);

describe("회전 — 주택을 맨 앞으로, 나머지는 입력 순서 그대로", () => {
  it("[L, H] → [H, L]", () => {
    expect(ids(swapped(form(L("l1"), HOUSE(0))))).toEqual(["h1", "l1"]);
  });

  it("🔑 [L1, H, L2] → [H, L1, L2] (단순 교환이면 [H, L1, L2]가 아니라 토지 순서가 뒤집힌다 — 이 시료는 H가 가운데라 교환과 같다)", () => {
    expect(ids(swapped(form(L("l1"), HOUSE(0), L("l2"))))).toEqual(["h1", "l1", "l2"]);
  });

  it("🔑 [L1, L2, H] → [H, L1, L2] — 단순 교환 swap(0,k)이면 [H, L2, L1]로 토지 순서가 뒤집힌다", () => {
    expect(ids(swapped(form(L("l1"), L("l2"), HOUSE(0))))).toEqual(["h1", "l1", "l2"]);
    expect(ids(swapped(form(L("l1"), L("l2"), L("l3"), HOUSE(0))))).toEqual(["h1", "l1", "l2", "l3"]);
  });
});

describe("T1 — 주 자산 배지(isPrimaryForHouseholdFlags)는 새 첫 자산만 true", () => {
  it("교환 후 첫 자산(주택)만 true · 강등된 토지는 false", () => {
    const s = swapped(form(L("l1"), L("l2"), HOUSE(0)));
    expect(s.assets.map((a) => a.isPrimaryForHouseholdFlags)).toEqual([true, false, false]);
  });
});

describe("T2 — 미등기: 주 자산은 폼 전역, 컴패니언은 자산 값", () => {
  const base = () => form(L("l1"), HOUSE(0)) as F;
  it("토지(첫 자산)가 미등기 — 폼 전역 true → 토지 자산 값으로 내려가고 폼 전역은 주택(false)을 따른다", () => {
    const s = swapped({ ...base(), isUnregistered: true });
    expect(s.isUnregistered).toBe(false);
    expect(s.assets.map((a) => [a.assetId, a.isUnregistered])).toEqual([["h1", false], ["l1", true]]);
  });
  it("주택(컴패니언)이 미등기 — 자산 값 true → 폼 전역으로 올라가고 주택 자산 값은 false", () => {
    const b = base();
    const s = swapped({ ...b, assets: b.assets.map((a) => (a.assetId === "h1" ? { ...a, isUnregistered: true } : a)) });
    expect(s.isUnregistered).toBe(true);
    expect(s.assets.map((a) => [a.assetId, a.isUnregistered])).toEqual([["h1", false], ["l1", false]]);
  });
  it("가운데 토지의 컴패니언 미등기는 그대로 남는다", () => {
    const b = form(L("l1"), L("l2"), HOUSE(0)) as F;
    const s = swapped({ ...b, assets: b.assets.map((a) => (a.assetId === "l2" ? { ...a, isUnregistered: true } : a)) });
    expect(s.assets.find((a) => a.assetId === "l2")!.isUnregistered).toBe(true);
  });
});

describe("라벨 — 미편집 `자산 N`만 새 위치로 재번호", () => {
  it("기본 라벨은 새 index+1 · 사용자가 고친 라벨은 그대로", () => {
    const b = form(L("l1"), HOUSE(0)) as F;
    const edited = { ...b, assets: b.assets.map((a) => (a.assetId === "l1" ? { ...a, assetLabel: "우리 집 앞마당" } : a)) };
    expect(swapped(b).assets.map((a) => a.assetLabel)).toEqual(["자산 1", "자산 2"]);
    expect(swapped(edited).assets.map((a) => a.assetLabel)).toEqual(["자산 1", "우리 집 앞마당"]);
  });
});

describe("입력 불변성 — 헬퍼는 폼을 바꾸지 않는다", () => {
  it("패치·사유·안내 목록 호출 전후 폼이 깊게 같다", () => {
    const f = form(L("l1"), L("l2"), HOUSE(0)) as F;
    const before = JSON.parse(JSON.stringify(f));
    reverseAppurtenantSwapPatch(f);
    reverseAppurtenantSwapBlockReason(f);
    reverseAppurtenantSwapNewlyReflected(f);
    expect(JSON.parse(JSON.stringify(f))).toEqual(before);
  });
});

describe("가드 표(계획서 §5-1) — 전 분기", () => {
  const withPatch = (f: F, patch: Record<string, unknown>) => ({ ...f, assets: f.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) }) as F;
  const a = (o: Record<string, unknown>) => ({ ...makeDefaultAsset(2), ...o }) as never;

  it("기본 구성은 패치가 있고 사유가 없다", () => {
    const f = form(L("l1"), HOUSE(0)) as F;
    expect(reverseAppurtenantSwapPatch(f)).not.toBeNull();
    expect(reverseAppurtenantSwapBlockReason(f)).toBeNull();
  });

  it("짝 주택이 없으면 버튼도 사유도 없다 — 현행 ⑧·엔진 경고가 안내한다", () => {
    const cases: [string, F][] = [
      ["주택 먼저(역방향 아님)", form(HOUSE(0), L("l1")) as F],
      ["토지 성격 독립 나대지", form({ ...L("l1"), landNature: "standalone" }, HOUSE(0)) as F],
      ["토지 성격 미선택", form({ ...L("l1"), landNature: undefined }, HOUSE(0)) as F],
      ["주택 2건", form(L("l1"), HOUSE(0), { ...HOUSE(0), assetId: "h2" }) as F],
      ["겸용주택", form(L("l1"), { ...HOUSE(0), isMixedUseHouse: true }) as F],
      ["재개발 완공주택만", form(L("l1"), { ...HOUSE(0), assetKind: "redevelopment_apt" }) as F],
      ["단건", form(L("l1")) as F],
    ];
    for (const [name, f] of cases) {
      expect(reverseAppurtenantSwapPatch(f), name).toBeNull();
      expect(reverseAppurtenantSwapBlockReason(f), name).toBeNull();
    }
  });

  it("지분 분할(축 B) 묶음 — 형제가 짝 주택으로 보이지 않는다(⑧ 오탐 보정 포함 · 지분율 입력 전·후)", () => {
    const half = { ownershipNumerator: "1", ownershipDenominator: "2" };
    const blank = { ownershipNumerator: "", ownershipDenominator: "" };
    const sib = (r: Record<string, string>) => a({ assetId: "s2", ...r });
    const typed = { ...(form({ ...L("l1"), ...half }, HOUSE(0)) as F), assets: [{ ...makeDefaultAsset(1), ...L("l1"), ...half }, sib(half)] } as F;
    const entry = { ...typed, assets: [{ ...makeDefaultAsset(1), ...L("l1"), ...blank }, sib(blank)] } as F;
    for (const f of [typed, entry]) {
      expect(reverseAppurtenantSwapPatch(f)).toBeNull();
      expect(reverseAppurtenantSwapBlockReason(f)).toBeNull();
      expect(blocked(allIssues(f))).toEqual([]);
    }
  });

  it("함께 양도 묶음에서 주택만 지분(<1)이어도(축 B 아님) 버튼은 있다 — 엔진 `conflicted` 가드가 합산을 안 하고 안내만 한다", () => {
    const f = form(L("l1"), { ...HOUSE(0), ownershipNumerator: "1", ownershipDenominator: "2" }) as F;
    expect(reverseAppurtenantSwapPatch(f)).not.toBeNull();
  });

  it("증환지 증가분이 하나라도 있으면 숨김(사유 없음)", () => {
    const f = form(L("l1"), HOUSE(0), { ...L("l2"), isReplotIncrement: true }) as F;
    expect(reverseAppurtenantSwapPatch(f)).toBeNull();
    expect(reverseAppurtenantSwapBlockReason(f)).toBeNull();
  });

  it.each([
    ["nblUseDetailedJudgment", { nblUseDetailedJudgment: true }, "비사업용 토지 정밀판정"],
    ["parcelMode", { parcelMode: true }, "다필지"],
    ["isSalesCaseAcquisition", { isSalesCaseAcquisition: true }, "매매사례가액"],
    ["familyBusinessInheritance", { familyBusinessInheritance: { decedentAcquisitionPrice: "1" } }, "가업상속"],
  ])("첫 자산 토지의 «첫 자산 전용» 입력(%s)이 있으면 숨김 + 사유 한 줄(입력 이름 포함)", (_n, patch, label) => {
    const f = withPatch(form(L("l1"), HOUSE(0)) as F, patch);
    expect(reverseAppurtenantSwapPatch(f)).toBeNull();
    const reason = reverseAppurtenantSwapBlockReason(f);
    expect(reason).toContain(label);
    expect(reason).toContain("첫 자산에서만 반영");
  });

  it("전용 입력이 여럿이면 사유에 모두 나열한다", () => {
    const f = withPatch(form(L("l1"), HOUSE(0)) as F, { parcelMode: true, nblUseDetailedJudgment: true });
    const reason = reverseAppurtenantSwapBlockReason(f)!;
    expect(reason).toContain("비사업용 토지 정밀판정");
    expect(reason).toContain("다필지");
  });
});

describe("가드 근거 실측 — 첫 자산 전용 입력은 컴패니언 위치에서 ④가 안 보내거나 ⑧이 막는다(계획서 §4-4)", () => {
  it.each([
    ["nblUseDetailedJudgment", { isNonBusinessLand: true, nblUseDetailedJudgment: true }, "정밀판정"],
    ["parcelMode", { parcelMode: true }, "다필지"],
    ["isSalesCaseAcquisition", { isSalesCaseAcquisition: true, similarSalesValue: "100000000" }, "첫 번째 자산에서만"],
    ["familyBusinessInheritance", { acquisitionCause: "inheritance", familyBusinessInheritance: { decedentAcquisitionPrice: "1" } }, "상속개시일 평가액"],
  ])("%s — 토지가 컴패니언일 때 ⑧ 차단(교환하면 새 ⑧ 오류)", (_n, patch, frag) => {
    const comp = form(HOUSE(0), { ...L("l1"), ...patch }) as F;
    expect(allIssues(comp).some((i) => i.message.includes(frag))).toBe(true);
  });
});

describe("승격 주택의 «처음 반영되는 입력» (Q3)", () => {
  const withHouse = (patch: Record<string, unknown>) => {
    const f = form(L("l1"), HOUSE(0)) as F;
    return { ...f, assets: f.assets.map((a) => (a.assetId === "h1" ? { ...a, ...patch } : a)) } as F;
  };
  it("없으면 빈 목록", () => {
    expect(reverseAppurtenantSwapNewlyReflected(form(L("l1"), HOUSE(0)) as F)).toEqual([]);
  });
  it("신축·증축 / 장기임대주택 특례 선언", () => {
    expect(reverseAppurtenantSwapNewlyReflected(withHouse({ isSelfBuilt: true }))).toEqual(["신축·증축"]);
    const rental = { ...makeDefaultAsset(2).rentalHousingException, applyException: true };
    expect(reverseAppurtenantSwapNewlyReflected(withHouse({ rentalHousingException: rental }))).toEqual(["장기임대주택 거주주택 비과세 특례"]);
  });
  it("교환 구성이 아니면 빈 목록", () => {
    expect(reverseAppurtenantSwapNewlyReflected(form(HOUSE(0), L("l1")) as F)).toEqual([]);
  });
});

// ───────────────────────── parity ─────────────────────────
// 과세 시료 — 조정대상지역 2018 취득 · 거주 0이라 주택도 과세된다(총세액이 0이 아니어야 parity가 세액을 가린다).
const TAXED_FORM = { wasRegulatedAtAcquisition: true, wasRegulatedAtAcquisitionTouched: true, residencePeriodMonths: "0" };
const T18 = { acquisitionDate: "2018-01-02" };
const H18 = () => ({ ...HOUSE(0), ...T18, residencePeriodMonthsAsset: "0" });
const NONINT = { contractTotalPrice: "1000000007", ...TAXED_FORM };
const stdOf = (std: string) => ({ standardPriceAtTransfer: std });
const land18 = (id: string, area: number, std: string) => ({ ...L(id, area), ...T18, ...stdOf(std) });
const withForm = (f: F, extra: Record<string, unknown>) => ({ ...(f as object), ...extra }) as unknown as F;
const samples: { name: string; land: F; house: F }[] = [
  { name: "토지 1 + 주택 1", land: form(L("l1"), HOUSE(0)), house: form(HOUSE(0), L("l1")) },
  {
    name: "토지 2 + 주택 1 (토지 순서 보존)",
    land: form({ ...L("l1", 200), ...stdOf("200000000") }, { ...L("l2", 150), ...stdOf("100000000") }, HOUSE(0)),
    house: form(HOUSE(0), { ...L("l1", 200), ...stdOf("200000000") }, { ...L("l2", 150), ...stdOf("100000000") }),
  },
  {
    name: "과세 · 안분 모드 비정수(±1원 — 총액 1,000,000,007 · 기준시가 비율 안분)",
    land: withForm(form(land18("l1", 120, "333333331"), land18("l2", 90, "222222223"), H18()), NONINT),
    house: withForm(form(H18(), land18("l1", 120, "333333331"), land18("l2", 90, "222222223")), NONINT),
  },
  {
    name: "첫 자산 토지 미등기(폼 전역) → 토지 자산 값",
    land: withForm(form(L("l1"), HOUSE(0)), { isUnregistered: true }),
    house: form(HOUSE(0), { ...L("l1"), isUnregistered: true }),
  },
];

describe("parity — swap(form(LAND…, HOUSE)) ≡ form(HOUSE, LAND…)", () => {
  for (const s of samples) {
    it(`🔑 ${s.name}: 폼·⑧ 이슈·④ 본문·route 총세액·properties가 같다`, async () => {
      const sw = swapped(s.land);
      // 1) 폼 자체가 자산 단위로 깊게 같다(주 자산 배지·라벨·미등기 포함)
      expect(sw.assets).toEqual(s.house.assets);
      expect(sw.isUnregistered).toBe(s.house.isUnregistered);
      // 2) ⑧ — 막지 않는다(주택 먼저와 같은 이슈 목록, 역방향 차단 0건)
      expect(blocked(allIssues(sw))).toEqual([]);
      expect(allIssues(sw)).toEqual(allIssues(s.house));
      // 3) ④ 본문 · route 총세액 · properties
      const a = await runCalc(sw);
      const b = await runCalc(s.house);
      expect(a.body).toEqual(b.body);
      expect(aggOf(a).totalTax).toBe(aggOf(b).totalTax);
      if (s.name.startsWith("과세")) expect(aggOf(a).totalTax).toBeGreaterThan(0);
      if (s.name.startsWith("첫 자산 토지 미등기")) expect(aggOf(a).totalTax).toBeGreaterThan(0);
      expect(aggOf(a).properties).toEqual(aggOf(b).properties);
    });
  }

  it("교환 전(토지 먼저)은 ⑧이 막고 교환 후는 막지 않는다", () => {
    const f = form(L("l1"), HOUSE(0)) as F;
    expect(blocked(allIssues(f))).toHaveLength(1);
    expect(blocked(allIssues(swapped(f)))).toEqual([]);
  });

  it("④ 본문 — 교환 후 주택이 최상위로 정착면적·소재지 구분·도시지역 여부를 싣는다(컴패니언 주택에는 안 실리던 값)", async () => {
    const before = await captureBody(form(L("l1"), HOUSE(0)));
    const after = await captureBody(swapped(form(L("l1"), HOUSE(0)) as F));
    expect(before.buildingFootprintArea).toBeUndefined();
    expect(after.buildingFootprintArea).toBe(100);
    expect(after.appurtenantLandZone).toBe("metropolitan_residential");
    expect(after.isUrbanArea).toBe(true);
  });

  it("안분 모드 비정수 시료는 실제로 ±1원 경계다 — 단순 교환(순서 뒤집힘)이면 properties가 달라진다(시료가 순서를 가리는지 확인)", async () => {
    const s = samples[2];
    const rotated = await runCalc(swapped(s.land));
    // 토지 순서를 뒤집은 주택 먼저 폼(= 단순 교환의 결과)
    const flipped = await runCalc(withForm(form(H18(), land18("l2", 90, "222222223"), land18("l1", 120, "333333331")), NONINT));
    const prices = (r: Awaited<ReturnType<typeof runCalc>>) =>
      Object.fromEntries(aggOf(r).properties.map((p) => [p.propertyId, p.transferPrice]));
    expect(prices(rotated)).not.toEqual(prices(flipped));
  });
});
