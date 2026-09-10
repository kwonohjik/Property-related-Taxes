/**
 * anchor: 「증거 소멸 48건」 표본 재확인에서 **아직 살아 있던** 항목들 (2026-09-07).
 *
 * 대장 216건 중 48건은 「인용한 증거 문자열이 그 줄에 더 없다」는 이유로 미확인 상태였다.
 * 高 9건을 전수 확인하니 2건이 살아 있었고(22%), 나머지 39건을 마저 대조하니 22건이 더 살아 있었다.
 * ⇒ **증거 문자열의 소멸은 수정의 증거가 아니다** — 리팩터로 줄이 바뀐 것일 수 있다.
 *
 * 순수 함수·페이로드 축은 여기, 렌더 축은 `evidence-gone-sweep.test.tsx`에 있다.
 */
import { describe, it, expect, vi } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 다건 ④ body를 가로채 반환한다. */
async function captureMultiBody(form: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ result: {} }) } as unknown as Response;
    }),
  );
  await callMultiTransferTaxAPI(
    { ...defaultMultiTransferFormData, transferDate: "2026-01-27", properties: [] } as never,
    [{ propertyId: "p1", propertyLabel: "자산 1", form } as never],
  ).catch(() => {});
  vi.unstubAllGlobals();
  return (cap.body?.properties as Record<string, unknown>[] | undefined)?.[0];
}

function housingForm(over: Partial<AssetForm> = {}, formOver: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-01-27",
    contractTotalPrice: "700,000,000",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-06-01",
        actualSalePrice: "700,000,000",
        fixedAcquisitionPrice: "300,000,000",
        standardPriceAtTransfer: "700,000,000",
        ...over,
      } as AssetForm,
    ],
    ...formOver,
  } as TransferFormData;
}

/* ── #12 · #11 — 다건 ④가 단건과 같은 키를 만든다 ───────────────────────────── */

describe("#12 — 다건 ④가 최상위 `regionCode`를 보낸다", () => {
  it("🔑 A-1: 자산 `regionCode`가 payload 최상위에 실린다 — boolean fallback으로 떨어지지 않는다", async () => {
    const first = await captureMultiBody(housingForm({ regionCode: "1168010100" }));
    expect(first?.regionCode).toBe("1168010100");
  });

  it("A-2: 코드가 없으면 키도 없다 — 빈 문자열을 지어내지 않는다", async () => {
    const first = await captureMultiBody(housingForm({ regionCode: "" }));
    expect(first?.regionCode).toBeUndefined();
  });
});

describe("#11 — 다건 ④가 증축부분 취득당시 기준시가를 보낸다", () => {
  it("🔑 B-1: ⑧이 필수로 요구하는 값이 ④에도 실린다", async () => {
    const first = await captureMultiBody(
      housingForm({
        isSelfBuilt: true,
        buildingType: "extension",
        constructionDate: "2015-03-01",
        extensionFloorArea: "30",
        extensionStdPriceAtAcquisition: "50,000,000",
      }),
    );
    expect(first?.extensionStdPriceAtAcquisition).toBe(50_000_000);
    // 면적만 실리고 base가 빠지던 종전 상태의 짝 — 둘 다 있어야 §114조의2 환산이 성립한다.
    expect(first?.extensionFloorArea).toBe(30);
  });

  it("B-2: 신축(증축 아님)이면 보내지 않는다", async () => {
    const first = await captureMultiBody(
      housingForm({
        isSelfBuilt: true,
        buildingType: "new",
        constructionDate: "2015-03-01",
        extensionStdPriceAtAcquisition: "50,000,000",
      }),
    );
    expect(first?.extensionStdPriceAtAcquisition).toBeUndefined();
  });
});

/* ── #7 — 다건 ④가 §154① 단서 사유를 정규화한다 ────────────────────────────── */

describe("#7 — 다건 ④가 §154① 단서 사유를 게이트 없이 흘리지 않는다", () => {
  it("🔑 C-1: 1세대1주택이 아니면(카드 숨김) 사유를 보내지 않는다", async () => {
    const first = await captureMultiBody(
      housingForm({}, { isOneHousehold: false, householdHousingCount: "2", provisoReason: "overseas_migration" } as Partial<TransferFormData>),
    );
    expect(first?.oneHouseExemptionProviso).toBeUndefined();
  });

  it("🔑 C-2: 카드가 열리는 조합에서는 종전대로 보낸다 — 게이트를 통째로 막은 게 아니다", async () => {
    const first = await captureMultiBody(
      housingForm(
        {},
        { isOneHousehold: true, householdHousingCount: "1", provisoReason: "overseas_migration" } as Partial<TransferFormData>,
      ),
    );
    expect((first?.oneHouseExemptionProviso as { reason?: string } | undefined)?.reason).toBe("overseas_migration");
  });
});

/* ── #8 — 세대 보유 분양권 ⑧이 자산 종류를 본다 ─────────────────────────────── */

describe("#8 — 분양권 행 검증이 ⑤ 입력 경로와 같은 술어를 쓴다", () => {
  const withStaleRight = (kind: AssetForm["assetKind"]) =>
    housingForm({ assetKind: kind }, {
      presaleRights: [{ id: "r1", type: "presale_right", acquisitionDate: "" }],
    } as unknown as Partial<TransferFormData>);

  it("🔑 D-1: 토지 자산에 남은 분양권 행으로 차단하지 않는다 — 그 위젯은 화면에 없다", () => {
    const issues = collectStepIssues(1, withStaleRight("land"));
    expect(issues.some((i) => i.message.includes("분양권·입주권"))).toBe(false);
  });

  it("🔑 D-2: 주택 자산에서는 종전대로 취득일을 요구한다", () => {
    const issues = collectStepIssues(1, withStaleRight("housing"));
    expect(issues.some((i) => i.message.includes("분양권·입주권"))).toBe(true);
  });
});

/* ── #6 — 5호 미만 기간 ⑧이 「미해당」에서 막다른 길을 만들지 않는다 ─────────── */

describe("#6 — 5호 미만 임대 기간 검증이 ⑤ 게이트를 따른다", () => {
  const rentalForm = (hasMin5: boolean): TransferFormData =>
    housingForm({
      reductions: [
        {
          type: "rental_97_main",
          hasMin5RentalUnits: hasMin5,
          constructionYear: "2000",
          // 앞선 필수 항목을 채워 이 축까지 도달시킨다 (⑧은 첫 오류 1건만 반환한다).
          registrationDate: "2015-01-01",
          rentalStartDate: "2015-01-01",
          rentIncreaseViolationMode: "none",
          hasVacancyOverGrace: false,
          isTaxOfficeRegistered: true,
          rentalContinuesToTransfer: true,
          // 사용자가 열어 두고 비운 구간 — 「미해당」을 고르면 삭제 UI가 사라진다.
          belowMin5UnitsPeriods: [{ startDate: "", endDate: "" }],
        },
      ],
    } as unknown as Partial<AssetForm>);

  it("🔑 E-1: 「미해당(5호 미만)」이면 빈 구간으로 막지 않는다 — 지울 수단이 없다", () => {
    const issue = validateStep2Reductions(2, rentalForm(false));
    expect(issue?.message ?? "").not.toContain("5호 미만 임대 기간");
  });

  it("🔑 E-2: 「5호 이상」이면 종전대로 요구한다 — 그때는 편집·삭제 UI가 화면에 있다", () => {
    const issue = validateStep2Reductions(2, rentalForm(true));
    expect(issue?.message ?? "").toContain("5호 미만 임대 기간");
  });
});
