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
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PreDeemedEstimatedNotice } from "../../components/calc/transfer/PreDeemedEstimatedNotice";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

const NOTICE = /계산에 등장하지 않습니다/;
/** 노출 여부만 보는 케이스용 — 선언 토글의 쓰기 경로는 U2-9~U2-12가 따로 본다. */
const NOOP = () => {};

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
    render(<PreDeemedEstimatedNotice asset={preDeemedGift()} onChange={NOOP} />);
    expect(screen.queryAllByText(NOTICE).length).toBeGreaterThan(0);
  });

  it("U2-2: **상속** pre-1985 + 환산 + ① 비움 → 노출 (증여와 대칭)", () => {
    render(
      <PreDeemedEstimatedNotice
        onChange={NOOP}
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
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ fixedAcquisitionPrice: "100000000" })} onChange={NOOP} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-4: 증여 pre-1985 + **실거래가 모드** → 미노출", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ useEstimatedAcquisition: false })} onChange={NOOP} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-5(회귀): 증여 **post-1985** + 환산 → 미노출 (giftEstimatedModeError가 차단할 영역)", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ acquisitionDate: "1990-03-01" })} onChange={NOOP} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-6(경계): **매매** pre-1985 + 환산 → 미노출 (§163⑨ 대상 아님)", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ acquisitionCause: "purchase" })} onChange={NOOP} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-7(경계): 이월과세 pre-1985 + 환산 → 미노출 (§97의2 승계)", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift({ acquisitionCause: "carryover_gift" })} onChange={NOOP} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("U2-8: 감정가액·매매사례가액 모드도 같은 안내 (추계 3종 공통)", () => {
    render(
      <PreDeemedEstimatedNotice
        onChange={NOOP}
        asset={preDeemedGift({ useEstimatedAcquisition: false, isAppraisalAcquisition: true })}
      />,
    );
    expect(screen.queryAllByText(NOTICE).length).toBeGreaterThan(0);
  });
});

/**
 * E-1(U2-E) — 안내에 **선언 토글**이 붙었다. 노출 조건은 ⑧ validate와 **같은 술어**
 * (`needsClauseADeclaration`)라, 여기서 뜨는데 저기서 안 막히는 상태가 나올 수 없다.
 */
describe("E-1: 「가목 확인 불가」 선언 토글", () => {
  const DECL = /상증법 평가액」을 확인할 수 없음/;

  it("U2-9: 안내가 뜨는 조합이면 선언 토글도 함께 뜬다 (⑤⑧ 술어 공유)", () => {
    render(<PreDeemedEstimatedNotice asset={preDeemedGift()} onChange={NOOP} />);
    expect(screen.queryAllByText(DECL).length).toBeGreaterThan(0);
  });

  it("U2-10: 토글을 켜면 `preDeemedClauseAUnconfirmed: true`를 쓴다", () => {
    const writes: Partial<AssetForm>[] = [];
    render(
      <PreDeemedEstimatedNotice asset={preDeemedGift()} onChange={(d) => writes.push(d)} />,
    );
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(writes).toEqual([{ preDeemedClauseAUnconfirmed: true }]);
  });

  it("★ U2-11: **상속 · 실거래가 모드**도 노출 — 종전 안내는 추계 전용이라 이 구멍을 못 덮었다", () => {
    render(
      <PreDeemedEstimatedNotice
        onChange={NOOP}
        asset={asset({
          acquisitionCause: "inheritance",
          acquisitionDate: "1980-03-01",
          inheritanceStartDate: "1980-03-01",
          useEstimatedAcquisition: false,
        })}
      />,
    );
    expect(screen.queryAllByText(DECL).length).toBeGreaterThan(0);
  });

  it("U2-12(경계): **증여 · 실거래가**는 미노출 — 「증여 신고가액을 입력하세요」가 이미 막는다", () => {
    render(
      <PreDeemedEstimatedNotice
        onChange={NOOP}
        asset={preDeemedGift({ useEstimatedAcquisition: false })}
      />,
    );
    expect(screen.queryByText(DECL)).toBeNull();
  });

  it("U2-13: ②(§164④ 5필드) 충족 → 미노출 — ② 단독도 가목이다(§163⑨1호 「많은 금액」)", () => {
    render(
      <PreDeemedEstimatedNotice
        onChange={NOOP}
        asset={preDeemedGift({
          acquisitionArea: "184.2",
          pre1990Grade_atAcq: "200",
          pre1990Grade_current: "218",
          pre1990Grade_prev: "218",
          pre1990PricePerSqm_1990: "1100000",
          pre1990GradeMode: "number",
        })}
      />,
    );
    expect(screen.queryByText(DECL)).toBeNull();
  });
});
