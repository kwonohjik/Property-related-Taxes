/**
 * anchor (결정 #8 · S05-3) — 상속 권리(§156의2⑥·⑦ · §156의3④·⑤)의 「상속개시 당시 보유한 주택」을 날짜로 판정한다.
 *
 * 조문(KoreanLaw MCP — 「소득세법 시행령」 현행 MST 290841): §156의2⑥·§156의3④ 괄호 「그 밖의 주택(상속개시 당시 보유한 주택
 * 또는 상속개시 당시 보유한 조합원입주권[분양권]에 의하여 사업시행 완료 후 취득한 신축주택만 해당하며 …)」, 같은 영 §162①5호
 * (상속 자산의 취득시기 = 상속이 개시된 날). §156의2⑦ 후단·§156의3⑤ 후단에는 신축주택을 포함하는 문구가 없다.
 *
 * 변경 전(master 6362a525b·본 작업 직전) 실측: 판정 메뉴에서 상속 후에 산 주택도 비과세(판정 보류 카드만), 토글 「보유하고 있었다」는
 * 켜기만 가능. 이제 분양권은 행 취득일, 입주권은 `inheritedDate` 칸, 신축주택 갈래는 ⑥·④ 모양에서만 — 모름은 불성립 + 확인 필요.
 * 경로: 판정 메뉴 전 구간(폼 → ④ → ⑫ → route ⑭ → 엔진) + 계산기 ④ 빌더 + 다건 ④.
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
import {
  buildInheritanceGeneralHousePayload,
  generalHouseRightAtInheritanceVisible,
} from "@/lib/calc/inheritance-general-house-scope";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { clause2BlocksSurchargeDeeming, clause2SurchargeDeemed } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const rightRow = (asset: Record<string, unknown>, right: Record<string, unknown>, extra: Record<string, unknown> = {}): RulingCase => ({
  id: "S05-3-probe",
  docNo: "",
  docDate: "",
  basis: "current",
  today: "2026-10-11",
  summary: "probe",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: "2026-05-20",
    contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-06-01", ...asset },
    presaleRights: [
      { id: "r", type: "redevelopment_right", memberOrigin: "successor", acquisitionDate: "2017-01-10", region: "capital", isInherited: true, ...right },
    ],
    ...extra,
  } as never,
});

describe("#8-J — 판정 메뉴 전 구간: 입주권 상속개시일 칸(inheritedDate)", () => {
  it("★ 일반주택(2015-06-01)을 상속개시(2017-01-10) 전에 보유 → ⑥ 성립 · 비과세 · 보류·사유 없음 (칸이 ④·⑫·⑭를 지나 엔진에 닿는다)", async () => {
    const o = await observeCase(rightRow({}, { inheritedDate: "2017-01-10" }));
    expect(o.status).toBe(200);
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).toEqual([]);
    expect(o.unmetExceptions).toEqual([]);
  });

  it("★ 상속개시 뒤에 산 주택 → 불성립 ⇒ 과세 + 사유 한 줄(종전: 비과세 + 판정 보류)", async () => {
    const o = await observeCase(rightRow({ acquisitionDate: "2018-03-01" }, { inheritedDate: "2017-01-10" }));
    expect(o.isExempt).toBe(false);
    expect(o.unmetReasons["89-2-inherited-general-house-unheld"].join(" ")).toContain("상속개시일(2017-01-10)보다 뒤에 취득했습니다");
    expect(o.undetermined).not.toContain("89-2-open:소득세법 시행령 §156의2 ⑥·⑦");
    // ⑧이 신축주택 취득 경위를 요구하는 입력 칸이 열려 있다(막다른 오류 아님) — 선언하면 통과
    expect(o.validationErrors.join(" ")).toContain("generalHouseRightAtInheritance");
  });

  it("긍정 짝 — 같은 사실에서 신축주택(상속개시 당시 보유한 입주권으로 완공)을 선언하면 비과세", async () => {
    const o = await observeCase(
      rightRow({ acquisitionDate: "2018-03-01" }, { inheritedDate: "2017-01-10" }, { generalHouseRightAtInheritance: "redevelopment_right" }),
    );
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.unmetExceptions).toEqual([]);
  });

  it("★ 모름 — 상속개시일 칸이 비면 불성립 + 확인 필요(결론을 가를 때만 고지)", async () => {
    const o = await observeCase(rightRow({}, {}));
    expect(o.validationErrors).toEqual([]); // 칸을 비워도 막지 않는다 — 불리 적용 + 확인 필요
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain("89-2-confirm:0");
    // 긍정 짝 — 입력하면 고지가 사라지고 비과세
    const dated = await observeCase(rightRow({}, { inheritedDate: "2017-01-10" }));
    expect(dated.undetermined).not.toContain("89-2-confirm:0");
    expect(dated.isExempt).toBe(true);
  });

  it("분양권 — 행 취득일이 상속개시일이다: 일반주택을 이 날보다 뒤에 샀으면 불성립", async () => {
    const presale = { type: "presale_right", memberOrigin: undefined, acquisitionDate: "2022-03-01" };
    const held = await observeCase(rightRow({}, presale));
    expect(held.isExempt).toBe(true);
    const after = await observeCase(rightRow({ acquisitionDate: "2022-06-01" }, presale));
    expect(after.isExempt).toBe(false);
    expect(after.unmetReasons["89-2-inherited-general-house-unheld"].join(" ")).toContain("§156의3 ④·⑤");
  });

  it("조건 — ⑦·⑤ 후단(상속 외 권리 동반)에서는 신축주택 선언이 인정되지 않는다", async () => {
    // 상속 입주권 + 상속 외 입주권(2022-01-10 취득, 일반주택 2018-03-01 + 1년 경과·3년 이내 양도 아님) — ⑦ 모양에서 신축주택 갈래는 보지 않는다.
    const base = rightRow({ acquisitionDate: "2018-03-01" }, { inheritedDate: "2017-01-10" }, { generalHouseRightAtInheritance: "redevelopment_right" });
    const sevenShape: RulingCase = {
      ...base,
      form: {
        ...base.form,
        presaleRights: [
          ...(base.form!.presaleRights as unknown[]),
          { id: "own", type: "redevelopment_right", memberOrigin: "successor", acquisitionDate: "2022-01-10", region: "capital" },
        ],
      } as never,
    };
    const o = await observeCase(sevenShape);
    expect(o.unmetReasons["89-2-inherited-general-house-unheld"]?.join(" ") ?? "").not.toContain("신축주택");
    // ⑥ 모양이면 신축주택 선언으로 성립(위 긍정 짝)이지만, ⑦ 모양에서는 같은 선언이 있어도 상속 권리를 없는 셈 치고 상속 외 권리로 판정한다.
    expect(o.isExempt).toBe(false);
  });
});

describe("#8-P — ④ 빌더: 상속개시일은 입주권·상속 행에서만 싣는다", () => {
  const entry = (over: Partial<PresaleRightEntry>): PresaleRightEntry => ({
    id: "r",
    type: "redevelopment_right",
    acquisitionDate: "2017-01-10",
    region: "capital",
    ...over,
  });
  const payload = (rows: PresaleRightEntry[]) => buildPresaleRightsPayload("housing", rows)![0];

  it("입주권 + 상속 + 칸 입력 → inheritedDate를 싣는다(단건·다건 공용 leaf)", () => {
    expect(payload([entry({ isInherited: true, inheritedDate: "2017-01-10" })]).inheritedDate).toBe("2017-01-10");
  });
  it("부정 짝 — 분양권 행 · 상속 해제 행 · 빈 칸은 싣지 않는다(stale 값 차단)", () => {
    expect(payload([entry({ type: "presale_right", isInherited: true, inheritedDate: "2017-01-10" })]).inheritedDate).toBeUndefined();
    expect(payload([entry({ isInherited: false, inheritedDate: "2017-01-10" })]).inheritedDate).toBeUndefined();
    expect(payload([entry({ isInherited: true, inheritedDate: "" })]).inheritedDate).toBeUndefined();
  });
});

describe("#8-G — 신축주택 칸 게이트 (⑤·④·⑧ 공용 술어)", () => {
  const form = (rows: PresaleRightEntry[], acq = "2018-03-01") => ({
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing" as const, acquisitionDate: acq }],
    transferDate: "2026-05-20",
    houses: [],
    presaleRights: rows,
  });
  const inh = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry => ({
    id: "r",
    type: "redevelopment_right",
    acquisitionDate: "2017-01-10",
    region: "capital",
    isInherited: true,
    inheritedDate: "2017-01-10",
    ...over,
  });

  it("⑥·④ 모양 + 양도 주택이 상속개시 뒤 취득 → 열린다 / 상속개시 전 취득 → 닫힌다", () => {
    expect(generalHouseRightAtInheritanceVisible(form([inh()]) as never)).toBe(true);
    expect(generalHouseRightAtInheritanceVisible(form([inh()], "2016-01-01") as never)).toBe(false);
  });
  it("분양권은 행 취득일(상속개시일)로 본다 / 입주권은 칸이 비면 닫힌다(모름은 엔진이 확인 필요로 처리)", () => {
    expect(generalHouseRightAtInheritanceVisible(form([inh({ type: "presale_right", inheritedDate: undefined, acquisitionDate: "2017-01-10" })]) as never)).toBe(true);
    expect(generalHouseRightAtInheritanceVisible(form([inh({ inheritedDate: undefined })]) as never)).toBe(false);
  });
  it("부정 짝 — ⑦·⑤ 모양(상속 외 권리 동반) · 상속 권리 아님 · 2013-02-15 전 취득은 닫힌다", () => {
    expect(
      generalHouseRightAtInheritanceVisible(form([inh(), inh({ id: "o", isInherited: false, inheritedDate: undefined })]) as never),
    ).toBe(false);
    expect(generalHouseRightAtInheritanceVisible(form([inh({ isInherited: false })]) as never)).toBe(false);
    expect(generalHouseRightAtInheritanceVisible(form([inh({ inheritedDate: "2012-01-01" })], "2012-06-01") as never)).toBe(false);
  });
  it("④ — 선언 값은 게이트가 열렸을 때만 싣는다", () => {
    const f = { ...form([inh()]), generalHouseRightAtInheritance: "redevelopment_right" as const };
    expect(buildInheritanceGeneralHousePayload(f as never).generalHouseRightAtInheritance).toBe("redevelopment_right");
    const closed = { ...form([inh()], "2016-01-01"), generalHouseRightAtInheritance: "redevelopment_right" as const };
    expect(buildInheritanceGeneralHousePayload(closed as never).generalHouseRightAtInheritance).toBeUndefined();
  });
});

describe("#8-C — 계산기 경고: 날짜로 확정된 불성립 사유와 확인 필요", () => {
  const rates = makeMockRates();
  const run = (rightOver: Record<string, unknown>, houseAcq = "2018-03-01") =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 1,
        transferPrice: 900_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date(houseAcq),
        transferDate: new Date("2026-05-20"),
        residencePeriodMonths: 60,
        rightThreeYearException: { kind: "none" },
        presaleRights: [
          { id: "r", type: "redevelopment_right", acquisitionDate: new Date("2017-01-10"), region: "capital", isInherited: true, ...rightOver },
        ],
      } as never),
      rates,
    );
  it("상속개시 뒤 취득 → 과세 + 경고에 사유", () => {
    const r = run({ inheritedDate: new Date("2017-01-10") });
    expect(r.isExempt).toBe(false);
    expect((r.warnings ?? []).join("\n")).toContain("상속개시일(2017-01-10)보다 뒤에 취득했습니다");
  });
  it("모름 → 과세 + 확인 필요 경고 / 긍정 짝(상속개시 전 보유) → 비과세 · 경고 없음", () => {
    const unknown = run({});
    expect(unknown.isExempt).toBe(false);
    expect((unknown.warnings ?? []).join("\n")).toContain("상속개시일이 없어");
    const held = run({ inheritedDate: new Date("2017-01-10") }, "2015-06-01");
    expect(held.isExempt).toBe(true);
    expect(held.warnings ?? []).toEqual([]);
  });
});

describe("#8-S — 번지는 효과 고정: 중과 배제 ① 요소(§167의10①15호 등)", () => {
  const resolve = (rightOver: Record<string, unknown>, houseAcq: string) =>
    resolveArticle89Clause2(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 1,
        acquisitionDate: new Date(houseAcq),
        transferDate: new Date("2026-05-20"),
        presaleRights: [
          { id: "r", type: "redevelopment_right", acquisitionDate: new Date("2017-01-10"), region: "capital", isInherited: true, ...rightOver },
        ],
      } as never),
      undefined,
    );
  it("상속개시 전 보유가 날짜로 확인되면 ⑥ exception_met ⇒ 중과 배제 의제가 열린다(종전: 판정 보류로 막혀 있었다)", () => {
    const r = resolve({ inheritedDate: new Date("2017-01-10") }, "2015-06-01");
    expect(r.status).toBe("exception_met");
    expect(clause2BlocksSurchargeDeeming(r)).toBe(false);
    expect(clause2SurchargeDeemed(r)?.basis).toBe("house_with_redevelopment_right");
  });
  it("부정 짝 — 상속개시 뒤 취득 · 상속개시일 모름은 의제가 열리지 않는다(배제 확정)", () => {
    const after = resolve({ inheritedDate: new Date("2017-01-10") }, "2018-03-01");
    const unknown = resolve({}, "2015-06-01");
    for (const r of [after, unknown]) {
      expect(r.status).toBe("excluded");
      expect(clause2BlocksSurchargeDeeming(r)).toBe(true);
      expect(clause2SurchargeDeemed(r)).toBeUndefined();
    }
  });
});
