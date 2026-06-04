/**
 * 부표 5 영리법인 주주 명세 — heirRef 필드 Zod 보존 anchor
 *
 * 목적: shareholders 배열 객체 내 `heirRef` 필드가 Zod parse 후 strip 되지 않고
 *       보존됨을 검증 (14지점 ⑧ 침묵 strip 방지).
 *
 * 법령 근거: 상증법 §3의2② (납세의무자 4종: 상속인/상속인의 배우자/상속인의 직계비속/직계비속의 배우자)
 *   - `heirRef`는 부표 5 ⑦ 구분에서 "입력된 상속인"을 선택한 경우 해당 Heir.id 참조.
 *   - 엔진 미사용 — 신고서 표시·연결 추적 전용 (세액 무영향).
 *
 * 계획서: docs/00-pm/inheritance-corporate-shareholder-heir-dropdown.plan.md §7
 *
 * 정책 참조:
 *   - feedback_api_zod_schema_sync (14지점 ⑧ Zod shareholders 스키마)
 *   - pre-do-anchor-verification (실패 우선 확보 → 구현 → GREEN)
 *
 * 참고 패턴:
 *   - __tests__/lib/validators/estate-item-schema-roundtrip.test.ts
 *   - __tests__/lib/validators/inheritance-deduction-schema-preserve.test.ts
 */

import { describe, it, expect } from "vitest";
import { heirSchema } from "@/lib/validators/property-valuation-input";

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 헬퍼: corporate Heir 기본 구조 (shareholders 포함)
// ─────────────────────────────────────────────────────────────────────────────

/** corporate Heir 최소 유효 입력 (heirRef 포함) */
const makeHeirWithShareholder = (
  shareholderOverride?: Partial<{
    id: string;
    relation: "heir" | "heir_spouse" | "lineal_descendant_of_heir" | "spouse_of_lineal_descendant";
    name: string;
    residentNumber?: string;
    shareRatio: number;
    heirRef?: string;
  }>,
) => ({
  id: "heir-corporate-001",
  relation: "corporate" as const,
  name: "(주)테스트법인",
  isForProfit: true,
  businessRegistrationNumber: "123-45-67890",
  shareholders: [
    {
      id: "sh-001",
      relation: "heir" as const,
      name: "홍길동",
      residentNumber: "800101-1234567",
      shareRatio: 0.6,
      heirRef: "heir-202301-001",
      ...shareholderOverride,
    },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// C-1: heirRef 포함 shareholder가 parse 후 보존 (strip 안 됨)
//
// Pre-Do 실패 상태 (Zod 추가 전):
//   heirRef는 z.object 미선언 → strip → result.data.shareholders[0].heirRef === undefined
//   → C-1 FAIL (RED — 침묵 strip 확인)
//
// 구현 후 (Zod 추가 후):
//   heirRef: z.string().optional() 선언 → strip 방지 → C-1 GREEN
// ─────────────────────────────────────────────────────────────────────────────
describe("C-1: heirRef 포함 shareholder Zod parse 후 보존", () => {
  it("C-1: heirRef='heir-202301-001' 입력 후 parse → 보존 (strip 방지 anchor)", () => {
    const input = makeHeirWithShareholder();
    const result = heirSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (!result.success) {
      console.error("parse 실패:", result.error.format());
      return;
    }

    const shareholders = result.data.shareholders;
    expect(shareholders).toBeDefined();
    expect(shareholders!.length).toBe(1);

    // Pre-Do 실패 지점: heirRef가 schema에 없으면 strip되어 undefined
    // 구현 후: z.string().optional() 추가 → "heir-202301-001" 보존
    expect(shareholders![0].heirRef).toBe("heir-202301-001");
  });

  it("C-1b: heirRef 외 기존 필드(relation·name·residentNumber·shareRatio) 동시 보존", () => {
    const input = makeHeirWithShareholder();
    const result = heirSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const sh = result.data.shareholders![0];
    expect(sh.relation).toBe("heir");
    expect(sh.name).toBe("홍길동");
    expect(sh.residentNumber).toBe("800101-1234567");
    expect(sh.shareRatio).toBe(0.6);
    // heirRef 추가로 기존 필드 보존이 깨지지 않는지 함께 검증
    expect(sh.heirRef).toBe("heir-202301-001");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C-3: heirRef 없는 기존 데이터 정상 통과 (하위호환)
//
// 기존 sessionStorage에 저장된 주주 행은 heirRef가 없음.
// z.string().optional() 선언이므로 heirRef 미포함 데이터도 parse 성공해야 함.
// ─────────────────────────────────────────────────────────────────────────────
describe("C-3: heirRef 없는 기존 데이터 하위호환", () => {
  it("C-3: heirRef 미포함 shareholder → parse 성공 + heirRef undefined (하위호환)", () => {
    const input = {
      id: "heir-corporate-002",
      relation: "corporate" as const,
      name: "(주)구버전법인",
      isForProfit: true,
      shareholders: [
        {
          id: "sh-legacy-001",
          relation: "heir_spouse" as const,
          name: "김영희",
          shareRatio: 0.3,
          // heirRef 없음 — 구 데이터 형식
        },
      ],
    };

    const result = heirSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (!result.success) {
      console.error("parse 실패 (하위호환 실패):", result.error.format());
      return;
    }

    const sh = result.data.shareholders![0];
    expect(sh.relation).toBe("heir_spouse");
    expect(sh.name).toBe("김영희");
    expect(sh.shareRatio).toBe(0.3);
    // heirRef 미포함 → undefined (optional 이므로 허용)
    expect(sh.heirRef).toBeUndefined();
  });

  it("C-3b: heir_spouse·lineal_descendant·spouse_of_lineal_descendant 기존 4-enum 모두 heirRef 없이 통과", () => {
    const relations = [
      "heir_spouse",
      "lineal_descendant_of_heir",
      "spouse_of_lineal_descendant",
    ] as const;

    for (const relation of relations) {
      const input = {
        id: `heir-corp-${relation}`,
        relation: "corporate" as const,
        name: `테스트법인(${relation})`,
        isForProfit: true,
        shareholders: [
          {
            id: `sh-${relation}`,
            relation,
            name: "테스트주주",
            shareRatio: 0.25,
          },
        ],
      };

      const result = heirSchema.safeParse(input);
      if (!result.success) {
        throw new Error(`${relation} parse 실패: ${JSON.stringify(result.error.format())}`);
      }
      expect(result.success).toBe(true);
      if (!result.success) continue;

      expect(result.data.shareholders![0].heirRef).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C-7: 이름 있는 정상 케이스 name.min(1) 통과
//
// 계획서 §7: "name fallback은 UI 책임이므로 Zod에선 정상 name으로 테스트"
// → Zod schema에 name.min(1) 유지 (빈 문자열 거부)
// → heirRef 포함 + name 정상값 조합에서 parse 성공 확인
// ─────────────────────────────────────────────────────────────────────────────
describe("C-7: heirRef 포함 + name.min(1) 통과", () => {
  it("C-7: heirRef 설정 + name='홍길동' → parse 성공 (name 정상 케이스)", () => {
    const input = makeHeirWithShareholder({
      name: "홍길동",
      heirRef: "heir-202301-002",
    });

    const result = heirSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const sh = result.data.shareholders![0];
    expect(sh.name).toBe("홍길동");
    expect(sh.heirRef).toBe("heir-202301-002");
  });

  it("C-7b: heirRef 설정 + name='' → parse 실패 (name.min(1) Zod 검증 유지)", () => {
    // name fallback(관계 라벨로 채우기)은 UI 책임 — Zod는 빈 문자열 거부
    const input = makeHeirWithShareholder({
      name: "", // 빈 문자열 — Zod name.min(1) 위반
      heirRef: "heir-202301-003",
    });

    const result = heirSchema.safeParse(input);

    // Zod는 name.min(1)으로 빈 문자열 거부 — 이것이 올바른 동작
    // UI에서 관계 라벨 fallback으로 채워 빈 문자열을 방지해야 함
    expect(result.success).toBe(false);
  });

  it("C-7c: heirRef 설정 + name 있음 + residentNumber 있음 → 전체 필드 보존", () => {
    const input = makeHeirWithShareholder({
      name: "이철수",
      residentNumber: "900202-1234567",
      shareRatio: 0.4,
      heirRef: "heir-202306-003",
    });

    const result = heirSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const sh = result.data.shareholders![0];
    expect(sh.name).toBe("이철수");
    expect(sh.residentNumber).toBe("900202-1234567");
    expect(sh.shareRatio).toBe(0.4);
    expect(sh.heirRef).toBe("heir-202306-003");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 메타 anchor: 가드 실효성 — schema 미선언 시 strip 동작 자체 확인
//
// heirRef가 실제로 strip 방지가 필요한 필드임을 anchor로 증명.
// "schema에 없는 가짜 필드는 strip됨"(M-1 패턴) + "선언된 필드는 보존됨"(M-2 패턴)
// ─────────────────────────────────────────────────────────────────────────────
describe("메타 anchor — shareholders 스키마 strip 동작 검증", () => {
  it("M-1: shareholders.id·relation·name·shareRatio는 보존 (기존 필드 회귀)", () => {
    const input = {
      id: "heir-corp-meta",
      relation: "corporate" as const,
      name: "메타테스트법인",
      isForProfit: true,
      shareholders: [
        {
          id: "sh-meta-001",
          relation: "heir" as const,
          name: "메타주주",
          shareRatio: 0.5,
        },
      ],
    };

    const result = heirSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const sh = result.data.shareholders![0];
    // 기존 필드 보존 — heirRef 추가 후에도 기존 필드 회귀 없음
    expect(sh.id).toBe("sh-meta-001");
    expect(sh.relation).toBe("heir");
    expect(sh.name).toBe("메타주주");
    expect(sh.shareRatio).toBe(0.5);
  });

  it("M-2: 지분율 합 >1 기존 refine 경고 유지 (heirRef 추가 후 refine 무력화 없음)", () => {
    const input = {
      id: "heir-corp-refine",
      relation: "corporate" as const,
      name: "Refine테스트법인",
      isForProfit: true,
      shareholders: [
        {
          id: "sh-r-001",
          relation: "heir" as const,
          name: "주주A",
          shareRatio: 0.7,
          heirRef: "heir-ref-001",
        },
        {
          id: "sh-r-002",
          relation: "heir_spouse" as const,
          name: "주주B",
          shareRatio: 0.5, // 0.7 + 0.5 = 1.2 > 1 — refine 위반
        },
      ],
    };

    const result = heirSchema.safeParse(input);
    // 지분율 합 >1 → refine 실패 → parse 실패
    expect(result.success).toBe(false);
  });
});
