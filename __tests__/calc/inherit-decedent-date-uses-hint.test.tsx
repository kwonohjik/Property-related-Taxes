/**
 * 피상속인 취득일 칸 안내 — 이 날짜를 쓰는 규정 4개를 모두 밝힌다.
 * 계획서 `docs/02-design/features/inherit-decedent-date-early-return.plan.md` §5.1 · Q-1 c.
 * 종전 안내는 「단기보유 통산용 (소득세법 §104②1호)」뿐이라 가업상속·수용 감면·비사업용 토지 수용 쓰임이 빠져 있었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup); // RTL 자동 cleanup 미설정 — 수동

const noop = () => {};
const asset = (assetKind: AssetForm["assetKind"]): AssetForm => ({
  ...makeDefaultAsset(1),
  assetKind,
  acquisitionCause: "inheritance",
  acquisitionDate: "2015-01-01",
  inheritanceStartDate: "2015-01-01",
});

describe("피상속인 취득일 안내 — 쓰는 규정 전부", () => {
  for (const kind of ["housing", "land", "general_building"] as const) {
    it(`${kind}: 규정 4개를 모두 밝히고 종전 한 줄 안내는 없다`, () => {
      render(<CompanionAcqInheritanceBlock asset={asset(kind)} onChange={noop} />);
      const text = screen.getByTestId("decedent-acq-date-uses").textContent ?? "";
      expect(text).toContain("세율의 보유기간 기산일입니다(소득세법 §104②1호");
      expect(text).toContain("상속개시일부터 2년 이상 보유했으면 세율은 달라지지 않습니다");
      expect(text).toContain("장기보유특별공제 기산일(소득세법 §95④ 단서)");
      expect(text).toContain("수용 감면의 취득일(조특법 §77⑨)");
      expect(text).toContain("비사업용 토지 제외 판정 취득일(소득령 §168의14③3호나목)");
      expect(screen.queryByText("단기보유 통산용 (소득세법 §104②1호)")).toBeNull();
    });
  }
});
