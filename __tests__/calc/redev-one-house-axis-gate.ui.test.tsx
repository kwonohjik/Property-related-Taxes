/** @vitest-environment jsdom */
/**
 * G3-2 ⑤ — 재개발 완공APT 카드 게이트(③-c 청산금분 선언 · 거주월수 분리)가 **§155 의제 후보 세대**에도 열린다.
 *
 * 종전: Step1이 `form.householdHousingCount === "1"`(원시 스칼라)을 `isOneHouseSingle`로 넘겨, 일시적 2주택·상속주택
 * 포함 2주택 같은 의제 후보 세대는 같은 날 동시신고·단독신고에서 ③-c 카드가 닫혔다 — 정답에 이를 입력 경로가 없었다.
 * 엔진의 표2·§154① 축은 §155 의제를 포함한다(`resolveRedevAptOneHouseTable2Axis`).
 *
 * 이 파일은 **Step1 배선까지** 본다(leaf 단위 테스트만으로는 Step1이 그 leaf를 쓰는지 증명되지 않는다).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { redevOneHouseAxisCandidate } from "@/lib/calc/redev-one-house-axis";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const TID = "redev-one-house-at-settlement-sale";
/** ③-c 「비과세 보유 요건」(종전주택 보유 요건 선언) 카드 제목 — 단독신고에서 이 카드가 유일한 입력 경로다 */
const ELIGIBLE_CARD = "비과세 보유 요건 (관리처분계획인가일 기준 보유 2년)";

/** 완공APT + 청산금 수령 + 원조합원 + **같은 날 동시신고**(청산금분 양도일 = 양도일) */
function form(count: string, over: Partial<TransferFormData> = {}): TransferFormData {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionDate: "2001-01-01",
    redevApprovalDate: "2014-02-01",
    redevRightsValue: "800000000",
    redevSettlementDirection: "receive",
    redevSettlementAmount: "200000000",
    redevSettlementSaleDate: "2022-03-01",
    redevReceiveOnlyMode: "",
  } as unknown as AssetForm;
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2022-03-01",
    assets: [asset],
    isOneHousehold: true,
    householdHousingCount: count,
    ...over,
  } as TransferFormData;
}

function renderStep1(f: TransferFormData) {
  return render(<Step1 form={f} onChange={() => {}} />);
}

describe("redevOneHouseAxisCandidate — leaf", () => {
  const c = (isOneHousehold: boolean, n: string) =>
    redevOneHouseAxisCandidate({ isOneHousehold, householdHousingCount: n });
  it("1세대 + 주택 1·2채만 후보(§155 의제는 세대 주택 수 2의 규정)", () => {
    expect([c(true, "1"), c(true, "2")]).toEqual([true, true]);
  });
  it("3채 이상 · 빈 값 · 1세대 아님은 후보가 아니다", () => {
    expect([c(true, "3"), c(true, ""), c(true, "0"), c(false, "1")]).toEqual([false, false, false, false]);
  });
});

describe("G3-2 ⑤ — Step1 → RedevelopmentBlock 게이트 (같은 날 동시신고)", () => {
  it("🔑 일시적 2주택·상속주택 포함 2주택(원시 스칼라 2) — ③-c 청산금분 선언 카드가 열린다(수정 전: 닫힘)", () => {
    renderStep1(form("2"));
    expect(screen.queryByTestId(TID)).not.toBeNull();
  });

  it("긍정 짝 — 실제 1주택(스칼라 1)은 종전대로 열린다", () => {
    renderStep1(form("1"));
    expect(screen.queryByTestId(TID)).not.toBeNull();
  });

  it("부정 짝 — 3채 이상 세대는 닫힌다(후보가 아님)", () => {
    renderStep1(form("3"));
    expect(screen.queryByTestId(TID)).toBeNull();
  });

  it("부정 짝 — 1세대가 아니면 닫힌다", () => {
    renderStep1(form("1", { isOneHousehold: false }));
    expect(screen.queryByTestId(TID)).toBeNull();
  });

  it("단독신고는 양도일을 묻지 않는다 — 양도일이 곧 청산금분 양도일(세대 입력이 그 날의 사실)", () => {
    const f = form("2");
    f.assets = [{ ...f.assets[0], redevReceiveOnlyMode: "yes" } as AssetForm];
    renderStep1(f);
    expect(screen.queryByTestId(TID)).toBeNull();
  });

  it("🔑 단독신고 + 의제 후보(스칼라 2) — 종전주택 보유 요건 선언 카드는 열린다(수정 전: 닫혀 비과세 선언 경로 없음)", () => {
    const f = form("2");
    f.assets = [{ ...f.assets[0], redevReceiveOnlyMode: "yes" } as AssetForm];
    const { container } = renderStep1(f);
    expect(container.textContent).toContain(ELIGIBLE_CARD);
  });

  it("부정 짝 — 단독신고 + 3채 이상은 그 카드도 닫힌다", () => {
    const f = form("3");
    f.assets = [{ ...f.assets[0], redevReceiveOnlyMode: "yes" } as AssetForm];
    const { container } = renderStep1(f);
    expect(container.textContent).not.toContain(ELIGIBLE_CARD);
  });
});
