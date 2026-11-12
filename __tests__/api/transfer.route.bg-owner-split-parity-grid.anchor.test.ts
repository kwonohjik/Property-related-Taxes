/**
 * 부담부증여 × 토지·건물 소유자 분리 — ⑧(화면 검증) ↔ ⑫(서버) 격자 전수 대조 (계획서 `bg-owner-split-159.plan.md` §7 · PR-3).
 *
 * 불변식(UI 통과 ↔ 서버 400 모순 금지 — memory `feedback_fe8_vs_12_parity_grid`):
 *  I1. ⑧ 통과 ⇒ 서버 200.
 *  I2. 서버 200 ⇒ ⑧ 통과 — 단 폼 확인·일반 소유자 분리와 같은 규칙인 «서버가 막을 근거가 없는» 항목은 의도된 예외(`ATTESTATION_ONLY`)다.
 * 범위 격자(종류 × 소유 × 취득원인 × 평가 × 지분 × 묶음)는 입력을 모두 채우고, 입력 격자(범위 안 × 생략 칸)는 한 칸씩 비운다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE } from "@/lib/calc/bg-owner-split-scope";
import { asset, bldg, land, run } from "./_bg-owner-split-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 일반 부담부증여 ⑧이 먼저 요구하는 단일 칸 — 범위 밖 시료가 소유자 분리 사유까지 닿게 채운다. */
const G = { standardPriceAtTransfer: "1,000,000,000", standardPriceAtAcq: "500,000,000", bgMarketValueAtTransfer: "1,000,000,000", bgPresumedAcquisitionTotal: "300,000,000", decedentAcquisitionDate: "2000-01-01", donorAcquisitionDate: "2000-01-01" };
const MKT = { bgValuationMode: "sangjeungbeop_market", bgMarketValueOwnedPart: "200,000,000" };
const VALUATION: Record<string, Record<string, unknown>> = {
  std: {},
  "market-actual": { ...MKT, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" },
  "market-converted": { ...MKT, bgAcquisitionMethod: "converted" },
  "market-salesCase": { ...MKT, bgAcquisitionMethod: "salesCase" },
  "market-appraisal": { ...MKT, bgAcquisitionMethod: "appraisal" },
};
const CAUSE: Record<string, Record<string, unknown>> = { purchase: {}, inheritance: { acquisitionCause: "inheritance" }, gift: { acquisitionCause: "gift" } };
const OWN: Record<string, Record<string, unknown>> = {
  building_only: bldg("200,000,000", "80,000,000"),
  land_only: land("1,000,000", "200", "400,000", "200"),
};
const KIND: Record<string, Record<string, unknown>> = { building: {}, housing: { assetKind: "housing" } };

describe("범위 격자 — 종류 × 소유 × 취득원인 × 평가 × 묶음 (입력은 모두 채움)", () => {
  const rows: Array<{ id: string; assets: () => ReturnType<typeof asset>[] }> = [];
  for (const [k, kind] of Object.entries(KIND))
    for (const [o, own] of Object.entries(OWN))
      for (const [c, cause] of Object.entries(CAUSE))
        for (const [v, val] of Object.entries(VALUATION))
          for (const bundled of [false, true]) {
            const make = (id: number) => asset(id, { ...G, ...own, ...val, ...cause, ...kind });
            rows.push({ id: `${k} · ${o} · ${c} · ${v} · ${bundled ? "묶음" : "단건"}`, assets: () => (bundled ? [make(1), make(2)] : [make(1)]) });
          }

  it("I1·I2 — ⑧ 통과 ⇔ 서버 200, ⑧ 차단 ⇔ 서버 400 (격자 전수)", async () => {
    const mismatches: string[] = [];
    let ok = 0;
    let blocked = 0;
    for (const row of rows) {
      const r = await run(row.assets());
      const uiPass = r.issues.length === 0;
      const serverPass = r.status === 200;
      if (uiPass && !serverPass) mismatches.push(`UI 통과 ↔ 서버 ${r.status}: ${row.id}`);
      if (!uiPass && serverPass) mismatches.push(`UI 차단 ↔ 서버 200: ${row.id} (${r.issues.map((i) => i.field).join(",")})`);
      // 범위 밖이면 두 층이 같은 머리말 문구를 낸다
      const uiScope = r.issues.some((i) => i.message.includes(BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE));
      const serverScope = r.text.includes(BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE);
      if (uiScope !== serverScope) mismatches.push(`범위 사유 ⑧=${uiScope} ⑫=${serverScope}: ${row.id}`);
      if (uiPass) ok++;
      else blocked++;
    }
    expect(mismatches).toEqual([]);
    // 격자가 비어 있지 않다 — 범위 안(통과)과 밖(차단)이 모두 있다
    expect(ok).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
    expect(rows.length).toBe(2 * 2 * 3 * 5 * 2);
  }, 600_000);
});

describe("입력 격자 — 범위 안에서 한 칸씩 비움", () => {
  /** ⑧만 요구하는 항목 — 서버가 막을 근거가 없다(폼 확인 · 일반 소유자 분리와 같은 규칙: API는 취득일 분리 토글을 보내지 않는다). */
  const ATTESTATION_ONLY = new Set(["bgOwnerSplitDebtConfirmed", "landAcquisitionDate"]);

  type Omit_ = { name: string; field: string; patch: Record<string, unknown> };
  const stdBldg: Omit_[] = [
    { name: "양도시 건물 기준시가", field: "buildingStandardPriceAtTransfer", patch: { buildingStandardPriceAtTransfer: "" } },
    { name: "취득시 건물 기준시가", field: "buildingStandardPriceAtAcq", patch: { buildingStandardPriceAtAcq: "" } },
    { name: "채무 확인", field: "bgOwnerSplitDebtConfirmed", patch: { bgOwnerSplitDebtConfirmed: false } },
  ];
  const stdLand: Omit_[] = [
    { name: "양도시 공시지가", field: "standardPricePerSqmAtTransfer", patch: { standardPricePerSqmAtTransfer: "" } },
    { name: "양도시 면적", field: "transferArea", patch: { transferArea: "" } },
    { name: "취득시 공시지가", field: "standardPricePerSqmAtAcq", patch: { standardPricePerSqmAtAcq: "" } },
    { name: "취득시 면적", field: "acquisitionArea", patch: { acquisitionArea: "" } },
    { name: "토지 취득일", field: "landAcquisitionDate", patch: { landAcquisitionDate: "" } },
    { name: "채무 확인", field: "bgOwnerSplitDebtConfirmed", patch: { bgOwnerSplitDebtConfirmed: false } },
  ];
  const mkt: Omit_[] = [
    { name: "증여한 부분 시가", field: "bgMarketValueOwnedPart", patch: { bgMarketValueOwnedPart: "" } },
    { name: "양도시 기준시가(엔진 입력 계약)", field: "buildingStandardPriceAtTransfer", patch: { buildingStandardPriceAtTransfer: "" } },
  ];

  const table: Array<{ id: string; field: string; form: () => ReturnType<typeof asset> }> = [];
  for (const o of stdBldg) table.push({ id: `건물만 · 기준시가 · ${o.name}`, field: o.field, form: () => asset(1, { ...OWN.building_only, ...o.patch }) });
  for (const o of stdLand) table.push({ id: `토지만 · 기준시가 · ${o.name}`, field: o.field, form: () => asset(1, { ...OWN.land_only, ...o.patch }) });
  for (const o of mkt) table.push({ id: `건물만 · 시가 실지 · ${o.name}`, field: o.field, form: () => asset(1, { ...OWN.building_only, ...VALUATION["market-actual"], ...o.patch }) });
  for (const o of [...mkt, { name: "취득시 건물 기준시가", field: "buildingStandardPriceAtAcq", patch: { buildingStandardPriceAtAcq: "" } }])
    table.push({ id: `건물만 · 시가 환산 · ${o.name}`, field: o.field, form: () => asset(1, { ...OWN.building_only, ...VALUATION["market-converted"], ...o.patch }) });
  table.push({ id: "건물만 · 시가 실지 · 실지취득가액 총액", field: "bgActualAcquisitionTotal", form: () => asset(1, { ...OWN.building_only, ...VALUATION["market-actual"], bgActualAcquisitionTotal: "" }) });

  it("⑧이 짚는 칸 = 그 칸 하나 · ATTESTATION_ONLY 밖은 서버도 같은 입력을 막는다 (UI 통과 ↔ 서버 400 · 서버 통과 ↔ UI 차단 0건)", async () => {
    const mismatches: string[] = [];
    const rowsOut: string[] = [];
    for (const row of table) {
      const r = await run([row.form()]);
      const fields = r.issues.map((i) => i.field);
      rowsOut.push(`${row.id} → ⑧[${fields.join(",")}] 서버 ${r.status}`);
      if (fields.length !== 1 || fields[0] !== row.field) mismatches.push(`⑧ 칸 불일치 ${row.id}: ${fields.join(",") || "(통과)"}`);
      if (fields.length > 0 && r.status === 200 && !ATTESTATION_ONLY.has(row.field)) mismatches.push(`UI 차단 ↔ 서버 200: ${row.id}`);
      if (fields.length === 0 && r.status !== 200) mismatches.push(`UI 통과 ↔ 서버 ${r.status}: ${row.id}`);
    }
    expect(mismatches, rowsOut.join("\n")).toEqual([]);
  }, 600_000);
});
