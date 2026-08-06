/**
 * anchor: post-deemed 상속토지 §164④ 등급환산 진입.
 *
 * 소령 §163⑨**1호**: 개별공시지가 최초고시(1990-08-30) 前 상속·증여받은 토지의 취득가액 =
 *   max(① 상증법 평가액, ② §164④ 취득당시 기준시가).
 *   **1호는 「의제취득일」과 무관**하므로 1985.1.1.~1990.8.30. 상속 토지도 대상이다.
 *
 * 갭: 그 기간에는 ①의 소스인 **개별공시지가가 존재하지 않고**(1990.8.30. 최초고시),
 *     ② 등급환산 위젯도 post-deemed 화면에 노출되지 않아 **취득가액 산정 경로가 없었다**.
 *     엔진·API·STEP 0.4는 선행 Phase D로 이미 준비돼 있어 **UI 한 곳만 열면 이어진다**.
 *
 * 계획서: docs/02-design/features/post-deemed-land-164-4-ui-gap.plan.md
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostDeemedInputs } from "../../components/calc/transfer/inheritance/PostDeemedInputs";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

/** §164④ 등급환산 위젯 제목 */
const SEC164_4 = /1990\.8\.30\. 이전 취득 토지 기준시가 환산/;
/** ① 상증법 평가액의 **실제 입력 경로** — 신고가액 필드 */
const REPORTED = /상속세 신고가액/;

function postDeemedAsset(overrides = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land" as const,
    // 2026-08-06 추가 — §163⑨ 기준일 파생이 취득원인을 본다(`deriveSec163_9BaseDate`).
    // `PostDeemedInputs`는 `CompanionAcqInheritanceBlock`에서만 마운트되므로 실사용에서는 항상
    // 상속이다. 종전 fixture는 이를 생략해 `makeDefaultAsset`의 기본 취득원인(매매)을 썼고,
    // 파생이 엄격해지자 기준일이 빈 문자열이 되어 §164④가 숨겨졌다.
    acquisitionCause: "inheritance" as const,
    inheritanceAssetKind: "land" as const,
    inheritanceStartDate: "1987-05-01", // ≥ 1985(post-deemed) & < 1990-08-30(공시지가 미고시)
    // 보충적평가 보조 입력 섹션의 상위 게이트 — 이걸 켜야 토지 입력이 렌더된다
    inheritanceValuationMethod: "supplementary" as const,
    useSupplementaryHelper: true,
    ...overrides,
  };
}

describe("post-deemed 상속토지 §164④ 등급환산 진입 (소령 §163⑨1호)", () => {
  it("P-1: 1985~1990.8.30. 상속 토지 → §164④ 등급환산 위젯 노출", () => {
    render(
      <PostDeemedInputs asset={postDeemedAsset()} onChange={() => {}} transferDate="2024-01-01" />,
    );
    expect(screen.queryAllByText(SEC164_4).length).toBeGreaterThan(0);
  });

  it("P-3(회귀): 1990.8.30. 이후 상속 토지 → 미노출 (개별공시지가가 존재한다)", () => {
    render(
      <PostDeemedInputs
        asset={postDeemedAsset({ inheritanceStartDate: "1991-01-01" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(SEC164_4).length).toBe(0);
  });

  it("P-4(대조): 주택은 이미 §164④를 제공한다 — 빠져 있던 것은 토지뿐이었다", () => {
    // 미공시 상속주택은 `HouseValuationSection`(§164⑦ 3-시점 환산) 안에서
    // 부수토지 §164④ 등급환산을 이미 노출한다. 즉 자산 간 **비대칭**이 문제였다.
    render(
      <PostDeemedInputs
        asset={postDeemedAsset({
          assetKind: "housing" as const,
          inheritanceAssetKind: "house_individual" as const,
        })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(SEC164_4).length).toBeGreaterThan(0);
  });

  it("P-5: ① 입력 경로(상속세 신고가액)는 계속 살아 있다 — max(①,②)이므로 막지 않는다", () => {
    // §163⑨1호는 max(①,②)다. 감정·매매사례로 ①을 확인한 사용자가 입력할 수 있어야 한다.
    //
    // ⚠️ ①의 입력 경로는 「상속세 신고가액」 필드다. 그 아래 **보충적평가 보조계산**(개별공시지가 × 면적)은
    //    이 값을 자동으로 채워주는 도구일 뿐이고, 1990.8.30. 前 토지에서는 `isPreDisclosure`로
    //    **이미 숨겨진다**(공시지가가 존재하지 않으므로). 본 변경은 그 상태를 바꾸지 않는다.
    render(
      <PostDeemedInputs asset={postDeemedAsset()} onChange={() => {}} transferDate="2024-01-01" />,
    );
    expect(screen.queryAllByText(REPORTED).length).toBeGreaterThan(0);
  });
});
