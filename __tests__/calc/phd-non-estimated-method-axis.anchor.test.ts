/**
 * anchor — PHD(§164⑦) 플래그 × 취득가액 산정 방식(환산 축): ⑧ 통과 ⇒ route ≠ 400, 비환산에서 PHD 는 세액을 움직이지 않는다 (PR-1)
 * 계획서: docs/00-pm/phd-appraisal-dead-end.plan.md (§1 재현 · §5 설계 · §6.2 격자 D1~D6 · §8.1 Pre-Do)
 *
 * 결함: 취득일 < 2005-04-29 주택이면 ⑤ effect 가 방식과 무관하게 `usePreHousingDisclosure` 를 켠다. 토글은 환산에서만 보이는데 ④ 는 그 플래그를
 * 방식 없이 읽었다 → (A) 플래그만 ON: ⑧ 통과 · route 400(화면에 없는 양도시 파트 기준시가) / (B) 11칸 ON: 200 이지만 감정·매매사례 개산공제 base 소실 → 개산공제 0.
 * 수정: `phdFlagEffective` 가 방식 축(`phdAcqMethodEstimated`)을 AND — ④⑤⑧·다건 ⑧·부수 소비처가 한 술어로 정렬된다.
 *
 * 수정 전 수치(Pre-Do 실측, 대표 셀 — 취득 2003-01-10 · 양도 2026-03-01 · 양도가 10억 · 2주택 · 3억 · 기준시가 2억/4억):
 *   R-1~R-3 실거래가·감정·매매사례 + 플래그만 → ⑧ 0건 · route 400(buildingStandardPriceAtTransfer·landStandardPriceAtTransfer)
 *   R-4 감정 + 11칸 → 200 · 개산공제 0 · 총세액 185,966,000 (플래그 OFF 쌍둥이 = 개산공제 6,000,000 · 184,118,000)
 *   R-5 감정 + 11칸 + 취득일 2010-01-10 → 400(preHousingDisclosure.firstDisclosureDate)
 *   격자(1,332셀): 비환산 × PHD ON 단건 112 · 함께 양도 56 · 다건 168 셀이 ⑧ 통과 ∧ 400
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
import { phdAcqMethodEstimated, phdFlagEffective, phdPayloadActive } from "@/lib/calc/phd-toggle-scope";
import { usesPhdGate } from "@/lib/calc/transfer-lump-sum-base-gate";
import { sellingHouseStdPriceAtTransfer, sellingStdPriceInputElsewhere, sellingStdPriceIssue } from "@/lib/calc/selling-std-price-scope";
import { ownerSplitHousingNeedsBuildingStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import { allPhdIssues } from "./_phd-non-estimated-fixture";
import { SB_APPRAISAL, calc as sbCalc, sbForm } from "./_self-built-housing-fixture";
import { deriveLegacyPartAcqMode, effectivePartAcqMode, isSeparateAcquisition } from "@/lib/calc/transfer-tax-split-acq-mode";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  PHD_ELEVEN,
  PHD_METHODS,
  controlGrid,
  mainGrid,
  phdBundledForm,
  phdForm,
  runPhdCell,
  separateGrid,
  type PhdCell,
  type PhdRow,
} from "./_phd-non-estimated-fixture";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const M = Object.fromEntries(PHD_METHODS) as Record<string, Partial<AssetForm>>;
const FLAG = { usePreHousingDisclosure: true };
const FULL = { usePreHousingDisclosure: true, ...PHD_ELEVEN };
const run = (over: Partial<AssetForm>) => runPhdCell("single", "t", phdForm(over));

describe("재현 R-1~R-7 — 수정 전 실패 (단건 대표 셀)", () => {
  it.each([
    ["R-1 실거래가", "actual"],
    ["R-2 감정", "app"],
    ["R-3 매매사례", "sales"],
  ])("%s + 플래그만 ON → ⑧ 통과 ∧ route 200 (수정 전: 400 — 화면에 없는 양도시 파트 기준시가 요구)", async (_n, m) => {
    const r = await run({ ...M[m], ...FLAG });
    expect(r.issues, r.issueMsgs.join("|")).toBe(0);
    expect(r.status, r.fieldErrors).toBe(200);
    expect(r.phdKey).toBe(false);
    if (m !== "actual") expect(r.stdKey).toBe(true); // 감정·매매사례는 취득시 기준시가(개산공제 base)를 싣는다 — 수정 전: 지웠다
  });

  it("R-4 감정 + 11칸 → 개산공제 6,000,000 · 총세액 184,118,000 = 플래그 OFF 쌍둥이 (수정 전: 개산공제 0 · 185,966,000)", async () => {
    const on = await run({ ...M.app, ...FULL });
    const off = await run({ ...M.app, usePreHousingDisclosure: false });
    expect(on.status).toBe(200);
    expect(on.estDed).toBe(6_000_000);
    expect(on.totalTax).toBe(184_118_000);
    expect(off.totalTax).toBe(184_118_000);
    expect(on.phdKey).toBe(false);
  });

  it("R-5 감정 + 11칸 + 취득일 2010-01-10(≥ 최초공시일) → 200 (수정 전: 400 preHousingDisclosure.firstDisclosureDate)", async () => {
    const r = await run({ ...M.app, ...FULL, acquisitionDate: "2010-01-10" });
    expect(r.status, r.fieldErrors).toBe(200);
  });

  it("R-6 환산 + 플래그만 ON → ⑧ 이 최초 고시일을 요구한다 (환산 경로 불변 — 끌 수 있는 토글이 보인다)", async () => {
    const r = await run({ ...M.est, ...FLAG });
    expect(r.issues).toBeGreaterThan(0);
    expect(r.issueMsgs.some((m) => m.includes("최초 고시일"))).toBe(true);
  });

  it("환산 대조(불변) — PHD OFF 122,518,000 · PHD 11칸 206,154,088(PHD 키 전송)", async () => {
    const off = await run({ ...M.est, usePreHousingDisclosure: false });
    const on = await run({ ...M.est, ...FULL });
    expect(off.totalTax).toBe(122_518_000);
    expect(on.totalTax).toBe(206_154_088);
    expect(on.phdKey).toBe(true);
  });

  it("함께 양도 둘째 이후 자산의 PHD 잔재 + 감정 → 200 · 플래그 OFF 쌍둥이와 응답 동일 (PH-7 — 둘째 자산은 종전부터 영향 없음)", async () => {
    const on = await runPhdCell("companion", "c", phdBundledForm({}, { ...M.app, ...FLAG }));
    const off = await runPhdCell("companion", "c", phdBundledForm({}, { ...M.app, usePreHousingDisclosure: false }));
    expect(on.status).toBe(200);
    expect(on.respSha).toBe(off.respSha);
  });

  it("다건 — 감정 + 플래그 잔재는 «단건 전용» 으로 막지 않고, 환산 + PHD 는 막는다 (Q-6)", async () => {
    const non = await runPhdCell("multi", "m", phdForm({ ...M.app, ...FLAG }));
    const est = await runPhdCell("multi", "m", phdForm({ ...M.est, ...FULL }));
    expect(non.multiBlock).toBeNull();
    expect(non.status, non.fieldErrors).toBe(200);
    expect(est.multiBlock).toContain("단건 계산기");
  });
});

describe("술어 진리표 — phdFlagEffective · usesPhdGate · phdPayloadActive × 방식", () => {
  const house = (over: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-01-10", usePreHousingDisclosure: true, ...over }) as AssetForm;

  it.each(PHD_METHODS.map(([n, o]) => [n, o] as const))("주택 · 플래그 ON · %s → 환산(우선순위 파생)일 때만 PHD 유효", (id, flags) => {
    const a = house(flags);
    const est = id === "est";
    expect(phdAcqMethodEstimated(a)).toBe(est);
    expect(phdFlagEffective(a)).toBe(est);
    expect(usesPhdGate(a, false)).toBe(est); // 첫 자산
    expect(usesPhdGate(a, true)).toBe(false); // 함께 양도 둘째 이후 — 종전부터 false
    expect(phdPayloadActive(a)).toBe(est);
  });

  it("플래그 OFF 는 방식과 무관하게 무효", () => {
    expect(phdFlagEffective(house({ ...M.est, usePreHousingDisclosure: false }))).toBe(false);
  });

  it("적용 밖 — 겸용주택·이월과세·PHD 종류 축 밖(토지)은 방식 축을 보지 않는다(종전 그대로 true)", () => {
    for (const [, flags] of PHD_METHODS) {
      expect(phdFlagEffective(house({ ...flags, isMixedUseHouse: true }))).toBe(true);
      expect(phdFlagEffective(house({ ...flags, acquisitionCause: "carryover_gift" }))).toBe(true);
      expect(phdFlagEffective(house({ ...flags, assetKind: "land" }))).toBe(true);
    }
  });

  it("건물(building) + 토지·건물 취득일 분리 토글(PHD 토글이 닿는 종류): 주택과 같은 방식 축 / 분리 토글 없는 건물은 종류 축 밖이라 종전 그대로", () => {
    const bld = (flags: Partial<AssetForm>, sep: boolean) => house({ ...flags, assetKind: "building", hasSeperateLandAcquisitionDate: sep });
    expect(phdFlagEffective(bld(M.est, true))).toBe(true);
    expect(phdFlagEffective(bld(M.actual, true))).toBe(false);
    expect(phdFlagEffective(bld(M.app, true))).toBe(false);
    expect(phdFlagEffective(bld(M.sales, true))).toBe(false);
    for (const [, flags] of PHD_METHODS) expect(phdFlagEffective(bld(flags, false))).toBe(true); // 종류 축 밖 — 종전 그대로
  });

  it("상속·증여·신축 원인은 방식과 무관하게 종전대로 false (`phdToggleCauseReachable`)", () => {
    for (const cause of ["inheritance", "gift", "newConstruction", "burdened_gift"])
      expect(phdFlagEffective(house({ ...M.est, acquisitionCause: cause as AssetForm["acquisitionCause"] }))).toBe(false);
  });
});

describe("D6 — 방식 leaf ≡ deriveLegacyPartAcqMode · 별개 취득 파트 모드 (순환 import 회피 사본의 동치)", () => {
  const FLAG_COMBOS = PHD_METHODS.map(([n, o]) => [n, o] as const);
  const base = (over: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-01-10", ...over }) as AssetForm;

  it("비별개 취득: 8플래그 조합 전부 leaf === (deriveLegacyPartAcqMode === 'estimated')", { timeout: 60_000 }, () => {
    for (const [id, flags] of FLAG_COMBOS) {
      const a = base(flags);
      expect(phdAcqMethodEstimated(a), id).toBe(deriveLegacyPartAcqMode(a) === "estimated");
      // 토글이 켜진 별개 취득이어도 취득일이 같으면 별개 취득이 아니다 — 같은 규칙
      const same = base({ ...flags, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2003-01-10" });
      expect(isSeparateAcquisition(same), id).toBe(false);
      expect(phdAcqMethodEstimated(same), id).toBe(deriveLegacyPartAcqMode(same) === "estimated");
    }
  });

  it("별개 취득: 파트 모드 5×5 × 8플래그 전부 leaf === 한 파트라도 환산 (⑤ 노출의 파트 조건 · effectivePartAcqMode 와 동일)", { timeout: 60_000 }, () => {
    const parts = ["", "actual", "estimated", "appraisal", "salesCase"] as const;
    let n = 0;
    for (const [id, flags] of FLAG_COMBOS)
      for (const lm of parts)
        for (const bm of parts) {
          const a = base({ ...flags, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2001-05-01", landAcqMode: lm, buildingAcqMode: bm });
          expect(isSeparateAcquisition(a)).toBe(true);
          const partsEst = effectivePartAcqMode(lm, a) === "estimated" || effectivePartAcqMode(bm, a) === "estimated";
          expect(phdAcqMethodEstimated(a), `${id} L=${lm} B=${bm}`).toBe(partsEst);
          n++;
        }
    expect(n).toBe(200);
  });

  it("별개 취득이 아닌 토글만 켜진 경우(두 취득일이 같거나 토지 취득일이 비어 있음): 파트 모드가 남아 있어도 자산 전체 방식이 정본 — isSeparateAcquisition 과 동치", { timeout: 60_000 }, () => {
    const parts = ["", "actual", "estimated", "appraisal", "salesCase"] as const;
    let n = 0;
    for (const [id, flags] of FLAG_COMBOS)
      for (const landDate of ["2003-01-10", ""]) // 같은 날 / 토지 취득일 미입력
        for (const lm of parts)
          for (const bm of parts) {
            const a = base({ ...flags, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: landDate, landAcqMode: lm, buildingAcqMode: bm });
            expect(isSeparateAcquisition(a), `${id} date=${landDate}`).toBe(false);
            expect(phdAcqMethodEstimated(a), `${id} date=${landDate} L=${lm} B=${bm}`).toBe(deriveLegacyPartAcqMode(a) === "estimated");
            n++;
          }
    expect(n).toBe(400);
  });

  it("종전 ⑤ 노출 조건(raw useEstimatedAcquisition ∨ 별개∧파트 환산)과의 차이는 «raw 환산 잔재 ∧ 실제 방식은 환산 아님» 한 갈래뿐이다", { timeout: 60_000 }, () => {
    const parts = ["", "actual", "estimated", "appraisal", "salesCase"] as const;
    let diff = 0;
    let total = 0;
    for (const [id, flags] of FLAG_COMBOS)
      for (const sep of [false, true])
        for (const lm of sep ? parts : [""] as const)
          for (const bm of sep ? parts : [""] as const) {
            const a = base({ ...flags, ...(sep ? { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2001-05-01", landAcqMode: lm, buildingAcqMode: bm } : {}) });
            const isSep = isSeparateAcquisition(a);
            const oldFive = a.useEstimatedAcquisition || (isSep && (effectivePartAcqMode(a.landAcqMode, a) === "estimated" || effectivePartAcqMode(a.buildingAcqMode, a) === "estimated"));
            const next = phdAcqMethodEstimated(a);
            total++;
            if (!!oldFive !== next) {
              diff++;
              // 새 leaf 가 환산이 아니라고 하는 방향으로만 갈린다 — 그리고 그때 종전은 raw 환산 플래그 하나로만 켜져 있었다(실제 우선순위 방식은 감정·매매사례·실거래가·파트 비환산)
              expect(next, `${id} sep=${sep} L=${lm} B=${bm}`).toBe(false);
              expect(a.useEstimatedAcquisition, `${id} sep=${sep} L=${lm} B=${bm}`).toBe(true);
            }
          }
    expect(total).toBe(8 * (1 + 25));
    expect(diff).toBe(60); // 격자가 비어 통과하는 것을 막는다 — raw 환산 잔재 셀: 비별개 3 + 별개 57 (전 208셀 중)
  });
});

describe("형제 소비처 — 양도시 기준시가 칸 · 소유자 분리 건물 기준시가 · 본인 신축 건물분 (같은 술어를 따라간다)", () => {
  const JEONJU = "4511110100"; // 2020-12-18~2022-09-26 조정대상지역 · 가액기준(selling-std-price-value-region.anchor 와 같은 시료)
  const sell = (flags: Partial<AssetForm>, over: Partial<AssetForm> = {}) =>
    ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-01-10", regionCode: JEONJU, usePreHousingDisclosure: true, ...flags, ...over }) as AssetForm;

  it("양도 주택 기준시가(가액기준 지역 중과 판정) — 비환산은 «양도시 기준시가» 칸이 정본, 환산은 PHD 카드 칸이 정본", () => {
    const non = sell(M.app, { standardPriceAtTransfer: "400000000", phdTransferHousingPrice: "" });
    const est = sell(M.est, { standardPriceAtTransfer: "400000000", phdTransferHousingPrice: "250000000" });
    // 수정 전: 비환산 + 플래그 → phdTransferHousingPrice(화면에 없는 칸 = 0) 를 읽어 양도 주택 행 공시가격이 0
    expect(sellingHouseStdPriceAtTransfer(non)).toBe(400_000_000);
    expect(sellingHouseStdPriceAtTransfer(est)).toBe(250_000_000);
    // «다른 칸이 이미 받는가» — 비환산은 아니오(자기 칸이 열린다) / 환산은 예(PHD 카드)
    expect(sellingStdPriceInputElsewhere(non, false)).toBe(false);
    expect(sellingStdPriceInputElsewhere(est, false)).toBe(true);
  });

  it("⑧ 앵커 — 비어 있으면 비환산은 standardPriceAtTransfer(보이는 칸), 환산은 phdTransferHousingPrice (수정 전: 비환산도 보이지 않는 PHD 칸을 지목)", () => {
    const non = sellingStdPriceIssue(sell(M.app, { standardPriceAtTransfer: "", phdTransferHousingPrice: "" }), "2021-06-01");
    const est = sellingStdPriceIssue(sell(M.est, { standardPriceAtTransfer: "", phdTransferHousingPrice: "" }), "2021-06-01");
    expect(non?.field).toBe("standardPriceAtTransfer");
    expect(est?.field).toBe("phdTransferHousingPrice");
  });

  it("소유자 분리 주택의 건물 기준시가(나목) 요구 — 비환산은 PHD 가 대신 도출한다는 면제가 없다(수정 전: 플래그만 있으면 면제)", () => {
    const own = (flags: Partial<AssetForm>) => sell(flags, { selfOwns: "building_only", usePreHousingDisclosure: true });
    expect(ownerSplitHousingNeedsBuildingStd(own(M.est))).toBe(false); // PHD 가 쓰이는 환산 — 종전 그대로
    expect(ownerSplitHousingNeedsBuildingStd(own(M.actual))).toBe(true);
    expect(ownerSplitHousingNeedsBuildingStd(own(M.app))).toBe(true);
  });

  it("본인 신축 × 감정 × PHD 잔재: 건물분 카드가 열려(⑧ 이 건물 감정가액 앵커로 막음) 입력하면 플래그 OFF 쌍둥이와 같은 가산세 (수정 전: 카드 닫힘 → base 자산 전체)", async () => {
    const phd = { usePreHousingDisclosure: true, ...PHD_ELEVEN };
    const filled = { ...SB_APPRAISAL, fixedAcquisitionPrice: "300000000", selfBuiltBuildingAppraisal: "110000000" } as Partial<AssetForm>;
    const missing = allPhdIssues(sbForm({ ...filled, ...phd, selfBuiltBuildingAppraisal: "" }));
    expect(missing.some((i) => i.field === "selfBuiltBuildingAppraisal"), JSON.stringify(missing.map((m) => m.field))).toBe(true);
    const on = await sbCalc(sbForm({ ...filled, ...phd }));
    const off = await sbCalc(sbForm({ ...filled, usePreHousingDisclosure: false }));
    expect(on.status).toBe(200);
    expect(on.result?.penaltyBase).toBe(110_000_000);
    expect(on.result?.penaltyTax).toBe(5_500_000);
    expect(on.result?.totalTax).toBe(off.result?.totalTax);
  });
});

// ─── 격자 D1~D5 ──────────────────────────────────────────────────────────────────
const phdOn = (c: PhdCell) => c.phd !== "off";
/** 우선순위 파생 — 구현(leaf)과 독립적으로 쓴 기대값 */
const nonEstimated = (c: PhdCell) => (c.separate ? !c.method.split("/").includes("estimated") : c.method !== "est");

describe("격자 — ⑧ 통과 ⇒ route ≠ 400 (D1) · 비환산 PHD 비전송 (D2) · 쌍둥이 동치 (D3) · 환산 불변 (D4) · 다건 차단은 환산만 (D5)", () => {
  it("D1~D5 위반 0 (단건 · 함께 양도 · 다건 × 취득일 2 × 방식 8 / 별개 취득 파트 3×3)", { timeout: 900_000 }, async () => {
    const cells = [...mainGrid(), ...separateGrid()];
    const rows = new Map<string, PhdRow>();
    for (const c of cells) rows.set(c.id, await runPhdCell(c.path, c.id, c.form));
    const bad = (f: (c: PhdCell, r: PhdRow) => boolean) => cells.filter((c) => f(c, rows.get(c.id)!)).map((c) => c.id);

    // D1 — 막다른 길 0. 다건은 «단건 전용» 차단(화면에서 계산 전에 막힘)을 통과한 셀만 센다
    expect(bad((c, r) => r.issues === 0 && (c.path !== "multi" || r.multiBlock === null) && r.status === 400), "D1 ⑧ 통과 ∧ 400").toEqual([]);

    // D2 — 비환산 ∧ PHD ON → ④ 본문에 PHD 키 없음 / 환산 ∧ 11칸 ∧ ⑧ 통과 → 있음(양성 대조 — 단건·함께 양도)
    expect(bad((c, r) => phdOn(c) && nonEstimated(c) && r.phdKey), "D2 비환산인데 PHD 키 전송").toEqual([]);
    const estFull = cells.filter((c) => !c.separate && c.method === "est" && c.phd === "full" && c.path !== "multi" && rows.get(c.id)!.issues === 0);
    expect(estFull.length).toBeGreaterThan(10);
    expect(estFull.filter((c) => !rows.get(c.id)!.phdKey).map((c) => c.id), "D2 환산인데 PHD 키 없음").toEqual([]);

    // D3 — 비환산 ∧ PHD ON 셀의 모든 관측값 = 같은 폼에서 플래그만 OFF 한 쌍둥이 (PHD 가 세액·⑧·본문을 움직이지 않는다)
    const targets = cells.filter((c) => phdOn(c) && nonEstimated(c));
    expect(targets.length).toBeGreaterThan(400);
    const twinBad: string[] = [];
    for (const c of targets) {
      const twin = JSON.parse(JSON.stringify(c.form)) as PhdCell["form"];
      twin.assets[0].usePreHousingDisclosure = false;
      const t = await runPhdCell(c.path, c.id, twin);
      const r = rows.get(c.id)!;
      const same = t.issues === r.issues && t.status === r.status && t.totalTax === r.totalTax && t.estDed === r.estDed && t.bodySha === r.bodySha && t.respSha === r.respSha && t.fieldErrors === r.fieldErrors && t.multiBlock === r.multiBlock;
      if (!same) twinBad.push(c.id);
    }
    expect(twinBad, "D3 쌍둥이 불일치").toEqual([]);

    // D4 — 환산 셀: 대표값 고정(206,154,088 / 122,518,000) + 환산 ∧ 플래그만 ON 은 ⑧ 이 계속 막는다
    const e = (id: string) => rows.get(id)!;
    expect(e("single|2003-01-10|est|full|std|s100").totalTax).toBe(206_154_088);
    expect(e("single|2003-01-10|est|off|std|s100").totalTax).toBe(122_518_000);
    expect(bad((c, r) => !c.separate && c.method === "est" && c.phd === "flag" && c.acqDate === "2003-01-10" && c.path === "single" && r.issues === 0), "D4 환산+플래그만인데 ⑧ 통과").toEqual([]);

    // D5 — 다건 «단건 전용» 차단은 환산 ∧ PHD ON 에만 (비환산 셀은 전부 null)
    expect(bad((c, r) => c.path === "multi" && nonEstimated(c) && r.multiBlock !== null), "D5 비환산인데 다건 차단").toEqual([]);
    expect(bad((c, r) => c.path === "multi" && !c.separate && c.method === "est" && phdOn(c) && r.multiBlock === null), "D5 환산 PHD 인데 다건 통과").toEqual([]);

    // 규모 가드 — 격자가 비어 통과하는 것을 막는다
    expect(cells.length).toBeGreaterThan(1000);
    expect(cells.filter((c) => c.separate && nonEstimated(c) && phdOn(c)).length).toBeGreaterThanOrEqual(80);
    expect(cells.filter((c) => c.path === "multi" && nonEstimated(c) && phdOn(c) && rows.get(c.id)!.issues === 0).length).toBeGreaterThanOrEqual(50);
  });
});

describe("대조군 — 겸용·이월과세·비주택·상속·증여 취득은 방식 축 밖: PHD 플래그의 ⑧ 이슈/응답 상태가 방식과 무관하게 종전과 같다(구조 확인)", () => {
  it("대조군 격자가 비어 있지 않다 + 적용 밖 자산 종류의 술어는 방식에 흔들리지 않는다", () => {
    const cells = controlGrid();
    expect(cells.length).toBeGreaterThan(200);
    // 술어는 위 진리표가 잠그고, 응답 바이트 동치는 구현 PR 의 전후 sha256 대조(보고)로 확인했다 — 여기는 시료 존재만 가드한다.
    expect(new Set(cells.map((c) => c.id.split("|")[1])).size).toBeGreaterThanOrEqual(6);
  });
});
