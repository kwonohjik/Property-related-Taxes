/**
 * 양도세 계산기 — 조특법 주택 수 제외(§99의4·§98의9·감면주택)를 **명부 행**에서 받는다.
 *
 * 계획서 `docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md`(Q-1~Q-6 · Q-2′ · §7-1 V).
 * 판정 메뉴 짝: `one-house-count-exclusion-row-link.anchor.test.ts`.
 *
 * 공통 사실관계(계획서 §7-1 V-1 probe): 양도 대상 S 취득 2015-01-01 · 양도 2024-06-01 · 9억 ·
 * 취득가액 3억 · 비조정. R = 농어촌주택(2021-01-01, §99의4 요건 충족), N = 다른 일반주택.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | CR-1 | C2 — 행 R(⑥)·N → 비과세 / 짝: ⑥ 해제 → 과세 |
 * | CR-2 | C6 — 명부 N(2016) + 행 없는 옛 선언 → ⑧ 차단 / 짝: 삭제 → 과세 186,846,000 |
 * | CR-2l | 대표 자산이 토지여도 함께 양도하는 주택의 옛 선언은 막는다(선언 자산 자신의 종류) |
 * | CR-3 | 게이트 술어(Q-2′) — 주택·재개발 아파트만 |
 * | CR-4 | ④ — 재개발 아파트는 행 선언을 싣고, 입주권은 싣지 않는다 |
 * | CR-5 | ⑧ 게이트 밖(입주권)은 옛 선언·행 필수값을 막지 않는다 |
 * | CR-6 | ⑧ 행 필수값 — 행 번호로 |
 * | CR-7 | 다건 — §99의4 행·감면주택 행 모두 건별로 싣는다(감면주택 차단은 Q4에서 해제) |
 * | CR-8 | 판정 → 계산기 전달 — 행을 그대로 넘긴다(중복 0) |
 * | CR-9 | 옛 기록(Q-5) — 행 id가 있는 저장소 선언은 그 행으로 옮긴다 |
 * | CR-10 | ③ 감면 패널 검증은 세 유형을 보지 않는다(입력 칸이 없다) |
 * | CR-11 | 조문을 아직 고르지 않은 감면주택 행 — 제외 대상 계산이 던지지 않는다(PR #1881 잠복 결함) |
 * | CR-12 | 엔진 결과 `houseCountExclusionDetails` — 선언 전건·행 id가 반환 경로마다 실린다(Q-6) |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import {
  countExclusionRowsInScope,
  eligibleCountExcludedHouseIds,
  moveLinkedCountExclusionsToRows,
} from "@/lib/calc/house-count-exclusion-rows";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createDefaultTransferFormData,
  mergePersistedWizard,
  type TransferFormData,
} from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AssetReductionForm, SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

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

/** 행 ⑥ — 취득일·주소는 행 값을 쓰므로 비워 둔다. */
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

/** 계산기 감면 패널에서 직접 입력하던 옛 선언 — 행 id가 없다. */
const LEGACY_RURAL = {
  ...RURAL,
  ruralHouseAcquisitionDate: "2021-01-01",
  ruralHouseJibun: "",
} as AssetReductionForm;

/** 판정 메뉴를 거쳐 유효한 계산기 폼을 만든다(자산 필드 기본값을 손으로 맞추지 않으려고). */
function baseForm(): TransferFormData {
  const judged = {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      { ...makeDefaultAsset(1), residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01" },
    ],
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
  const f = { ...createDefaultTransferFormData(), ...toTransferFormPatch(judged) } as TransferFormData;
  return {
    ...f,
    assets: f.assets.map((a, i) =>
      i === 0 ? ({ ...a, fixedAcquisitionPrice: "300000000", acquisitionPrice: "300000000" } as AssetForm) : a,
    ),
  };
}

function withForm(patch: Partial<TransferFormData>, assetOver: Partial<AssetForm> = {}): TransferFormData {
  const f = baseForm();
  return {
    ...f,
    ...patch,
    householdHousingCount: patch.householdHousingCount ?? String(1 + (patch.houses?.length ?? 0)),
    assets: f.assets.map((a, i) => (i === 0 ? ({ ...a, ...assetOver } as AssetForm) : a)),
  };
}

/** 계산기 ④ 본문을 가로챈다. */
async function captureBody(form: TransferFormData): Promise<Record<string, unknown>> {
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
  return cap.body!;
}

/** ④ 본문을 계산기 route에 그대로 통과시킨다. */
async function runCalc(form: TransferFormData) {
  const body = await captureBody(form);
  const res = await CALC_POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    data?: {
      result?: {
        isExempt?: boolean;
        totalTax?: number;
        houseCountExclusionDetails?: { id: string; houseId?: string; isEligible: boolean }[];
      };
    };
  };
  return json.data?.result;
}

const step1Messages = (f: TransferFormData) => collectStepIssues(1, f).map((i) => i.message);
const LEGACY_MSG = "어느 주택인지 지정되지 않았습니다";

describe("CR-1 C2 — 행 ⑥이 계산기 판정에 닿는다", () => {
  it("[CR-1] 행 R(농어촌 ⑥)·N(신규) → 일시적 2주택 비과세 (서면-2021-부동산-6220)", async () => {
    const f = withForm({ houses: [ruralRow("r", "2021-01-01"), row("n", "2023-12-01")] });
    expect(step1Messages(f)).toEqual([]);
    expect((await runCalc(f))?.isExempt).toBe(true);
  });

  it("[CR-1+] 짝 — ⑥을 해제하면 3주택 과세", async () => {
    const f = withForm({ houses: [row("r", "2021-01-01"), row("n", "2023-12-01")] });
    expect((await runCalc(f))?.isExempt).toBe(false);
  });
});

describe("CR-2 C6 — 명부에 없는 주택을 빼는 옛 선언은 막는다 (Q-1)", () => {
  it("[CR-2] 명부 N(2016) + 행 없는 §99의4 선언 → ⑧ 차단", () => {
    const f = withForm({ houses: [row("n", "2016-01-01")] }, { reductions: [LEGACY_RURAL] });
    expect(step1Messages(f).some((m) => m.includes(LEGACY_MSG))).toBe(true);
  });

  it("[CR-2+] 짝 — 선언을 지우면 차단이 풀리고 과세 186,846,000 (처분기한 경과)", async () => {
    const f = withForm({ houses: [row("n", "2016-01-01")] }, { reductions: [] });
    expect(step1Messages(f)).toEqual([]);
    const result = await runCalc(f);
    expect(result?.isExempt).toBe(false);
    expect(result?.totalTax).toBe(186_846_000);
  });

  it("[CR-2s] 폼 전역 감면주택(행 id 없음)도 같은 차단", () => {
    const special: SpecialHouseExclusionFormItem = {
      article: "new_99",
      houseAcquisitionDate: "2000-01-01",
      houseContractDate: "",
      isNationalHousing: false,
      requirementsConfirmed: true,
    } as SpecialHouseExclusionFormItem;
    const f = withForm({ houses: [row("n", "2016-01-01")], specialHouseExclusions: [special] });
    expect(step1Messages(f).some((m) => m.includes(LEGACY_MSG))).toBe(true);
  });

  it("[CR-2c] 컴패니언 자산의 옛 선언도 막는다(V-4 — 컴패니언 선언도 엔진에 닿는다)", () => {
    const f = withForm({ houses: [row("n", "2016-01-01")] });
    const g = {
      ...f,
      assets: [...f.assets, { ...makeDefaultAsset(2), assetKind: "housing", reductions: [LEGACY_RURAL] } as AssetForm],
    };
    expect(step1Messages(g).some((m) => m.includes(LEGACY_MSG))).toBe(true);
  });
});

describe("CR-2l 대표 자산이 게이트 밖이어도 — 함께 양도하는 주택의 옛 선언은 막는다 (V-4)", () => {
  it("[CR-2l] 토지 + 주택(컴패니언)의 행 없는 §99의4 선언 → ⑧ 차단 — 패널에서 사라져 보이지 않은 채 실린다", () => {
    const f = withForm({ houses: [row("n", "2016-01-01")] }, { assetKind: "land" });
    const g = {
      ...f,
      assets: [...f.assets, { ...makeDefaultAsset(2), assetKind: "housing", reductions: [LEGACY_RURAL] } as AssetForm],
    };
    expect(step1Messages(g).some((m) => m.includes(LEGACY_MSG))).toBe(true);
  });

  it("[CR-2l+] 짝 — 선언이 붙은 자산이 권리(입주권)면 막지 않는다(효과 0)", () => {
    const f = withForm({ houses: [row("n", "2016-01-01")] }, { assetKind: "land" });
    const g = {
      ...f,
      assets: [...f.assets, { ...makeDefaultAsset(2), assetKind: "right_to_move_in", reductions: [LEGACY_RURAL] } as AssetForm],
    };
    expect(step1Messages(g).some((m) => m.includes(LEGACY_MSG))).toBe(false);
  });
});

describe("CR-3 게이트 술어 (Q-2′)", () => {
  it("[CR-3] 주택·재개발 아파트 양도만 연다 — 권리 양도에는 효과가 없다(V-1)", () => {
    expect(countExclusionRowsInScope("housing")).toBe(true);
    expect(countExclusionRowsInScope("redevelopment_apt")).toBe(true);
    expect(countExclusionRowsInScope("right_to_move_in")).toBe(false);
    expect(countExclusionRowsInScope("presale_right")).toBe(false);
    expect(countExclusionRowsInScope("land")).toBe(false);
    expect(countExclusionRowsInScope(undefined)).toBe(false);
  });
});

describe("CR-4 ④ — 게이트 안에서만 행 선언을 싣는다", () => {
  const houses = [ruralRow("r", "2021-01-01"), row("n", "2023-12-01")];
  const rowTypes = (body: Record<string, unknown>) =>
    ((body.reductions as { type: string; houseId?: string }[]) ?? []).filter((r) => r.type === "new_99_4_rural");

  it("[CR-4] 주택 양도 — 행 값(취득일)과 행 id를 싣는다", async () => {
    const body = await captureBody(withForm({ houses }));
    expect(rowTypes(body)).toEqual([
      expect.objectContaining({ houseId: "r", ruralHouseAcquisitionDate: "2021-01-01" }),
    ]);
  });

  it("[CR-4r] 재개발 아파트 양도도 싣는다 — 이 종류에도 C6이 있다(V-1)", async () => {
    const body = await captureBody(withForm({ houses }, { assetKind: "redevelopment_apt" }));
    expect(rowTypes(body)).toEqual([expect.objectContaining({ houseId: "r" })]);
  });

  it("[CR-4+] 짝 — 입주권 양도는 싣지 않는다(값은 행에 남는다)", async () => {
    const body = await captureBody(withForm({ houses }, { assetKind: "right_to_move_in" }));
    expect(rowTypes(body)).toEqual([]);
  });
});

describe("CR-5·6 ⑧", () => {
  it("[CR-5] 게이트 밖(입주권) — 옛 선언도, 비어 있는 행 ⑥도 막지 않는다(효과 0)", () => {
    const f = withForm(
      { houses: [ruralRow("r", "2021-01-01", { ...RURAL, ruralHouseStdPrice: "" })] },
      { assetKind: "right_to_move_in", reductions: [LEGACY_RURAL] },
    );
    const msgs = step1Messages(f);
    expect(msgs.some((m) => m.includes(LEGACY_MSG))).toBe(false);
    expect(msgs.some((m) => m.includes("기준시가 합계"))).toBe(false);
  });

  it("[CR-6] 게이트 안 — 행 ⑥ 필수값은 행 번호로 막는다", () => {
    const f = withForm({
      houses: [row("n", "2023-12-01"), ruralRow("r", "2021-01-01", { ...RURAL, ruralHouseStdPrice: "" })],
    });
    expect(step1Messages(f)).toContain(
      "보유 주택 2: §99의4 농어촌주택 적용: 취득 당시 기준시가 합계(주택+부속토지)를 입력하세요.",
    );
  });

  it("[CR-6s] 감면주택 행 — 조문 미선택을 막는다", () => {
    const f = withForm({
      houses: [
        row("s", "2001-01-01", {
          countExclusion: {
            kind: "special",
            special: {
              article: "",
              houseAcquisitionDate: "",
              houseContractDate: "",
              isNationalHousing: false,
              requirementsConfirmed: false,
            } as SpecialHouseExclusionFormItem,
          },
        }),
      ],
    });
    expect(step1Messages(f)).toContain("보유 주택 1: 주택 수 제외 — 감면주택의 적용 조문을 선택하세요.");
  });
});

describe("CR-7 다건", () => {
  it("[CR-7] §99의4 행은 건별 본문에 싣는다", () => {
    const f = withForm({ houses: [ruralRow("r", "2021-01-01"), row("n", "2023-12-01")] });
    const payload = buildPropertyPayload(f) as { reductions: { type: string; houseId?: string }[] };
    expect(payload.reductions).toEqual([expect.objectContaining({ type: "new_99_4_rural", houseId: "r" })]);
  });

  it("[CR-7s] 감면주택 행 — 다건도 막지 않고 건별 본문에 싣는다(Q4 — 종전 차단 해제)", () => {
    const f = withForm({
      houses: [
        row("s", "2001-01-01", {
          countExclusion: {
            kind: "special",
            special: {
              article: "new_99",
              houseAcquisitionDate: "",
              houseContractDate: "",
              isNationalHousing: false,
              requirementsConfirmed: true,
            } as SpecialHouseExclusionFormItem,
          },
        }),
      ],
    });
    expect(validateMultiSupportedMode(f)).toBeNull();
    const payload = buildPropertyPayload(f) as { specialHouseExclusions: { article: string; houseId?: string }[] };
    expect(payload.specialHouseExclusions).toEqual([expect.objectContaining({ article: "new_99", houseId: "s" })]);
  });
});

describe("CR-8 판정 → 계산기 전달", () => {
  it("[CR-8] 행 ⑥을 그대로 넘기고 감면 저장소에는 옮기지 않는다(이중 적재 0)", () => {
    const judged = {
      ...createInitialOneHouseJudgmentForm(),
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01" }],
      transferDate: "2024-06-01",
      contractTotalPrice: "900000000",
      isOneHousehold: true,
      houses: [ruralRow("r", "2021-01-01"), row("n", "2023-12-01")],
      presaleRights: [],
    } as unknown as OneHouseJudgmentFormData;
    const patch = toTransferFormPatch(judged);
    expect(patch.houses?.find((h) => h.id === "r")?.countExclusion).toEqual({ kind: "reduction", reduction: RURAL });
    expect((patch.assets?.[0].reductions ?? []).some((r) => r.type === "new_99_4_rural")).toBe(false);
    expect(patch.specialHouseExclusions ?? []).toEqual([]);
  });
});

describe("CR-9 옛 기록 — 행 id가 있는 저장소 선언은 그 행으로 옮긴다 (Q-5)", () => {
  const linked = { ...LEGACY_RURAL, houseId: "r" } as AssetReductionForm;
  const linkedSpecial = {
    article: "new_99",
    houseId: "s",
    houseAcquisitionDate: "2001-01-01",
    houseContractDate: "",
    isNationalHousing: false,
    requirementsConfirmed: true,
  } as SpecialHouseExclusionFormItem;

  it("[CR-9] 행 id가 가리키는 행으로 옮기고 저장소에서 지운다 — 행 id 없는 선언은 그대로 둔다(추측 금지)", () => {
    const f = withForm(
      {
        houses: [row("r", "2021-01-01"), row("s", "2001-01-01"), row("n", "2023-12-01")],
        specialHouseExclusions: [linkedSpecial],
      },
      { reductions: [linked, LEGACY_RURAL] },
    );
    const m = moveLinkedCountExclusionsToRows(f);
    expect(m.houses.find((h) => h.id === "r")?.countExclusion).toEqual({
      kind: "reduction",
      reduction: expect.objectContaining({ type: "new_99_4_rural", ruralHouseStdPrice: "150000000" }),
    });
    expect(m.houses.find((h) => h.id === "s")?.countExclusion).toEqual({
      kind: "special",
      special: expect.objectContaining({ article: "new_99" }),
    });
    expect(m.assets[0].reductions).toEqual([LEGACY_RURAL]);
    expect(m.specialHouseExclusions).toEqual([]);
  });

  it("[CR-9+] 짝 — 가리키는 행이 없으면 옮기지 않고, ⑧이 행 없는 선언으로 막는다", () => {
    const f = withForm({ houses: [row("n", "2016-01-01")] }, { reductions: [linked] });
    const m = moveLinkedCountExclusionsToRows(f);
    expect(m.assets[0].reductions).toEqual([linked]);
    expect(step1Messages(m).some((msg) => msg.includes(LEGACY_MSG))).toBe(true);
  });

  it("[CR-9m] sessionStorage 복원(mergePersistedWizard)이 같은 이동을 거친다", () => {
    const f = withForm({ houses: [row("r", "2021-01-01"), row("n", "2023-12-01")] }, { reductions: [linked] });
    const merged = mergePersistedWizard({ formData: f }, {
      currentStep: 0,
      formData: createDefaultTransferFormData(),
      result: null,
      pendingMigration: false,
    } as never);
    expect(merged.formData.houses.find((h) => h.id === "r")?.countExclusion?.kind).toBe("reduction");
    expect(merged.formData.assets[0].reductions.some((r) => r.type === "new_99_4_rural")).toBe(false);
  });
});

describe("CR-10 ③ 감면 패널 검증", () => {
  it("[CR-10] 세 유형은 패널에 입력 칸이 없으므로 ③ 단계에서 필수값을 묻지 않는다", () => {
    const f = withForm(
      { houses: [row("n", "2023-12-01")] },
      { reductions: [{ ...LEGACY_RURAL, ruralHouseStdPrice: "" } as AssetReductionForm] },
    );
    expect(collectStepIssues(2, f).some((i) => i.message.includes("§99의4"))).toBe(false);
  });
});

describe("CR-11 조문 미선택 감면주택 행", () => {
  it("[CR-11] 「감면주택」만 고른 순간에도 제외 대상 계산이 던지지 않는다 — 판정 메뉴 ③ 헤더가 매 렌더 부른다", () => {
    const emptySpecial = {
      article: "",
      houseAcquisitionDate: "",
      houseContractDate: "",
      isNationalHousing: false,
      requirementsConfirmed: false,
    } as SpecialHouseExclusionFormItem;
    const f = withForm({ houses: [row("s", "2001-01-01", { countExclusion: { kind: "special", special: emptySpecial } })] });
    expect(() => eligibleCountExcludedHouseIds(f)).not.toThrow();
    expect(eligibleCountExcludedHouseIds(f).size).toBe(0);
  });
});

describe("CR-12 엔진 결과 — 선언 전건 (Q-6)", () => {
  const UNSOLD = {
    type: "unsold_98_9",
    unsoldHouseAcquisitionDate: "",
    unsoldHouseAcquisitionPrice: "",
    unsoldHouseExclusiveArea: "",
    isNonCapitalRegion: true,
    wasOneHouseholdAtAcquisition: true,
    meetsSellerAndContractRequirement: true,
  } as unknown as RowCountExclusionReduction;
  const unsoldRow = (id: string, date: string) =>
    row(id, date, {
      acquisitionPrice: "500000000",
      exclusiveArea: "84",
      countExclusion: { kind: "reduction", reduction: UNSOLD },
    });
  const pick = (r: Awaited<ReturnType<typeof runCalc>>) =>
    (r?.houseCountExclusionDetails ?? []).map((d) => ({ id: d.id, houseId: d.houseId, isEligible: d.isEligible }));

  it("[CR-12] 비과세 조기 반환 — 행 R의 §99의4가 행 id와 함께 실린다", async () => {
    const r = await runCalc(withForm({ houses: [ruralRow("r", "2021-01-01"), row("n", "2023-12-01")] }));
    expect(r?.isExempt).toBe(true);
    expect(pick(r)).toEqual([{ id: "new_99_4_rural", houseId: "r", isEligible: true }]);
  });

  it("[CR-12t] 과세(일반 반환) — 명부 N(2016, 처분기한 경과)이라 과세여도 R의 판정 결과는 실린다", async () => {
    const r = await runCalc(withForm({ houses: [ruralRow("r", "2021-01-01"), row("n", "2016-01-01")] }));
    expect(r?.isExempt).toBe(false);
    expect(pick(r)).toEqual([{ id: "new_99_4_rural", houseId: "r", isEligible: true }]);
  });

  it("[CR-12l] 양도차손(차손 반환 경로) — 과세 사실관계에 취득가액이 양도가액보다 커도 실린다", async () => {
    const f = withForm({ houses: [ruralRow("r", "2021-01-01"), row("n", "2016-01-01")] });
    const g = {
      ...f,
      assets: f.assets.map((x, i) =>
        i === 0 ? ({ ...x, fixedAcquisitionPrice: "1000000000", acquisitionPrice: "1000000000" } as AssetForm) : x,
      ),
    };
    const r = await runCalc(g);
    expect(r?.totalTax).toBe(0);
    expect(pick(r)).toEqual([{ id: "new_99_4_rural", houseId: "r", isEligible: true }]);
  });

  it("[CR-12d] 같은 유형 두 행(§98의9) — 두 행 모두 실린다(종전 `unsold989Detail`은 첫 행뿐)", async () => {
    const r = await runCalc(withForm({ houses: [unsoldRow("u1", "2024-02-01"), unsoldRow("u2", "2024-03-01")] }));
    expect(pick(r).map((d) => d.houseId)).toEqual(["u1", "u2"]);
  });

  it("[CR-12r] 재개발 아파트 양도 — 재개발 분기에서도 실린다", async () => {
    const r = await runCalc(
      withForm(
        { houses: [ruralRow("r", "2021-01-01"), row("n", "2016-01-01")] },
        {
          assetKind: "redevelopment_apt",
          redevApprovalDate: "2018-01-01",
          redevRightsValue: "400000000",
          redevSettlementDirection: "pay",
          redevSettlementAmount: "100000000",
          redevIsSuccessorMember: "no",
        } as Partial<AssetForm>,
      ),
    );
    expect(pick(r)).toEqual([{ id: "new_99_4_rural", houseId: "r", isEligible: true }]);
  });
});

/**
 * CR-13 — 스칼라가 주택 수의 정본인데 ⑥ 행이 그 수에 들어 있지 않다 (S1 후속, F-1)
 *
 * 계획서 `docs/00-pm/transfer-count-exclusion-hidden-roster.plan.md` §1. 엔진은 `max(주택 수 − 제외 수, 0)`으로
 * 빼서 스칼라 1 − ⑥ 1 = **0채** → 1세대1주택 비과세를 잃는다(실측 C 186,846,000 · D 264,600,600).
 * 두 입력이 모순이라(스칼라 1 = 다른 주택 없음 · ⑥ 행 = 다른 주택 있음) 사용자가 고르도록 ⑧이 막는다(Q-1 (a)).
 * 주택 수는 ④와 **같은 leaf**(`resolveHouseholdHousingCount`)로 센다.
 *
 * 🔴 PR-B(2026-10-05, `docs/00-pm/roster-required-other-assets.plan.md`) — 재개발 아파트도
 *    위 leaf의 F1 집합(`isOneHouseExemptionAsset`)에 들어가 **명부가 정본**이 됐다. 그래서
 *    「스칼라가 주택 수의 정본인데」라는 이 describe 의 전제 자체가 재개발 아파트에는 더 이상
 *    성립하지 않는다 — 스칼라 값과 무관하게 명부가 항상 이기므로 두 입력이 모순될 수 없다
 *    (housing과 같아짐, CR-13++ 패턴). 옛 이력 표식(legacy)이 붙은 레코드만 이 전제가 남는다.
 */
describe("CR-13 스칼라 정본 주택 수가 ⑥ 행을 포함하지 않으면 ⑧이 막는다 (F-1)", () => {
  const MSG = "보유 주택 목록의 주택";
  const REDEV = {
    assetKind: "redevelopment_apt",
    redevApprovalDate: "2018-01-01",
    redevRightsValue: "400000000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "100000000",
    redevIsSuccessorMember: "no",
  } as Partial<AssetForm>;
  const blocked = (f: TransferFormData) => step1Messages(f).filter((m) => m.includes(MSG));

  it("[CR-13] 옛 이력 표식 · 스칼라 1 · ⑥ 행 → 차단 (종전: 0채로 과세 186,846,000)", () => {
    const f = withForm({ houses: [ruralRow("r", "2021-01-01")], householdHousingCount: "1", legacyHouseCountPrecedence: true });
    expect(blocked(f)).toEqual([
      "세대 보유 주택 수(1채)가 보유 주택 목록의 주택(양도 주택 포함 2채)보다 적습니다. 주택 수 제외는 목록의 주택을 세대 보유 주택 수에서 빼는 것이라, 두 값이 어긋나면 어느 주택을 뺐는지 알 수 없습니다 — 세대 보유 주택 수를 2채 이상으로 입력하거나, 목록에서 주택 수 제외 지정을 해제하세요.",
    ]);
  });

  it("[CR-13r] 🔴 PR-B 이후 — 재개발 아파트는 스칼라 1이어도 막지 않는다(명부가 정본, housing과 동일)", async () => {
    const f = withForm({ houses: [ruralRow("r", "2021-01-01")], householdHousingCount: "1" }, REDEV);
    expect(blocked(f)).toEqual([]);
    expect((await runCalc(f))?.isExempt).toBe(true);
  });

  it("[CR-13s] 감면주택 ⑥ 행도 센다 — PR-B 이후 재개발 아파트는 스칼라와 무관하게 막지 않는다", async () => {
    const special = row("s", "2012-10-15", {
      countExclusion: {
        kind: "special",
        special: { article: "unsold_98_7", requirementsConfirmed: true } as SpecialHouseExclusionFormItem,
      },
    });
    const f = withForm({ houses: [special], householdHousingCount: "1" }, REDEV);
    expect(blocked(f)).toEqual([]);
    expect((await runCalc(f))?.isExempt).toBe(true);
  });

  it("[CR-13+] 짝 — 스칼라가 ⑥ 행을 포함하면 막지 않고 비과세 (재개발 스칼라 2)", async () => {
    const f = withForm({ houses: [ruralRow("r", "2021-01-01")], householdHousingCount: "2" }, REDEV);
    expect(blocked(f)).toEqual([]);
    expect((await runCalc(f))?.isExempt).toBe(true);
  });

  it("[CR-13++] 짝 — 명부가 정본인 주택 양도는 스칼라가 1이어도 명부로 센다(④와 같은 leaf) → 막지 않는다", async () => {
    const f = withForm({ houses: [ruralRow("r", "2021-01-01")], householdHousingCount: "1" });
    expect(blocked(f)).toEqual([]);
    expect((await runCalc(f))?.isExempt).toBe(true);
  });

  it("[CR-13-] 대조군(옛 이력) — ⑥이 없으면 막지 않는다. 스칼라 1이 정본이라 비과세", async () => {
    const legacy = withForm({ houses: [row("r", "2021-01-01")], householdHousingCount: "1", legacyHouseCountPrecedence: true });
    expect(blocked(legacy)).toEqual([]);
    expect((await runCalc(legacy))?.isExempt).toBe(true);
  });

  /**
   * 🔴 PR-B 이후 — ⑥ 선언 없는 평범한 다른 주택은 **명부가 이겨** 정확히 2채로 과세된다.
   * 종전(F1 미포함)에는 스칼라 "1"이 그대로 쓰여 명부의 r을 못 본 채 **잘못 비과세**였다
   * (방금 위 legacy 사례의 "옛 이력" 처리와 혼동하기 쉬운 지점 — 여기는 legacy 표식이 없다).
   */
  it("[CR-13-redev] 대조군(재개발) — ⑥ 없는 다른 주택은 명부가 이겨 2채로 과세된다(PR-B)", async () => {
    const redev = withForm({ houses: [row("r", "2021-01-01")], householdHousingCount: "1" }, REDEV);
    expect(blocked(redev)).toEqual([]);
    expect((await runCalc(redev))?.isExempt).toBe(false);
  });
});

/**
 * CR-14 — 스칼라가 정본인데 ⑥ 행 **외의** 명부 주택이 스칼라에 빠졌다 (S1 후속 R-1, 과소과세)
 *
 * 명부 [r⑥, n]인데 스칼라 2 → 엔진 2 − 1 = 1채로 비과세. 명부와 정합하는 스칼라 3이면 3 − 1 = 2채로 과세다 —
 * 스칼라가 n을 빠뜨린 채 r을 빼서 사실상 **n이 빠진다**(실측 비과세 0 ↔ 264,600,600 · 186,846,000).
 * ⇒ ⑥ 행이 있으면 정본 주택 수가 명부의 주택(양도 주택 포함)을 모두 담아야 한다. ⑥이 없으면 종전대로
 * 보지 않는다.
 *
 * 🔴 PR-B(2026-10-05) — 재개발 아파트는 이제 F1 집합에 포함되어 **스칼라·명부 전체 정합성을
 *    더는 「보지 않는 축」이 아니다**(위 문단의 종전 서술은 재개발 아파트에 더 이상 맞지 않는다).
 *    명부가 항상 이기므로 스칼라 값과 무관하게 정확한 주택 수(3)로 계산된다 — housing과 같다.
 */
describe("CR-14 ⑥ 행이 있으면 스칼라가 명부의 주택을 모두 담아야 한다 (R-1)", () => {
  const MSG = "보유 주택 목록의 주택";
  const REDEV = {
    assetKind: "redevelopment_apt",
    redevApprovalDate: "2018-01-01",
    redevRightsValue: "400000000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "100000000",
    redevIsSuccessorMember: "no",
  } as Partial<AssetForm>;
  const H = () => [ruralRow("r", "2021-01-01"), row("n", "2016-01-01")];
  const blocked = (f: TransferFormData) => step1Messages(f).filter((m) => m.includes(MSG));

  it("[CR-14] 🔴 PR-B 이후 — 스칼라 2를 선언해도 명부가 이겨 3채(과세 264,600,600)로 계산된다", async () => {
    const f = withForm({ houses: H(), householdHousingCount: "2" }, REDEV);
    expect(blocked(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r?.isExempt).toBe(false);
    expect(r?.totalTax).toBe(264_600_600);
  });

  it("[CR-14l] 옛 이력 표식 · 스칼라 2 · 명부 [r⑥, n] → 차단 (종전: 비과세 — 정합 스칼라 3이면 과세 186,846,000)", () => {
    const f = withForm({ houses: H(), householdHousingCount: "2", legacyHouseCountPrecedence: true });
    expect(blocked(f)).toHaveLength(1);
  });

  it("[CR-14+] 짝 — 스칼라 3(정합)이면 막지 않고 과세 264,600,600", async () => {
    const f = withForm({ houses: H(), householdHousingCount: "3" }, REDEV);
    expect(blocked(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r?.isExempt).toBe(false);
    expect(r?.totalTax).toBe(264_600_600);
  });

  it("[CR-14++] 짝 — 선언 스칼라가 명부보다 커도(4) 막지 않는다 — PR-B 이후 명부(3)가 그대로 쓰인다", () => {
    expect(blocked(withForm({ houses: H(), householdHousingCount: "4" }, REDEV))).toEqual([]);
  });

  it("[CR-14-] 대조군 — ⑥이 없으면 스칼라 선언과 무관하게 막지 않는다(이 가드는 ⑥ 유무에만 반응)", () => {
    const f = withForm({ houses: [row("r", "2021-01-01"), row("n", "2016-01-01")], householdHousingCount: "2" }, REDEV);
    expect(blocked(f)).toEqual([]);
  });
});
