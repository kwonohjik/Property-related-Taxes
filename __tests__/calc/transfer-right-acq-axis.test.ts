/**
 * 입주권 취득가액 입력 축 — API 변환(⑬) anchor
 *
 * 계획서: docs/02-design/features/right-to-move-in-top-acq-axis-removal.plan.md §5 Phase 1
 *
 * 배경 (착수 전 실측 — 계획서 §2.1~§2.3):
 *  - 입주권 화면 상단의 일반 「취득가액 산정 방식·취득가액」(축 A)은 계산에 도달하지 않는다.
 *    실거래가 모드에서는 §166 섹션의 `redevActualAcquisitionPrice`가 쓰이고, 감정·매매사례·환산
 *    모드에서는 `acquisitionPrice`가 **0**이 되어 인가전 양도차익 = 권리가액 − 0 으로 과대과세된다.
 *  - **그 소스를 고정하는 테스트가 하나도 없었다** — `transfer-tax-api.ts:300`의 취득가액 소스를
 *    `fixedAcquisitionPrice`로 뒤집는 mutation에 전체 vitest 15,586건이 전부 통과했다.
 *    A-1이 그 무방비 지점을 메운다.
 *  - 승계조합원 입주권은 §166①의 적용 대상이 아니다(「조합에 기존건물과 그 부수토지를 **제공**하고
 *    취득한」 — 승계자는 제공한 사실이 없다). 취득가액은 §97①1호 가목 실지거래가액이고,
 *    구성은 「권리가액 상당 + 프리미엄 + 취득 이후 납입한 추가분담금」이다
 *    (기준-2025-법규재산-0057, 2025-06-19).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}

/** ⑤ 「인가전 분 종전 부동산 취득가액」 — 원조합원 입주권의 취득가액 정본 */
const REDEV_ACTUAL_ACQ = 77_777_777;
/** 상단 축 A 「취득가액」 — 입주권에서는 계산에 도달해서는 안 되는 값 */
const TOP_AXIS_ACQ = 100_000_000;
/** 승계취득가액 (권리가액 상당 + 프리미엄) */
const SUCCESSOR_ACQ = 350_000_000;
/** 승계 후 납입한 추가분담금 */
const SUCCESSOR_CONTRIB = 90_000_000;

/** 원조합원 입주권 (취득일 < 관리처분 인가일) */
function originalMemberRight(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2015-03-01",
    isSuccessorRightToMoveIn: false,
    actualSalePrice: "500,000,000",
    fixedAcquisitionPrice: String(TOP_AXIS_ACQ),
    redevSubject: "right",
    redevOriginalAssetType: "land",
    redevSettlementDirection: "pay",
    redevApprovalDate: "2018-10-23",
    redevRightsValue: "300000000",
    redevSettlementAmount: "90000000",
    redevActualAcquisitionPrice: String(REDEV_ACTUAL_ACQ),
    useEstimatedAcquisition: false,
    ...over,
  };
}

/** 승계조합원 입주권 (관리처분 인가 후 승계취득) */
function successorRight(over: Record<string, unknown> = {}) {
  return {
    ...originalMemberRight(),
    acquisitionDate: "2020-05-01",
    isSuccessorRightToMoveIn: true,
    successorRightAcqPrice: String(SUCCESSOR_ACQ),
    successorRightAddedContribution: String(SUCCESSOR_CONTRIB),
    ...over,
  };
}

/** 완공APT (재개발_apt) — 무변경 트립와이어용 */
function completedApt(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2015-03-01",
    actualSalePrice: "800,000,000",
    fixedAcquisitionPrice: String(TOP_AXIS_ACQ),
    redevSubject: "apt",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "pay",
    redevApprovalDate: "2018-10-23",
    redevRightsValue: "300000000",
    redevSettlementAmount: "90000000",
    redevActualAcquisitionPrice: String(REDEV_ACTUAL_ACQ),
    redevCompletionDate: "2022-06-01",
    useEstimatedAcquisition: false,
    ...over,
  };
}

function makeForm(asset: Record<string, unknown>, salePrice = "500,000,000") {
  return {
    transferDate: "2026-02-16",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: salePrice,
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

afterEach(() => vi.unstubAllGlobals());

describe("입주권 취득가액 축 — 원조합원", () => {
  it("A-1: 실거래가 모드 → acquisitionPrice = ⑤ 값 (상단 축 A는 미도달)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(originalMemberRight()));
    expect(
      cap.body?.acquisitionPrice,
      "재개발·입주권의 취득가액 정본은 §166 섹션의 redevActualAcquisitionPrice다 " +
        "(transfer-tax-api.ts:291-302). 상단 fixedAcquisitionPrice가 들어오면 회귀다.",
    ).toBe(REDEV_ACTUAL_ACQ);
  });

  it("A-2: stale 매매사례가액 → 여전히 ⑤ 값 · acquisitionMethod=actual (구: 0 / salesCase)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm(originalMemberRight({ isSalesCaseAcquisition: true, similarSalesValue: "123456789" })),
    );
    expect(cap.body?.acquisitionPrice).toBe(REDEV_ACTUAL_ACQ);
    expect(cap.body?.acquisitionMethod).toBe("actual");
    expect(
      cap.body?.similarSalesValue,
      "§166 경로는 similarSalesValue를 읽지 않는다 — 보내면 죽은 값이다.",
    ).toBeUndefined();
  });

  it("A-3: stale 감정가액 → 여전히 ⑤ 값 · acquisitionMethod=actual (구: 0 / appraisal)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(originalMemberRight({ isAppraisalAcquisition: true })));
    expect(cap.body?.acquisitionPrice).toBe(REDEV_ACTUAL_ACQ);
    expect(cap.body?.acquisitionMethod).toBe("actual");
    expect(cap.body?.appraisalValue).toBeUndefined();
  });

  it("A-1b: 환산 모드는 그대로 — useEstimatedAcquisition은 ⑤ 라디오의 정본이다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(originalMemberRight({ useEstimatedAcquisition: true })));
    expect(cap.body?.useEstimatedAcquisition).toBe(true);
    expect(cap.body?.acquisitionMethod).toBe("estimated");
  });
});

describe("입주권 취득가액 축 — 승계조합원 (§166 미적용 · §97①1호 가목)", () => {
  it("A-4: redevelopment 페이로드를 보내지 않는다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(successorRight()));
    expect(
      cap.body?.redevelopment,
      "승계조합원은 조합에 기존건물을 제공한 사실이 없어 §166①의 적용 대상이 아니다 " +
        "— 재개발 페이로드를 보내면 엔진이 3분할 산식을 탄다.",
    ).toBeUndefined();
  });

  it("A-5: acquisitionPrice = 승계취득가 + 추가분담금", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(successorRight()));
    expect(cap.body?.acquisitionPrice).toBe(SUCCESSOR_ACQ + SUCCESSOR_CONTRIB);
    expect(cap.body?.acquisitionMethod).toBe("actual");
    expect(cap.body?.useEstimatedAcquisition).toBe(false);
  });

  it("A-5b: 추가분담금 미입력이면 승계취득가액 단독", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(successorRight({ successorRightAddedContribution: "" })));
    expect(cap.body?.acquisitionPrice).toBe(SUCCESSOR_ACQ);
  });

  /**
   * 🔴 2026-08-23 **범위 축소** (R-12) — 종전에는 `isSalesCaseAcquisition`·`useEstimatedAcquisition`도
   * 「stale 노이즈」로 함께 넣고 무시됨을 단언했다. 이제 그 둘은 승계에서 **정식 입력**이다
   * (§165① 기준시가 경로가 열렸다). 따라서 이 케이스는 **실거래가 모드 한정**으로 좁히고,
   * 추계 활성화는 아래 A-5d가 별도로 고정한다.
   *
   * 여기 남는 stale은 여전히 stale이다:
   *   `fixedAcquisitionPrice`      — 감정 모드 전용 칸(실가 모드에서는 승계 2칸이 정본)
   *   `redevActualAcquisitionPrice` — **원조합원 §166 전용**(승계는 §166 대상이 아니다)
   */
  it("A-5c: 실가 모드 — stale 감정칸·§166칸이 남아 있어도 승계 2칸이 이긴다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm(
        successorRight({
          fixedAcquisitionPrice: "999999999",
          redevActualAcquisitionPrice: "888888888",
        }),
      ),
    );
    expect(cap.body?.acquisitionPrice).toBe(SUCCESSOR_ACQ + SUCCESSOR_CONTRIB);
    expect(cap.body?.useEstimatedAcquisition).toBe(false);
  });

  /**
   * R-12 — 승계 입주권의 추계 3종. 근거: 법 §94①2호**가목** → §99①2호 가목 → 영 **§165①**
   * (납입액 + 프리미엄) · 환산 산식 영 §176의2②**2호** · 추계 순서 영 §176의2③.
   *
   * ⚠️ **추계 모드에서 승계 2칸을 보내면 안 된다** — 엔진이 `appraisalValue ?? acquisitionPrice`로
   *    후퇴할 때 실가가 남아 있으면 고른 추계값 대신 그것이 취득가액이 된다.
   */
  it("A-5d: 매매사례 모드 → acquisitionPrice 0 · 승계 2칸 미송신", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm(
        successorRight({
          isSalesCaseAcquisition: true,
          similarSalesValue: "420000000",
          successorRightStdPaidAtAcq: "300000000",
        }),
      ),
    );
    expect(cap.body?.acquisitionMethod).toBe("salesCase");
    expect(cap.body?.acquisitionPrice).toBe(0);
    expect(cap.body?.similarSalesValue).toBe(420_000_000);
    // §163⑥ 개산공제 base — §165① 합계가 실린다
    expect(cap.body?.standardPriceAtAcquisition).toBe(300_000_000);
  });

  it("A-5e: 환산 모드 → §165① 4칸이 취득·양도 기준시가 한 쌍으로 합산돼 실린다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm(
        successorRight({
          useEstimatedAcquisition: true,
          successorRightStdPaidAtAcq: "250000000",
          successorRightStdPremiumAtAcq: "50000000",
          successorRightStdPaidAtTransfer: "500000000",
          successorRightStdPremiumAtTransfer: "100000000",
        }),
      ),
    );
    expect(cap.body?.acquisitionMethod).toBe("estimated");
    expect(cap.body?.useEstimatedAcquisition).toBe(true);
    expect(cap.body?.acquisitionPrice).toBe(0);
    expect(cap.body?.standardPriceAtAcquisition).toBe(300_000_000); // 250,000,000 + 50,000,000
    expect(cap.body?.standardPriceAtTransfer).toBe(600_000_000); // 500,000,000 + 100,000,000
  });
});

describe("완공APT 무변경 트립와이어", () => {
  it("A-8: 완공APT + 매매사례가액 → 현행 동작 유지 (0 / salesCase)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm(completedApt({ isSalesCaseAcquisition: true, similarSalesValue: "123456789" }), "800,000,000"),
    );
    expect(
      cap.body?.acquisitionPrice,
      "완공APT는 본 PR 범위 밖이다 — 여기까지 바뀌면 과잉 변경이다.",
    ).toBe(0);
    expect(cap.body?.acquisitionMethod).toBe("salesCase");
  });

  it("A-9: 완공APT + 승계조합원(사례 48) → isSuccessorMember=true 유지", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm(completedApt({ redevIsSuccessorMember: "yes", acquisitionDate: "2020-05-01" }), "800,000,000"),
    );
    const redev = cap.body?.redevelopment as Record<string, unknown> | undefined;
    expect(redev?.isSuccessorMember).toBe(true);
    expect(
      cap.body?.acquisitionPrice,
      "사례 48 승계조합원은 자산 카드 fixedAcquisitionPrice를 쓴다 (transfer-tax-api.ts:298-300).",
    ).toBe(TOP_AXIS_ACQ);
  });
});
