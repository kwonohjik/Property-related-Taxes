/**
 * anchor: 감면 축 PHD 토글 — §164⑦ 적격 판정을 자산 축과 **같은 leaf**로 한다 (Q12).
 *
 * 종전 이 위젯은 `new Date(취득일) < new Date(최초고시일)`로 판정을 복제해
 * `isPhdEligible`이 접어 주는 **의제취득일(1985-01-01)** 을 보지 않았고, 부적격일 때
 * 아무 경고도 내보내지 않았다. 자산 축은 같은 규정을 ⑤ 경고·⑧ 차단·⑫ refine 3중으로
 * 다루는데 감면 축만 무방비였다.
 *
 * ⚠️ 이 PR은 **차단하지 않는다**(1단계 경고). 차단 승격은 별건이므로 여기서 「차단됨」을
 *    단언하지 않는다 — 대신 경고 노출·미노출을 가른다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReductionPhdInput } from "../../components/calc/transfer/ReductionPhdInput";

afterEach(cleanup);

const WARN = "reduction-phd-not-eligible";

function renderPhd(acquisitionDate: string | undefined, firstDisclosureDate: string) {
  return render(
    <ReductionPhdInput
      acquisitionDate={acquisitionDate}
      value={{ phdMode: true, firstDisclosureDate }}
      onChange={() => {}}
    />,
  );
}

describe("감면 PHD 적격 게이트 (§164⑦)", () => {
  it("취득일 < 최초고시일 — 경고 없음 + '환산 권장' 안내", () => {
    renderPhd("2003-05-10", "2006-01-01");
    expect(screen.queryByTestId(WARN)).toBeNull();
    expect(screen.getByText(/환산 권장/)).toBeTruthy();
  });

  it("취득일 > 최초고시일 — 부적격 경고 노출", () => {
    renderPhd("2010-05-10", "2006-01-01");
    expect(screen.getByTestId(WARN)).toBeTruthy();
  });

  it("취득일 = 최초고시일 — 고시분이 존재하므로 부적격", () => {
    renderPhd("2006-01-01", "2006-01-01");
    expect(screen.getByTestId(WARN)).toBeTruthy();
  });

  it("🔑 1984년 취득 × 1985-01-01 이전 고시 — 의제취득일 접힘으로 **부적격**", () => {
    // 종전 raw 비교('1980-03-01' < '1984-06-01')는 적격이라 답했다.
    renderPhd("1980-03-01", "1984-06-01");
    expect(screen.getByTestId(WARN)).toBeTruthy();
  });

  it("🔑 1984년 취득 × 1985-01-01 이후 고시 — 의제취득일 기준으로 적격", () => {
    renderPhd("1980-03-01", "1990-01-01");
    expect(screen.queryByTestId(WARN)).toBeNull();
  });

  it("한쪽 날짜 미상 — 판정 불능이므로 경고도 권장도 없다", () => {
    renderPhd(undefined, "2006-01-01");
    expect(screen.queryByTestId(WARN)).toBeNull();
    expect(screen.queryByText(/환산 권장/)).toBeNull();
  });
});
