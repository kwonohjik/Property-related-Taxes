/**
 * anchor: **증여**도 §163⑨ 취득가액 의제 경로를 타야 한다.
 *
 * 「소득세법 시행령」 §163⑨은 본문·1호·2호·§176조의2④가 **전부 「상속 또는 증여」**를 대상으로 한다.
 *   · 본문 — "**상속 또는 증여**받은 자산 … **상속개시일 또는 증여일** 현재 상증법 §60~66 평가액을
 *            취득당시의 실지거래가액으로 본다"
 *   · 1호  — "1990.8.30. 개별공시지가 고시 前 **상속 또는 증여**받은 **토지** … §164④ 가액 중 많은 금액"
 *   · 2호  — "건물 기준시가 고시 前 **상속 또는 증여**받은 **건물** … §164⑤~⑦ 가액 중 많은 금액"
 *
 * 그런데 payload 빌더가 `acquisitionCause === "inheritance"`만 트리거해
 * **증여는 ②(§164④~⑦)와 비교되지 않았다** — ① 신고가액 단독.
 *
 * ⚠️ §163⑨ 본문 괄호는 **상증법 §34~§42의3 증여의제를 제외**한다.
 *    현행 UI 취득원인에 증여의제 항목이 없어(매매/상속/증여/이월과세/신축) 순수 수증만 `gift`다 ⇒ 정합.
 *    이월과세(`carryover_gift`)는 §97의2 승계 경로로 별개다.
 *
 * 계획서: docs/02-design/features/gift-163-9-clause-1-2-max.plan.md
 */
import { describe, it, expect } from "vitest";
import { buildInheritedAcquisitionPayload } from "../../lib/calc/transfer-tax-api-inheritance";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = { inheritedAcquisition?: any };

function giftAsset(overrides = {}) {
  return {
    ...makeDefaultAsset(1),
    acquisitionCause: "gift" as const,
    // 엔진 assetKind는 상단 assetKind에서 파생된다(deriveEngineInheritanceAssetKind)
    assetKind: "land" as const,
    inheritanceAssetKind: "land" as const,
    // 증여 신고가액(① 상증법 평가액) — UI 「증여 신고가액」은 fixedAcquisitionPrice에 바인딩된다
    fixedAcquisitionPrice: "300,000,000",
    ...overrides,
  };
}

describe("증여 §163⑨ — payload 트리거 (본문·1호·2호는 「상속 또는 증여」)", () => {
  it("F-1: 1990.8.30. 前 증여 토지 → §163⑨ payload가 생성된다", () => {
    // §163⑨1호 대상. ②(§164④)와 비교하려면 이 payload가 먼저 있어야 한다.
    const r = buildInheritedAcquisitionPayload(
      giftAsset({ acquisitionDate: "1987-05-01" }) as never,
      1,
      false,
    ) as Payload;

    expect(r.inheritedAcquisition).toBeDefined();
    expect(r.inheritedAcquisition.assetKind).toBe("land");
  });

  it("F-3: pre-1985 증여 → pre-deemed 모드로 생성된다 (국심2003부0627 = 증여 사안)", () => {
    // 1977.4.30. 증여 토지에 대해 처분청의 §176조의2④ 환산 경정을 **취소**하고
    // §163⑨ 적용을 인정한 결정(주문: 경정 · 납세자 승).
    const r = buildInheritedAcquisitionPayload(
      giftAsset({ acquisitionDate: "1977-04-30" }) as never,
      1,
      false,
    ) as Payload;

    expect(r.inheritedAcquisition).toBeDefined();
    expect(r.inheritedAcquisition.mode).toBe("pre-deemed");
  });

  it("F-6: ① 증여 신고가액이 reportedValue로 도달한다", () => {
    const r = buildInheritedAcquisitionPayload(
      giftAsset({ acquisitionDate: "1987-05-01" }) as never,
      1,
      false,
    ) as Payload;

    expect(r.inheritedAcquisition.reportedValue).toBe(300_000_000);
  });

  it("F-5(회귀): 상속은 종전대로 생성된다", () => {
    const r = buildInheritedAcquisitionPayload(
      {
        ...makeDefaultAsset(1),
        acquisitionCause: "inheritance" as const,
        inheritanceAssetKind: "land" as const,
        inheritanceStartDate: "1983-07-26",
        publishedValueAtInheritance: "500,000,000",
      } as never,
      1,
      false,
    ) as Payload;

    expect(r.inheritedAcquisition).toBeDefined();
    expect(r.inheritedAcquisition.mode).toBe("pre-deemed");
    expect(r.inheritedAcquisition.reportedValue).toBe(500_000_000);
  });

  it("F-7(경계): 이월과세(carryover_gift)는 §163⑨ 경로가 아니다 — §97의2 승계", () => {
    const r = buildInheritedAcquisitionPayload(
      giftAsset({ acquisitionCause: "carryover_gift" as const, acquisitionDate: "1987-05-01" }) as never,
      1,
      false,
    ) as Payload;

    expect(r.inheritedAcquisition).toBeUndefined();
  });
});
