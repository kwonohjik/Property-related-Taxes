/**
 * 주택 split 파트 이월과세 P6(증여자 취득가액을 모를 때 파트 환산) — A·B·C 격자가 공유하는 환산 셀 정의.
 *
 * 폼 → ④ body → ⑫ route 와 같은 폼의 ⑧(단계 0·1)을 나란히 돌린다. 기대의 정본은 ⑫(엔진 leaf·refine)가 400으로 내는 칸이다(`feedback_fe8_vs_12_parity_grid`) —
 * ⑧ 기대값을 손으로 적지 않는다. 각 격자 파일이 `registerP6Cells(spec, POST)`를 호출한다(vi.mock은 호출한 테스트 파일의 모듈 그래프에 적용된다).
 *
 * 불변식: (A) ⑧ 통과 ⇒ ⑫ 200 · (B) 분자·분모·같은 날은 ⑧ 차단 ⇔ ⑫ 400 · (C) 환산 OFF 잔재(자산 전체 환산 플래그·남은 분자 값)는 body와 세액을 바꾸지 않는다 ·
 * (D) 분자는 지분 스케일을 받지 않는다(물건 전체 공시가격).
 */
import { describe, it, expect } from "vitest";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bodyOf, routeOf, issuesOf } from "./split-carryover-c-form";

type Part = "land" | "building";
type Patches = Partial<Record<Part, Record<string, unknown>>>;

export interface P6Spec {
  kind: "A" | "B" | "C";
  /** 환산을 켤 수 있는 파트(A 토지 · B 건물 · C 둘 다) */
  parts: Part[];
  /** 폼 조립 — 파트 서브폼 패치 · 자산 덮어쓰기 · 폼 덮어쓰기 */
  make: (patches?: Patches, assetOver?: Record<string, unknown>, formOver?: Partial<TransferFormData>) => TransferFormData;
  /** 증여자 취득일을 상대 파트 취득일과 같게 만드는 패치(S10) */
  sameDay: (part: Part) => Patches;
  /** 양도일 2016.1.1. 전 폼(연혁 면제 경계) — 패치·자산·폼 덮어쓰기 */
  early: { patches: Patches; assetOver: Record<string, unknown>; formOver: Partial<TransferFormData> };
  /** 기준 환산 셀의 분자 */
  numerator?: number;
}

const PREFIX: Record<Part, "landCarryover" | "carryover"> = { land: "landCarryover", building: "carryover" };
const PART_KEY: Record<Part, "landCarryoverPart" | "buildingCarryoverPart"> = { land: "landCarryoverPart", building: "buildingCarryoverPart" };
const STD_FIELD: Record<Part, "landStandardPriceAtTransfer" | "buildingStandardPriceAtTransfer"> = {
  land: "landStandardPriceAtTransfer",
  building: "buildingStandardPriceAtTransfer",
};
const NUM = "30,000,000";
const on = (extra: Record<string, unknown> = {}) => ({ partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: NUM, ...extra });

type RouteFn = Parameters<typeof routeOf>[0];

export function registerP6Cells(spec: P6Spec, POST: RouteFn): void {
  for (const part of spec.parts) {
    const prefix = PREFIX[part];
    const key = PART_KEY[part];
    const label = part === "land" ? "토지" : "건물";
    const only = (p: Record<string, unknown>): Patches => ({ [part]: p });

    describe(`P6 ${spec.kind} · ${label} 환산 — ⑧≡⑫ 격자`, () => {
      it("환산 ON — ⑧ 통과 · ④ 파트에 환산 플래그 + 분자(가액 키 없음) · ⑫ 200 · echo 분자", async () => {
        const form = spec.make(only(on()));
        expect(issuesOf(form)).toEqual([]);
        const body = await bodyOf(form);
        const wire = body[key] as Record<string, unknown>;
        expect(wire.useEstimatedAcquisition).toBe(true);
        expect(wire.donorStandardPriceAtAcquisition).toBe(30_000_000);
        expect("donorAcquisitionPrice" in wire).toBe(false);
        const r = await routeOf(POST, body);
        expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
        const echo = r.json.data.result.splitDetail[part].carryover;
        expect(echo.estimated.donorStdPriceAtAcquisition).toBe(30_000_000);
        expect(echo.donorAcquisitionPrice).toBeUndefined();
      });

      it("환산 OFF(기본) — 파트에 환산 키·분자 키를 싣지 않는다(P1~P5 payload 그대로)", async () => {
        const wire = (await bodyOf(spec.make()))[key] as Record<string, unknown>;
        expect("useEstimatedAcquisition" in wire).toBe(false);
        expect("donorStandardPriceAtAcquisition" in wire).toBe(false);
        expect(typeof wire.donorAcquisitionPrice).toBe("number");
      });

      for (const [name, value] of [["분자 비움", ""], ["분자 0", "0"]] as const) {
        it(`${name} — ⑧ ${prefix}.donorStandardPriceAtAcquisition 차단 ⇔ ⑫ ${key}.donorStandardPriceAtAcquisition 400`, async () => {
          const form = spec.make(only(on({ donorStandardPriceAtAcquisition: value })));
          const issues = issuesOf(form);
          expect(issues[0]?.field).toBe(`${prefix}.donorStandardPriceAtAcquisition`);
          const r = await routeOf(POST, await bodyOf(form));
          expect(r.status).toBe(400);
          expect(Object.keys(r.fieldErrors).some((k) => k.includes(`${key}.donorStandardPriceAtAcquisition`))).toBe(true);
        });
      }

      it("환산 ON인데 증여자 취득가액이 남아 있어도 싣지 않는다 — 세액은 가액을 비운 것과 같다", async () => {
        const stale = spec.make(only(on({ donorAcquisitionPrice: "77,000,000" })));
        const clean = spec.make(only(on()));
        const body = await bodyOf(stale);
        expect("donorAcquisitionPrice" in (body[key] as object)).toBe(false);
        const [a, b] = [await routeOf(POST, body), await routeOf(POST, await bodyOf(clean))];
        expect(a.status).toBe(200);
        expect(a.json.data.result.determinedTax).toBe(b.json.data.result.determinedTax);
      });

      it(`양도시 ${label} 기준시가(분모) 비움 — ⑧ 차단 ⇔ ⑫ 400 (${STD_FIELD[part]})`, async () => {
        const form = spec.make(only(on()), { [STD_FIELD[part]]: "" });
        const issues = issuesOf(form);
        const r = await routeOf(POST, await bodyOf(form));
        expect(issues.length, "⑧ 차단").toBeGreaterThan(0);
        expect(r.status).toBe(400);
        expect(Object.keys(r.fieldErrors).some((k) => k.includes(STD_FIELD[part]))).toBe(true);
      });

      it(`연혁 면제 경계(2016.1.1. 전 양도 + 구분 기재) — 환산 파트의 분모는 면제하지 않는다: ⑧ 차단 ⇔ ⑫ 400`, async () => {
        const { patches, assetOver, formOver } = spec.early;
        const merged: Patches = { ...patches, [part]: { ...patches[part], ...on() } };
        const blank = { ...assetOver, [STD_FIELD[part]]: "" };
        const form = spec.make(merged, blank, formOver);
        const issues = issuesOf(form);
        const r = await routeOf(POST, await bodyOf(form));
        expect(issues.length, `⑧ ${JSON.stringify(issues)}`).toBeGreaterThan(0);
        expect(r.status).toBe(400);
        expect(Object.keys(r.fieldErrors).some((k) => k.includes(STD_FIELD[part]))).toBe(true);
        // 짝 — 분모를 채우면 같은 연혁에서도 통과한다(⑧ 통과 ⇒ ⑫ 200)
        const ok = spec.make(merged, assetOver, formOver);
        expect(issuesOf(ok), "분모 입력 시 ⑧ 통과").toEqual([]);
        const rOk = await routeOf(POST, await bodyOf(ok));
        expect(rOk.status, JSON.stringify(rOk.fieldErrors)).toBe(200);
      });

      it("S10 증여자 같은 날 취득 — 환산이면 ⑧ 차단(앵커 = 환산 토글) ⇔ ⑫ 400, 환산이 아니면 막지 않는다", async () => {
        const same = spec.sameDay(part);
        const form = spec.make({ ...same, [part]: { ...same[part], ...on() } });
        const issues = issuesOf(form);
        expect(issues[0]?.field).toBe(`${prefix}.partEstimated`);
        const r = await routeOf(POST, await bodyOf(form));
        expect(r.status).toBe(400);
        expect(Object.keys(r.fieldErrors).some((k) => k.includes(key))).toBe(true);
        const off = spec.make(same);
        expect(issuesOf(off)).toEqual([]);
        expect((await routeOf(POST, await bodyOf(off))).status).toBe(200);
      });

      it("지분 0.5 — 분자는 지분 스케일을 받지 않는다(물건 전체 공시가격), 증여자 자본적지출은 지분 몫", async () => {
        const form = spec.make(only(on({ donorCapitalExpenditure: "10,000,000" })), { ownershipNumerator: "1", ownershipDenominator: "2" });
        const wire = (await bodyOf(form))[key] as Record<string, unknown>;
        expect(wire.donorStandardPriceAtAcquisition).toBe(30_000_000);
        expect(wire.donorCapitalExpenditure).toBe(5_000_000);
      });

      it("잔재 비누출 — 자산 전체 환산 플래그·estimationMode·남은 분자 값은 환산 OFF 파트의 body·세액을 바꾸지 않는다", async () => {
        const base = await routeOf(POST, await bodyOf(spec.make()));
        const residue = spec.make(
          only({ useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "1,000", donorStandardPriceAtTransfer: "2,000" }),
        );
        const body = await bodyOf(residue);
        const wire = body[key] as Record<string, unknown>;
        expect("useEstimatedAcquisition" in wire).toBe(false);
        expect("donorStandardPriceAtAcquisition" in wire).toBe(false);
        expect(wire.donorAcquisitionPrice).toBeTypeOf("number");
        expect(issuesOf(residue)).toEqual([]);
        const r = await routeOf(POST, body);
        expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
        expect(r.json.data.result.determinedTax).toBe(base.json.data.result.determinedTax);
      });
    });
  }
}
