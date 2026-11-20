/**
 * 2026-11 리뷰 I-10 · 결정 Q-5 — 판정이 과세이고 §155⑦ 농어촌주택·§155② 상속주택이 불성립한 사례에서 계산기 결과에도 그 사유가 나온다.
 * 종전: 평가셋 30건 중 30건이 계산기 경고 0건(리뷰 실측 29건 중 22건 — 표본 차이). 수정 뒤 30건 모두 사유가 보인다(전수 probe 2026-11-21).
 * 판정 메뉴 전용 양론 카드를 가리키는 꼬리는 계산이 따른 입장(과세관청)과 볼 곳으로 바꾼다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import fs from "node:fs";
import path from "node:path";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { buildCaseForm, type RulingCase } from "./harness";
import { handoff, runCalc, runJudgment, withToday } from "../one-house-pr6b/_helpers";

const DIR = path.join(__dirname, "cases");
const byId = (file: string, id: string) =>
  (JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as RulingCase[]).find((c) => c.id === id)!;
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});
const fill = (t: TransferFormData) =>
  ({ ...t, assets: t.assets.map((a, i) => (i === 0 ? { ...a, fixedAcquisitionPrice: a.fixedAcquisitionPrice || "100000000", redevRightsValue: a.redevRightsValue || "100000000" } : a)) }) as TransferFormData;

async function pair(c: RulingCase) {
  const form = buildCaseForm(c);
  return withToday(c.today, async () => {
    const j = (await runJudgment(form)).data?.judgment;
    const k = await runCalc(fill(handoff(form)));
    const unmet = (j?.unmetExceptions ?? []).filter((u: { id: string }) => u.id.startsWith("155-7-rural:") || u.id === "155-2-inherited-house");
    return { j, warnings: (k.result?.warnings ?? []) as string[], unmet: unmet as { id: string; reasons: string[] }[] };
  });
}

describe("I-10 계산기 결과의 §155⑦·§155② 불성립 사유", () => {
  it.each([
    ["E147.json", "E147-era"],
    ["E156.json", "E156-dual"],
    ["E071.json", "E071-era"],
  ])("%s %s — 판정 과세 · 불성립 사유가 계산기 경고에 있다", async (file, id) => {
    const { j, warnings, unmet } = await pair(byId(file, id));
    expect(j?.isExempt).toBe(false);
    expect(unmet.length).toBeGreaterThan(0);
    expect(unmet.some((u) => u.reasons.some((r) => warnings.some((w) => w.includes(r.split(" — ")[0]))))).toBe(true);
  });
  it("E091-era — 2017.2.3. 전 공동상속 소수지분: 양론 카드 대신 계산이 따른 입장과 판정 메뉴를 가리킨다", async () => {
    const { warnings } = await pair(byId("E091.json", "E091-era"));
    const w = warnings.find((x) => x.includes("공동상속주택(소수지분)"));
    expect(w).toBeDefined();
    expect(w).toContain("이 계산은 과세관청 해석을 따랐습니다");
    expect(w).not.toContain("해석이 갈리는 쟁점");
  });
});
