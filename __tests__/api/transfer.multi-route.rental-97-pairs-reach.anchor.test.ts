/**
 * route anchor — 다건 `/api/calc/transfer/multi`의 `properties[i].reductions`에 담은 임대 쌍도 단건 route와 같은 400이다 (V-6 후속 V-3).
 * 계획서 docs/00-pm/rental-97-v3-multi-properties.plan.md (Q-1 a).
 *
 * 차단은 ⑫ 한 곳이 맡는다: `propertyItemSchema.superRefine` → `addPropertyRefines` → `refineReductionTrack127_7`.
 * 단건 anchor는 `propertySchema`만 거치므로 `propertyItemSchema`가 공용 refine을 빼도 못 본다 — 이 파일이 그 틈을 고정한다.
 * 명문 배제 3쌍(조특법 §97의3②·§97의5②)과 §127⑦ 교차(임대 장특 특례 §97의3·§97의4 + 다른 분류 조문).
 * 세율표는 route 폴백이다(정본 세액). 단건 응답의 문구와 비교하므로 문구가 늘어도 깨지지 않는다.
 * 고정하지 않는 것: 임대 세액감면 계열 안 쌍(§97 본문·단서·§97의2·§97의5 사이)·건별 reductionAmount·컴패니언 직접 입력.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { runSingle, buildMultiBody, postMulti } from "../calc/_helpers/single-multi-route-parity";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const CONFLICT_RE = /조특법 §127⑦ 중복배제/;
const STAT_3 = /\(조특법 §97의3②\)/;
const STAT_5 = /\(조특법 §97의5②\)/;

// ── 시료: V-6 anchor(`transfer.route.rental-97-overlap-v6.anchor.test.ts`)와 같은 임대 카드 · 같은 주택 1장
const rentalCommon = {
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
const r973 = () => ({ ...getReductionDefault("rental_97_3"), ...rentalCommon, stdPriceAtAcquisition: "100,000,000", stdPriceAtTransfer: "400,000,000" });
const r974 = () => ({ ...getReductionDefault("rental_97_4"), ...rentalCommon, rental974Category: "purchase_a", region: "capital" });
const r975 = () => ({ ...getReductionDefault("rental_97_5"), ...rentalCommon, isPurchaseRental: true });
const OLD = { registrationDate: "1995-03-01", rentalStartDate: "1995-03-01", taxRegistrationDate: "1995-03-01" };
const r97main = () => ({
  ...getReductionDefault("rental_97_main" as never), ...rentalCommon, ...OLD,
  constructionYear: "1995", isNationalHousing: true, hasMin5RentalUnits: true, isMultiUnitHousing: false, isUnoccupiedAt1986: true, isUnoccupiedAtAcquisition: true,
});
// 신축 §99의3 — 5년 경과 분기의 기준시가 칸(standardPriceAt5Years)과 매매계약일을 채운 정상 폼 시료
const r993 = () => ({
  ...getReductionDefault("new_99_3"), houseType993: "apartment", firstContract993: "yes", contractDate993: "2003-02-01",
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "150,000,000", standardPriceAtTransfer993: "400,000,000", exclusiveAreaSqm993: "84",
});
// 수용 §77 — 최소 본문({type}만)은 필드 검증이 먼저 걸려 교차 문구가 나오지 않는다. 정상 폼 시료를 쓴다.
const r77 = () => ({
  ...getReductionDefault("public_expropriation"), expropriationCash: "900,000,000", expropriationBond: "0",
  expropriationBondHoldingYears: "none", expropriationApprovalDate: "2023-01-01",
});

const ACQ = "2003-03-01";
const ACQ_OLD = "1995-02-01"; // §97 본문 카드 취득일

function card(reductions: unknown[], acq = ACQ): AssetForm {
  return Object.assign({ ...makeDefaultAsset(1) }, x({
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq,
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reductions as never,
  })) as AssetForm;
}
function form(reductions: unknown[], acq = ACQ): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2025-08-01", contractTotalPrice: "900000000", assets: [card(reductions, acq)], isOneHousehold: false, householdHousingCount: "1",
  }) as TransferFormData;
}

type Fe = Record<string, string[]>;
const feOf = (json: unknown): Fe => ((json as { error?: { fieldErrors?: Fe } }).error?.fieldErrors ?? {}) as Fe;

/** 같은 폼을 단건 route와 다건 route(건 1개)로 보낸다. */
async function both(f: TransferFormData) {
  const s = await runSingle(f);
  const m = await postMulti(await buildMultiBody([f]));
  return { s: { status: s.status, fe: feOf(s.json), total: s.totalTax }, m: { status: m.status, fe: feOf(m.json), total: m.totalTax } };
}
const all = (fe: Fe) => Object.values(fe).flat();
/** 단건 오류 중 `re`에 맞는 문구가 실린 칸(`reductions.<j>.type`) */
const keyWith = (fe: Fe, re: RegExp) => Object.keys(fe).find((k) => (fe[k] ?? []).some((m) => re.test(m)));

describe("전제 — 각 단독은 단건·다건 모두 200이고 총세액이 같다", () => {
  const SINGLES: Array<[string, () => unknown[], string, number]> = [
    ["§97의3", () => [r973()], ACQ, 144_899_332],
    ["§97의4", () => [r974()], ACQ, 155_166_000],
    ["§97의5", () => [r975()], ACQ, 185_966_000],
    ["§97 본문(취득 1995)", () => [r97main()], ACQ_OLD, 109_889_000],
    ["신축 §99의3", () => [r993()], ACQ, 156_565_999],
    ["수용 §77", () => [r77()], ACQ, 163_142_900],
  ];
  it.each(SINGLES)("%s 단독", async (_n, mk, acq, total) => {
    const f = form(mk(), acq);
    expect(validateStep2Reductions(2, f)?.message ?? "", "전제: ⑧이 쌍 문구를 내지 않는다").not.toMatch(/중복하여 적용할 수 없습니다|중복배제/);
    const { s, m } = await both(f);
    expect(s.status).toBe(200);
    expect(m.status).toBe(200);
    expect(s.total).toBe(total);
    expect(m.total).toBe(total);
  });
});

type Pair = { name: string; mk: () => unknown[]; acq: string; re: RegExp; at: number };
const STATUTORY: Pair[] = [
  { name: "[§97의3, §97의4]", mk: () => [r973(), r974()], acq: ACQ, re: STAT_3, at: 1 },
  { name: "[§97의4, §97의3]", mk: () => [r974(), r973()], acq: ACQ, re: STAT_3, at: 1 },
  { name: "[§97의3, §97의5]", mk: () => [r973(), r975()], acq: ACQ, re: STAT_5, at: 1 },
  { name: "[§97의5, §97의3]", mk: () => [r975(), r973()], acq: ACQ, re: STAT_5, at: 0 },
  { name: "[§97의4, §97의5]", mk: () => [r974(), r975()], acq: ACQ, re: STAT_5, at: 1 },
  { name: "[§97의5, §97의4]", mk: () => [r975(), r974()], acq: ACQ, re: STAT_5, at: 0 },
  { name: "[§97의3, §97의4, §97의5] 세 조문 동시", mk: () => [r973(), r974(), r975()], acq: ACQ, re: STAT_5, at: 2 },
];
const CROSS: Pair[] = [
  { name: "[§97의4, §99의3]", mk: () => [r974(), r993()], acq: ACQ, re: CONFLICT_RE, at: 1 },
  { name: "[§99의3, §97의4]", mk: () => [r993(), r974()], acq: ACQ, re: CONFLICT_RE, at: 0 },
  { name: "[§97의3, §99의3]", mk: () => [r973(), r993()], acq: ACQ, re: CONFLICT_RE, at: 1 },
  { name: "[§97의3, §77]", mk: () => [r973(), r77()], acq: ACQ, re: CONFLICT_RE, at: 1 },
  { name: "[§77, §97의3]", mk: () => [r77(), r973()], acq: ACQ, re: CONFLICT_RE, at: 0 },
  { name: "[§97의4, §77]", mk: () => [r974(), r77()], acq: ACQ, re: CONFLICT_RE, at: 1 },
  { name: "[§97 본문, §97의4]", mk: () => [r97main(), r974()], acq: ACQ_OLD, re: CONFLICT_RE, at: 0 },
  { name: "[§97의4, §97 본문]", mk: () => [r974(), r97main()], acq: ACQ_OLD, re: CONFLICT_RE, at: 1 },
  { name: "[§97 본문, §97의3]", mk: () => [r97main(), r973()], acq: ACQ_OLD, re: CONFLICT_RE, at: 0 },
];

function suite(title: string, pairs: Pair[]) {
  describe(title, () => {
    it.each(pairs)("$name — 단건과 같은 문구의 400, 오류 경로는 properties.0.reductions.<j>.type", async ({ mk, acq, re, at }) => {
      const f = form(mk(), acq);
      const { s, m } = await both(f);
      // 전제: 단건이 의도한 조문 문구로 막는다
      expect(s.status, "전제: 단건 400").toBe(400);
      const sKey = keyWith(s.fe, re);
      expect(sKey, "전제: 단건이 이 쌍의 문구를 낸다").toBe(`reductions.${at}.type`);
      // 다건: 400, 같은 문구가 같은 칸에 앞에 `properties.0.`만 붙어서 나온다
      expect(m.status).toBe(400);
      expect(m.fe[`properties.0.${sKey}`]).toEqual(s.fe[sKey!]);
      expect(all(m.fe)).toEqual(expect.arrayContaining(all(s.fe)));
      // 교차 문구가 아닌 쌍은 §127⑦ 문구로 새지 않는다(명문 배제는 §127⑦ 분류 충돌에서 빠진다)
      if (re !== CONFLICT_RE) expect(all(m.fe).join("\n")).not.toMatch(CONFLICT_RE);
    });
    it.each(pairs)("$name — 전제: ⑧(단건·다건 건별 validateStep)이 같은 문구를 내고 단건 ⑫가 그 문구를 낸다", async ({ mk, acq, re }) => {
      const f = form(mk(), acq);
      const m8 = validateStep2Reductions(2, f)?.message;
      expect(m8).toMatch(re);
      expect(validateStep(2, f)).toBe(m8);
      expect(all((await both(f)).s.fe)).toContain(m8);
    });
  });
}
suite("명문 배제 3쌍(조특법 §97의3②·§97의5②) — 두 순서 + 세 조문 동시", STATUTORY);
suite("§127⑦ 교차(임대 장특 특례 + 다른 분류 조문)", CROSS);

describe("properties 2건 — 정상 건 + 문제 건 위치가 오류 경로에 반영된다", () => {
  const PICK = ["[§97의3, §97의4]", "[§97의3, §97의5]", "[§97의4, §97의5]", "[§97의4, §99의3]", "[§97의3, §77]", "[§97의4, §77]"];
  const POS = [...STATUTORY, ...CROSS].filter((p) => PICK.includes(p.name));
  const normal = () => form([r974()]);

  it("전제: 정상 건 2개는 200이다(하네스 확인)", async () => {
    const m = await postMulti(await buildMultiBody([normal(), normal()]));
    expect(m.status).toBe(200);
  });
  it.each(POS)("$name — 문제 건이 둘째", async ({ mk, acq, re, at }) => {
    const bad = form(mk(), acq);
    const s = await runSingle(bad);
    const sKey = keyWith(feOf(s.json), re);
    const m = await postMulti(await buildMultiBody([normal(), bad]));
    const fe = feOf(m.json);
    expect(m.status).toBe(400);
    expect(sKey).toBe(`reductions.${at}.type`);
    expect(fe[`properties.1.${sKey}`]).toEqual(feOf(s.json)[sKey!]);
    expect(Object.keys(fe).filter((k) => k.startsWith("properties.0."))).toEqual([]);
  });
  it.each(POS)("$name — 문제 건이 첫째", async ({ mk, acq, re, at }) => {
    const bad = form(mk(), acq);
    const s = await runSingle(bad);
    const sKey = keyWith(feOf(s.json), re);
    const m = await postMulti(await buildMultiBody([bad, normal()]));
    const fe = feOf(m.json);
    expect(m.status).toBe(400);
    expect(sKey).toBe(`reductions.${at}.type`);
    expect(fe[`properties.0.${sKey}`]).toEqual(feOf(s.json)[sKey!]);
    expect(Object.keys(fe).filter((k) => k.startsWith("properties.1."))).toEqual([]);
  });
});
