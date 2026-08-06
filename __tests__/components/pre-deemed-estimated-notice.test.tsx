/**
 * anchor(S-1): 의제취득일 前 상속·증여 + 추계 + ①(가목) 미입력 → **안내 노출**.
 *
 * §163⑨의 ①을 비우면 payload에 `reportedValue`가 실리지 않아 엔진이 ①을 후보에서 제외하고
 * ③(환산)만 남는다. 화면 어디에도 그 사실이 드러나지 않았다.
 *
 * ⚠️ **차단이 아니라 안내다** — pre-deemed는 §176조의2④(나목) 적용 영역이기도 해서 추계 자체가
 *    법적으로 불가능하지 않다. 「가목 우선」 재편은 별도 판단(U2-E)이 남아 있다.
 *
 * 계획서: docs/02-design/features/pre-deemed-clause-a-omitted-estimated-path.plan.md §6
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PreDeemedEstimatedNotice } from "../../components/calc/transfer/PreDeemedEstimatedNotice";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

const NOTICE = /계산에 등장하지 않습니다/;

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return { ...makeDefaultAsset(1), assetKind: "land", ...over } as AssetForm;
}

/** 의제취득일 前 증여 + 환산 모드 */
function preDeemedGift(over: Partial<AssetForm> = {}): AssetForm {
  return asset({
    acquisitionCause: "gift",
    acquisitionDate: "1980-03-01",
    donorAcquisitionDate: "1975-01-01",
    useEstimatedAcquisition: true,
    ...over,
  });
}

describe("S-1: pre-deemed + 추계 + ① 미입력 안내", () => {
  it("U2-1: 증여 pre-1985 + 환산 + ① 비움 → 노출", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift()} />);
    expect(screen.queryAllByText(NOTICE).length).toBeGreaterThan(0);
  });

  it("U2-2: **상속** pre-1985 + 환산 + ① 비움 → 노출 (증여와 대칭)", () => {
    render(
      <PreDeemedEstimatedNotice
        asset={asset({
          acquisitionCause: "inheritance",
          acquisitionDate: "1980-03-01",
          inheritanceStartDate: "1980-03-01",
          useEstimatedAcquisition: true,
        })}
      />,
    );
    expect(screen.queryAllByText(NOTICE).length).toBeGreaterThan(0);
  });

  it("U2-3: 증여 pre-1985 + 환산 + ① **입력됨** → 미노출", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ fixedAcquisitionPrice: "100000000" })} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-4: 증여 pre-1985 + **실거래가 모드** → 미노출", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ useEstimatedAcquisition: false })} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-5(회귀): 증여 **post-1985** + 환산 → 미노출 (giftEstimatedModeError가 차단할 영역)", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ acquisitionDate: "1990-03-01" })} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-6(경계): **매매** pre-1985 + 환산 → 미노출 (§163⑨ 대상 아님)", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ acquisitionCause: "purchase" })} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-7(경계): 이월과세 pre-1985 + 환산 → 미노출 (§97의2 승계)", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ acquisitionCause: "carryover_gift" })} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-8: 감정가액·매매사례가액 모드도 같은 안내 (추계 3종 공통)", () => {
    render(
      <PreDeemedEstimatedNotice
        asset={preDeemedGift({ useEstimatedAcquisition: false, isAppraisalAcquisition: true })}
      />,
    );
    expect(screen.queryAllByText(NOTICE).length).toBeGreaterThan(0);
  });
});
