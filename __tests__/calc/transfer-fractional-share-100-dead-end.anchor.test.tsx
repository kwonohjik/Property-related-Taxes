/**
 * @vitest-environment jsdom
 *
 * 지분 분할 모드에서 지분 칸이 축 B를 이루지 못하는 입력(100% 등) — ⑧이 화면에 없는 칸을 요구하지 않는다.
 * 함께 카드 값(총액 × 지분율)이 본문·엔진과 같고, 컴패니언에는 금액 카드가 없음을 고정한다 — 컴패니언에 금액을 표시하게 되면
 * 흡수 자산 값이 달라지므로 `absorbFractionalResidual`을 써야 한다. 계획서 `fractional-auto-sale-price-card.plan.md`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { cleanup, render } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { CompanionSaleModeBlock } from "@/components/calc/transfer/CompanionSaleModeBlock";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody, postTransfer } from "./_helpers/redev-one-house-route";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const MSG = "지분 분할은 각 지분이 100% 미만이어야 합니다";
const CARD_LABEL = "자동 계산 (총 양도가액 × 지분율)";
type Share = [string, string?];

const asset = (n: number, [num, den]: Share, std = ""): AssetForm =>
  ({
    ...makeDefaultAsset(n),
    assetId: `A${n}`,
    addressJibun: `서울 강남구 테스트동 ${n}`,
    assetKind: "land",
    acquisitionArea: "300",
    transferArea: "300",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-03",
    fixedAcquisitionPrice: "300000000",
    standardPriceAtTransfer: std,
    ownershipNumerator: num,
    ownershipDenominator: den ?? (num === "" ? "" : "100"),
    ownershipRemainderThirdParty: "",
  }) as unknown as AssetForm;

function form(shares: Share[], mode: "actual" | "apportioned", split: "fractional" | "companion" = "fractional", total = "1000000000", std = "") {
  const f = createDefaultTransferFormData() as TransferFormData;
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-04-30";
  f.contractTotalPrice = total;
  f.bundledSaleMode = mode;
  f.assetSplitMode = split;
  f.assets = shares.map((s, i) => asset(i + 1, s, std));
  return f;
}

/** 자산 입력 단계(step 0)의 메시지 — 빈 fixture가 공허하게 통과하지 않도록 부정형 짝이 같은 단계에서 오류를 낸다. */
const messages = (f: TransferFormData) => collectStepIssues(0, f).map((i) => i.message);
const NO_FIELD = /계약서상 양도가액|양도시 기준시가|구분 기재된 양도가액|자산 유형/;

describe("⑧ 지분 모드 — 축 B를 이루지 못하는 지분", () => {
  it.each([
    ["50/100 실가", [["50"], ["100"]], "actual", 2],
    ["100/50 실가", [["100"], ["50"]], "actual", 1],
    ["50/100 안분", [["50"], ["100"]], "apportioned", 2],
    ["100/50 안분", [["100"], ["50"]], "apportioned", 1],
    ["1/1 분수 표기", [["1", "1"], ["50"]], "actual", 1],
    ["셋째 자산만 100", [["25"], ["25"], ["100"]], "actual", 3],
  ] as [string, Share[], "actual" | "apportioned", number][])("%s → 새 메시지 1건이 그 자산 지분 칸으로, 없는 칸 오류 없음", (_n, shares, mode, at) => {
    const f = form(shares, mode);
    const issues = collectStepIssues(0, f);
    const hit = issues.filter((i) => i.message.includes(MSG));
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toBe(`자산 ${at}: ${MSG}.`);
    expect(hit[0].field).toBe("ownershipNumerator");
    expect(hit[0].assetIndex).toBe(at - 1);
    expect(issues.map((i) => i.message).filter((m) => NO_FIELD.test(m))).toEqual([]);
  });

  it("컴패니언 자산 종류가 비어 있어도(① 숨김) 없는 칸을 요구하지 않는다", () => {
    const f = form([["50"], ["100"]], "actual");
    f.assets[1] = { ...f.assets[1], assetKind: "" as never };
    expect(messages(f).filter((m) => NO_FIELD.test(m))).toEqual([]);
    expect(messages(f)).toContain(`자산 2: ${MSG}.`);
  });

  it("빈칸 — 공유 지분율 오류만, 없는 칸 오류 없음", () => {
    const f = form([["50"], [""]], "actual");
    const m = messages(f);
    expect(m).toContain("지분 분할 취득: 공유 지분율(%)을 입력하세요.");
    expect(m.some((x) => x.includes(MSG))).toBe(false);
    expect(m.filter((x) => NO_FIELD.test(x))).toEqual([]);
  });

  it.each([
    ["0", "지분율은 0보다 커야 합니다."],
    ["150", "지분율은 100%를 초과할 수 없습니다"],
    ["abc", "지분율은 숫자로 입력하세요."],
  ])("지분 %s — 통과시키지 않는다", (num, expected) => {
    const m = messages(form([["50"], [num]], "actual"));
    expect(m.some((x) => x.startsWith("자산 2: ") && x.includes(expected))).toBe(true);
    expect(m.filter((x) => NO_FIELD.test(x))).toEqual([]);
  });

  it("안분 · 기준시가 있음 50/100 — 카드와 엔진이 갈리던 입력도 막는다", () => {
    const m = messages(form([["50"], ["100"]], "apportioned", "fractional", "1000000000", "500000000"));
    expect(m).toEqual([`자산 2: ${MSG}.`]);
  });

  it("고치면 오류가 사라진다 — 50/50", () => {
    expect(messages(form([["50"], ["50"]], "actual"))).toEqual([]);
  });
});

describe("⑧ 부정형 짝", () => {
  it("함께 양도 100/100·50/100 — 종전 칸 오류 그대로, 새 메시지 없음", () => {
    for (const shares of [[["100"], ["100"]], [["50"], ["100"]]] as Share[][]) {
      const m = messages(form(shares, "actual", "companion"));
      expect(m).toContain("자산 1: 계약서상 양도가액을 입력하세요.");
      expect(m).toContain("자산 2: 계약서상 양도가액을 입력하세요.");
      expect(m).toContain("구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다.");
      expect(m.some((x) => x.includes(MSG))).toBe(false);
    }
    const app = messages(form([["100"], ["100"]], "apportioned", "companion"));
    expect(app).toContain("자산 1: 양도시 기준시가를 입력하세요.");
  });

  it("단건 지분 모드 100 — 자산 1개는 새 검사 대상이 아니다", () => {
    const f = form([["100"]], "actual");
    expect(messages(f).some((x) => x.includes(MSG))).toBe(false);
  });

  it.each([
    [[["50"], ["30"], ["20"]]],
    [[["33.33"], ["33.33"], ["33.33"]]],
    [[["33.33"], ["33.33"], ["33.34"]]],
    [[["1", "3"], ["1", "3"], ["1", "3"]]],
    [[["50"], ["50"]]],
    [[["60"], ["40"]]],
    [Array(7).fill(["14.29"])],
    [[["50"], ["30"], ["20.06"]]],
  ] as [Share[]][])("정상 축 B %j — 오류 0건", (shares) => {
    for (const mode of ["actual", "apportioned"] as const) expect(messages(form(shares, mode))).toEqual([]);
  });

  it("합 100% 대역 밖 축 B — 합계 오류 그대로", () => {
    expect(messages(form([["50"], ["30"], ["20.07"]], "actual")).some((m) => m.includes("합계가 100%"))).toBe(true);
  });
});

/** 렌더한 카드 금액. */
function cardValue(f: TransferFormData): number | null {
  const a = f.assets[0];
  const { container } = render(
    <CompanionSaleModeBlock
      bundledSaleMode={f.bundledSaleMode as "actual"}
      assetKind="land"
      actualSalePrice=""
      onActualSalePriceChange={() => {}}
      standardPriceAtTransfer=""
      onStandardPriceAtTransferChange={() => {}}
      ownershipNumerator={a.ownershipNumerator}
      ownershipDenominator={a.ownershipDenominator}
      contractTotalPrice={f.contractTotalPrice}
      isFractionalSplit
    />,
  );
  const el = container.querySelector(".font-mono");
  const v = el ? Number(el.textContent!.replace(/[^0-9]/g, "")) : null;
  cleanup();
  return v;
}

describe("카드 동결 — 주 자산 카드 = 본문 = 엔진 자산 1", () => {
  it.each([
    [[["50"], ["30"], ["20"]], "1000000000", 500_000_000],
    [[["33.33"], ["33.33"], ["33.33"]], "1000000000", 333_300_000],
    [[["33.33"], ["33.33"], ["33.34"]], "1000000000", 333_300_000],
    [[["1", "3"], ["1", "3"], ["1", "3"]], "1000000000", 333_333_333],
    [[["1", "3"], ["1", "3"], ["1", "3"]], "1000000001", 333_333_333],
    [[["50"], ["50"]], "1000000001", 500_000_000],
    [[["60"], ["40"]], "7777777", 4_666_666],
    [Array(7).fill(["14.29"]), "1000000000", 142_900_000],
  ] as [Share[], string, number][])("%j · %s → %i", async (shares, total, expected) => {
    const f = form(shares, "actual", "fractional", total);
    expect(cardValue(f)).toBe(expected);
    const body = await captureBody(f);
    expect(body.primaryActualSalePrice).toBe(expected);
    const r = await postTransfer(body);
    expect(r.status).toBe(200);
    const rows = (r.json?.data as { apportionment: { apportioned: { allocatedSalePrice: number }[] } }).apportionment.apportioned;
    expect(rows[0].allocatedSalePrice).toBe(expected);
    expect(rows.reduce((s, x) => s + x.allocatedSalePrice, 0)).toBe(Number(total));
  }, 60_000);
});

describe("컴패니언 동결 — 축 B 둘째 카드에 금액 카드가 없다", () => {
  it("안내문은 있어도 금액 카드·금액은 없다", () => {
    const f = form([["33.33"], ["33.33"], ["33.34"]], "actual");
    const { container } = render(
      <CompanionAssetCard
        index={2}
        asset={f.assets[2]}
        primaryAsset={f.assets[0]}
        bundledSaleMode="actual"
        onChange={() => {}}
        transferDate={f.transferDate}
        contractTotalPrice={f.contractTotalPrice}
        splitMode="fractional"
        onFractionalToggle={() => {}}
        hasSiblings
      />,
    );
    expect(container.textContent).not.toContain(CARD_LABEL);
    expect(container.textContent).not.toContain("333,400,000");
    expect(container.querySelector('[data-asset-section="2"]')).toBeNull();
    expect(container.querySelector('[data-testid="fractional-basic-inherited-notice"]')).not.toBeNull();
  });

  it("같은 조건의 주 자산 카드에는 금액 카드가 있다 — 위 단언이 공허하지 않다", () => {
    const f = form([["33.33"], ["33.33"], ["33.34"]], "actual");
    const { container } = render(
      <CompanionAssetCard
        index={0}
        asset={f.assets[0]}
        primaryAsset={f.assets[0]}
        bundledSaleMode="actual"
        onChange={() => {}}
        transferDate={f.transferDate}
        contractTotalPrice={f.contractTotalPrice}
        splitMode="fractional"
        onFractionalToggle={() => {}}
        hasSiblings
      />,
    );
    expect(container.textContent).toContain(CARD_LABEL);
    expect(container.textContent).toContain("333,300,000");
  });
});
