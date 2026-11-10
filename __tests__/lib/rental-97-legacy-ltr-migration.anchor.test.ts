/**
 * anchor — 레거시 `long_term_rental` 이관은 «1:1 치환»이고, 이관된 임대 조문이 같은 카드의 다른 임대 조문과
 * 겹치면 «채운 뒤» ⑧이 막으며, API는 `long_term_rental`을 400으로 거절하는 현행 동작 고정
 * (V-6 계획서 V-4·V-5). 계획서 docs/00-pm/rental-97-v45-saved-state.plan.md (Q-1 a · Q-2 a).
 *
 * 고정하는 것
 *  A) 이관 4경로 — 구 폼-전역(`migrateLegacyForm`)은 `reductions`를 `[rental_97_3]`로 «교체»하고,
 *     자산 폼 경로(`migrateAsset` ← 세션 복원 · 이력 편집 · 다건 편입)는 LTR 원소만 «1:1 치환»한다.
 *     같은 범주의 다른 id를 지우지도 합치지도 않는다(이관 코드는 중복을 새로 만들지도, 정리하지도 않는다).
 *  B) ⑧·⑫ — `[LTR, 97의4]`·`[LTR, 97의5]` 이관 직후에는 «임대개시일» 필수값이 먼저 나오고, 필수값을 채운 뒤에는
 *     명문 배제 문구(§97의3②·§97의5②)로 막힌다. ⑫도 같은 문구로 400이다. 다른 범주(신축·자경)와는 §127⑦이다.
 *  C) API — `type:"long_term_rental"`은 본 자산·컴패니언 모두 400(strip이 아니다).
 *
 * 이 테스트가 깨지면 «로드 때 임대 조문 하나만 남기기» 같은 자동 선택이 들어온 것이니 계획서 §4(Q-1 b·Q-2 c)를 먼저 다시 본다.
 *
 * ⚠️ 본문·단서·§97의2·§97의5 사이의 «세액감면형 쌍»은 일부러 고정하지 않는다 — 그 쌍의 ⑧·⑫ 동작은 Q-3(#3144)에서 바뀐다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, mergePersistedWizard, migratePersistedTransferForm, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { migrateLegacyForm } from "@/lib/stores/calc-wizard-migration";
import { migrateReductionReclassification } from "@/lib/storage/migrations/reduction-reclassification";
import { getReductionDefault, toggleGroupRadio } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const STAT_3 = /\(조특법 §97의3②\)/;
const STAT_5 = /\(조특법 §97의5②\)/;
const CONFLICT_RE = /조특법 §127⑦ 중복배제/;
const START_DATE_RE = /§97의3 적용: 임대개시일을 입력하세요/;

// ── 레거시 시료 ─────────────────────────────────────────────────────────────────
const LTR = () => ({ type: "long_term_rental", rentalYears: "8", rentIncreaseRate: "3" });
const types = (reds: unknown): string[] => ((reds ?? []) as Array<{ type: string }>).map((r) => r.type);

// ── 사용자가 채운 뒤의 임대 조문 픽스처 (V-6 anchor와 같은 틀) ─────────────────────────
const rentalCommon = {
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
const r973 = () => ({ ...getReductionDefault("rental_97_3"), ...rentalCommon, stdPriceAtAcquisition: "100,000,000", stdPriceAtTransfer: "400,000,000" });
const r974 = () => ({ ...getReductionDefault("rental_97_4"), ...rentalCommon, rental974Category: "purchase_a", region: "capital" });
const r975 = () => ({ ...getReductionDefault("rental_97_5"), ...rentalCommon, isPurchaseRental: true });
/** 이관 직후 빈 칸이던 §97의3 항목을 사용자가 채운 상태 — 이관이 정한 id·위반 모드는 그대로 두고 필수값만 채운다. */
const filled = (migrated: Record<string, unknown>) => ({ ...migrated, ...r973(), rentIncreaseViolationMode: migrated.rentIncreaseViolationMode });

function card(reductions: unknown[], acq = "2003-03-01"): AssetForm {
  return Object.assign({ ...makeDefaultAsset(1) }, x({
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq,
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reductions as never,
  })) as AssetForm;
}
function form(assets: AssetForm[]): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2025-08-01", contractTotalPrice: String(900_000_000 * assets.length), assets, isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}
const step8 = (f: TransferFormData) => validateStep2Reductions(2, f)?.message;
const url = "http://localhost/api/calc/transfer";
async function postBody(body: Record<string, unknown>) {
  const res = await POST(new NextRequest(url, {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Any;
  return { status: res.status, fieldErrors: (json.error?.fieldErrors ?? {}) as Record<string, string[]> };
}
const post = async (f: TransferFormData) => postBody(await captureBody(f));

/** 이관 입력: 자산 폼에는 housing 종류만 필요하다. */
const mig = (reductions: unknown[]) => migrateAsset({ assetKind: "housing", reductions }).reductions as unknown as Array<Record<string, Any>>;

// ═══════════════════════════════════════════════════════════════════════════════
describe("A-1 자산 폼 경로(migrateAsset) — LTR 원소만 1:1 치환, 같은 범주의 다른 id는 그대로", () => {
  it("전제: 시료는 정말 레거시 타입이고 폼 union에는 없는 값이다", () => {
    expect(LTR().type).toBe("long_term_rental");
    expect(types(mig([LTR()]))).not.toContain("long_term_rental");
  });

  it("[LTR] → [rental_97_3] — 날짜는 비우고(없는 사실을 만들지 않음) 위반 모드만 승계한다", () => {
    const out = mig([LTR()]);
    expect(types(out)).toEqual(["rental_97_3"]);
    expect(out[0].registrationDate).toBe("");
    expect(out[0].rentalStartDate).toBe("");
    expect(out[0].rentIncreaseViolationMode).toBe("none");
    expect(mig([{ ...LTR(), rentIncreaseRate: "8" }])[0].rentIncreaseViolationMode).toBe("has_violation");
  });

  it.each([
    ["[LTR, 97의4] → [97의3, 97의4]", () => [LTR(), r974()], ["rental_97_3", "rental_97_4"]],
    ["[97의4, LTR] → [97의4, 97의3] (순서 보존)", () => [r974(), LTR()], ["rental_97_4", "rental_97_3"]],
    ["[LTR, 97의5] → [97의3, 97의5]", () => [LTR(), r975()], ["rental_97_3", "rental_97_5"]],
    ["[LTR, 97의3] → [97의3, 97의3] (같은 id 둘 — 합치지 않는다)", () => [LTR(), r973()], ["rental_97_3", "rental_97_3"]],
    ["[LTR, LTR] → [97의3, 97의3]", () => [LTR(), LTR()], ["rental_97_3", "rental_97_3"]],
    ["[LTR, 본문] → [97의3, 본문]", () => [LTR(), getReductionDefault("rental_97_main" as never)], ["rental_97_3", "rental_97_main"]],
    ["[LTR, 신축] → [97의3, new_99] (다른 범주도 지우지 않는다)", () => [LTR(), { type: "new_housing" }], ["rental_97_3", "new_99"]],
    ["[LTR, 자경] → [97의3, self_farming]", () => [LTR(), getReductionDefault("self_farming" as never)], ["rental_97_3", "self_farming"]],
  ])("%s", (_n, mk, expected) => {
    expect(types(mig(mk() as unknown[]))).toEqual(expected);
  });

  it("치환 대상이 아닌 원소의 사용자 입력은 그대로 남는다 — [LTR, 97의4]의 97의4 칸", () => {
    const out = mig([LTR(), r974()]);
    expect(out[1].type).toBe("rental_97_4");
    expect(out[1].registrationDate).toBe("2014-01-01");
    expect(out[1].rental974Category).toBe("purchase_a");
    expect(out[1].officialPriceAtStart).toBe("300,000,000");
  });

  it("임대 6종의 모든 쌍(15쌍 × 두 순서)은 입력과 같은 순서·같은 원소로 나온다 — 중복을 정리하지 않는다", () => {
    const IDS = ["rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_3", "rental_97_4", "rental_97_5"];
    let pairs = 0;
    for (let i = 0; i < IDS.length; i++) {
      for (let j = 0; j < IDS.length; j++) {
        if (i === j) continue;
        pairs += 1;
        expect(types(mig([getReductionDefault(IDS[i] as never), getReductionDefault(IDS[j] as never)])), `${IDS[i]}+${IDS[j]}`).toEqual([IDS[i], IDS[j]]);
      }
    }
    expect(pairs).toBe(30);
  });
});

describe("A-2 나머지 이관 경로 — 세션 복원 · 구 폼-전역 · IndexedDB v4", () => {
  it("세션 복원(migratePersistedTransferForm · mergePersistedWizard) — [LTR, 97의4] → [97의3, 97의4]", () => {
    const raw = { assets: [{ assetKind: "housing", reductions: [LTR(), r974()] }] };
    expect(types(migratePersistedTransferForm(raw).assets[0].reductions)).toEqual(["rental_97_3", "rental_97_4"]);
    const merged = mergePersistedWizard({ formData: raw }, { formData: createDefaultTransferFormData() } as never);
    expect(types(merged.formData.assets[0].reductions)).toEqual(["rental_97_3", "rental_97_4"]);
  });

  it("구 폼-전역 스키마(assets 없음) — reductionType 하나를 reductions 전체로 «교체»한다: 자산 1건 · [97의3]", () => {
    const f = migrateLegacyForm(
      { transferDate: "2030-06-01", reductionType: "long_term_rental", rentalYears: "9", rentIncreaseRate: "3" },
      createDefaultTransferFormData(),
    );
    expect(f.assets).toHaveLength(1);
    expect(types(f.assets[0].reductions)).toEqual(["rental_97_3"]);
    const r = f.assets[0].reductions[0] as unknown as Record<string, unknown>;
    expect(r.registrationDate).toBe("");
    expect(r.rentIncreaseViolationMode).toBe("none");
  });

  it("IndexedDB v4 업그레이드 — type만 제자리 치환하고 다른 항목·순서는 그대로, 이어서 읽을 때 정규화도 같은 결과", async () => {
    const records = [
      { inputData: { assets: [{ reductions: [{ type: "long_term_rental" }, { type: "rental_97_4" }] }] } },
      { inputData: { assets: [{ reductions: [{ type: "long_term_rental" }, { type: "rental_97_3" }] }] } },
      { inputData: { assets: [{ reductions: [{ type: "long_term_rental" }, { type: "rental_97_5" }] }] } },
    ];
    const tx = { table: () => ({ toCollection: () => ({ modify: async (fn: (r: Any) => void) => records.forEach(fn) }) }) } as never;
    expect(await migrateReductionReclassification(tx)).toBe(3);
    expect(records.map((r) => types(r.inputData.assets[0].reductions))).toEqual([
      ["rental_97_3", "rental_97_4"], ["rental_97_3", "rental_97_3"], ["rental_97_3", "rental_97_5"],
    ]);
    // 업그레이드 뒤 읽기(migrateAsset)는 이미 치환된 목록을 다시 건드리지 않는다
    expect(types(mig(records[0].inputData.assets[0].reductions))).toEqual(["rental_97_3", "rental_97_4"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("B ⑧·⑫ — 이관 직후는 필수값이 먼저, 채운 뒤에는 명문 배제 문구", () => {
  it("전제: 채운 §97의3 단독은 ⑧을 통과하고 ⑫도 200이다(픽스처가 정말 «채운 상태»)", async () => {
    const f = form([card([filled(mig([LTR()])[0])])]);
    expect(step8(f)).toBeUndefined();
    expect((await post(f)).status).toBe(200);
  });

  it("전제: 이관 직후(날짜 빈 칸)의 [97의3] 단독은 임대개시일 문구로 막힌다", () => {
    expect(step8(form([card(mig([LTR()]))])) ?? "").toMatch(START_DATE_RE);
  });

  it.each([
    ["[LTR, 97의4]", () => [LTR(), r974()], STAT_3, /^§97의3 적용: §97의4 .*중복하여 적용할 수 없습니다/],
    ["[LTR, 97의5]", () => [LTR(), r975()], STAT_5, /^§97의3 적용: §97의5 세액감면과 중복하여 적용할 수 없습니다/],
  ])("%s — 이관 직후는 임대개시일 문구 · 채우면 명문 배제 문구 · ⑫도 같은 문구로 400", async (_n, mk, basis, head) => {
    const migrated = mig(mk() as unknown[]);
    const before = step8(form([card(migrated)])) ?? "";
    expect(before).toMatch(START_DATE_RE);
    expect(before).not.toMatch(basis);

    const f = form([card([filled(migrated[0]), ...migrated.slice(1)])]);
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(basis);
    expect(m8).toMatch(head);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });

  it("[97의4, LTR] — 순서가 바뀌어도 채운 뒤에는 §97의3② (주어는 먼저 고른 §97의4)", async () => {
    const migrated = mig([r974(), LTR()]);
    const f = form([card([migrated[0], filled(migrated[1])])]);
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(STAT_3);
    expect(m8).toMatch(/^§97의4 적용: §97의3 .*중복하여 적용할 수 없습니다/);
    expect((await post(f)).status).toBe(400);
  });

  it.each([
    ["신축", () => [LTR(), { type: "new_housing" }]],
    ["자경", () => [LTR(), getReductionDefault("self_farming" as never)]],
  ])("[LTR, %s] — 다른 범주와는 §127⑦ 중복배제(이관 직후부터)", (_n, mk) => {
    const migrated = mig(mk() as unknown[]);
    expect(step8(form([card(migrated)])) ?? "").toMatch(CONFLICT_RE);
    expect(step8(form([card([filled(migrated[0]), ...migrated.slice(1)])])) ?? "").toMatch(CONFLICT_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("C API — long_term_rental은 본 자산·컴패니언 모두 400 (strip이 아니다)", () => {
  it("전제: 같은 본문에서 reductions를 바꾸지 않으면 200이다", async () => {
    expect((await post(form([card([r973()])]))).status).toBe(200);
  });

  it("본 자산 [LTR] → 400 · reductions.0.type", async () => {
    const body = await captureBody(form([card([r973()])]));
    body.reductions = [{ type: "long_term_rental", rentalYears: 8, rentIncreaseRate: 0.03 }];
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toContain("reductions.0.type");
  });

  it("본 자산 [97의3, LTR] → 400 · reductions.1.type (정상 항목이 앞에 있어도 걸린다)", async () => {
    const body = await captureBody(form([card([r973()])]));
    body.reductions = [...(body.reductions as unknown[]), { type: "long_term_rental" }];
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toContain("reductions.1.type");
  });

  it("컴패니언 [LTR] → 400 · companionAssets.0.reductions.0.type", async () => {
    const f = form([card([]), Object.assign(card([r973()]), { assetId: "companion-2" })]);
    const body = await captureBody(f);
    const comp = body.companionAssets as Array<Record<string, unknown>>;
    expect(comp, "전제: 컴패니언 본문이 있다").toHaveLength(1);
    expect(types(comp[0].reductions), "전제: 바꾸기 전엔 §97의3").toEqual(["rental_97_3"]);
    comp[0].reductions = [{ type: "long_term_rental" }];
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toContain("companionAssets.0.reductions.0.type");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("D(Q-2 a) 패널 라디오 — 저장 상태로 담긴 임대 둘을 클릭이 범주째 다룬다 (ⓑ 배너 없음의 짝)", () => {
  const sel = (ids: string[]) => ids.map((id) => getReductionDefault(id as never)) as never;
  it("선택된 카드를 끄면 범주 전체가 비워진다 · 안 고른 카드를 켜면 그 하나만 남는다 · 다른 범주는 보존", () => {
    expect(types(toggleGroupRadio(sel(["rental_97_3", "rental_97_4"]), "rental", "rental_97_3" as never, true))).toEqual([]);
    expect(types(toggleGroupRadio(sel(["rental_97_3", "rental_97_4"]), "rental", "rental_97_5" as never, false))).toEqual(["rental_97_5"]);
    expect(types(toggleGroupRadio(sel(["rental_97_3", "self_farming"]), "rental", "rental_97_4" as never, false))).toEqual(["self_farming", "rental_97_4"]);
  });
  it("레거시 LTR도 같은 범주로 지운다(이관 전 상태 방어)", () => {
    expect(types(toggleGroupRadio([LTR() as never], "rental", "rental_97_4" as never, false))).toEqual(["rental_97_4"]);
  });
});
