/**
 * 상속·증여 UI 리뷰 G8 — 순수·소스 축 anchor.
 *
 * 배치: 입력폼 구조·사후관리 20건 중 렌더로 재기 어려운 축만 여기 둔다.
 * (게이트·표시 축은 `ig-ui-g8-render.anchor.test.tsx`가 정본 — 소스 문자열은 게이트를 못 잰다.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAmendmentReturnData,
  familyBusinessAmendmentDeadline,
} from "@/lib/tax-engine/credits/family-business-postmgmt-orchestrator";
import {
  formatInheritanceApiError,
  labelForInheritancePath,
} from "@/components/calc/InheritanceTaxFormErrors";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

// ────────────────────────────────────────────────────
// IG-013 — 신고·납부 기한 (§18의2⑨) 단일 소스
// ────────────────────────────────────────────────────

describe("[G8-A] IG-013 — 수정신고 기한은 사건별로 계산된다 (§18의2⑨)", () => {
  it("A-1: 위반일이 속하는 달의 말일 + 6개월", () => {
    // 2026-06-15 위반 → 말일 2026-06-30 → +6개월 = 2026-12-30
    expect(familyBusinessAmendmentDeadline("2026-06-15")).toBe("2026-12-30");
    // 말일이 31일인 달 → +6개월이 30일뿐인 달이면 클램프
    expect(familyBusinessAmendmentDeadline("2026-01-10")).toBe("2026-07-31");
  });

  it("A-2: buildAmendmentReturnData가 같은 함수를 쓴다 (기한 산식 단일 소스)", () => {
    const result = {
      totalRecapture: 1_000_000,
      totalAddback: 0,
      totalInterest: 0,
      cgtCreditApplied: 0,
      netRecapture: 1_000_000,
      perViolationDetail: [],
    };
    for (const d of ["2026-06-15", "2026-01-10", "2025-02-28"]) {
      expect(buildAmendmentReturnData(result, d).amendmentDeadline).toBe(
        familyBusinessAmendmentDeadline(d),
      );
    }
  });

  it("A-3: 날짜가 다르면 기한도 다르다 — 「첫 원소 고정」이면 이 단언이 무의미해진다", () => {
    expect(familyBusinessAmendmentDeadline("2026-01-10")).not.toBe(
      familyBusinessAmendmentDeadline("2026-06-15"),
    );
  });
});

// ────────────────────────────────────────────────────
// IG-011 — §15⑧ 정당한 사유의 호별 대응 (소스 축)
// ────────────────────────────────────────────────────

describe("[G8-B] IG-011 — 정당한 사유는 위반 유형별로 갈린다", () => {
  const src = read("app/calc/family-business-postmgmt/page.tsx");

  it("B-1: 모든 정당사유 옵션이 forViolation을 들고 있다", () => {
    // §15⑧ 정당사유 옵션만 — 라벨이 「N호X.」로 시작한다
    // (VIOLATION_TYPE_OPTIONS·CESSATION_SUBTYPE_OPTIONS도 description에 「호」를 담으므로
    //  단순히 「호」를 포함하는 줄로 세면 모집단이 24로 부풀어 오른다.)
    const optionLines = src
      .split("\n")
      .filter((l) => /label: "[1-3]호[가-사]\./.test(l));
    // §15⑧ 1~3호 = 7 + 3 + 7 = 17건
    expect(optionLines.length).toBe(17);
    for (const line of optionLines) {
      expect(line).toContain("forViolation:");
    }
  });

  it("B-2: 호별 배분이 1호 7 · 2호 3 · 3호 7이다 (상증령 §15⑧ 실측)", () => {
    const count = (t: string) =>
      src.split("\n").filter((l) => l.includes(`forViolation: "${t}"`)).length;
    expect(count("asset_disposal")).toBe(7);
    expect(count("business_cessation")).toBe(3);
    expect(count("share_decrease")).toBe(7);
    // ⑤4호(고용 미달)에는 §15⑧에 정당한 사유가 없다
    expect(count("employment_drop")).toBe(0);
  });

  it("B-3: select가 전건이 아니라 위반 유형별 목록을 그린다", () => {
    expect(src).toContain("justifiableReasonsFor(v.type).map");
    expect(src).not.toContain("JUSTIFIABLE_REASON_OPTIONS.map");
  });

  it("B-4: 위반 유형이 바뀌면 호가 어긋난 사유를 비운다 (엔진은 대조하지 않는다)", () => {
    expect(src).toContain("next.justifiableReasonCode = \"\"");
  });
});

// ────────────────────────────────────────────────────
// IG-038 — 감정평가수수료 ④ 체크리스트 게이트
// ────────────────────────────────────────────────────

describe("[G8-C] IG-038 — appraisalFee도 수동 항목 게이트를 탄다", () => {
  it("C-1: ④ 변환이 isManualItemActive로 게이트된다", () => {
    const src = read("components/calc/InheritanceTaxForm.tsx");
    expect(src).toContain(
      'appraisalFee: isManualItemActive(form, "appraisalFee") ? buildAppraisalFee(form) : undefined',
    );
  });

  it("C-2: appraisalFee는 자동 항목이 아니다 (게이트가 필요한 근거)", async () => {
    const { AUTO_KEYS } = await import("@/lib/calc/inheritance-deduction-checklist");
    expect(AUTO_KEYS).not.toContain("appraisalFee");
  });
});

// ────────────────────────────────────────────────────
// IG-101 — 도달 불가 경고 점 분기 제거
// ────────────────────────────────────────────────────

describe("[G8-D] IG-101 — 죽은 amber 경고 점 분기가 남아 있지 않다", () => {
  const src = read("components/calc/exemption/ExemptionChecklistPanel.tsx");

  it("D-1: itemMap prop·별칭·showWarning 분기가 모두 사라졌다", () => {
    expect(src).not.toContain("itemMap={");
    expect(src).not.toContain("const itemMap = checkedMap");
    expect(src).not.toContain("showWarning");
  });

  it("D-2: 그룹 배지(warningCount)는 살아 있다 — 삭제 대상이 아니었다", () => {
    expect(src).toContain("warningCount");
  });
});

// ────────────────────────────────────────────────────
// IG-157 — 한국어 라벨 포매터 배선 + 라벨표 ↔ 스키마 정합
// ────────────────────────────────────────────────────

describe("[G8-E] IG-157 — 특화 포매터가 실제로 배선됐다", () => {
  it("E-1: 폼이 특화 포매터를 부른다 (일반 포매터 별칭 import 없음)", () => {
    const src = read("components/calc/InheritanceTaxForm.tsx");
    expect(src).toContain("? formatInheritanceApiError(res.data)");
    expect(src).not.toContain("formatInheritanceApiError as formatApiError");
  });

  it("E-2: lib/calc/inheritance-api의 일반 포매터는 제거됐다 (경로 재발 차단)", () => {
    const src = read("lib/calc/inheritance-api.ts");
    expect(src).not.toContain("export function formatInheritanceApiError");
  });

  it("E-3: 라벨표가 실제 Zod 스키마 최상위 키를 덮는다", () => {
    // 종전 표에 있던 존재하지 않는 키 → 실제 키로 교체됐다
    expect(labelForInheritancePath(["deathDate"])).toBe("상속개시일");
    expect(labelForInheritancePath(["preGiftsWithin10Years"])).toBe("10년 내 사전증여");
    expect(labelForInheritancePath(["heirs"])).toBe("상속인");
    expect(labelForInheritancePath(["deductionInput"])).toBe("공제 입력");
    expect(labelForInheritancePath(["creditInput"])).toBe("세액공제 입력");
  });

  it("E-4: 리뷰가 든 대표 경로가 내부 식별자 없이 나온다", () => {
    expect(labelForInheritancePath(["deductionInput", "familyBusiness", "heirId"])).toBe(
      "공제 입력 › 가업상속공제 › 상속인",
    );
  });

  it("E-5: 배열 순번은 「n번」으로 표기된다", () => {
    expect(labelForInheritancePath(["estateItems", "0", "marketValue"])).toBe(
      "상속재산 › 1번 › 시가",
    );
  });

  it("E-6: 대조군 — 라벨이 없는 세그먼트는 원문을 유지한다 (침묵 치환 없음)", () => {
    expect(labelForInheritancePath(["unknownSegment"])).toBe("unknownSegment");
  });

  it("E-7: 포매터 출력에 Zod 원문 경로(점 표기)가 남지 않는다", () => {
    const out = formatInheritanceApiError({
      error: "입력값이 올바르지 않습니다.",
      issues: [{ path: ["deductionInput", "familyBusiness", "heirId"], message: "Required" }],
    });
    expect(out).toContain("공제 입력 › 가업상속공제 › 상속인: Required");
    expect(out).not.toContain("deductionInput.familyBusiness.heirId");
  });
});
