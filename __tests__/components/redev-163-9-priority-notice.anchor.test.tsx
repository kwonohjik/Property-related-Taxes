/**
 * R-10 — §163⑨ 평가액이 ⑤ 「인가전 분 종전 부동산 취득가액」보다 우선한다는 표시 (2026-08-23).
 *
 * ## 왜 이 안내가 필요한가 — 실측
 *
 * ⑧ validate는 실가 모드에서 `redevActualAcquisitionPrice`를 **필수**로 요구한다
 * (`transfer-tax-validate-redev.ts:111`·`:214`). 그런데 상속·증여 평가액이 함께 있으면
 * STEP 0.45(`transfer-tax.ts:115`)가 `input.acquisitionPrice`를 **무조건 교체**하므로
 * (`inheritance-acquisition-helpers.ts:264` — 조건 없는 대입) 그 필수 입력값이 조용히 버려진다.
 *
 * 클라이언트 실측 (입주권 원조합원 · 실가 모드 · 권리가액 3억):
 *
 * | 증여 신고가액 | ⑤ 칸 | validate | 실제 적용 취득가액 |
 * |---|---|---|---|
 * | 3억 | 2억 | 통과 | **3억** (⑤ 무시) |
 * | 미입력 | 2억 | 통과 | 2억 (⑤ 사용) |
 * | 3억 | 미입력 | **차단** | — |
 *
 * ⇒ 사용자는 ⑤를 반드시 채워야 하는데 그 값이 쓰이는지는 화면에 없었다.
 *
 * ## 술어 계약 (⛔ 복제 금지)
 *
 * 노출 조건 = **API 변환이 실제로 `inheritedAcquisition`을 송신하는가**.
 * `RedevelopmentSec163_9PriorityNotice`는 `buildInheritedAcquisitionPayload` **그 함수**를
 * 호출해 판정한다. 조건을 손으로 다시 쓰면 갈린다 — 증여 신고가액 미입력 시 payload는
 * 안 나가는데 안내만 뜨면 **거짓 안내**가 된다(N-03이 그 경우를 봉인한다).
 *
 * ⚠️ 안내이지 게이트가 아니다. ⑤ 입력을 숨기거나 막지 말 것 — 값을 지우면 §163⑨ 경로가
 *   사라져 계산이 조용히 틀어진다(선행 PR 교훈: 「UI 게이트가 유일 입력 경로를 제거」).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

/** 안내 고유 문구 — 증여 ToneCard의 「③ 취득정보의 "증여 신고가액"」과 substring 충돌하지 않는 부분 */
const NOTICE = /이 섹션보다 우선 적용됩니다/;

function origMemberAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in",
    redevSubject: "right",
    redevIsSuccessorMember: "no",
    acquisitionDate: "2009-04-09",
    redevApprovalDate: "2016-10-23",
    useEstimatedAcquisition: false,
    redevActualAcquisitionPrice: "200000000",
    ...over,
  } as AssetForm;
}

function renderBlock(asset: AssetForm) {
  render(
    <RedevelopmentBlock
      asset={asset}
      onChange={vi.fn()}
      isOneHouseSingle={false}
      wasRegulatedAtAcquisition={false}
    />,
  );
}

describe("R-10 — §163⑨ 우선 적용 안내", () => {
  it("[N-01] 증여 + 증여 신고가액 입력 → 안내가 뜨고 소스 칸을 「증여 신고가액」으로 지목한다", () => {
    renderBlock(origMemberAsset({ acquisitionCause: "gift", fixedAcquisitionPrice: "300000000" }));

    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText(/증여 신고가액.*이 섹션보다 우선/)).toBeTruthy();
  });

  it("[N-02] 상속 + 상속개시일 평가액 입력 → 소스 칸을 「상속개시일 평가액」으로 지목한다", () => {
    renderBlock(
      origMemberAsset({ acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000" }),
    );

    expect(screen.getByText(/상속개시일 평가액.*이 섹션보다 우선/)).toBeTruthy();
  });

  it("[N-03] 증여인데 신고가액 미입력 → payload가 안 나가므로 안내도 뜨지 않는다 (거짓 안내 금지)", () => {
    renderBlock(origMemberAsset({ acquisitionCause: "gift", fixedAcquisitionPrice: "" }));

    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("[N-04] 매매 → §163⑨ 대상이 아니므로 안내 없음", () => {
    renderBlock(origMemberAsset({ acquisitionCause: "purchase", fixedAcquisitionPrice: "300000000" }));

    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("[N-05] 환산 모드에서도 뜬다 — §163⑨은 실가·환산 어느 쪽이든 이긴다", () => {
    renderBlock(
      origMemberAsset({
        acquisitionCause: "gift",
        fixedAcquisitionPrice: "300000000",
        useEstimatedAcquisition: true,
      }),
    );

    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it("[N-06] ⑤ 실가 입력칸은 그대로 남는다 — 안내는 게이트가 아니다", () => {
    renderBlock(origMemberAsset({ acquisitionCause: "gift", fixedAcquisitionPrice: "300000000" }));

    expect(screen.getByText("실거래가 취득가액")).toBeTruthy();
  });
});
