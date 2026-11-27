/**
 * ⑧↔⑫ 패리티 격자 (국외 부동산 U1) — 서버 Zod가 막는 모든 입력을 ⑧(`collectForeignIssues`)이 **같은 입력칸**으로 막는가.
 *
 * ⑧은 서버 ⑩ refine(`FOREIGN_RE_REFINES`)을 같은 빌더(`buildForeignRealEstateBody`)의 결과에 그대로 돌리므로 refine 쪽은 구조적으로 일치한다 —
 * 이 격자가 고정하는 것은 (1) 서버 오류 경로 → 화면 입력칸 매핑이 빠지지 않았다 (2) ⑨ 기본 모양(종류·통화·건수 상한)을 ⑧이 같은 값으로 막는다
 * (3) 새 refine이 추가되면 이 격자에 행이 없어 실패한다(완전성 가드). UI 통과 ↔ API 차단 모순이 없는지(⑧ ⊇ ⑫)는 모든 행에서 확인한다.
 */
import { describe, it, expect } from "vitest";
import { foreignRealEstateInputSchema, FOREIGN_RE_MAX_ASSETS, FOREIGN_RE_MAX_ROWS } from "@/lib/api/transfer-foreign-schema";
import { FOREIGN_RE_REFINES } from "@/lib/api/transfer-foreign-refines";
import { buildForeignRealEstateBody } from "@/lib/calc/transfer-foreign-body";
import { collectForeignIssues } from "@/lib/calc/transfer-tax-validate-foreign";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { foreignForm, gainAsset2, k1Asset } from "./_foreign-form-fixture";

const row = (date: string, amountForeign: string, exchangeRate: string) => ({ date, amountForeign, exchangeRate });
const taxOn = (): Partial<TransferFormData> => ({ foreignTaxEnabled: true });

interface Row {
  name: string;
  /** 이 결함을 지키는 서버 refine id · `base`=⑨ 기본 모양 · `screen`=화면 필수(서버는 모름) */
  owner: string;
  form: TransferFormData;
  /** ⑧ 이슈가 가리켜야 하는 입력칸(`data-field`). 폼 전역 이슈(칸 없음)는 생략 */
  field?: string;
  /** 서버(⑫)도 막는가 — false면 ⑧이 더 엄격한 행(화면 필수) */
  server: boolean;
}

const withRows = (a: Partial<ReturnType<typeof k1Asset>>, f: Partial<TransferFormData> = {}) => foreignForm(f, [k1Asset(a)]);
const manyRows = (n: number) => Array.from({ length: n }, () => row("2026-07-10", "1", "1100"));

const GRID: Row[] = [
  // ── 거주 연수 · 건수 · id
  { name: "거주 연수 소수", owner: "residence-years", form: foreignForm({ foreignResidenceYears: "5.5" }), field: "foreignResidenceYears", server: true },
  { name: "거주 연수 음수", owner: "residence-years", form: foreignForm({ foreignResidenceYears: "-1" }), field: "foreignResidenceYears", server: true },
  { name: "거주 연수 빈 칸(0년으로 읽지 않는다)", owner: "residence-years", form: foreignForm({ foreignResidenceYears: "" }), field: "foreignResidenceYears", server: true },
  { name: "자산 0건", owner: "assets-present", form: foreignForm({}, []), server: true },
  // ── 날짜 유효성
  { name: "양도일 잘못된 날짜", owner: "asset-dates-valid", form: withRows({ transferDate: "2026-13-45" }), field: "foreignAsset.transferDate", server: true },
  { name: "취득일 잘못된 날짜", owner: "asset-dates-valid", form: withRows({ acquisitionDate: "2026-13-45" }), field: "foreignAsset.acquisitionDate", server: true },
  { name: "양도일 빈 칸", owner: "asset-dates-valid", form: withRows({ transferDate: "" }), field: "foreignAsset.transferDate", server: true },
  { name: "양도비 지출일 잘못된 날짜", owner: "asset-dates-valid", form: withRows({ costRows: [row("x", "30000", "1100")] }), field: "foreignAsset.costRows.0.date", server: true },
  { name: "자본적지출 지출일 빈 칸", owner: "asset-dates-valid", form: withRows({ capitalRows: [row("", "10000", "1100")] }), field: "foreignAsset.capitalRows.0.date", server: true },
  { name: "외국납부세액 납부일 빈 칸", owner: "asset-dates-valid", form: withRows({ taxRows: [row("", "1000", "1100")] }, taxOn()), field: "foreignTaxRow.0.0.date", server: true },
  // ── 환율·외화액 (fallback 없음)
  { name: "양도일 환율 빈 칸", owner: "asset-money", form: withRows({ transferRate: "" }), field: "foreignAsset.transferRate", server: true },
  { name: "양도일 환율 0", owner: "asset-money", form: withRows({ transferRate: "0" }), field: "foreignAsset.transferRate", server: true },
  { name: "취득일 환율 빈 칸", owner: "asset-money", form: withRows({ acquisitionRate: "" }), field: "foreignAsset.acquisitionRate", server: true },
  { name: "양도비 환율 빈 칸 — 양도일 환율로 대체하지 않는다", owner: "asset-money", form: withRows({ costRows: [row("2026-07-10", "30000", "")] }), field: "foreignAsset.costRows.0.rate", server: true },
  { name: "자본적지출 환율 0", owner: "asset-money", form: withRows({ capitalRows: [row("2026-07-10", "10000", "0")] }), field: "foreignAsset.capitalRows.0.rate", server: true },
  { name: "환율 소수 5자리", owner: "asset-money", form: withRows({ transferRate: "1100.12345" }), field: "foreignAsset.transferRate", server: true },
  { name: "외화액 소수 5자리", owner: "asset-money", form: withRows({ acquisitionAmount: "400000.12345" }), field: "foreignAsset.acquisitionAmount", server: true },
  { name: "외화액 상한 초과", owner: "asset-money", form: withRows({ transferAmount: "1000000000000" }), field: "foreignAsset.transferAmount", server: true },
  { name: "환율 상한 초과", owner: "asset-money", form: withRows({ transferRate: "100000000" }), field: "foreignAsset.transferRate", server: true },
  { name: "외국납부세액 환율 빈 칸", owner: "asset-money", form: withRows({ taxRows: [row("2026-07-10", "1000", "")] }, taxOn()), field: "foreignTaxRow.0.0.rate", server: true },
  { name: "외국납부세액 환율 소수 5자리(필요경비 산입도 같다)", owner: "asset-money", form: withRows({ taxRows: [row("2026-07-10", "1000", "1000.12345")] }, { foreignTaxEnabled: true, foreignTaxMethod: "expense" }), field: "foreignTaxRow.0.0.rate", server: true },
  // ── 날짜 관계 · 지원 개시 · 과세기간
  { name: "취득일이 양도일보다 늦음", owner: "acquisition-not-after-transfer", form: withRows({ acquisitionDate: "2026-08-01" }), field: "foreignAsset.acquisitionDate", server: true },
  { name: "양도일 2019-12-31 (지원 개시 2020-01-01 전)", owner: "transfer-date-supported", form: withRows({ acquisitionDate: "2015-01-01", transferDate: "2019-12-31" }), field: "foreignAsset.transferDate", server: true },
  { name: "과세기간이 다른 2건", owner: "same-tax-year", form: foreignForm({}, [k1Asset(), gainAsset2({ transferDate: "2025-03-05" })]), field: "foreignAsset.transferDate", server: true },
  // ── 양도차손 + 양도차익 혼재
  {
    name: "양도차손 자산 + 양도차익 자산",
    owner: "loss-gain-mix",
    form: foreignForm({}, [k1Asset(), gainAsset2({ acquisitionAmount: "900000", transferAmount: "100000" })]),
    server: true,
  },
  // ── ⑨ 기본 모양 (화면이 같은 값으로 막는다)
  { name: "자산 종류 = 부동산에 관한 권리(v1 body에 없다)", owner: "base", form: withRows({ kind: "right" }), field: "foreignAsset.kind", server: true },
  { name: "통화 «기타» 코드 미입력", owner: "base", form: withRows({ currency: "" }), field: "foreignAsset.currency", server: true },
  { name: "통화 코드 소문자", owner: "base", form: withRows({ currency: "usd" }), field: "foreignAsset.currency", server: true },
  { name: "자산 21건(상한 20)", owner: "base", form: foreignForm({}, Array.from({ length: FOREIGN_RE_MAX_ASSETS + 1 }, (_, i) => k1Asset({ address: `A${i}` }))), server: true },
  { name: "양도비 51행(상한 50)", owner: "base", form: withRows({ costRows: manyRows(FOREIGN_RE_MAX_ROWS + 1) }), field: "foreignAsset.costRows.0.date", server: true },
  { name: "자본적지출 51행(상한 50)", owner: "base", form: withRows({ capitalRows: manyRows(FOREIGN_RE_MAX_ROWS + 1) }), field: "foreignAsset.capitalRows.0.date", server: true },
  {
    name: "외국납부세액 51행(상한 50 — 자산 합계)",
    owner: "base",
    form: foreignForm(taxOn(), [k1Asset({ taxRows: manyRows(30) }), gainAsset2({ taxRows: manyRows(21) })]),
    field: "foreignTaxEnabled",
    server: true,
  },
  // ── 화면 필수 (서버는 모름 — ⑧이 더 엄격)
  { name: "양도가액(외화) 빈 칸", owner: "screen", form: withRows({ transferAmount: "" }), field: "foreignAsset.transferAmount", server: false },
  { name: "취득가액(외화) 빈 칸", owner: "screen", form: withRows({ acquisitionAmount: "" }), field: "foreignAsset.acquisitionAmount", server: false },
  { name: "소재 국가 미선택", owner: "screen", form: withRows({ countryCode: "" }), field: "foreignAsset.country", server: false },
  { name: "소재지 빈 칸", owner: "screen", form: withRows({ address: "  " }), field: "foreignAsset.address", server: false },
  { name: "필요경비 행 일부만 입력(금액 빈 칸)", owner: "screen", form: withRows({ costRows: [row("2026-07-10", "", "1100")] }), field: "foreignAsset.costRows.0.amount", server: false },
  { name: "외국납부세액 ON인데 납부 내역 0행", owner: "screen", form: withRows({ taxRows: [] }, taxOn()), field: "foreignTaxEnabled", server: false },
];

function serverBlocks(form: TransferFormData): boolean {
  const { body } = buildForeignRealEstateBody(form);
  return !foreignRealEstateInputSchema.safeParse(JSON.parse(JSON.stringify(body))).success;
}

describe("⑧↔⑫ 격자 — 서버가 막는 모든 행을 ⑧이 같은 입력칸으로 막는다", () => {
  it.each(GRID.map((r) => [r.name, r] as const))("%s", (_name, r) => {
    const issues = collectForeignIssues(r.form);
    expect(issues.length).toBeGreaterThan(0);
    if (r.field) expect(issues.map((i) => i.field)).toContain(r.field);
    // 서버 판정과의 대응 — ⑧ ⊇ ⑫ (⑧이 통과시키는데 서버가 막는 행은 없다)
    expect(serverBlocks(r.form)).toBe(r.server);
  });

  it("카드 안의 칸은 그 카드 인덱스로 가리킨다(둘째 카드 오류 → assetIndex 1)", () => {
    const f = foreignForm({}, [k1Asset(), gainAsset2({ transferRate: "0" })]);
    const hit = collectForeignIssues(f).find((i) => i.field === "foreignAsset.transferRate");
    expect(hit?.assetIndex).toBe(1);
    expect(hit?.message).toContain("국외자산 2");
  });

  it("외국납부세액 행은 카드 밖이라 assetIndex 없이 자산 인덱스를 키에 싣는다", () => {
    const f = foreignForm(taxOn(), [k1Asset(), gainAsset2({ taxRows: [row("2026-07-10", "1000", "0")] })]);
    const hit = collectForeignIssues(f).find((i) => i.field === "foreignTaxRow.1.0.rate");
    expect(hit).toBeDefined();
    expect(hit?.assetIndex).toBeUndefined();
    expect(hit?.message).toContain("국외자산 2");
  });

  it("같은 칸은 한 번만 — 빈 칸 오류와 서버 오류가 겹치지 않는다", () => {
    const issues = collectForeignIssues(withRows({ transferRate: "" }));
    expect(issues.filter((i) => i.field === "foreignAsset.transferRate")).toHaveLength(1);
  });
});

describe("격자 완전성 — 서버 refine이 늘면 이 격자도 늘려야 한다", () => {
  it("모든 refine id가 격자의 어느 행에서 실제로 발화한다(`asset-ids-unique` 제외 — 화면 id가 라벨이라 도달 불가)", () => {
    const fired = new Set<string>();
    for (const g of GRID) {
      const { body } = buildForeignRealEstateBody(g.form);
      for (const r of FOREIGN_RE_REFINES) {
        let hit = false;
        r.run(body, { addIssue: () => (hit = true), path: [] } as never);
        if (hit) fired.add(r.id);
      }
    }
    const unreachable = new Set(["asset-ids-unique"]);
    const missing = FOREIGN_RE_REFINES.map((r) => r.id).filter((id) => !fired.has(id) && !unreachable.has(id));
    expect(missing).toEqual([]);
  });

  it("asset-ids-unique 도달 불가의 근거 — 20건 모두 id(라벨)가 다르다", () => {
    const assets = Array.from({ length: FOREIGN_RE_MAX_ASSETS }, () => k1Asset());
    const ids = buildForeignRealEstateBody(foreignForm({}, assets)).body.assets.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("양성 짝 — 게이트가 정상 입력을 삼키지 않는다", () => {
  it("교재 사례(K-1)는 ⑧ 통과 · 서버도 통과", () => {
    const f = foreignForm();
    expect(collectForeignIssues(f)).toEqual([]);
    expect(serverBlocks(f)).toBe(false);
  });

  it("거주 5년 미만은 차단하지 않는다(서버 not_liable) — 경고만", () => {
    const f = foreignForm({ foreignResidenceYears: "3" });
    expect(collectForeignIssues(f)).toEqual([]);
    expect(serverBlocks(f)).toBe(false);
  });

  it("전부 차손이면 통산할 대상이 없어 통과 · 차익 2건도 통과", () => {
    const loss = (p = {}) => gainAsset2({ acquisitionAmount: "900000", transferAmount: "100000", ...p });
    expect(collectForeignIssues(foreignForm({}, [loss(), loss({ address: "B" })]))).toEqual([]);
    expect(collectForeignIssues(foreignForm({}, [k1Asset(), gainAsset2()]))).toEqual([]);
  });

  it("외국납부세액 ON + 정상 행은 통과 · 서버도 통과", () => {
    const f = withRows({ taxRows: [row("2026-07-10", "1000", "1100")] }, { foreignTaxEnabled: true });
    expect(collectForeignIssues(f)).toEqual([]);
    expect(serverBlocks(f)).toBe(false);
  });
});

describe("FRE-4·FRE-5 국내 불변 · 국외 우회", () => {
  it("국외 폼은 국내 step 0 검증(총 양도가액·자산)을 요구하지 않는다 — collectStepIssues 단일 진입점", () => {
    const f = foreignForm();
    expect(f.contractTotalPrice).toBe("");
    expect(collectStepIssues(0, f)).toEqual([]);
    expect(collectStepIssues(1, f)).toEqual([]);
    expect(collectStepIssues(2, f)).toEqual([]);
    expect(collectStepIssues(3, f)).toEqual([]);
  });

  it("국내 폼은 종전대로 국내 규칙으로 막는다(게이트가 국내를 삼키지 않는다)", () => {
    const d = createDefaultTransferFormData();
    const messages = collectStepIssues(0, d).map((i) => i.message);
    expect(messages).toContain("양도일을 선택하세요.");
    expect(messages).toContain("총 양도가액을 입력하세요.");
  });

  it("소재를 국내로 되돌리면 국외 입력의 오류는 사라지고 국내 규칙만 본다(숨은 값은 지우지 않는다)", () => {
    const f = foreignForm({ assetLocation: "domestic", foreignResidenceYears: "" });
    const fields = collectStepIssues(0, f).map((i) => i.field);
    expect(fields).not.toContain("foreignResidenceYears");
    expect(f.foreignAssets[0].transferAmount).toBe("900000");
  });
});
