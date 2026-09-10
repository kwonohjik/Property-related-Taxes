/**
 * anchor: **스스로 사라지는 카드**의 ⑧ 게이트 — 채울 칸 없는 영구 차단을 막는다 (UI 리뷰 보통).
 *
 * 세 축을 한 파일에 모았다. 모양이 같기 때문이다 — **노출 조건이 ⑤에만 있고 ⑧은 플래그만 본다**.
 *
 * | 축 | 카드가 사라지는 계기 | 종전 차단 메시지 |
 * |---|---|---|
 * | §89② 3년 초과 예외 | 양도일을 3년 이내로 정정 · 권리 행 삭제 · 자산 종류 전환 | 「신축주택 완성일을 입력하세요」 |
 * | 겸용 Case A | PHD를 켜서 최초고시일을 채운 뒤 **다시 끔** | 「취득시 상가건물 기준시가를 입력하세요」 |
 * | §164⑤ PHD | 주택에서 **자동 ON** 된 뒤 자산 종류 전환 | 「최초 고시일을 입력하세요」 외 11칸 |
 */
import { describe, it, expect } from "vitest";
import { rightThreeYearExceptionVisible } from "@/lib/calc/right-three-year-exception-scope";
import { isMixedUseCaseA } from "@/lib/calc/mixed-use-case";
import { phdToggleReachable } from "@/lib/calc/phd-toggle-scope";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2000-03-01",
    acquisitionPrice: "600000000",
    actualSalePrice: "2000000000",
    acquisitionArea: "100",
    ...over,
  }) as AssetForm;

const form = (over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets: [asset()],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "2000000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    ...over,
  }) as unknown as TransferFormData;

const msgs = (f: TransferFormData) => collectStepIssues(1, f).map((i) => i.message);

/** 3년을 넘긴 분양권 1건 — 카드가 열리는 최소 조건. */
const RIGHT_OVER_3Y = [{ acquisitionDate: "2019-01-01", type: "presale_right" }];

describe("§89② 3년 초과 예외 — 카드가 사라지면 ⑧도 멈춘다", () => {
  it("R-1: 술어 — 주택 계열 §154① 대상 + 3년 초과 권리가 있어야 참", () => {
    expect(rightThreeYearExceptionVisible(form({ presaleRights: RIGHT_OVER_3Y }))).toBe(true);
    // 3년 이내로 정정 → 카드가 닫힌다.
    expect(
      rightThreeYearExceptionVisible(
        form({ presaleRights: [{ acquisitionDate: "2023-01-01", type: "presale_right" }] }),
      ),
    ).toBe(false);
    // 권리 행 삭제 · 비대상 자산 종류
    expect(rightThreeYearExceptionVisible(form({ presaleRights: [] }))).toBe(false);
    expect(
      rightThreeYearExceptionVisible(
        form({ presaleRights: RIGHT_OVER_3Y, assets: [asset({ assetKind: "land" })] }),
      ),
    ).toBe(false);
  });

  it("🔑 R-2: 카드가 사라진 뒤 stale 선택은 계산을 막지 않는다", () => {
    const stale = form({
      presaleRights: [],
      rightThreeYearExceptionKind: "new_house",
      rightNewHouseCompletionDate: "",
    });
    expect(msgs(stale).filter((m) => m.includes("신축주택 완성일"))).toHaveLength(0);
  });

  it("R-3: 카드가 보이면 **종전대로 요구**한다 (축을 죽인 게 아니다)", () => {
    const visible = form({
      presaleRights: RIGHT_OVER_3Y,
      rightThreeYearExceptionKind: "new_house",
      rightNewHouseCompletionDate: "",
    });
    expect(msgs(visible)).toContain(
      "3년 초과 예외(시행령 §156의2④): 신축주택 완성일을 입력하세요.",
    );
  });

  it("R-4: 경매·공매 갈래도 같다", () => {
    const visible = form({
      presaleRights: RIGHT_OVER_3Y,
      rightThreeYearExceptionKind: "delay",
      rightDisposalDelayReason: "",
    });
    expect(msgs(visible)).toContain(
      "3년 초과 예외(시행규칙 §75①): 3년이 되는 날 현재의 사유를 선택하세요.",
    );
    const gone = form({
      presaleRights: [],
      rightThreeYearExceptionKind: "delay",
      rightDisposalDelayReason: "",
    });
    expect(msgs(gone).filter((m) => m.includes("3년이 되는 날"))).toHaveLength(0);
  });
});

describe("겸용 Case A — PHD가 꺼지면 Case A도 아니다", () => {
  const caseAFields = {
    isMixedUseHouse: true,
    hasPartialUsageChange: true,
    partialChangeDirection: "house_to_commercial" as const,
    phdFirstDisclosureDate: "2005-04-30",
    partialChangeDate: "2015-06-01",
  };

  it("🔑 C-1: PHD OFF면 Case A가 아니다 — ⑤가 상가 기준시가 칸을 지우지 않는다", () => {
    expect(isMixedUseCaseA(asset({ ...caseAFields, usePreHousingDisclosure: false }))).toBe(false);
  });

  it("C-2: PHD ON이면 종전대로 Case A다", () => {
    expect(isMixedUseCaseA(asset({ ...caseAFields, usePreHousingDisclosure: true }))).toBe(true);
  });
});

describe("§164⑤ PHD — 토글이 닿지 않는 자산 종류에서는 11칸을 요구하지 않는다", () => {
  it("P-1: 술어 — 주택은 항상, 건물은 분리취득일 때만", () => {
    expect(phdToggleReachable({ assetKind: "housing" })).toBe(true);
    expect(
      phdToggleReachable({ assetKind: "building", hasSeperateLandAcquisitionDate: true }),
    ).toBe(true);
    expect(phdToggleReachable({ assetKind: "building" })).toBe(false);
    expect(phdToggleReachable({ assetKind: "land" })).toBe(false);
    expect(phdToggleReachable({ assetKind: "commercial_building" })).toBe(false);
  });

  it("🔑 P-2: 주택에서 자동 ON 된 뒤 토지로 바꿔도 「최초 고시일」을 요구하지 않는다", () => {
    const land = asset({
      assetKind: "land",
      useEstimatedAcquisition: true,
      usePreHousingDisclosure: true,
      standardPriceAtAcq: "300000000",
      standardPriceAtTransfer: "800000000",
    });
    // 차단이 아예 없다 — 토지 환산에 필요한 기준시가 2칸은 채워 두었으므로 통과가 정답이다.
    expect(validateAssetEntry(land, 0, form({ assets: [land] }))).toBeNull();
  });

  it("P-3: 주택에서는 종전대로 11칸을 요구한다", () => {
    const house = asset({
      useEstimatedAcquisition: true,
      usePreHousingDisclosure: true,
      phdFirstDisclosureDate: "",
    });
    expect(validateAssetEntry(house, 0, form({ assets: [house] }))).toContain("최초 고시일");
  });
});
