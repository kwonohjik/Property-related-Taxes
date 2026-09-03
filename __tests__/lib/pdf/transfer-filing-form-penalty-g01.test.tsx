/**
 * @vitest-environment jsdom
 *
 * anchor: 🔴 G-01 — 결과 PDF의 「신고서 양식」이 국세기본법 가산세를 싣는다
 *
 * ## 종전 결함
 *
 * PDF 단건 「신고서 양식」은 `r.penaltyTax`만 읽었다. 그런데 그 슬롯은 엔진이 직접 산출한
 * result에서 **「소득세법」 제114조의2 환산가액적용가산세 뿐**이다
 * (`transfer-tax-finalize.ts:435` `penaltyResult = calculateBuildingPenalty(...)`).
 * 「국세기본법」 §47의2~§47의4 신고불성실·납부지연분은 `penaltyDetail`에 따로 담기고
 * 총액(`totalTax`)에만 들어간다(`:502`).
 *
 * ⇒ **같은 PDF 안에서 총 납부세액 카드와 신고서 양식 총결정세액이 어긋났다.**
 * 화면 신고서 표는 이미 두 축을 합산하고 있었다(`FilingFormTableHelpers.ts:657`) —
 * PDF만 남아 있었고, 「신고서 양식」은 단독 print leaf라 그것만 인쇄하면
 * 국기법 가산세가 통째로 빠진 서식이 나온다.
 *
 * ## 픽스처
 *
 * `review-2026-08-f31.test.ts`와 **같은 격자**를 쓴다 — 화면과 PDF가 같은 값을 보여야 한다.
 */

import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";
import { makeMockRates, baseTransferInput } from "../../tax-engine/_helpers/mock-rates";

function calc() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date("2026-06-01"),
      filingPenaltyDetails: {
        determinedTax: 141_060_000,
        reductionAmount: 0,
        priorPaidTax: 0,
        originalFiledTax: 0,
        excessRefundAmount: 0,
        interestSurcharge: 0,
        filingType: "none" as const,
        penaltyReason: "normal" as const,
      },
      delayedPaymentDetails: {
        unpaidTax: 100_000_000,
        paymentDeadline: new Date("2026-08-31"),
        actualPaymentDate: new Date("2026-12-31"),
      },
    }),
    makeMockRates(),
  );
}

/** react-pdf 트리를 순회해 (라벨, 값) 쌍을 모은다. */
function collectRows(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const c of node) collectRows(c, out);
    return out;
  }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  const props = (el.props ?? {}) as { children?: unknown };
  // 함수형 컴포넌트는 호출해 전개한다(react-pdf 원시 요소는 children만 훑는다)
  if (typeof el.type === "function") {
    try {
      const rendered = (el.type as (p: unknown) => unknown)(el.props);
      collectRows(rendered, out);
    } catch {
      /* 렌더 불가 노드는 건너뛴다 */
    }
    return out;
  }
  collectRows(props.children, out);
  return out;
}

/** `texts` 에서 label 바로 뒤에 오는 값을 돌려준다(react-pdf 행은 라벨·값 두 Text). */
function valueAfter(texts: string[], label: string): string | undefined {
  const i = texts.indexOf(label);
  return i >= 0 ? texts[i + 1] : undefined;
}

describe("G-01 PDF 신고서 양식 — 가산세 두 축 합산", () => {
  it("엔진 관측값 (§114조의2분 0 · 국기법분 30,874,000)", () => {
    const r = calc();
    expect(r.penaltyTax).toBe(0);
    expect(r.penaltyDetail?.totalPenalty).toBe(30_874_000);
    expect(r.determinedTax).toBe(141_060_000);
  });

  it("🔴 신고서 양식의 가산세액·총결정세액이 국기법분을 포함한다", () => {
    const r = calc();
    const tree = ResultPdfDocument({
      taxType: "transfer",
      taxTypeLabel: "양도소득세",
      createdAt: "2026-09-03",
      resultData: r as unknown as Record<string, unknown>,
    });
    const texts = collectRows(tree);

    // 종전: 가산세액 행 자체가 없었고(penaltyTax 0 → 조건부 미렌더),
    //       총결정세액 = 141,060,000 (국기법 가산세 30,874,000 누락)
    expect(valueAfter(texts, "가산세액")).toBe("30,874,000");
    expect(valueAfter(texts, "총결정세액")).toBe("171,934,000");
    expect(valueAfter(texts, "결정세액")).toBe("141,060,000");
  });

  it("🔑 같은 PDF의 총 납부세액과 자기일관 — 신고서 총결정세액 + 지방소득세 + 농특세", () => {
    const r = calc();
    const tree = ResultPdfDocument({
      taxType: "transfer",
      taxTypeLabel: "양도소득세",
      createdAt: "2026-09-03",
      resultData: r as unknown as Record<string, unknown>,
    });
    const texts = collectRows(tree);

    const total = Number((valueAfter(texts, "총결정세액") ?? "0").replace(/,/g, ""));
    // 엔진 totalTax = 총결정세액 + 지방소득세 + 농특세 (transfer-tax-finalize.ts:502)
    expect(total + r.localIncomeTax + (r.ruralSurtax ?? 0)).toBe(r.totalTax);
  });
});
