/**
 * anchor — 조특법 주택 수 제외(§99의4·§98의9·보유 감면주택)를 **명부 행**에 연결 (④ → route)
 *
 * 계획서 `docs/00-pm/one-house-judgment-count-exclusion-row-link.plan.md`.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | ROW-1 | 해석례 서면-2021-부동산-6220 재현 — 일시적 2주택 + §99의4 농어촌주택 → 비과세, 제외 행 id |
 * | ROW-1+ | 짝 — 농어촌주택 표시가 없으면 3주택 → 과세 |
 * | ROW-2 | 요건 미달 농어촌주택은 빼지 않는다 → 신규 주택 후보에도 남는다(Q-3(b)) |
 * | ROW-3 | 농어촌주택등 2채 보유 → 둘 다 빼지 않고 사유(재산세과-1096·부동산납세과-91) |
 * | ROW-4 | 감면주택 행 → 제외 · 행 id |
 * | ROW-5 | 감면주택 요건 미달 → 불성립 사유가 명세에 남는다(종전에는 사라졌다) |
 * | ROW-6 | ④ 본문 — 행 값(취득일·주소·가액·면적·수도권 여부)으로 채우고 행 id를 싣는다 |
 * | ROW-7 | ⑧ — 어느 주택인지 지정되지 않은 옛 선언은 다시 판정하지 않는다(Q-2) |
 * | ROW-8 | 판정 → 계산기 전달 — 행 ⑥을 그대로 넘긴다(계산기 계획서 §4-3 — 종전 저장소 이동은 되돌림) |
 * | ROW-9 | 넘겨받은 계산기 입력도 route에서 비과세 — 행 ⑥이 계산기에서도 정본이다(계산기 계획서 §4-3) |
 *
 * 모든 부정형 단언에 긍정 짝을 둔다(`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
import { judgmentDerivedNewHouse } from "@/lib/calc/one-house-judgment-temp-two-house";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

const row = (id: string, acquisitionDate: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "non_capital",
    acquisitionDate,
    officialPrice: "150000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

/** §99의4 농어촌주택 — 요건 충족 선언(취득일·주소는 행 값을 쓰므로 폼 칸은 비워 둔다). */
const RURAL: RowCountExclusionReduction = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};
const ruralRow = (id: string, date: string, reduction: RowCountExclusionReduction = RURAL) =>
  row(id, date, { countExclusion: { kind: "reduction", reduction } });

const jForm = (houses: HouseEntry[], over: Record<string, unknown> = {}, assetOver: Partial<AssetForm> = {}) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2012-11-21",
        ...assetOver,
      } as AssetForm,
    ],
    transferDate: "2021-12-12",
    contractTotalPrice: "800000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses,
    presaleRights: [],
    ...over,
  }) as unknown as OneHouseJudgmentFormData;

async function judgeForm(f: OneHouseJudgmentFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  return json.data;
}

/**
 * 서면-2021-부동산-6220(2022.09.14) 사실관계 — 대구 종전주택 A(2012.11.21.) · 대구 신규주택 B(2019.3.17.) ·
 * 경북 성주 농어촌주택 C(2019.10.21.) · A 양도(2021.12.12.). 회신: 「국내에 1개의 주택을 소유하고 있는 것으로
 * 보아 「소득세법」 제89조제1항제3호를 적용」.
 */
const B = row("b", "2019-03-17");
const C = ruralRow("c", "2019-10-21");

describe("ROW-1 해석례 재현 — 일시적 2주택 + §99의4 농어촌주택", () => {
  it("[ROW-1] 농어촌주택 C를 빼고 A·B 일시적 2주택 → 비과세 · 제외 명세에 C의 행 id", async () => {
    const d = await judgeForm(jForm([B, C]));
    expect(d.judgment.isExempt).toBe(true);
    expect(d.houseCount.total).toBe(3);
    expect(d.houseCount.countedForExemption).toBe(2);
    expect(d.houseCount.excluded).toEqual([
      expect.objectContaining({
        houseId: "c",
        // 결과 화면 「보유 주택 2 (2019-10-21 취득) — 」 — 이력 상세에서도 보이게 결과에 싣는다
        houseNo: 2,
        houseAcquisitionDate: "2019-10-21",
        label: "농어촌주택등 — 소유주택으로 보지 않음",
      }),
    ]);
  });

  it("[ROW-1+] 짝 — C에 제외 사유가 없으면 3주택 → 과세", async () => {
    const d = await judgeForm(jForm([B, row("c", "2019-10-21")]));
    expect(d.judgment.isExempt).toBe(false);
    expect(d.houseCount.countedForExemption).toBe(3);
  });

  it("[ROW-1u] 신규 주택 도출 — C를 후보에서 빼고 B를 찾는다", () => {
    expect(judgmentDerivedNewHouse(jForm([B, C]))?.newAcquisitionDate).toBe("2019-03-17");
    // 짝: 제외 사유가 없으면 나중 취득 행이 2채라 도출하지 않는다(억측 금지 규칙)
    expect(judgmentDerivedNewHouse(jForm([B, row("c", "2019-10-21")]))).toBeUndefined();
  });
});

describe("ROW-2 요건 미달 농어촌주택은 빼지 않는다 (Q-3(b))", () => {
  const OVER = { ...RURAL, ruralHouseStdPrice: "400000000" } as RowCountExclusionReduction;

  it("[ROW-2] 기준시가 3억 초과 → 제외 행 없음 · 신규 주택 미도출 · 과세 · 사유가 명세에 남는다", async () => {
    const f = jForm([B, ruralRow("c", "2019-10-21", OVER)]);
    expect([...eligibleCountExcludedHouseIds(f)]).toEqual([]);
    expect(judgmentDerivedNewHouse(f)).toBeUndefined();
    const d = await judgeForm(f);
    expect(d.judgment.isExempt).toBe(false);
    expect(d.houseCount.countedForExemption).toBe(3);
    expect(d.houseCount.notApplied).toEqual([expect.objectContaining({ houseId: "c" })]);
  });

  it("[ROW-2+] 짝 — 요건을 갖추면 제외 행 집합에 C가 든다", () => {
    expect([...eligibleCountExcludedHouseIds(jForm([B, C]))]).toEqual(["c"]);
  });
});

describe("ROW-3 농어촌주택등 2채 보유 — 1채를 양도한 뒤에 적용", () => {
  it("[ROW-3] 농어촌주택 2채 → 둘 다 빼지 않는다 · 두 행 모두 사유", async () => {
    const d = await judgeForm(jForm([ruralRow("r1", "2015-01-01"), ruralRow("r2", "2016-01-01")]));
    expect(d.houseCount.countedForExemption).toBe(3);
    expect(d.judgment.isExempt).toBe(false);
    const na = d.houseCount.notApplied as { houseId: string; reasons: string[] }[];
    expect(na.map((n) => n.houseId)).toEqual(["r1", "r2"]);
    for (const n of na) expect(n.reasons.join(" ")).toMatch(/2채.*재산세과-1096/);
  });

  it("[ROW-3+] 짝 — 1채면 빼서 1주택 비과세", async () => {
    const d = await judgeForm(jForm([ruralRow("r1", "2015-01-01")]));
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.judgment.isExempt).toBe(true);
  });
});

describe("ROW-4·5 보유 감면주택 행", () => {
  const special = (over: Partial<SpecialHouseExclusionFormItem> = {}): SpecialHouseExclusionFormItem => ({
    article: "unsold_98_2",
    houseAcquisitionDate: "",
    houseContractDate: "",
    isNationalHousing: false,
    requirementsConfirmed: true,
    ...over,
  });
  // §98의2 지방 미분양 — 취득 2009-06-01(창 2008.11.3~2010.12.31). 취득일은 행 값이다.
  const specialRow = (s: SpecialHouseExclusionFormItem) =>
    row("s", "2009-06-01", { countExclusion: { kind: "special", special: s } });

  it("[ROW-4] 요건 충족 → 1주택으로 보아 비과세 · 행 id", async () => {
    const d = await judgeForm(jForm([specialRow(special())], {}, { acquisitionDate: "2005-01-01" }));
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.judgment.isExempt).toBe(true);
    expect(d.houseCount.excluded).toEqual([expect.objectContaining({ houseId: "s" })]);
  });

  it("[ROW-5] 요건 확인이 없으면 빼지 않고, 사유가 명세에 남는다", async () => {
    const d = await judgeForm(
      jForm([specialRow(special({ requirementsConfirmed: false }))], {}, { acquisitionDate: "2005-01-01" }),
    );
    expect(d.houseCount.countedForExemption).toBe(2);
    expect(d.houseCount.notApplied).toEqual([
      expect.objectContaining({ houseId: "s", reasons: [expect.stringMatching(/본 요건/)] }),
    ]);
  });
});

describe("ROW-6 ④ 본문 — 행 값으로 채우고 행 id를 싣는다", () => {
  it("[ROW-6a] §99의4 — 취득일·주소는 행 값(폼 칸은 무시)", () => {
    const f = jForm([
      row("c", "2019-10-21", {
        addressJibun: "경북 성주군 성주읍 1",
        countExclusion: { kind: "reduction", reduction: { ...RURAL, ruralHouseAcquisitionDate: "2000-01-01" } },
      }),
    ]);
    expect(buildOneHouseExemptionApiBody(f).reductions).toEqual([
      expect.objectContaining({ type: "new_99_4_rural", houseId: "c", ruralHouseAcquisitionDate: "2019-10-21" }),
    ]);
  });

  it("[ROW-6b] §98의9 — 취득일·가액·면적은 행 값, 수도권 여부는 행 법정동코드로", () => {
    const unsold: RowCountExclusionReduction = {
      type: "unsold_98_9",
      unsoldHouseAcquisitionDate: "",
      unsoldHouseAcquisitionPrice: "",
      unsoldHouseExclusiveArea: "",
      isNonCapitalRegion: false,
      wasOneHouseholdAtAcquisition: true,
      meetsSellerAndContractRequirement: true,
    };
    const f = jForm([
      row("u", "2024-03-01", {
        acquisitionPrice: "500000000",
        exclusiveArea: "84",
        regionCode: "4719025000", // 경북 — 수도권 밖
        countExclusion: { kind: "reduction", reduction: unsold },
      }),
    ]);
    expect(buildOneHouseExemptionApiBody(f).reductions).toEqual([
      expect.objectContaining({
        type: "unsold_98_9",
        houseId: "u",
        unsoldHouseAcquisitionDate: "2024-03-01",
        unsoldHouseAcquisitionPrice: 500000000,
        unsoldHouseExclusiveArea: 84,
        isNonCapitalRegion: true,
      }),
    ]);
  });

  it("[ROW-6c] 옛 세대 단위 선언(행 id 없음)은 보내지 않는다 — Q-2", () => {
    const f = jForm([row("c", "2019-10-21")], {
      specialHouseExclusions: [
        { article: "unsold_98_2", houseAcquisitionDate: "2009-06-01", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: true },
      ],
    }, { reductions: [{ ...RURAL, ruralHouseAcquisitionDate: "2019-10-21" }] });
    const body = buildOneHouseExemptionApiBody(f);
    expect(body.reductions).toEqual([]);
    expect(body.specialHouseExclusions).toEqual([]);
  });
});

describe("ROW-7 ⑧ — 어느 주택인지 지정되지 않은 옛 선언 (Q-2)", () => {
  const legacy = jForm([B], {}, { reductions: [{ ...RURAL, ruralHouseAcquisitionDate: "2019-10-21" }] });
  const errs = (f: OneHouseJudgmentFormData) =>
    validateStep2(f).filter((e) => e.severity === "error").map((e) => e.message);

  it("[ROW-7] 옛 §99의4 선언이 남아 있으면 막는다 — 종전처럼 1채를 빼면 과소과세(P6)가 남는다", () => {
    expect(errs(legacy).some((m) => m.includes("어느 주택인지 지정되지 않았습니다"))).toBe(true);
  });

  it("[ROW-7+] 짝 — 행에 지정했으면 막지 않는다", () => {
    expect(errs(jForm([B, C])).some((m) => m.includes("어느 주택인지 지정되지 않았습니다"))).toBe(false);
  });
});

describe("ROW-8·9 판정 → 계산기 전달 (Q-4 · §7-2)", () => {
  const judged = jForm([B, C]);
  const calcForm = (patch: Partial<TransferFormData>): TransferFormData =>
    ({ ...createDefaultTransferFormData(), ...patch }) as TransferFormData;

  it("[ROW-8] 행 ⑥을 그대로 넘기고 감면 저장소로는 옮기지 않는다 — 계산기도 명부 행에서 받는다", () => {
    // 계획서 `transfer-calc-count-exclusion-row-link.plan.md` §4-3 — 종전(PR #1881)의 저장소 이동을 되돌렸다.
    const patch = toTransferFormPatch(judged);
    expect(patch.houses?.find((h) => h.id === "c")?.countExclusion?.kind).toBe("reduction");
    expect((patch.assets?.[0].reductions ?? []).some((r) => r.type === "new_99_4_rural")).toBe(false);
  });

  /** 계산기 ④ 본문을 가로채 계산기 route에 그대로 통과시킨다(`one-house-judgment-handoff.anchor.test.ts`와 같은 방식). */
  async function runCalc(form: TransferFormData) {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await callTransferTaxAPI(form);
    vi.unstubAllGlobals();
    const res = await CALC_POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ratelimit-bypass": "1" },
        body: JSON.stringify(cap.body),
      }),
    );
    const json = (await res.json()) as { data?: { result?: { isExempt?: boolean } } };
    expect(res.status).toBe(200);
    return json.data?.result;
  }

  it("[ROW-9] 넘겨받은 입력을 계산기에서 계산해도 비과세 — 계산기의 신규 주택 도출도 C를 뺀다", async () => {
    const result = await runCalc(calcForm(toTransferFormPatch(judged)));
    expect(result?.isExempt).toBe(true);
  });

  it("[ROW-9+] 짝 — 계산기에서 행 ⑥을 해제하면 3주택 과세", async () => {
    const patch = toTransferFormPatch(judged);
    const cleared = {
      ...patch,
      houses: patch.houses?.map((h) => ({ ...h, countExclusion: undefined })),
    } as Partial<TransferFormData>;
    const result = await runCalc(calcForm(cleared));
    expect(result?.isExempt).toBe(false);
  });
});
