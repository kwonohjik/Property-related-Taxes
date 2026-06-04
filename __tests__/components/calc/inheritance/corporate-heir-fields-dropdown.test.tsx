/**
 * CorporateHeirFields ⑦ 드롭다운 2그룹 optgroup + 상속인 자동채움 RTL 테스트
 *
 * 케이스: C-1(상속인 연결 → 자동채움 read-only), C-6(상속인 0명 → 그룹1 없음)
 *
 * 계획서: docs/00-pm/inheritance-corporate-shareholder-heir-dropdown.plan.md §6
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CorporateHeirFields } from "@/components/calc/inheritance/CorporateHeirFields";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 픽스처
// ─────────────────────────────────────────────────────────────────────────────

const spouseHeir: Heir = {
  id: "heir-spouse-001",
  relation: "spouse",
  name: "홍길동",
  residentNumber: "600101-1234567",
};

const childHeir: Heir = {
  id: "heir-child-001",
  relation: "child",
  name: "홍철수",
  residentNumber: "900202-1234567",
};

const corporateHeir: Heir = {
  id: "corp-001",
  relation: "corporate",
  name: "(주)테스트법인",
  isForProfit: true,
  shareholders: [],
};

function makeCorporateWithShareholder(
  shareholderOverride: Partial<import("@/lib/tax-engine/types/inheritance-gift.types").ShareholderInfo> = {},
): Heir {
  return {
    ...corporateHeir,
    shareholders: [
      {
        id: "sh-001",
        relation: "heir",
        name: "",
        shareRatio: 0,
        ...shareholderOverride,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// C-1: 상속인 연결 → ⑧⑨ 자동채움 + read-only
// ─────────────────────────────────────────────────────────────────────────────
describe("C-1: 그룹1 상속인 선택 → 자동채움 + read-only", () => {
  it("C-1a: 배우자 상속인 연결된 shareholder → ⑧ 성명 read-only + 홍길동 표시", () => {
    const heir = makeCorporateWithShareholder({
      heirRef: "heir-spouse-001",
      relation: "heir",
      name: "홍길동",
      residentNumber: "600101-1234567",
    });

    render(
      <CorporateHeirFields
        heir={heir}
        set={vi.fn()}
        allHeirs={[spouseHeir, childHeir]}
      />,
    );

    // ⑧ 성명 input은 read-only (heirRef 연결)
    const nameInputs = screen.getAllByPlaceholderText("주주 성명");
    expect(nameInputs[0].getAttribute("readonly")).toBeDefined();
    // 자동채움된 값 표시
    expect((nameInputs[0] as HTMLInputElement).value).toBe("홍길동");
  });

  it("C-1b: 상속인 연결 시 ⑨ 주민등록번호도 read-only", () => {
    const heir = makeCorporateWithShareholder({
      heirRef: "heir-spouse-001",
      relation: "heir",
      name: "홍길동",
      residentNumber: "600101-1234567",
    });

    render(
      <CorporateHeirFields
        heir={heir}
        set={vi.fn()}
        allHeirs={[spouseHeir, childHeir]}
      />,
    );

    const rrnInputs = screen.getAllByPlaceholderText("000000-0000000");
    expect(rrnInputs[0].getAttribute("readonly")).toBeDefined();
    expect((rrnInputs[0] as HTMLInputElement).value).toBe("600101-1234567");
  });

  it("C-1c: ⑦ select에 그룹1 optgroup + 그룹2 optgroup 모두 렌더", () => {
    const heir = {
      ...corporateHeir,
      shareholders: [
        {
          id: "sh-001",
          relation: "heir_spouse" as const,
          name: "김영희",
          shareRatio: 0.3,
        },
      ],
    };

    render(
      <CorporateHeirFields
        heir={heir}
        set={vi.fn()}
        allHeirs={[spouseHeir, childHeir]}
      />,
    );

    // 그룹1 optgroup
    const optgroup1 = screen.getByRole("group", { name: "입력된 상속인" });
    expect(optgroup1).toBeTruthy();

    // 그룹2 optgroup
    const optgroup2 = screen.getByRole("group", { name: "기타 관계" });
    expect(optgroup2).toBeTruthy();
  });

  it("C-1d: 그룹1 옵션 라벨에 상속인 이름 + 관계 병기", () => {
    const heir = {
      ...corporateHeir,
      shareholders: [
        {
          id: "sh-001",
          relation: "heir_spouse" as const,
          name: "김영희",
          shareRatio: 0.3,
        },
      ],
    };

    render(
      <CorporateHeirFields
        heir={heir}
        set={vi.fn()}
        allHeirs={[spouseHeir, childHeir]}
      />,
    );

    // "홍길동 (배우자)" 옵션 존재
    expect(screen.getByRole("option", { name: /홍길동 \(배우자\)/ })).toBeTruthy();
    // "홍철수 (자녀)" 옵션 존재
    expect(screen.getByRole("option", { name: /홍철수 \(자녀\)/ })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C-6: 자연인 상속인 0명 → 그룹1 optgroup 생략 + hint 표시
// ─────────────────────────────────────────────────────────────────────────────
describe("C-6: 자연인 상속인 0명 → 그룹1 없음 + hint", () => {
  it("C-6a: allHeirs = [] → 그룹1 optgroup 없음", () => {
    const heir = {
      ...corporateHeir,
      shareholders: [
        {
          id: "sh-001",
          relation: "heir_spouse" as const,
          name: "김영희",
          shareRatio: 0.3,
        },
      ],
    };

    render(
      <CorporateHeirFields heir={heir} set={vi.fn()} allHeirs={[]} />,
    );

    // 그룹1 없음
    expect(screen.queryByRole("group", { name: "입력된 상속인" })).toBeNull();
    // 그룹2는 존재
    expect(screen.getByRole("group", { name: "기타 관계" })).toBeTruthy();
  });

  it("C-6b: allHeirs = [] → hint 텍스트 표시", () => {
    const heir = {
      ...corporateHeir,
      shareholders: [
        {
          id: "sh-001",
          relation: "heir_spouse" as const,
          name: "김영희",
          shareRatio: 0.3,
        },
      ],
    };

    render(
      <CorporateHeirFields heir={heir} set={vi.fn()} allHeirs={[]} />,
    );

    expect(
      screen.getByText(/상속인을 먼저 추가하면 자동채움됩니다/),
    ).toBeTruthy();
  });

  it("C-6c: allHeirs에 corporate만 있으면 그룹1 없음 (HEIR_RELATIONS 필터)", () => {
    const corporateOnlyHeirs: Heir[] = [
      { id: "corp-2", relation: "corporate", name: "(주)다른법인", isForProfit: true },
    ];

    const heir = {
      ...corporateHeir,
      shareholders: [
        {
          id: "sh-001",
          relation: "heir_spouse" as const,
          name: "수동입력",
          shareRatio: 0.5,
        },
      ],
    };

    render(
      <CorporateHeirFields
        heir={heir}
        set={vi.fn()}
        allHeirs={corporateOnlyHeirs}
      />,
    );

    // 법인은 HEIR_RELATIONS 밖 → 그룹1 없음
    expect(screen.queryByRole("group", { name: "입력된 상속인" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C-2: 주주 추가 시 첫 상속인 자동 연결
// ─────────────────────────────────────────────────────────────────────────────
describe("C-2: addShareholder — 자연인 상속인 있으면 첫 상속인 자동 연결", () => {
  it("C-2a: 주주 추가 버튼 클릭 → set 호출 시 heirRef=첫 상속인 id", () => {
    const setSpy = vi.fn();
    const heir = { ...corporateHeir, shareholders: [] };

    render(
      <CorporateHeirFields
        heir={heir}
        set={setSpy}
        allHeirs={[spouseHeir, childHeir]}
      />,
    );

    fireEvent.click(screen.getByText("주주 추가"));

    expect(setSpy).toHaveBeenCalledOnce();
    const callArg = setSpy.mock.calls[0][0] as { shareholders: import("@/lib/tax-engine/types/inheritance-gift.types").ShareholderInfo[] };
    expect(callArg.shareholders).toBeDefined();
    expect(callArg.shareholders.length).toBe(1);
    expect(callArg.shareholders[0].heirRef).toBe("heir-spouse-001");
    expect(callArg.shareholders[0].relation).toBe("heir");
    expect(callArg.shareholders[0].name).toBe("홍길동");
  });

  it("C-2b: 자연인 상속인 없을 때 주주 추가 → heir_spouse + heirRef undefined", () => {
    const setSpy = vi.fn();
    const heir = { ...corporateHeir, shareholders: [] };

    render(
      <CorporateHeirFields heir={heir} set={setSpy} allHeirs={[]} />,
    );

    fireEvent.click(screen.getByText("주주 추가"));

    const callArg = setSpy.mock.calls[0][0] as { shareholders: import("@/lib/tax-engine/types/inheritance-gift.types").ShareholderInfo[] };
    expect(callArg.shareholders[0].relation).toBe("heir_spouse");
    expect(callArg.shareholders[0].heirRef).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 그룹2 수동입력 행 ⑧⑨ 편집 가능 확인
// ─────────────────────────────────────────────────────────────────────────────
describe("그룹2 수동입력: ⑧⑨ 편집 가능", () => {
  it("heir_spouse 행: ⑧ input은 readonly 아님", () => {
    const heir = {
      ...corporateHeir,
      shareholders: [
        {
          id: "sh-001",
          relation: "heir_spouse" as const,
          name: "김영희",
          shareRatio: 0.3,
        },
      ],
    };

    render(
      <CorporateHeirFields
        heir={heir}
        set={vi.fn()}
        allHeirs={[spouseHeir]}
      />,
    );

    const nameInput = screen.getByPlaceholderText("주주 성명");
    expect(nameInput.getAttribute("readonly")).toBeNull();
  });
});
