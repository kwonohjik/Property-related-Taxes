/**
 * 재개발 상속 종전자산 취득가액 §163⑨ 정합 anchor.
 *
 * §166③ 환산은 "취득가액을 확인할 수 없는 경우"에만 적용된다. 상속 종전자산은 §163⑨이
 * 상속개시일 상증법 평가액을 취득당시 실지거래가액으로 의제하므로, 그 평가액이 확인되면
 * 재개발 종전자산 취득가액 = 상속평가액(실가) — §166③ 환산·§163⑥ 개산공제 배제.
 * 상속평가액 미확인 시에만 §166③ 환산(현행) 유지.
 *
 * 버그(수정 전): STEP 0.45가 상속평가액을 input.acquisitionPrice에 넣어도, 재개발 분기가
 *   useEstimatedAcquisition=true면 이를 버리고 §166③ 환산(141,221,534)을 적용 → §163⑨ 위반.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

function buildInput(opts: {
  useEstimatedAcquisition: boolean;
  inhDate: string;
  reportedValue?: number;
  /** ⑤ 「인가전 분 종전 부동산 취득가액」이 실어 보내는 값 (E·F에서만 비0) */
  acquisitionPrice?: number;
  cause?: "inheritance" | "gift";
  propertyType?: "redevelopment_apt" | "right_to_move_in";
}): TransferTaxInput {
  return baseTransferInput({
    propertyType: opts.propertyType ?? "redevelopment_apt",
    acquisitionCause: opts.cause ?? "inheritance",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date(opts.inhDate),
    acquisitionPrice: opts.acquisitionPrice ?? 0,
    useEstimatedAcquisition: opts.useEstimatedAcquisition,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment:
      opts.propertyType === "right_to_move_in"
        ? { ...case44RedevelopmentInfo(), subject: "right" as const }
        : case44RedevelopmentInfo(),
    inheritedAcquisition: opts.reportedValue
      ? {
          inheritanceDate: new Date(opts.inhDate),
          assetKind: "house_individual",
          reportedValue: opts.reportedValue,
          reportedMethod: "supplementary",
        }
      : undefined,
  }) as TransferTaxInput;
}

describe("재개발 상속 §163⑨ 취득가액 정합", () => {
  it("A. post-1985 상속평가액 확인 + 환산모드 → 종전자산 취득가액 = 상속평가액(실가), §166③·개산공제 배제", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: true, inhDate: "2005-04-09", reportedValue: 200_000_000 }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
    // method="actual" = 실가 모드 → §166③ 환산·§163⑥ 개산공제 미적용
    expect(r.redevelopmentDetail?.valuationMeta?.method).toBe("actual");
  });

  it("A'. post-1985 상속평가액 확인 + 실가모드 → 동일(상속평가액)", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: false, inhDate: "2005-04-09", reportedValue: 200_000_000 }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
  });

  it("B. pre-1985 상속평가액 확인 → 종전자산 취득가액 = 상속평가액(§166③ 환산 아닌 reported 우선)", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: true, inhDate: "1980-01-01", reportedValue: 100_000_000 }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(100_000_000);
  });

  it("C. 상속평가액 미확인(신고가액 미입력) + 환산모드 → §166③ 환산 유지(141,221,534)", () => {
    const r = calculateTransferTax(
      buildInput({ useEstimatedAcquisition: true, inhDate: "2005-04-09" }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(141_221_534);
    expect(r.redevelopmentDetail?.valuationMeta?.method).toBe("estimated_post_disclosure_decree_166_3");
  });

  it("D. 비상속(매매) 재개발 → override 미발동, §166③ 환산 유지(회귀)", () => {
    const input = buildInput({ useEstimatedAcquisition: true, inhDate: "2005-04-09" });
    const salesInput = { ...input, acquisitionCause: "purchase" as const, inheritedAcquisition: undefined };
    const r = calculateTransferTax(salesInput, mockRates);
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(141_221_534);
  });

  /**
   * ── E·F: ⑤ 「인가전 분 종전 부동산 취득가액」과의 **우선순위** ──────────────────
   *
   * A~D는 `acquisitionPrice: 0`으로 고정돼 있어 「§163⑨이 ⑤ 값을 이긴다」를 **증명하지 못한다**
   * (0을 이겨도 이긴 것처럼 보인다). E·F는 ⑤에 비0을 실어 그 사각지대를 메운다.
   *
   * 이 단언이 `RedevelopmentSec163_9PriorityNotice`가 화면에서 주장하는 사실의 근거다 —
   * 안내문이 「아래 값은 계산에 쓰이지 않습니다」라고 말하려면 여기서 참이어야 한다.
   * (`__tests__/components/redev-163-9-priority-notice.anchor.test.tsx`)
   *
   * ⛔ E·F를 지우면 안내문이 근거 없는 문장이 된다.
   */
  it("E. ⑤에 비0 실가가 있어도 상속평가액이 이긴다 (안내문의 근거)", () => {
    const r = calculateTransferTax(
      buildInput({
        useEstimatedAcquisition: false,
        inhDate: "2005-04-09",
        reportedValue: 200_000_000,
        acquisitionPrice: 77_777_777,
      }),
      mockRates,
    );
    // ⑤ 값(77,777,777)이 아니라 §163⑨ 평가액이 채택된다.
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
  });

  it("E'. ⑤ 값이 평가액보다 커도 결과는 불변 — max가 아니라 **대체**다", () => {
    const r = calculateTransferTax(
      buildInput({
        useEstimatedAcquisition: false,
        inhDate: "2005-04-09",
        reportedValue: 200_000_000,
        acquisitionPrice: 400_000_000,
      }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
  });

  it("F. 증여도 같다 — §163⑨ 본문이 「상속 또는 증여」다 (입주권 축에서 실측)", () => {
    const r = calculateTransferTax(
      buildInput({
        useEstimatedAcquisition: false,
        inhDate: "2005-04-09",
        reportedValue: 200_000_000,
        acquisitionPrice: 77_777_777,
        cause: "gift",
        propertyType: "right_to_move_in",
      }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
  });

  /**
   * F'는 F와 달리 ⑤ 값을 평가액보다 **크게** 잡는다.
   *
   * 뮤테이션 실측(2026-08-23): STEP 0.45의 대입(`inheritance-acquisition-helpers.ts:264`)을
   * `Math.max(result, current)`로 바꿔도 **E·E'·F는 전부 통과했다**.
   *   · E·F  — ⑤(77,777,777) < 평가액(2억)이라 max여도 답이 같다.
   *   · E'   — 상속은 `transfer-tax.ts:231`이 §166 분기에서 **한 번 더** 덮어써서 가려진다.
   * 증여에는 그 두 번째 override가 없다(:229 조건이 `=== "inheritance"`). 그래서
   * **증여 × ⑤>평가액**이 STEP 0.45의 대입 자체를 겨누는 유일한 조합이다.
   *
   * ⛔ 이 케이스를 지우면 「대체가 아니라 max」로 바뀌어도 아무도 실패하지 않는다.
   */
  it("F'. 증여 + ⑤가 평가액보다 커도 평가액이 이긴다 — STEP 0.45 대입 봉인", () => {
    const r = calculateTransferTax(
      buildInput({
        useEstimatedAcquisition: false,
        inhDate: "2005-04-09",
        reportedValue: 200_000_000,
        acquisitionPrice: 400_000_000,
        cause: "gift",
        propertyType: "right_to_move_in",
      }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
  });

  it("G. §163⑨ 평가액이 없으면 ⑤ 값이 그대로 쓰인다 — 안내가 뜨지 않아야 하는 경우", () => {
    const r = calculateTransferTax(
      buildInput({
        useEstimatedAcquisition: false,
        inhDate: "2005-04-09",
        acquisitionPrice: 77_777_777,
      }),
      mockRates,
    );
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(77_777_777);
  });
});
