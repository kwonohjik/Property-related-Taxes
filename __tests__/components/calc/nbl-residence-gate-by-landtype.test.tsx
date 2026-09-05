/**
 * anchor: 비사업용 토지 — 재촌 입력의 지목별 게이트 (2026-09-05)
 *
 * 조문 실측:
 *  - 농지  법 §104의3①1호가목 「소유자가 농지 소재지에 **거주**하지 아니하거나 …」
 *          영 §168의8② 재촌 정의(동일·연접 시·군·구 또는 직선거리 30km)
 *  - 임야  법 §104의3①2호나목 「임야 소재지에 **거주**하는 자가 소유한 임야」
 *          영 §168의9② 「… 지역에 **주민등록이 되어 있고** 사실상 거주하는 자」
 *  - 목장  법 §104의3①3호 가목·나목 — **거주 요건 없음**. 단서의 제외 사유(영 §168의10②:
 *          상속 3년 미경과·종중·사회복지법인등)에도 거주가 없다.
 *
 * ⇒ 목장에는 거주 이력 입력이 뜨면 안 된다(엔진 `pasture.ts`도 참조하지 않는다).
 * ⇒ 「직선거리(km)」 legacy fallback 칸은 **농지 전용**이다 — 영 §168의9②의 주민등록 요건 때문에
 *    `forest.ts`가 거리 스냅샷 fallback을 의도적으로 쓰지 않는다(E1-04, 2026-09-02).
 *    임야에서 직선거리 30km 자체는 유효하지만, 그 판정은 거주 이력의 소재지 매칭
 *    (`computeResidencePeriods`의 `distanceLimitKm`)이 수행한다.
 *
 * 🔴 회귀 가드: 재촌 축을 지목으로 좁힐 때 **블록째** 목장을 빼면 안 된다 — 같은 블록 안의
 *    「소재지 행정구역 단위」는 목장의 §104의3①3호가목 도시지역 판정에 필요하다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ResidenceHistorySection } from "../../../components/calc/transfer/nbl/ResidenceHistorySection";
import { makeDefaultAsset } from "../../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const DISTANCE_LABEL = "직선거리 (km)";

describe("재촌 입력 지목 게이트 — 「직선거리(km)」는 농지 전용", () => {
  it("농지 + 거주 이력 없음 → 직선거리 칸 노출 (영 §168의8② fallback)", () => {
    render(
      <ResidenceHistorySection
        asset={{ ...makeDefaultAsset(1), nblResidenceHistories: [] }}
        onAssetChange={() => {}}
        landType="farmland"
      />,
    );
    expect(screen.queryByText(DISTANCE_LABEL)).not.toBeNull();
  });

  it("🔴 임야 + 거주 이력 없음 → 직선거리 칸 미노출 (영 §168의9② 주민등록 요건)", () => {
    render(
      <ResidenceHistorySection
        asset={{ ...makeDefaultAsset(1), nblResidenceHistories: [] }}
        onAssetChange={() => {}}
        landType="forest"
      />,
    );
    expect(screen.queryByText(DISTANCE_LABEL)).toBeNull();
  });

  it("농지라도 거주 이력이 1건이라도 있으면 직선거리 칸은 숨는다 (이력이 정본)", () => {
    render(
      <ResidenceHistorySection
        asset={{
          ...makeDefaultAsset(1),
          nblResidenceHistories: [
            {
              sigunguCode: "11110",
              sigunguName: "서울특별시 종로구",
              startDate: "2010-01-01",
              endDate: "2020-01-01",
              hasResidentRegistration: true,
            },
          ],
        }}
        onAssetChange={() => {}}
        landType="farmland"
      />,
    );
    expect(screen.queryByText(DISTANCE_LABEL)).toBeNull();
  });
});
