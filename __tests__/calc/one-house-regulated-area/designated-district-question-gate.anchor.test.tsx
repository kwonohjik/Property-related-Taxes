/**
 * @vitest-environment jsdom
 *
 * S14b-7 — 「지정 지구 안인가요?」 질문은 엔진이 그 답을 쓰는 입주권 행에만 뜬다. 노출 게이트와 고지가 같은 술어
 * (`rightRowDistrictAnswerUsed`)를 쓴다.
 *
 * 쓰이는 곳은 주택 양도의 §89② 기존주택 원조합원 §155① 처분기한 판정뿐이다(`transfer-tax-89-2-exclusion.ts` — 비주택 양도·비1세대면
 * 조기 반환). 「소득세법 시행령」 제156조의2제3항·제4항(승계취득)·제156조의3제2항·제3항(상가·토지 원조합원)에는 조정대상지역 요건이 없고,
 * 분양권 행은 §89②가 취득일 축이다. 삼송동(4128111100)은 고양시 지구 한정 지정 동(2019.11.8.~2020.6.18.)이다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";
import {
  designatedDistrictUndeclared,
  rightRowDistrictAnswerUsed,
} from "@/lib/tax-engine/one-house/designated-district-undeclared";
import { baseTransferInput } from "../../tax-engine/_helpers/mock-rates";
import { observeCase, type RulingCase } from "../one-house-rulings/harness";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const SAMSONG = "4128111100";
const mk = (i: number, extra: Record<string, unknown>): PresaleRightEntry =>
  ({ id: `r${i}`, acquisitionDate: "2020-01-01", region: "capital", regionCode: SAMSONG, ...extra }) as unknown as PresaleRightEntry;

const ROWS = [
  mk(0, { type: "presale_right" }),
  mk(1, { type: "redevelopment_right", memberOrigin: "successor" }),
  mk(2, { type: "redevelopment_right", memberOrigin: "original_non_house" }),
  mk(3, { type: "redevelopment_right", memberOrigin: "original_house" }),
  mk(4, { type: "redevelopment_right" }), // 취득 경위 미입력 — 엔진이 두 갈래를 계산한다
];

function shownFor(primaryKind: string) {
  render(<PresaleRightsSection rights={ROWS} onChange={() => {}} primaryKind={primaryKind} transferDate="2022-06-01" />);
  return ROWS.map((_, i) => !!screen.queryByTestId(`designated-district-question-right-${i}`));
}

describe("S14b-7 — 지구 질문 노출 = 엔진 소비 술어", () => {
  it("주택 양도: 기존주택 원조합원·경위 미입력 행에만 뜬다", () => {
    expect(shownFor("housing")).toEqual([false, false, false, true, true]);
  });
  it("입주권 양도: §89②를 판정하지 않으므로 어느 행에도 안 뜬다", () => {
    expect(shownFor("right_to_move_in")).toEqual([false, false, false, false, false]);
  });
});

describe("S14b-7 — 같은 술어가 엔진 고지에도 쓰인다", () => {
  const D = (s: string) => new Date(s);
  const row = (extra: Record<string, unknown>) =>
    ({ id: "r", type: "redevelopment_right" as const, acquisitionDate: D("2020-01-15"), region: "capital" as const, regionCode: "4128710400", ...extra });
  const base = (propertyType: "housing" | "right_to_move_in") =>
    baseTransferInput({ propertyType, isOneHousehold: true, transferDate: D("2020-05-15"), acquisitionDate: D("2016-03-02") });

  it("주택 양도 + 원조합원 행 + 미선언 → 고지 · 선언하면 없음", () => {
    const u = designatedDistrictUndeclared({ ...base("housing"), presaleRights: [row({ memberOrigin: "original_house" })] });
    expect(u.map((x) => x.id)).toEqual(["regulated-district-undeclared:right-0"]);
    expect(designatedDistrictUndeclared({ ...base("housing"), presaleRights: [row({ memberOrigin: "original_house", inDesignatedDistrict: false })] })).toEqual([]);
  });
  it("입주권 양도 + 같은 행 → 고지 없음(답이 쓰이지 않는다)", () => {
    expect(designatedDistrictUndeclared({ ...base("right_to_move_in"), presaleRights: [row({ memberOrigin: "original_house" })] })).toEqual([]);
  });
  it("술어: 승계취득·상가토지·분양권 행은 주택 양도에서도 쓰이지 않는다", () => {
    expect(rightRowDistrictAnswerUsed({ type: "redevelopment_right", memberOrigin: "successor" }, true)).toBe(false);
    expect(rightRowDistrictAnswerUsed({ type: "redevelopment_right", memberOrigin: "original_non_house" }, true)).toBe(false);
    expect(rightRowDistrictAnswerUsed({ type: "presale_right" }, true)).toBe(false);
    expect(rightRowDistrictAnswerUsed({ type: "redevelopment_right", memberOrigin: "original_house" }, true)).toBe(true);
    expect(rightRowDistrictAnswerUsed({ type: "redevelopment_right" }, true)).toBe(true);
  });
});

describe("S14b-7 — 판정 메뉴 실측: 기존주택 원조합원 행의 답은 주택 양도에서만 결론을 가른다", () => {
  async function menu(kind: "housing" | "right_to_move_in", inDesignatedDistrict: boolean | undefined) {
    const c: RulingCase = {
      id: "s14b-7", docNo: "-", docDate: "-", basis: "era", today: "2022-06-01", summary: "S14b-7", bucket: "match",
      form: {
        isOneHousehold: true,
        transferDate: "2022-06-01",
        contractTotalPrice: "1000000000",
        presaleRights: [
          { id: "r0", type: "redevelopment_right", memberOrigin: "original_house", acquisitionDate: "2020-01-01", region: "capital", regionCode: SAMSONG, inDesignatedDistrict, managementDisposalApprovalDate: "2019-06-01" },
        ],
        asset:
          kind === "housing"
            ? { assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: "1168010100", residenceInputMode: "direct", residencePeriodMonthsAsset: "60" }
            : { assetKind: "right_to_move_in", acquisitionDate: "2015-01-01", regionCode: "1168010100", redevSubject: "right", redevExemptionEligibleAtApproval: "yes", redevPriorHouseHoldingMonths: "60", redevPriorHouseResidenceMonths: "30" },
      } as RulingCase["form"],
    };
    return observeCase(c);
  }
  it("주택 양도: 미선언 → 과세 + 고지 / 지구 밖 → 비과세(답이 결론을 가른다)", async () => {
    const u = await menu("housing", undefined);
    expect(u.isExempt).toBe(false);
    expect(u.undetermined).toContain("regulated-district-undeclared:right-0");
    expect((await menu("housing", false)).isExempt).toBe(true);
  });
  it("입주권 양도: 세 값의 응답이 같고 고지가 없다(답이 쓰이지 않는다)", async () => {
    const [a, b, c] = [await menu("right_to_move_in", undefined), await menu("right_to_move_in", true), await menu("right_to_move_in", false)];
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(a.undetermined).not.toContain("regulated-district-undeclared:right-0");
  });
});
