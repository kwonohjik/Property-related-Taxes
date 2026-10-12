/**
 * #12 후속 anchor — 「소득세법 시행령」 §156의2⑥ 괄호 「상속개시 당시 보유한 조합원입주권에 의하여 사업시행 완료 후 취득한 신축주택」을
 * 재개발 신축주택에서는 **선언이 아니라 입주권 취득일**로 판정한다(§155② 경로의 E-8·#12와 같은 규칙).
 *
 *   · 토지만 출자한 원조합원 — 입주권 취득일 = 관리처분계획 인가일(그 전에는 토지만 보유)
 *   · 승계조합원 — 입주권 승계 취득일
 *   · 주택을 출자한 원조합원 — 종전주택 취득일이 일반주택 취득일이라(§154⑧1호 통산) 이 갈래가 필요 없다
 *
 * 종전: 권리 축(`qualifyInheritedRight`)은 선언(`generalHouseRightAtInheritance`)만 읽었는데, 화면은 이 두 축에서 선언 칸을 열지 않아
 * 「인가(승계) 후 · 준공 전」에 상속이 개시된 경우 상속개시 당시 입주권을 보유했는데도 과세됐다.
 *
 * 시료: 토지(또는 입주권 승계) 취득 → 인가 2016-03-01 → 준공 2019-06-01 → 양도 2024-06-01 · 비조정 · 1세대 · 거주 36개월 ·
 *       상속받은 조합원입주권 1개(⑥ 모양). mock 세율.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { translateRedevAptForHousingJudgment, redevNewBuildRightAcquisitionDate } from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { generalHouseRightAtInheritanceVisible } from "@/lib/calc/inheritance-general-house-scope";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
type Origin = "land" | "housing" | "successor";

function apt(origin: Origin, inheritedDate: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: D("2024-06-01"),
    acquisitionDate: D(origin === "successor" ? "2016-06-01" : "2005-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 36,
    presaleRights: [
      {
        id: "r",
        type: "redevelopment_right",
        memberOrigin: "successor",
        acquisitionDate: D(inheritedDate),
        region: "capital",
        isInherited: true,
        inheritedDate: D(inheritedDate),
      },
    ],
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2016-03-01"),
      rightsValue: 250_000_000,
      settlementDirection: "pay",
      settlementAmount: 136_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: origin === "land" ? "land" : "housing",
      isSuccessorMember: origin === "successor",
      completionDate: D("2019-06-01"),
    } as RedevelopmentInfo,
    ...over,
  } as Partial<TransferTaxInput>);
}

describe("#12 후속 — §156의2⑥ 신축주택 갈래를 입주권 취득일로 판정", () => {
  it("★ 토지 출자 · 인가 후 · 준공 전 상속(2017-06-01) — 상속개시 당시 입주권 보유 → 비과세 (종전: 과세 42,375,581)", () => {
    const r = calculateTransferTax(apt("land", "2017-06-01"), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("★ 승계조합원 · 승계(2016-06-01) 후 · 준공 전 상속(2017-06-01) — 같은 규칙으로 비과세 (종전: 과세 97,823,000)", () => {
    const r = calculateTransferTax(apt("successor", "2017-06-01"), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("부정 짝 — 토지 출자 · 인가 전 상속(2015-06-01) — 토지만 보유 → 일반주택 아님 → 과세 (판정 변화 없음)", () => {
    const r = calculateTransferTax(apt("land", "2015-06-01"), rates);
    expect(r.isExempt).toBe(false);
    // 2026-10-12 재산세과-1693 반영 후 세액(기존건물분 max(표1, 사용승인 후 표2)) — 종전 42,375,581
    expect(r.totalTax).toBe(62_441_747);
  });

  it("부정 짝 — 승계조합원 · 승계 전 상속(2015-06-01) → 과세 (변화 없음)", () => {
    const r = calculateTransferTax(apt("successor", "2015-06-01"), rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(97_823_000);
  });

  it("선언이 날짜를 이기지 못한다 — 토지 출자 · 인가 전 상속에 「입주권 보유」 선언이 남아 있어도 과세", () => {
    const r = calculateTransferTax(apt("land", "2015-06-01", { generalHouseRightAtInheritance: "redevelopment_right" }), rates);
    expect(r.isExempt).toBe(false);
  });

  it("대조 — 주택 출자 원조합원은 종전주택 취득일(2005) 기준이라 이 갈래와 무관하게 비과세", () => {
    for (const inh of ["2015-06-01", "2017-06-01"]) {
      expect(calculateTransferTax(apt("housing", inh), rates).isExempt).toBe(true);
    }
  });

  it("번역 leaf — 승계조합원 = 승계일 · 토지 출자 = 인가일 · 주택 출자 = 없음", () => {
    const day = (d: Date | undefined) => d?.toISOString().slice(0, 10);
    expect(day(translateRedevAptForHousingJudgment(apt("successor", "2017-06-01")).newBuildRightAcquisitionDate)).toBe("2016-06-01");
    expect(day(translateRedevAptForHousingJudgment(apt("land", "2017-06-01")).newBuildRightAcquisitionDate)).toBe("2016-03-01");
    expect(translateRedevAptForHousingJudgment(apt("housing", "2017-06-01")).newBuildRightAcquisitionDate).toBeUndefined();
    // 준공일이 없으면 취득일이 준공일로 바뀌지 않으므로 갈래도 없다
    const noCompletion = apt("land", "2017-06-01");
    noCompletion.redevelopment = { ...noCompletion.redevelopment!, completionDate: undefined };
    expect(redevNewBuildRightAcquisitionDate(noCompletion)).toBeUndefined();
  });
});

describe("#12 후속 — 화면 게이트: 엔진이 날짜로 판정하는 토지 출자 신축주택에는 「입주권으로 완공한 신축주택」 선언 칸을 열지 않는다", () => {
  const form = (asset: Record<string, unknown>) => ({
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2014-01-01", ...asset }],
    transferDate: "2024-06-01",
    houses: [],
    presaleRights: [
      { id: "r", type: "redevelopment_right", acquisitionDate: "2013-06-01", region: "capital", isInherited: true, inheritedDate: "2013-06-01" },
    ] as PresaleRightEntry[],
  });
  const redevApt = { assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2019-06-01" };

  it("★ 토지 출자 원조합원 + 준공일 → 닫힌다 (종전: 토지 취득일 2014로 판정해 열렸고 엔진은 그 선언을 쓰지 않았다)", () => {
    expect(generalHouseRightAtInheritanceVisible(form({ ...redevApt, redevOriginalAssetType: "land" }) as never)).toBe(false);
  });
  it("긍정 짝 — 주택 출자 원조합원(종전주택 2014 취득 · 상속 2013)은 선언이 결론을 가르므로 열린다", () => {
    expect(generalHouseRightAtInheritanceVisible(form({ ...redevApt, redevOriginalAssetType: "housing" }) as never)).toBe(true);
  });
  it("부정 짝 — 청산금 수령 단독신고는 토지 출자 신축주택 축이 아니다(⑤④⑧ 공용 술어와 같은 범위)", () => {
    expect(
      generalHouseRightAtInheritanceVisible(
        form({ ...redevApt, redevOriginalAssetType: "land", redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes" }) as never,
      ),
    ).toBe(true);
  });
});
