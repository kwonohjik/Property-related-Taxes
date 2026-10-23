/**
 * anchor — 엔진 엄격화(입력 부재 → throw)가 UI 술어 집합과 같다: ⑧ ↔ ④ ↔ ⑫ ↔ 엔진 격자 (단건 · 함께 양도 · 다건) — Q-12 PR-4
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§9 PR-4)
 *
 * 왜: 엔진이 `selfBuiltHousing` 부재를 던지게 되면(Q-2), 화면이 입력 칸을 보여주지 않는 조합에서 던질 때 사용자가 빠져나갈 수 없다(dead-end).
 * 같은 폼에서 폼 → ⑧ 전 단계 이슈 → ④ 본문 → route(⑫⑭ + 엔진)를 돌려 다음을 센다.
 *   D1 ⑧ 이 통과했는데 엔진이 이 입력 부재로 400  — dead-end (0 이어야 한다)
 *   D2 술어가 범위 안인데 키를 안 싣거나, 범위 밖인데 키를 싣는다 — ④ ↔ 술어 불일치 (0)
 *   D3 술어가 범위 안 ∧ ⑧ 통과인데 200 에 echo 가 없다 — 엔진이 입력을 조용히 무시 (0)
 *   D4 영 §164⑨ 공익수용·공매(PR-A — 종전엔 «200 + 확인 필요 고지, 키 없음» 이던 셀이 뒤집혔다): 다른 조합과 같다 — 고지(자산 전체 base) 0건, 범위 안이면 키 + echo,
 *      환산이면 echo `housingSplit.sec164_9` 가 있고 감정이면 없다(감정은 §164⑨ 무관 · stale 공매 플래그 포함), 보상액 미입력은 ⑧ 이 막는다
 * 엔진이 던지는 셀 중 술어가 범위 밖인 것은 전부 ⑧ 이 먼저 막는 셀(신축·증축 구분 미선택 · 매매사례가 함께 켜진 함께 양도 자산)이다 — 칸이 있는 차단이라 dead-end 가 아니다.
 */
import { describe, it, expect, vi } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }), shouldBypassRateLimit: vi.fn().mockReturnValue(true) };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";
import { allIssues, bundledForm, calc, sbForm } from "./_self-built-housing-fixture";
import { selfBuiltHousingScope } from "@/lib/calc/self-built-housing-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Path = "single" | "companion" | "multi";
const PATHS: Path[] = ["single", "companion", "multi"];

const COMMON: Partial<AssetForm> = { fixedAcquisitionPrice: "300000000", similarSalesValue: "300000000", selfBuiltBuildingAppraisal: "110000000" };
const FLAGS: [string, Partial<AssetForm>][] = [
  ["est", { useEstimatedAcquisition: true }],
  ["app", { useEstimatedAcquisition: false, isAppraisalAcquisition: true }],
  ["sales", { useEstimatedAcquisition: false, isSalesCaseAcquisition: true }],
  ["est+app", { useEstimatedAcquisition: true, isAppraisalAcquisition: true }],
  ["est+sales", { useEstimatedAcquisition: true, isSalesCaseAcquisition: true }],
  ["app+sales", { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: true }],
  ["all3", { useEstimatedAcquisition: true, isAppraisalAcquisition: true, isSalesCaseAcquisition: true }],
];
const BT: [string, Partial<AssetForm>][] = [["new", { buildingType: "new" }], ["none", { buildingType: "" }]];
const SPLIT: [string, Partial<AssetForm>][] = [
  ["none", {}],
  ["sepDate", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01" }],
  ["owner", { selfOwns: "building_only" }],
  ["phd", { usePreHousingDisclosure: true }],
  ["excess", { acquisitionArea: "900", transferArea: "900", buildingFootprintArea: "50", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true }],
];
const X3: Partial<AssetForm> = { transferCause: "public_expropriation", housingCompensationTotal: "300000000", housingCompensationBasisTotal: "350000000" };
const A3: Partial<AssetForm> = { isAuctionTransfer: true, auctionPrice: "300000000" };
const EXPR: [string, Partial<AssetForm>][] = [
  ["none", {}],
  ["expr", X3],
  ["auction", A3],
  // PR-A — 특례 불발(보상액 ≥ H_T 4억) · 보상액 미입력(⑧ 이 막는다) · 1호+2호 플래그 잔재(1호 우선)
  ["exprNotFired", { transferCause: "public_expropriation", housingCompensationTotal: "500000000", housingCompensationBasisTotal: "500000000" }],
  ["exprMissing", { transferCause: "public_expropriation", housingCompensationTotal: "", housingCompensationBasisTotal: "" }],
  ["both", { ...X3, ...A3 }],
];
const DATES: Record<Path, [string, { form: Record<string, unknown>; asset: Partial<AssetForm> }][]> = {
  single: [["open", { form: {}, asset: {} }], ["late", { form: { transferDate: "2027-01-11" }, asset: {} }]],
  multi: [["open", { form: {}, asset: {} }], ["late", { form: { transferDate: "2027-01-11" }, asset: {} }]],
  companion: [["open", { form: {}, asset: {} }], ["late", { form: { transferDate: "2026-06-02" }, asset: {} }]],
};

interface Row {
  id: string;
  split: string;
  expr: boolean;
  scope: boolean;
  issues: number;
  hasKey: boolean;
  status: number;
  sbError: boolean;
  echo: boolean;
  /** echo 방식 — 환산(estimated) | 감정(appraisal) | 없음 */
  method?: string;
  /** 환산 echo `housingSplit.sec164_9` */
  sec: boolean;
  /** 종전(PR-4) 자산 전체 base 고지 — PR-A 부터 어느 셀에도 없어야 한다 */
  legacyNotice: boolean;
  /** 응답에 §164⑨ 특례 detail(분모 H_T′)이 실렸는가 */
  trHousing?: number;
}

async function runCell(path: Path, id: string, split: string, expr: boolean, over: Partial<AssetForm>, formOver: Record<string, unknown>): Promise<Row> {
  let form: ReturnType<typeof sbForm>;
  let subject: AssetForm;
  let status: number;
  let json: unknown;
  let hasKey: boolean;
  if (path === "companion") {
    form = { ...bundledForm({ ...COMMON, ...over }), ...formOver } as never;
    subject = form.assets[1];
    const r = await calc(form);
    ({ status, json } = r);
    hasKey = !!(r.body.companionAssets as Record<string, unknown>[] | undefined)?.[0]?.selfBuiltHousing;
  } else if (path === "single") {
    form = sbForm({ ...COMMON, ...over }, formOver as never);
    subject = form.assets[0];
    const r = await calc(form);
    ({ status, json } = r);
    hasKey = r.body.selfBuiltHousing !== undefined;
  } else {
    form = sbForm({ ...COMMON, ...over }, formOver as never);
    subject = form.assets[0];
    const body = await buildMultiBody([form]);
    hasKey = (body.properties as Record<string, unknown>[])[0].selfBuiltHousing !== undefined;
    const res = await postMulti(body);
    ({ status, json } = res);
  }
  const text = JSON.stringify(json);
  type EchoLike = { method?: string; housingSplit?: { sec164_9?: unknown; transferHousing?: number } };
  type DataLike = { aggregated?: { properties?: { selfBuiltHousingPenalty?: EchoLike }[] }; result?: { selfBuiltHousingPenalty?: EchoLike }; properties?: { selfBuiltHousingPenalty?: EchoLike }[] };
  const d = ((json as { data?: DataLike })?.data ?? {}) as DataLike;
  const echoObj: EchoLike | undefined = path === "companion" ? d.aggregated?.properties?.[1]?.selfBuiltHousingPenalty : path === "single" ? d.result?.selfBuiltHousingPenalty : d.properties?.[0]?.selfBuiltHousingPenalty;
  return {
    id,
    split,
    expr,
    scope: selfBuiltHousingScope(subject, { transferDate: form.transferDate, isNonPrimary: path === "companion" }) !== null,
    issues: allIssues(form).length,
    hasKey,
    status,
    sbError: status === 400 && /selfBuiltHousing/.test(String((json as { error?: { message?: string } })?.error?.message ?? "")),
    echo: /"selfBuiltHousingPenalty"/.test(text),
    method: echoObj?.method,
    sec: !!echoObj?.housingSplit?.sec164_9,
    legacyNotice: /시행령 §164⑨\)가 함께 적용되는 경우/.test(text),
    trHousing: echoObj?.housingSplit?.transferHousing,
  };
}

describe("엄격화 격자 — 던지는 집합 = UI 술어 집합 (단건 · 함께 양도 · 다건)", () => {
  it("D1~D4 위반 0", { timeout: 300_000 }, async () => {
    const rows: Row[] = [];
    for (const path of PATHS)
      for (const [fn, fo] of FLAGS)
        for (const [bn, bo] of BT)
          for (const [dn, d] of DATES[path])
            for (const [sn, so] of SPLIT)
              for (const [en, eo] of EXPR)
                rows.push(await runCell(path, [path, fn, bn, dn, sn, en].join("|"), sn, en !== "none", { isSelfBuilt: true, ...fo, ...bo, ...so, ...eo }, d.form));
    // 범위 밖 자산(건물·토지·상속) 몇 셀 — 던지지 않고 키도 없다
    for (const path of PATHS)
      for (const [fn, fo] of [FLAGS[0], FLAGS[1]])
        for (const [kn, ko] of [["building", { assetKind: "building" }], ["land", { assetKind: "land" }], ["inh", { acquisitionCause: "inheritance" }]] as [string, Partial<AssetForm>][])
          rows.push(await runCell(path, ["B", path, fn, kn].join("|"), "none", false, { isSelfBuilt: true, buildingType: "new", ...fo, ...ko }, {}));

    const bad = (f: (r: Row) => boolean) => rows.filter(f).map((r) => r.id);
    // D1 — ⑧ 통과 ∧ 엔진이 이 입력 부재로 400 (dead-end)
    expect(bad((r) => r.issues === 0 && r.sbError), "D1 dead-end").toEqual([]);
    // 엔진이 던졌는데 술어가 범위 밖인 셀은 전부 ⑧ 이 먼저 막는 셀이어야 한다
    expect(bad((r) => r.sbError && !r.scope && r.issues === 0), "던지는데 ⑧ 이 안 막음").toEqual([]);
    // D2 — ④ 전송 ⇔ 술어 범위 안 (함께 양도 PHD 잔재 등 포함)
    expect(bad((r) => r.scope !== r.hasKey), "D2 술어 ↔ 전송").toEqual([]);
    // D3 — 범위 안 ∧ ⑧ 통과 ⇒ 200 + echo (엔진이 조용히 무시하지 않는다)
    expect(bad((r) => r.scope && r.issues === 0 && !(r.status === 200 && r.echo)), "D3 조용한 무시").toEqual([]);
    // D4 — 종전 «자산 전체 base» 고지는 어느 셀에도 없다(PR-A 로 그 경로가 사라졌다)
    expect(bad((r) => r.legacyNotice), "D4 종전 고지 잔존").toEqual([]);
    // 환산 echo 의 sec164_9 ⇔ 환산 ∧ §164⑨ 입력(보상액·경락가)이 있는 셀 (감정·stale 공매 플래그는 없음) — 범위 안 ∧ ⑧ 통과 ∧ 200 인 셀 전수
    const shown = rows.filter((r) => r.scope && r.issues === 0 && r.status === 200);
    expect(bad((r) => r.method === "estimated" && r.expr && !r.id.includes("|exprMissing") && !r.sec && shown.includes(r)), "D4 환산 × 특례 echo 누락").toEqual([]);
    expect(bad((r) => r.method === "estimated" && !r.expr && r.sec), "D4 특례 없는데 echo").toEqual([]);
    expect(bad((r) => r.method === "appraisal" && r.sec), "D4 감정에 sec164_9").toEqual([]);
    // 보상액 미입력 + 환산은 ⑧ 이 막는다(칸이 화면에 있다) — 범위 안인데 ⑧ 통과가 되면 안 된다
    expect(bad((r) => r.id.endsWith("|exprMissing") && r.scope && r.method === "estimated" && r.issues === 0), "D4 보상액 미입력인데 ⑧ 통과").toEqual([]);
    // 분모 단일 소스 — echo 분모 H_T′ 는 H_T(단건·다건 4억 · 함께 양도 10억+1)를 넘지 않는다. 특례가 걸린 셀(수용·공매 3억)은 H_T 보다 작다
    expect(bad((r) => r.sec && (r.trHousing ?? 0) > (r.id.startsWith("companion") ? 1_000_000_001 : 400_000_000)), "D4 분모가 H_T 초과").toEqual([]);
    expect(rows.filter((r) => r.sec && r.id.endsWith("|expr") && r.id.includes("|est|")).every((r) => r.trHousing === 300_000_000), "수용 3억 분모").toBe(true);
    // 대표 셀: 환산 × 수용/공매/불발/잔재는 200 + 키 + echo + sec, 보상액 미입력은 ⑧ 이 막는다
    for (const path of PATHS)
      for (const en of ["expr", "auction", "exprNotFired", "both"]) {
        const r = rows.find((x) => x.id === [path, "est", "new", "open", "none", en].join("|"))!;
        expect(r.status, r.id).toBe(200);
        expect(r.hasKey && r.echo && r.sec && r.method === "estimated", r.id).toBe(true);
      }
    for (const path of PATHS) {
      const r = rows.find((x) => x.id === [path, "est", "new", "open", "none", "exprMissing"].join("|"))!;
      expect(r.issues, r.id).toBeGreaterThan(0);
    }
    // 감정(첫 자산 감정 우선) 대표 셀: 키 + echo, sec 없음
    for (const path of ["single", "multi"] as Path[])
      for (const en of ["expr", "auction", "both"]) {
        const r = rows.find((x) => x.id === [path, "app", "new", "open", "none", en].join("|"))!;
        expect(r.status, r.id).toBe(200);
        expect(r.hasKey && r.echo && !r.sec && r.method === "appraisal", r.id).toBe(true);
      }
    // 규모 가드 — 격자가 비어 있어서 통과하는 것을 막는다
    expect(rows.length).toBeGreaterThan(2400);
    expect(rows.filter((r) => r.scope && r.issues === 0).length).toBeGreaterThanOrEqual(10);
    expect(rows.filter((r) => r.sbError).length).toBeGreaterThan(0); // 엄격화가 실제로 던지는 셀이 있다
    expect(rows.filter((r) => r.sec).length).toBeGreaterThanOrEqual(30); // 환산 × §164⑨ echo 셀이 실제로 있다(격자가 비어 통과하는 것을 막는다)
    expect(rows.filter((r) => r.id.endsWith("|exprMissing") && r.issues > 0).length).toBeGreaterThan(0);
  });
});
