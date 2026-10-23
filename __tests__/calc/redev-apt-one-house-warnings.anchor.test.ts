/**
 * anchor — 재개발 완공APT도 1세대1주택 판정 안내(경고)를 일반 주택과 같이 받는다
 * (`docs/00-pm/redev-apt-one-house-warning-parity.plan.md` D-1~D-3 · Q-1 (a) · Q-2 (a)).
 *
 * 시료(§1.1 W6a): 승계조합원 완공APT · 사용승인 2021-02-15(대전 유성 — 조정) · 거주 0 · 1주택 · 2024-06-01 양도 ·
 * 삭제 전 §154①4호 선택 · 사업자·임대 등록 신청 2019-12-17(부칙 제38조② 기한 2019-12-16 뒤 → 미충족).
 *
 * | # | 주장 |
 * |---|---|
 * | RW-1 | 화면 경로 · 승계조합원 완공APT · 4호 미충족 — ⑧ 통과 · 일반 주택과 같은 4호 경고 1건 |
 * | RW-2 | API 직접 · 승계조합원 완공APT · §155① 역순 + 3호 — 순서 사유 경고 1건 |
 * | RW-3 | 청산금 수령 단독신고 — 판정 결과를 쓰지 않아 공용 안내를 내지 않는다 |
 * | RW-4 | 원조합원 완공APT · §155④⑤ 합가 전 보유자 미선택 — 일반 주택과 같은 확인 필요 1건 |
 * | RW-5 | 승계조합원 완공APT · 같은 사실 — 판정이 보는 취득일(사용승인일)이 혼인 뒤라 고지하지 않는다(원본 입력을 넘기면 잘못 고지) |
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
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
import { runCalc, postTransfer, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const YUSEONG = "3020010100";
const NR = "4682025021";
const RENTAL_4HO_TEXT = /삭제 전 §154①4호 .*을 적용하지 않았습니다 — .*2019년 12월 16일 뒤/;
const ORDER_TEXT = /먼저 취득했습니다 — 양도하는 주택이 나중에 취득한 주택이라 일시적 2주택\(.*§155①\)이 적용되지 않습니다/;

const RENTAL_4HO_FORM = {
  provisoReason: "rental_registration_4ho",
  proviso4hoBusinessRegDate: "2019-12-17",
  proviso4hoRentalRegDate: "2019-12-17",
  proviso4hoRegulatedOneHouse: "yes",
  proviso4hoStatus: "maintained",
  proviso4hoDuringMandatory: "no",
  proviso4hoRentOver5: "no",
};

/** 승계조합원 완공APT — 사용승인 2021-02-15 · 청산금 없음 */
const SUCCESSOR = {
  acquisitionDate: "2019-06-01",
  redevIsSuccessorMember: "yes",
  redevApprovalDate: "2019-03-15",
  redevCompletionDate: "2021-02-15",
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  redevSettlementAmount: "0",
};

const count = (ws: string[] | undefined, re: RegExp) => (ws ?? []).filter((w) => re.test(w)).length;

describe("완공APT 경로가 공용 안내를 받는다", () => {
  it("RW-1 화면 · 승계조합원 완공APT · 4호 미충족 — 일반 주택과 같은 4호 경고 1건", async () => {
    const redev = await runCalc(
      redevAptForm({
        price: "1000000000",
        assetOver: { ...SUCCESSOR, regionCode: YUSEONG, residencePeriods: [] },
        formOver: { ...RENTAL_4HO_FORM, isRegulatedArea: false, wasRegulatedAtAcquisition: true } as never,
      }),
    );
    expect(redev.issues).toEqual([]);
    expect(redev.result.isExempt).toBe(false);
    expect(count(redev.result.warnings, RENTAL_4HO_TEXT)).toBe(1);

    // 일반 주택 짝 — 같은 문장
    const housing = await runCalc(
      redevAptForm({
        kind: "housing",
        price: "1000000000",
        assetOver: { acquisitionDate: "2021-02-15", regionCode: YUSEONG, residencePeriods: [] },
        formOver: { ...RENTAL_4HO_FORM, isRegulatedArea: false, wasRegulatedAtAcquisition: true } as never,
      }),
    );
    const pick = (ws: string[]) => ws.find((w) => RENTAL_4HO_TEXT.test(w));
    expect(pick(redev.result.warnings)).toBe(pick(housing.result.warnings));
  });

  it("RW-2 API 직접 · 승계조합원 완공APT · §155① 역순 + 3호 — 순서 사유 경고 1건", async () => {
    const f = redevAptForm({
      houses: [houseRow("n1", "2020-09-01", { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" } as never)],
      count: "2",
      price: "1000000000",
      assetOver: { ...SUCCESSOR, regionCode: NR, residencePeriods: [{ moveInDate: "2021-02-15", moveOutDate: "2024-05-31" }] },
    });
    const base = await runCalc(f);
    const r = await postTransfer({
      ...base.body,
      temporaryTwoHouse: { newHouseRegionCode: NR, previousAcquisitionDate: "2021-02-15", newAcquisitionDate: "2020-09-01" },
      oneHouseExemptionProviso: { reason: "unavoidable" },
    });
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
    expect(count(r.result.warnings, ORDER_TEXT)).toBe(1);
  });

  it("RW-3 청산금 수령 단독신고 — 공용 안내를 내지 않는다(판정 결과 미사용)", async () => {
    const f = redevAptForm({
      price: "1000000000",
      // 조정지역(유성 2020-06-19~) 취득이라 거주 2년이 필요하다 — 4호가 미충족이면 판정 결과에 사유가 생기는 시료
      assetOver: {
        acquisitionDate: "2020-08-01",
        redevApprovalDate: "2021-03-01",
        regionCode: YUSEONG,
        residencePeriods: [],
        redevSettlementDirection: "receive",
        redevReceiveOnlyMode: "yes",
        redevSettlementSaleDate: "2023-01-02",
        redevSettlementAmount: "50000000",
      },
      formOver: { ...RENTAL_4HO_FORM, isRegulatedArea: false, wasRegulatedAtAcquisition: true } as never,
    });
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(count(r.result.warnings, RENTAL_4HO_TEXT)).toBe(0);
  });
});

describe("§155④⑤ 합가 「모름」 — 판정이 본 입력(번역본)으로 고지한다", () => {
  const MERGE_TEXT = /§155④⑤ 합가 특례 — 확인 필요/;
  /** 혼인 2020-01-01 · 다른 주택 2018-01-01(합가 전 보유자 미선택) · 2024-06-01 양도 · 경남(비조정) */
  async function merged(kind: "original" | "successor" | "housing") {
    const houses = [houseRow("n1", "2018-01-01", { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" } as never)];
    const assetOver =
      kind === "successor"
        ? { ...SUCCESSOR, regionCode: NR, residencePeriods: [] }
        : kind === "original"
          ? { acquisitionDate: "2015-01-01", redevApprovalDate: "2016-06-01", regionCode: NR, residencePeriods: [] }
          : { acquisitionDate: "2015-01-01", regionCode: NR, residencePeriods: [] };
    const base = await runCalc(redevAptForm({ kind: kind === "housing" ? "housing" : "redevelopment_apt", houses, count: "2", price: "1000000000", assetOver }));
    const r = await postTransfer({ ...base.body, marriageMerge: { marriageDate: "2020-01-01" }, isFirstTransferredInMerge: true });
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
    return r.result.warnings as string[];
  }

  it("RW-4 원조합원 완공APT — 일반 주택과 같은 확인 필요 1건", async () => {
    const redev = await merged("original");
    expect(count(redev, MERGE_TEXT)).toBe(1);
    const housing = await merged("housing");
    expect(redev.find((w) => MERGE_TEXT.test(w))).toBe(housing.find((w) => MERGE_TEXT.test(w)));
  });

  it("RW-5 승계조합원 완공APT(사용승인 2021-02-15 — 혼인 뒤) — 합가 의제가 설 수 없어 고지하지 않는다", async () => {
    expect(count(await merged("successor"), MERGE_TEXT)).toBe(0);
  });
});
