/**
 * anchor: 안분 방식 섹션 제목은 **두 경로가 같은 문구**다 (2026-08-09).
 *
 * ## 경위
 *
 * #1138이 일반건물 제목을 사용자 확정 문구(「양도가액 토지·건물 안분 방식」)로 바꿨고,
 * #1139가 「주택·건물 경로도 같은 방식으로 정리」했으나 **선택지·전환 patch만** 통일하고
 * 제목은 각자 두었다 — 주택 경로에 종전 「이 자산의 토지·건물 양도가액 **결정 방식**」이
 * 남았다. **화면 실측에서 발견**했다(단위테스트·E2E는 제목을 단언하지 않아 조용히 통과했다).
 *
 * ⇒ 제목을 `SALE_SPLIT_SECTION_TITLE` 공유 상수로 올려 **구조적으로** 갈라지지 않게 했다.
 *   이 anchor는 그 상수를 두 컴포넌트가 실제로 **소비하는지**를 본다 — 상수만 만들고
 *   한쪽이 문자열을 그대로 쓰면 상수는 있으나 마나다.
 *
 * ⚠️ 축 B의 환산 안내(`LandBuildingSplitSection`의 `transferSource`)가 이 제목을 **이름으로
 *    가리킨다**. 문구가 갈리면 「없는 카드」를 가리키게 되므로 함께 본다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SALE_SPLIT_SECTION_TITLE } from "../../components/calc/transfer/SaleSplitBasisExemptionCards";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * 주석을 걷어낸 **코드만** 본다.
 *
 * 종전 문구를 금지하는 단언이 「왜 바꿨는지」를 적은 **주석까지** 걸어버렸다 —
 * 그러면 경위를 남길 수 없다. 주석은 문서이고 렌더되는 것은 코드다.
 */
const codeOf = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

const HOUSING = "components/calc/transfer/LandBuildingSaleSplitSection.tsx";
const GENERAL_BUILDING = "components/calc/transfer/GeneralBuildingSaleSplitSection.tsx";
const AXIS_B = "components/calc/transfer/LandBuildingSplitSection.tsx";

describe("T-1 — 제목은 사용자 확정 문구다", () => {
  it("「양도가액 토지·건물 안분 방식」", () => {
    expect(SALE_SPLIT_SECTION_TITLE).toBe("양도가액 토지·건물 안분 방식");
  });
});

describe("T-2 — 두 경로가 공유 상수를 소비한다 (문자열 재기입 금지)", () => {
  it.each([HOUSING, GENERAL_BUILDING])("%s", (path) => {
    const code = codeOf(path);
    expect(code).toMatch(/SALE_SPLIT_SECTION_TITLE/);
    // 양성 대조군 — 파일을 잘못 읽거나 주석 제거가 코드까지 지웠으면 여기서 먼저 깨진다.
    expect(code).toMatch(/SALE_SPLIT_MODE_OPTIONS/);
    // 상수를 두고도 리터럴을 나란히 쓰면 드리프트가 되살아난다.
    expect(code).not.toMatch(/양도가액 토지·건물 안분 방식/);
    expect(code).not.toMatch(/양도가액 결정 방식/);
  });
});

describe("T-3 — 축 B의 환산 안내가 가리키는 이름이 제목과 일치한다", () => {
  it("「없는 카드」를 가리키지 않는다", () => {
    const src = read(AXIS_B);
    expect(src).toContain(`${SALE_SPLIT_SECTION_TITLE} 아래`);
  });
});
