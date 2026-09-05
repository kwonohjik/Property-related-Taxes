/**
 * 재개발 ③-c 「비과세 보유 요건」 — 화면이 엔진보다 앞서 단언하지 않는다
 * (2026-09-05 · 코드리뷰 Q16)
 *
 * ## 종전 결함
 *
 * 선언이 비어 있으면 UI가 자동 산정값(취득일~인가일 24개월)을 **결론으로 승격**시켜
 * 「비과세 해당」이라 단언했다. 그러나 ④는 선언이 빈 값이면 `undefined`를 보내고
 * (`transfer-tax-api-redev.ts:180`), 엔진은 `=== true`일 때만 §89①4호·청산금 비과세를 연다
 * (`transfer-tax-redevelopment-transforms.ts:320`). ⇒ 화면은 「해당」, 엔진은 미적용.
 *
 * 예규 사전-2019-법령해석재산-0739 본문이 「사실상 주거용으로 사용되고 있는지 여부는
 * **사실판단할 사항**」으로 끝나므로, 자동 배선이 아니라 자기선언이 정본이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExemptionAtApprovalCard } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 자동 산정이 「충족」으로 나오는 축 — 취득 2015 → 인가 2022 (24개월 훌쩍 넘음) */
function asset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevSettlementDirection: "receive",
    redevIsSuccessorMember: "no",
    acquisitionDate: "2015-03-01",
    redevApprovalDate: "2022-03-01",
    redevRightsValue: "900000000",
    redevExemptionEligibleAtApproval: "",
    ...overrides,
  } as AssetForm;
}

describe("ExemptionAtApprovalCard — 자기선언만이 결론이다", () => {
  it("🔴 선언 없음 + 자동 산정 충족 → 「비과세 해당」이라 단언하지 않는다", () => {
    render(<ExemptionAtApprovalCard asset={asset()} onChange={() => {}} />);

    // 종전에는 자동 산정 결과를 결론으로 올려 이 문구가 떴다.
    expect(screen.queryByText(/비과세 해당/)).toBeNull();
    expect(screen.getByText(/선언하지 않음/)).toBeTruthy();
    expect(screen.getByText(/적용되지 않습니다/)).toBeTruthy();
  });

  it("선언 없음 → 청산금 「비과세 자동 적용」 안내도 뜨지 않는다 (같은 허위 단언)", () => {
    render(<ExemptionAtApprovalCard asset={asset()} onChange={() => {}} />);
    expect(screen.queryByText(/비과세 자동 적용/)).toBeNull();
  });

  it("자동 산정은 「참고」로만 남는다 (지우지 않는다 — 사용자 판단의 재료)", () => {
    render(<ExemptionAtApprovalCard asset={asset()} onChange={() => {}} />);
    expect(screen.getByText(/^참고 — 취득일부터 관리처분계획인가일까지/)).toBeTruthy();
  });

  it("「충족으로 선언」하면 그때 결론이 뜬다", () => {
    render(
      <ExemptionAtApprovalCard
        asset={asset({ redevExemptionEligibleAtApproval: "yes" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/충족으로 선언됨/)).toBeTruthy();
  });

  it("🔑 자동 산정이 「미충족」이어도 선언 없이는 표1 강등을 단언하지 않는다", () => {
    // 취득 2021-06 → 인가 2022-03 = 9개월. 엔진은 `=== false`일 때만 표1로 강등한다
    // (`redevelopment-lthd.ts:44` — undefined는 강등하지 않는다).
    render(
      <ExemptionAtApprovalCard
        asset={asset({ acquisitionDate: "2021-06-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/미충족으로 선언됨/)).toBeNull();
    expect(screen.getByText(/선언하지 않음/)).toBeTruthy();
  });
});
