/** @vitest-environment jsdom */
/**
 * anchor — 계산기 화면 쪽 「취득 당시 조정대상지역」 소비처 전부 = 실제 route 결론 (2026-11 리뷰 I-37 제안 (a) 판단 자료 · 2026-11-22).
 *
 * 리뷰는 화면 쪽 계산 전체를 엔진 입력(⑭)에서 끌어내는 개편 (a)를 보류하고 「같은 축에서 세 번째 어긋남이 나오면 재검토」로 남겼다.
 * 실측에서 덜 찬 폼 35개 상태 중 14개는 ⑭ 경로가 값을 내지 못해(⑫ Zod 거부) (a)는 보류를 유지했다. 대신 어긋남이 생기는 순간 잡도록
 * 소비처마다 route 정답과 맞춰 본다. 기존 38-10 anchor는 엔진 판정 함수에 코드·날짜·증여 사실만 줄여 넘겨, 용도변경·동일세대 상속 칸으로
 * 넓히면 정답부터 틀린다(실측: 실제 true → false). 그래서 여기서는 정답을 **route 결과**로 잡는다.
 *
 * 정답 — 1주택·보유 2년 이상·9억 양도·거주 0개월이라 거주요건만 결론을 가른다:
 *   route 문구에 「(취득 당시 조정대상지역 해당,」이 있으면 true, 비과세면 false. 그 밖(과세인데 그 문구 없음)은 시료 결함이라 실패한다.
 * 소비처(각 경로의 route 정답과 같아야 한다):
 *   ④ 단건 본문 · Step4 거주 안내 입력(`buildResidenceReqInput` — boolean과 엔진 판정) · ⑤ §155⑳ 카드 사실(`calcRentalResidenceFacts`)
 *   · Step4 자동 판정(`useAcquisitionRegulatedContext`, 코드 경로만 — 코드가 없으면 null) · 다건 ④(`buildPropertyPayload`, 재개발 제외 —
 *   다건 route가 §166을 「단건 계산기에서만」이라 막는다).
 * 다건 ④는 증여 세대 범위 인자 없이 값을 냈다. 코드 경로에서는 엔진이 이 boolean을 읽지 않아 결과는 같았지만 값은 엔진과 갈렸다
 *   (일반 증여 통산 · 이월과세). 이 anchor가 그 칸에서 실패했고 범위 인자를 넘겨 맞췄다.
 *
 * 서울 마포(1144010100) 2017-08-03 지정 · 2023-01-05 해제 · 2025-10-16 재지정. 화성 반송동(4159710200) 지정 지구 선언 칸은
 * 코드 경로에서만 지구 질문이 뜬다 — 주소 문자열 경로는 보수적으로 「해당」이다(의도된 설계, 아래 DISTRICT_OUT).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";
import { useAcquisitionRegulatedContext } from "@/app/calc/transfer-tax/steps/step4-sections/useAcquisitionRegulatedContext";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api-residence";
import { calcRentalResidenceFacts } from "@/lib/calc/rental-residence-form-facts";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { resolveWasRegulatedAtAcquisition } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const MAPO = "1144010100";
const MAPO_ADDR = "서울특별시 마포구 공덕동 1";
const DIST = "4159710200";
const DIST_ADDR = "경기도 화성시 동탄구 반송동 1";
const R0 = { residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [], redevPriorHouseResidenceMonths: "0", redevNewHouseResidenceMonths: "0" };

type Path = "code" | "addr";
type Cell = { name: string; redev?: true; make: (path: Path) => TransferFormData };

const plain = (name: string, asset: Record<string, unknown>, opt: { code?: string; addr?: string; transfer?: string } = {}): Cell => ({
  name,
  make: (path) => {
    const f = createDefaultTransferFormData();
    Object.assign(f, { transferDate: opt.transfer ?? "2026-02-16", contractTotalPrice: "900000000", isOneHousehold: true, householdHousingCount: "1", residencePeriodMonths: "0" });
    f.assets = [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        fixedAcquisitionPrice: "500000000",
        addressJibun: opt.addr ?? MAPO_ADDR,
        regionCode: path === "code" ? (opt.code ?? MAPO) : "",
        ...R0,
        ...asset,
      } as never,
    ];
    return f;
  },
});
const redev = (name: string, over: Record<string, unknown>): Cell => ({
  name,
  redev: true,
  make: (path) => {
    const f = redevAptForm({
      price: "1000000000",
      assetOver: { regionCode: path === "code" ? MAPO : "", addressJibun: MAPO_ADDR, ...R0, ...over },
      formOver: { transferDate: "2026-06-01", residencePeriodMonths: "0" } as never,
    });
    if (path === "addr") f.regionCode = "";
    return f;
  },
});

const gift = (sh: string, start: string, g: string) => ({
  acquisitionCause: "gift",
  acquisitionDate: g,
  fixedAcquisitionPrice: "600000000",
  donorAcquisitionDate: "2010-01-01",
  giftDonorRelation: "lineal",
  giftSameHousehold: sh,
  giftHouseholdHoldingStartDate: start,
});
const carryover = (sh: string, start: string, g: string) => ({
  acquisitionCause: "carryover_gift",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: g,
    donorAcquisitionDate: "2018-01-01",
    donorRelation: "spouse",
    giftDateValuation: "600000000",
    donorAcquisitionPrice: "200000000",
    donorSameHousehold: sh,
    donorHouseholdHoldingStartDate: start,
  },
});
const inherit = (start: string, acq: string, same = true) => ({
  acquisitionCause: "inheritance",
  acquisitionDate: acq,
  decedentSameHouseholdBeforeInheritance: same,
  decedentCohabitationHoldingStartDate: start,
  decedentAcquisitionDate: "2010-01-01",
});

const DISTRICT_OUT = "지정 지구 선언=밖 (반송동 · 취득 2019-01-07)";

const CELLS: Cell[] = [
  ...["2016-01-01", "2019-01-01", "2023-06-01"].map((d) => plain(`매매 취득=${d}`, { acquisitionDate: d })),
  ...["2016-01-01", "2019-01-01", "2023-06-01"].map((u) =>
    plain(`용도변경 취득=2014 사용개시=${u}`, { acquisitionDate: "2014-01-01", hasNonHousingConversion: true, residentialUseStartDate: u }),
  ),
  ...["2016-01-01", "2018-01-10"].flatMap((s) =>
    ["2022-06-01", "2023-06-01"].map((a) => plain(`동일세대 상속 보유개시=${s} 상속=${a}`, inherit(s, a))),
  ),
  plain("별도세대 상속 상속=2023-06 (잔존 보유개시 2018)", inherit("2018-01-10", "2023-06-01", false)),
  plain("용도변경 + 동일세대 상속 사용개시=2023-06 보유개시=2018", {
    ...inherit("2018-01-10", "2019-01-01"),
    hasNonHousingConversion: true,
    residentialUseStartDate: "2023-06-01",
  }),
  plain("일반 증여 같은세대 시작=2018 증여=2022-06", gift("yes", "2018-01-10", "2022-06-01")),
  plain("일반 증여 같은세대 시작=2016 증여=2023-06", gift("yes", "2016-01-01", "2023-06-01")),
  plain("일반 증여 같은세대 시작=2016(비지정) 증여=2019(지정)", gift("yes", "2016-01-01", "2019-06-01")),
  plain("일반 증여 다른세대 증여=2022-06", gift("no", "", "2022-06-01")),
  plain("일반 증여 다른세대 증여=2023-06", gift("no", "", "2023-06-01")),
  plain("이월과세 같은세대 시작=2018 증여=2023-06", carryover("yes", "2018-01-10", "2023-06-01")),
  plain("이월과세 다른세대 증여=2022-06", carryover("no", "", "2022-06-01")),
  plain("이월과세 미답 증여=2023-06", carryover("", "", "2023-06-01")),
  plain("지정 지구 선언=안 (반송동 · 취득 2019-01-07)", { acquisitionDate: "2019-01-07", regionInDesignatedDistrict: true }, { code: DIST, addr: DIST_ADDR, transfer: "2024-06-03" }),
  plain(DISTRICT_OUT, { acquisitionDate: "2019-01-07", regionInDesignatedDistrict: false }, { code: DIST, addr: DIST_ADDR, transfer: "2024-06-03" }),
  ...["2016-01-01", "2019-01-01"].flatMap((acq) =>
    ["2023-01-04", "2023-01-05"].map((c) =>
      redev(`재개발 원조합원 주택출자 종전취득=${acq} 준공=${c}`, { acquisitionDate: acq, redevApprovalDate: "2020-06-01", redevCompletionDate: c }),
    ),
  ),
  ...(
    [
      ["2019-01-01", "2022-06-01"],
      ["2019-01-01", "2023-01-05"],
      ["2019-01-01", "2025-10-16"],
      ["2023-06-01", "2025-10-16"],
    ] as const
  ).map(([acq, c]) =>
    redev(`재개발 승계 입주권취득=${acq} 준공=${c}`, {
      acquisitionDate: acq,
      redevIsSuccessorMember: "yes",
      redevApprovalDate: "2018-06-01",
      redevCompletionDate: c,
      fixedAcquisitionPrice: "500000000",
      redevSettlementDirection: "",
      redevSettlementAmount: "",
    }),
  ),
  ...["2016-01-01", "2018-01-10"].map((s) =>
    redev(`재개발 원조합원 동일세대 상속 보유개시=${s} 상속=2023-06`, {
      ...inherit(s, "2023-06-01"),
      redevApprovalDate: "2024-01-01",
      redevCompletionDate: "2025-06-01",
      publishedValueAtInheritance: "400000000",
      inheritanceValuationMethod: "market_value",
    }),
  ),
];

/** route 결론 — 거주 0개월이라 「취득 당시 조정대상지역」만 비과세를 가른다. */
async function routeTruth(form: TransferFormData): Promise<{ truth: boolean; body: Record<string, unknown> }> {
  const r = await runCalc(form);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  const text = JSON.stringify(r.json);
  if (text.includes("(취득 당시 조정대상지역 해당,")) return { truth: true, body: r.body };
  if (r.result?.isExempt === true) return { truth: false, body: r.body };
  throw new Error(`시료 결함 — 과세인데 「취득 당시 조정대상지역 해당」 문구가 없다: ${text.slice(0, 300)}`);
}

const seen = { code: new Set<boolean>(), addr: new Set<boolean>() };
const codeTruth = new Map<string, boolean>();

describe("I-37 (a) 판단 자료 — 계산기 「취득 당시」 소비처 = route 결론 (31칸 × 법정동코드/주소 문자열)", () => {
  const PATHS: Path[] = ["code", "addr"];
  it.each(CELLS.flatMap((cell) => PATHS.map((path) => [`${path} · ${cell.name}`, cell, path] as const)))(
    "%s",
    { timeout: 30_000 },
    async (_label, cell, path) => {
      const form = cell.make(path);
      const asset = form.assets[0];
      const { truth, body } = await routeTruth(form);
      seen[path].add(truth);
      if (path === "code") codeTruth.set(cell.name, truth);
      else if (codeTruth.has(cell.name)) {
        // 주소 문자열 경로도 같은 결론 — 지구 질문은 코드가 있을 때만 떠서 주소 경로는 보수적으로 「해당」이다(의도된 설계).
        expect(truth, "주소 경로 route = 코드 경로 route").toBe(cell.name === DISTRICT_OUT ? true : codeTruth.get(cell.name));
      }

      expect(body.wasRegulatedAtAcquisition, "④ 단건 본문").toBe(truth);
      const residence = buildResidenceReqInput(form);
      expect(residence.wasRegulatedAtAcquisition, "Step4 거주 안내 입력 boolean").toBe(truth);
      // Step4 거주 경고는 일반 주택에서만 이 입력을 엔진 판정에 넣는다(`Step4.tsx` `residenceShortfall` — kind !== "housing"이면 끈다).
      //   재개발 완공APT는 승계 준공일 번역(⑭ `translateRedevAptForHousingJudgment`)이 이 입력에 없어 판정이 다르지만 화면이 읽지 않는다.
      if (asset.assetKind === "housing") expect(resolveWasRegulatedAtAcquisition(residence), "Step4 거주 안내 엔진 판정").toBe(truth);
      expect(calcRentalResidenceFacts(form, asset, 0).wasRegulatedAtAcquisition, "⑤ §155⑳ 카드 사실").toBe(truth);
      const verdict = renderHook(() => useAcquisitionRegulatedContext(form)).result.current.acquisitionVerdict;
      if (path === "code") expect(verdict?.isRegulated, "Step4 자동 판정").toBe(truth);
      else expect(verdict, "코드가 없으면 자동 판정 없음(토글)").toBeNull();
      if (!cell.redev) expect(buildPropertyPayload(form).wasRegulatedAtAcquisition, "다건 ④").toBe(truth);
    },
  );

  it("격자가 두 경로 모두 두 결론을 지난다 — 한쪽 값만 나오면 단언이 비어 있다", () => {
    expect(seen.code).toEqual(new Set([true, false]));
    expect(seen.addr).toEqual(new Set([true, false]));
  });
});
