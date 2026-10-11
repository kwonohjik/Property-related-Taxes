/**
 * 1990 ㎡당가 칸(`pre1990PricePerSqm_1990`)의 이름 — 위젯과 ⑧ 미입력 문구가 같은 이름을 쓰는가.
 *
 * 「소득세법 시행령」 §164④ 산식의 분자는 「1990년 1월 1일을 기준으로 한 개별공시지가」다.
 * 1990.8.30.은 그 개별공시지가가 **고시된 날**(본문 「1990년 8월 30일 개별공시지가가 고시되기 전에」)이자
 * 분모의 시가표준액 기준일이다. 종전에는 위젯이 이 칸을 「1990.8.30. 개별공시지가」, ⑧ 문구가
 * 「1990.1.1. 개별공시지가」로 불러 같은 칸이 두 이름이었다(재실측 #12).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { sec164LandPartStatus } from "@/lib/calc/sec164-required-fields";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const NAME = "1990.1.1. 기준 개별공시지가(1990.8.30. 고시)";

describe("1990 ㎡당가 칸 이름 통일 (#12)", () => {
  it("위젯 라벨이 §164④ 분자 표현을 쓰고, 1990.8.30.은 고시일로만 적는다", () => {
    const { container } = render(
      <Pre1990LandValuationInput
        form={{ pre1990Enabled: true, pre1990PricePerSqm_1990: "", pre1990PricePerSqm_atTransfer: "", pre1990Grade_current: "", pre1990Grade_prev: "", pre1990Grade_atAcq: "", pre1990GradeMode: "number" }}
        onChange={() => {}} acquisitionDate="1988-05-01" transferDate="2026-06-30" acquisitionArea="100" alwaysOpen
      />,
    );
    const labels = [...container.querySelectorAll("label")].map((l) => l.textContent ?? "");
    expect(labels.some((t) => t.startsWith(`${NAME} (원/㎡)`))).toBe(true);
    expect(container.textContent).not.toContain("1990.8.30. 개별공시지가");
  });

  it("⑧ 미입력 라벨이 위젯과 같은 이름이다", () => {
    const st = sec164LandPartStatus({
      ...makeDefaultAsset(1), acquisitionArea: "100",
      pre1990Grade_current: "100", pre1990Grade_prev: "100", pre1990Grade_atAcq: "80",
    } as AssetForm);
    const i = st.missingFields.indexOf("pre1990PricePerSqm_1990");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(st.missing[i]).toBe(NAME);
  });
});
