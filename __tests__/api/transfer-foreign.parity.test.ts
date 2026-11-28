/**
 * ⑧↔⑫ 패리티 격자 + 뮤테이션 (PR-4) — 엔진이 던지는 모든 입력 오류가 Zod에서 **같은 코드·같은 경로**로 막히는가.
 *
 * 스키마는 route가 쓰는 `foreignRealEstateInputSchema`(= 기본 모양 + refine 전부)다 — 기본 모양만 쓰면 refine 누락을 못 잡는다
 * (주식 PR-1d′ 교훈). 한 행 = 하나의 결함을 엔진 입력(Date)과 API body(JSON)에 각각 적은 것이다.
 *
 * 소유(owner): 그 행을 막는 refine id. 뮤테이션 테스트가 그 refine만 빼고 같은 body를 다시 검사해 **통과해 버리는지**(= 그 refine이 실제로
 * 지키고 있었는지) 확인한다. owner `base`는 기본 모양(타입·enum)이 막는 행이라 경로만 비교한다(Zod 타입 오류는 엔진 코드가 없다).
 * Zod 오류 객체의 `params.engineCode`가 엔진 `TaxCalculationError.code`와 같고, 이슈 경로가 엔진 `details.path`와 같아야 한다.
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import type { ForeignRealEstateInput } from "@/lib/tax-engine/foreign-realestate/types";
import { foreignRealEstateBaseSchema, foreignRealEstateInputSchema } from "@/lib/api/transfer-foreign-schema";
import { FOREIGN_RE_REFINES, addForeignRealEstateRefines } from "@/lib/api/transfer-foreign-refines";
import { aAsset, bAsset, d, ftax, k1Input, ratesAt, usd } from "../tax-engine/foreign-realestate/_fixtures";

const MISSING = Symbol("missing");
type Edit = [path: string, engineValue: unknown, bodyValue?: unknown];

interface Row {
  name: string;
  /** 이 결함을 막는 refine id — `base`는 기본 모양(경로만 비교) */
  owner: string;
  base?: "single" | "two";
  edits: Edit[];
}

const bases: Record<"single" | "two", () => ForeignRealEstateInput> = {
  single: () => k1Input(), // 자산 a1
  two: () => k1Input({ assets: [aAsset(), bAsset()] }), // a(양도 7/10) · b(양도 3/5)
};

function setPath(root: unknown, path: string, value: unknown): void {
  const segs = path.split(".");
  let node = root as Record<string, unknown>;
  for (const s of segs.slice(0, -1)) node = node[s] as Record<string, unknown>;
  const last = segs[segs.length - 1];
  if (value === MISSING) delete node[last];
  else node[last] = value;
}
const roundtrip = (v: unknown) => (v === MISSING ? MISSING : JSON.parse(JSON.stringify(v)));

function build(row: Row) {
  const engine = structuredClone(bases[row.base ?? "single"]()) as unknown as Record<string, unknown>;
  const body = JSON.parse(JSON.stringify(bases[row.base ?? "single"]())) as Record<string, unknown>;
  for (const [path, ev, bv] of row.edits) {
    setPath(engine, path, ev);
    setPath(body, path, bv === undefined ? roundtrip(ev) : bv);
  }
  return { engine: engine as unknown as ForeignRealEstateInput, body };
}

const dotPath = (p: string) => p.replace(/\[(\d+)\]/g, ".$1");
const BAD_DATE = new Date(Number.NaN);

/** 엔진이 던지는 {code, path} — 던지지 않으면 null */
function engineOutcome(input: ForeignRealEstateInput) {
  try {
    calc(input, ratesAt("2026-07-10"));
    return null;
  } catch (e) {
    if (!(e instanceof TaxCalculationError)) throw e;
    return { code: e.code as string, path: dotPath(String(e.details?.path ?? "")) };
  }
}

type Issue = { path: PropertyKey[]; params?: { engineCode?: string } };
const issuesOf = (schema: { safeParse: (b: unknown) => { success: boolean; error?: { issues: unknown[] } } }, body: unknown): Issue[] => {
  const r = schema.safeParse(body);
  return r.success ? [] : (r.error!.issues as Issue[]);
};
const issuePath = (i: Issue) => i.path.join(".");

const ROWS: Row[] = [
  // ── 거주 연수 · 자산 건수 · id
  { name: "거주 연수 소수", owner: "residence-years", edits: [["domesticResidenceYears", 5.5]] },
  { name: "거주 연수 음수", owner: "residence-years", edits: [["domesticResidenceYears", -1]] },
  { name: "자산 0건", owner: "assets-present", edits: [["assets", []]] },
  { name: "자산 id 중복", owner: "asset-ids-unique", base: "two", edits: [["assets.1.id", "a"]] },
  // ── 날짜 유효성(잘못된 문자열은 route toDate 전에 막혀야 함)
  { name: "양도일 잘못된 문자열", owner: "asset-dates-valid", edits: [["assets.0.transferDate", BAD_DATE, "not-a-date"]] },
  { name: "취득일 잘못된 문자열", owner: "asset-dates-valid", edits: [["assets.0.acquisitionDate", BAD_DATE, "2026-13-45"]] },
  { name: "양도가액 수령일 잘못된 문자열", owner: "asset-dates-valid", edits: [["assets.0.transfer.date", BAD_DATE, "x"]] },
  { name: "취득가액 지출일 잘못된 문자열", owner: "asset-dates-valid", edits: [["assets.0.acquisition.date", BAD_DATE, "x"]] },
  { name: "양도비 지출일 잘못된 문자열", owner: "asset-dates-valid", edits: [["assets.0.transferCosts.0.date", BAD_DATE, "x"]] },
  {
    name: "자본적지출 지출일 잘못된 문자열",
    owner: "asset-dates-valid",
    edits: [["assets.0.capitalExpenditures", [usd(10_000, "2026-07-10", 1_100)]], ["assets.0.capitalExpenditures.0.date", BAD_DATE, "x"]],
  },
  // ── 환율·외화액 (§178의5① — 항목별 기준환율, fallback 없음)
  { name: "양도가액 환율 0", owner: "asset-money", edits: [["assets.0.transfer.exchangeRate", 0]] },
  { name: "취득가액 환율 음수", owner: "asset-money", edits: [["assets.0.acquisition.exchangeRate", -1_300]] },
  { name: "양도비 환율 0 — 양도일 환율로 대체하지 않는다", owner: "asset-money", edits: [["assets.0.transferCosts.0.exchangeRate", 0]] },
  { name: "환율 소수 5자리", owner: "asset-money", edits: [["assets.0.transfer.exchangeRate", 1_100.12345]] },
  { name: "외화액 소수 5자리", owner: "asset-money", edits: [["assets.0.acquisition.amountForeign", 400_000.12345]] },
  { name: "외화액 음수", owner: "asset-money", edits: [["assets.0.transfer.amountForeign", -1]] },
  { name: "외화액 상한 초과", owner: "asset-money", edits: [["assets.0.transfer.amountForeign", 1e12]] },
  { name: "환율 상한 초과", owner: "asset-money", edits: [["assets.0.transfer.exchangeRate", 1e8]] },
  { name: "원화 환산 안전 정수 초과", owner: "asset-money", edits: [["assets.0.transfer.amountForeign", 1e11], ["assets.0.transfer.exchangeRate", 1e7]] },
  {
    name: "자본적지출 환율 0",
    owner: "asset-money",
    edits: [["assets.0.capitalExpenditures", [usd(10_000, "2026-07-10", 1_100)]], ["assets.0.capitalExpenditures.0.exchangeRate", 0]],
  },
  // ── 날짜 관계 · 지원 개시 · 과세기간
  { name: "취득일이 양도일보다 늦음", owner: "acquisition-not-after-transfer", edits: [["assets.0.acquisitionDate", d("2026-08-01")]] },
  {
    name: "양도일 2019-12-31 (지원 개시 2020-01-01 전)",
    owner: "transfer-date-supported",
    edits: [["assets.0.acquisitionDate", d("2015-01-01")], ["assets.0.transferDate", d("2019-12-31")]],
  },
  { name: "과세기간 다른 2건", owner: "same-tax-year", base: "two", edits: [["assets.1.transferDate", d("2025-03-05")]] },
  // ── 외국납부세액 (§118의6 · 영 §178의7)
  {
    name: "외국납부세액 자산 id가 계산 안에 없음",
    owner: "foreign-tax-items",
    edits: [["foreignTax", { method: "credit", items: [ftax("zz", 1_000, "2026-07-10", 1_000)] }]],
  },
  {
    name: "외국납부세액 환율 0",
    owner: "foreign-tax-items",
    edits: [["foreignTax", { method: "credit", items: [ftax("a1", 1_000, "2026-07-10", 0)] }]],
  },
  {
    name: "외국납부세액 납부일 잘못된 문자열",
    owner: "foreign-tax-items",
    edits: [
      ["foreignTax", { method: "credit", items: [ftax("a1", 1_000, "2026-07-10", 1_000)] }],
      ["foreignTax.items.0.date", BAD_DATE, "x"],
    ],
  },
  {
    name: "외국납부세액 환율 소수 5자리(필요경비 산입방법도 같다)",
    owner: "foreign-tax-items",
    edits: [["foreignTax", { method: "expense", items: [ftax("a1", 1_000, "2026-07-10", 1_000.12345)] }]],
  },
  // ── 기본 모양이 막는 행(경로만 비교)
  {
    name: "외국납부세액 방법 값 오류",
    owner: "base",
    edits: [["foreignTax", { method: "bogus", items: [ftax("a1", 1_000, "2026-07-10", 1_000)] }]],
  },
  {
    name: "외국납부세액 환율 미입력 — 양도일 환율 fallback 없음(K-13)",
    owner: "base",
    edits: [
      ["foreignTax", { method: "credit", items: [ftax("a1", 1_000, "2026-07-10", 1_000)] }],
      ["foreignTax.items.0.exchangeRate", undefined, MISSING],
    ],
  },
  {
    name: "외국납부세액 납부일 미입력",
    owner: "base",
    edits: [
      ["foreignTax", { method: "credit", items: [ftax("a1", 1_000, "2026-07-10", 1_000)] }],
      ["foreignTax.items.0.date", undefined, MISSING],
    ],
  },
  { name: "양도가액 환율 미입력", owner: "base", edits: [["assets.0.transfer.exchangeRate", undefined, MISSING]] },
];

/** 엔진이 던지지 않는 입력 — Zod도 통과해야 한다(게이트가 지나치게 막지 않는다) */
const POSITIVE: Row[] = [
  { name: "K-1 교재", owner: "-", edits: [] },
  { name: "2건 합산", owner: "-", base: "two", edits: [] },
  { name: "양도일 2020-01-01 정각(지원 개시일 포함)", owner: "-", edits: [["assets.0.acquisitionDate", d("2015-01-01")], ["assets.0.transferDate", d("2020-01-01")]] },
  // 차손+차익 혼재는 통산하지 않고 계산한다(사용자 결정 2026-11-28 — 과거엔 loss-gain-mix refine이 막던 행)
  { name: "차손 자산 + 차익 자산 혼재 — 통산하지 않고 계산", owner: "-", base: "two", edits: [["assets.1.transfer", usd(100_000, "2026-03-05", 1_100)]] },
  {
    name: "필요경비 산입방법 외국세가 b를 차손으로 만들어도 혼재는 계산",
    owner: "-",
    base: "two",
    edits: [
      ["assets.1.transfer", usd(261_000, "2026-03-05", 1_000)],
      ["foreignTax", { method: "expense", items: [ftax("b", 2_000, "2026-03-05", 1_000)] }],
    ],
  },
  { name: "거주 5년 미만이면 차손+차익 혼재도 엔진은 not_liable로 반환", owner: "-", base: "two", edits: [["domesticResidenceYears", 4], ["assets.1.transfer", usd(100_000, "2026-03-05", 1_100)]] },
  { name: "전부 차손이면 통산할 대상이 없어 계산", owner: "-", base: "two", edits: [["assets.0.transfer", usd(300_000, "2026-07-10", 1_100)], ["assets.1.transfer", usd(100_000, "2026-03-05", 1_100)]] },
  { name: "외국납부세액 항목 0건이면 §118의6 미적용", owner: "-", edits: [["foreignTax", { method: "credit", items: [] }]] },
  { name: "환율 소수 4자리·JPY식 소수 0자리 외화액", owner: "-", edits: [["assets.0.transfer", usd(90_000_000, "2026-07-10", 9.9123)], ["assets.0.acquisition", usd(40_000_000, "2022-01-15", 9.5)]] },
];

describe("패리티 격자 — 엔진이 던지는 입력은 Zod가 같은 코드·같은 경로로 막는다", () => {
  it.each(ROWS)("$name [$owner]", (row) => {
    const { engine, body } = build(row);
    const thrown = engineOutcome(engine);
    expect(thrown, "엔진이 던지지 않는 결함 행은 격자에 둘 수 없다").not.toBeNull();
    const issues = issuesOf(foreignRealEstateInputSchema, body);
    const match = issues.filter((i) => issuePath(i) === thrown!.path);
    expect(match.length, `Zod 이슈 경로 [${issues.map(issuePath)}] 에 엔진 경로 ${thrown!.path} 없음`).toBeGreaterThan(0);
    if (row.owner !== "base") {
      expect(match.map((i) => i.params?.engineCode), "refine 이슈의 engineCode가 엔진 코드와 같아야 한다").toContain(thrown!.code);
    }
  });

  it.each(POSITIVE)("통과 대조: $name", (row) => {
    const { engine, body } = build(row);
    expect(engineOutcome(engine)).toBeNull();
    expect(issuesOf(foreignRealEstateInputSchema, body)).toEqual([]);
  });

  it("격자는 refine 전부를 소유한다 — 새 refine을 추가하면 패리티 행도 추가해야 한다", () => {
    const owners = new Set(ROWS.map((r) => r.owner));
    for (const r of FOREIGN_RE_REFINES) expect(owners.has(r.id), `${r.id}를 소유하는 행 없음`).toBe(true);
  });
});

describe("뮤테이션 — refine을 하나 빼면 그 refine이 소유한 행이 빨개진다", () => {
  for (const refine of FOREIGN_RE_REFINES) {
    const owned = ROWS.filter((r) => r.owner === refine.id);
    const mutant = addForeignRealEstateRefines(
      foreignRealEstateBaseSchema,
      FOREIGN_RE_REFINES.filter((r) => r.id !== refine.id),
    );
    it.each(owned)(`${refine.id} 제거 → $name 이(가) Zod를 통과해 버린다`, (row) => {
      const { engine, body } = build(row);
      const thrown = engineOutcome(engine)!;
      const hits = issuesOf(mutant, body).filter((i) => issuePath(i) === thrown.path);
      expect(hits, "다른 refine이 같은 경로를 대신 막고 있다(소유 중복)").toEqual([]);
    });
  }

  it("뮤테이션 대조군: refine 전부 제거하면 격자의 refine 소유 행은 하나도 막히지 않는다", () => {
    const none = addForeignRealEstateRefines(foreignRealEstateBaseSchema, []);
    for (const row of ROWS.filter((r) => r.owner !== "base")) {
      const { engine, body } = build(row);
      const thrown = engineOutcome(engine)!;
      expect(issuesOf(none, body).filter((i) => issuePath(i) === thrown.path), row.name).toEqual([]);
    }
  });
});
