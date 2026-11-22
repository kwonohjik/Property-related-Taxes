/**
 * 소스 가드 — 거주 개월은 §154⑥ 초일 산입 정본(`residenceIntervalMonths`)으로만 센다 (2026-11 리뷰 D-45 · PR-23에서 남긴 「인라인 식 스캔 가드」).
 *
 * D-45: 재개발 「거주개월 분리 입력」 카드가 `y * 12 + m - (d < 0 ? 1 : 0)`을 인라인으로 써서 첫날을 뺐다 — 정확히 2년 거주가 23개월로
 *   저장돼 §154① 거주요건·표2가 뒤집혔다(10억 0원 → 164,720,285원). PR-23(#3487)이 정본 leaf로 바꿨지만 같은 꼴의 식이 새 파일에
 *   다시 들어오는 것은 막지 않았다. 이 가드가 그 몫이다. 같은 축 형제로 §155⑳ 카드의 거주 구간 편집기가 임대기간 셈(`diffMonthsClamped` —
 *   첫날 불산입)으로 합계를 보이던 것을 이 가드를 만들며 찾았다(`rental-residence-mode-parity.anchor.test.tsx`).
 *
 * 1. 연·월 차로 개월을 바로 세는 인라인 식은 아래 목록의 파일에만 있다. 새 파일에 생기면 정본 leaf를 쓰거나, 거주 축이 아니라는 이유를
 *    적어 목록에 더한다(목록에서 빠져도 실패한다 — 목록이 현행과 같아야 한다).
 * 2. 첫날을 빼는 임대기간 셈 `diffMonthsClamped`는 임대기간 파일에서만 부른다.
 * 3. 거주 구간을 받는 `PeriodRangeEditor`는 `countMonths={residenceIntervalMonths}`를 준다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components", "lib"];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        walk(p);
      } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
        out.push(p.split(path.sep).join("/"));
      }
    }
  };
  ROOTS.forEach(walk);
  return out.sort();
}

const FILES = sourceFiles();
const read = (f: string) => fs.readFileSync(f, "utf8");

/** `(e.getUTCFullYear() - s.getUTCFullYear()) * 12 + …` · `yearDiff * 12 + monthDiff` · `y * 12 + m` */
const INLINE_MONTHS = /FullYear\(\)\s*\)?\s*\*\s*12|\b\w*[Dd]iff\w*\s*\*\s*12\s*\+|\by\s*\*\s*12\s*\+\s*m\b/;

/** 인라인 개월 식이 있어도 되는 파일 — 모두 거주 개월 축이 아니다. */
const INLINE_ALLOWED: Record<string, string> = {
  "components/calc/transfer/rental/Rental973InputForm.tsx": "§97의3 임대기간 표시",
  "components/calc/transfer/rental/Rental974InputForm.tsx": "§97의4 임대기간 표시",
  "lib/stores/calc-wizard-asset-residence.ts": "`diffMonthsClamped` 정의(임대기간 전용)",
  "lib/tax-engine/civil-period.ts": "민법 기간 계산 정본",
  "lib/tax-engine/same-adjustment-period-std-price.ts": "같은 조정기간 기준시가(달력 월 차)",
  "lib/tax-engine/separate-aggregate-land.ts": "별도합산 토지 월 단위 판정",
  "lib/tax-engine/transfer-land-rebuild-rate.ts": "등가 기산일 역산(월 인덱스)",
  "lib/tax-engine/transfer-tax-aggregate-helpers.ts": "`monthsBetween` — §95·§104 보유기간 내림 축",
  "lib/tax-engine/utc-date.ts": "date-fns 대체 달력 함수",
};

/** 첫날을 빼는 임대기간 셈을 불러도 되는 파일. */
const DIFF_MONTHS_CLAMPED_ALLOWED = [
  "components/calc/transfer/PeriodRangeEditor.tsx", // 기본값(임대 구간) — 거주 구간은 호출처가 `countMonths`로 바꾼다(3)
  "lib/stores/calc-wizard-asset-rental-period.ts",
  "lib/stores/calc-wizard-asset-residence.ts", // 정의
];

describe("D-45 가드 — 거주 개월 인라인 식", () => {
  it("1. 연·월 차 인라인 개월 식은 목록의 파일(거주 축 아님)에만 있다", () => {
    const found = FILES.filter((f) => INLINE_MONTHS.test(read(f)));
    expect(found).toEqual(Object.keys(INLINE_ALLOWED).sort());
  });

  it("1′. 정규식이 D-45의 옛 식을 실제로 잡는다", () => {
    expect(INLINE_MONTHS.test("return y * 12 + m - (d < 0 ? 1 : 0);")).toBe(true);
    expect(INLINE_MONTHS.test("const m = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());")).toBe(true);
    expect(INLINE_MONTHS.test("const months = held.years * 12 + held.months;")).toBe(false); // 보유기간 leaf 결과의 환산은 대상 아님
  });

  it("2. `diffMonthsClamped`(첫날 불산입)는 임대기간 파일에서만 부른다", () => {
    const callers = FILES.filter((f) => /\bdiffMonthsClamped\b/.test(read(f)));
    expect(callers).toEqual([...DIFF_MONTHS_CLAMPED_ALLOWED].sort());
  });

  it("3. 거주 구간 `PeriodRangeEditor`는 정본 셈을 넘긴다", () => {
    const blocks = FILES.flatMap((f) =>
      [...read(f).matchAll(/<PeriodRangeEditor\b[\s\S]*?\/>/g)].map((m) => ({ f, block: m[0] })),
    );
    const residence = blocks.filter((b) => /testidPrefix="residence/.test(b.block));
    expect(residence.length).toBeGreaterThan(0);
    for (const b of residence) expect(b.block, b.f).toMatch(/countMonths=\{residenceIntervalMonths\}/);
    // 임대 구간은 기본값(임대기간 셈)을 쓴다 — 거주 셈을 잘못 넘기지 않는다
    for (const b of blocks.filter((x) => /testidPrefix=\{?`?"?rental-period/.test(x.block))) {
      expect(b.block, b.f).not.toMatch(/countMonths=/);
    }
  });
});
