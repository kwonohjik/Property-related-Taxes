/**
 * anchor: 가업·영농 사후관리 **이자상당액** — 기본 이자율·근거 조문·명칭 (G-08 · G-19 · G-41)
 *
 * 세 건 모두 같은 두 파일(`family-business-postmgmt` · `inheritance-postmgmt`)에 몰려 있어
 * 한 묶음으로 고친다. 셋 다 **세액을 바꾸지 않는 화면 축**이라 값 anchor 로는 잡히지 않는다 —
 * 기본값은 사용자가 덮어쓸 수 있고, 조문 인용이 틀려도 계산은 돈다.
 * ⇒ 저장소 선례(`penalty-citation-b1-b5.anchor.test.ts`)대로 **렌더되는 리터럴**을 검사한다.
 *
 * ## 조문 체인
 *
 * 상증령 §15⑯3호(가업)·§16⑧3호(영농) → 「**부과 당시**의 「국세기본법 시행령」 제43조의3
 * 제2항 본문에 따른 이자율」 → 국세기본법 시행규칙 §19의3 「연 1천분의 31」.
 *
 * 🔴 **국세기본법 제43조의3은 존재하지 않는다** — 법 제43조는 「과세표준신고의 관할」이고,
 *    제43조의3은 **시행령**에만 있다(「국세환급가산금」).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CURRENT_SURCHARGE_RATE,
  INSTALLMENT_SURCHARGE_RATE_HISTORY,
} from "@/lib/tax-engine/data/installment-surcharge-rates";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const FB = "app/calc/family-business-postmgmt/page.tsx";
const FARM = "app/calc/inheritance-postmgmt/page.tsx";

describe("G-08 이자율 기본값 — 현행 고시(국세기본법 시행규칙 §19의3)에 추종한다", () => {
  it("G08-1: 🔑 현행 고시가 연 1천분의 31 이다 (단일 소스 확인)", () => {
    expect(CURRENT_SURCHARGE_RATE).toBe(0.031);
    // 표의 마지막 항목이 현행이어야 한다 — 새 고시를 추가하고 상수를 안 바꾸면 여기서 잡힌다
    const last = INSTALLMENT_SURCHARGE_RATE_HISTORY[INSTALLMENT_SURCHARGE_RATE_HISTORY.length - 1];
    expect(last.rate).toBe(CURRENT_SURCHARGE_RATE);
  });

  it("G08-2: 🔴 종전 기본값 0.022 는 고시 연혁 표 어디에도 없는 값이었다", () => {
    const rates = INSTALLMENT_SURCHARGE_RATE_HISTORY.map((p) => p.rate);
    expect(rates).not.toContain(0.022);
    // 0.029 는 실재하지만 2023-03-20~2024-03-21 구간의 **구율**이다
    expect(rates).toContain(0.029);
  });

  it.each([FB, FARM])("G08-3: 🔴 %s 가 상수를 참조한다 (하드코딩 기본값 제거)", (rel) => {
    const src = read(rel);
    expect(src, `${rel} — 상수 import 누락`).toContain(
      'import { CURRENT_SURCHARGE_RATE } from "@/lib/tax-engine/data/installment-surcharge-rates"',
    );
    expect(src).toContain("useState(String(CURRENT_SURCHARGE_RATE))");
    // 하드코딩 초기값·placeholder 가 남아 있으면 안 된다
    expect(src).not.toContain('useState("0.022")');
    expect(src).not.toContain('useState("0.029")');
    expect(src).not.toContain('placeholder="0.022"');
    expect(src).not.toContain('placeholder="0.029"');
  });

  it.each([FB, FARM])("G08-4: %s 안내문이 「부과 당시」 규칙을 밝힌다", (rel) => {
    const src = read(rel);
    expect(src).toContain("국세기본법 시행규칙 §19의3");
    expect(src).toContain("부과 당시");
  });
});

describe("G-19 근거 조문 — 국세기본법 **시행령** §43의3② (법 제43조의3은 없다)", () => {
  it.each([
    FB,
    FARM,
    "lib/tax-engine/deductions/farming-post-mgmt.ts",
    "lib/tax-engine/credits/family-business-postmanagement.ts",
    "lib/tax-engine/types/inheritance-family-business-postmgmt.types.ts",
  ])("G19-1: 🔴 %s 가 「국세기본법 §43의3②」로 법률을 지목하지 않는다", (rel) => {
    const src = read(rel);
    // 「국세기본법 §43의3」 바로 앞에 「시행령」·「**시행령**」이 없으면 법률 지목이다
    for (const m of src.matchAll(/국세기본법[^\n]{0,12}§43의3/g)) {
      expect(m[0], `${rel} — 「${m[0]}」는 법률을 지목한다`).toMatch(/시행령/);
    }
    // 최소 1곳은 실제로 인용하고 있어야 한다(정규식이 헛돌면 위 루프가 0회다)
    expect(src).toMatch(/§43의3/);
  });

  it("G19-2: 결과 breakdown 라벨이 시행령 → 시행규칙 체인을 가리킨다", () => {
    expect(read("lib/tax-engine/deductions/farming-post-mgmt.ts")).toContain(
      "이자율 (국세기본법 시행령 §43의3② 본문 → 시행규칙 §19의3)",
    );
  });

  it("G19-3: 이자상당액 산식 행의 lawRef 가 어느 시행령인지 밝힌다", () => {
    const src = read("lib/tax-engine/deductions/farming-post-mgmt.ts");
    expect(src).toContain('lawRef: "상증령 §16⑧"');
    expect(src).not.toContain('lawRef: "시행령 §16⑧"');
  });
});

describe("G-41 명칭 — 「이자상당액」이지 「가산세」가 아니다", () => {
  /**
   * 상증법 §18의2⑤ 후단 「이자상당액을 그 부과하는 상속세에 **가산**한다」 · §18의2⑨
   * 「해당 상속세와 이자상당액을」 — 가산세라는 표현이 없다. 별지 제9호서식에서도
   * ㉕(이자상당액)과 ㊱(신고불성실가산세)는 **다른 칸**이고, 국세기본법 §47의3① 괄호가
   * 이자상당가산액을 과소신고가산세 base 에서 제외한다.
   */
  it("G41-1: 🔴 별지9호 매핑 블록 라벨이 「이자상당액」이다", () => {
    const src = read(FB);
    expect(src).toContain("이자상당액 (별지9호 ㉕)");
    expect(src).not.toContain("이자상당액 가산세");
  });

  it("G41-2: 같은 화면 두 곳이 같은 이름을 쓴다 (자기모순 제거)", () => {
    const src = read(FB);
    // 상단 요약은 종전부터 옳았다 — 하단 매핑 블록만 「가산세」였다
    expect(src).toContain("이자상당액 (§15⑯)");
  });

  it("G41-3: 서식 상수는 두 칸을 계속 구분한다 (병합 금지)", () => {
    const src = read("components/calc/inheritance/filing-form-9/filing-form-9-constants.ts");
    expect(src).toContain('"㉕": "이자상당액"');
    expect(src).toContain('"㊱": "신고불성실가산세"');
  });
});
