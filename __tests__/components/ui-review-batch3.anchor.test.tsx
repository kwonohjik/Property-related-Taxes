/**
 * @vitest-environment jsdom
 *
 * anchor — UI 리뷰 대장 **밖** 미판정 23건 중 배치③(표시·규약 12건 + 대장 밖 B1).
 * 대장: `docs/reviews/transfer-ui-review-2026-09-unjudged.md`
 *
 * 두 축을 섞는다:
 *  · **리터럴 감사** — 「원」 접미사·괄호 균형 anchor(`transfer-result-display-convention`)와
 *    같은 방식. 값 anchor로는 잡히지 않는 표기 결함을 소스 문자열로 고정한다.
 *  · **렌더 단언** — 상태·접근성처럼 문자열만으로는 증명되지 않는 것.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { PreHousingDisclosureSection } from "@/components/calc/transfer/PreHousingDisclosureSection";
import { hasRentalBasicRegistration } from "@/lib/tax-engine/multi-house-surcharge-count";
import { ownershipRatioError } from "@/lib/calc/transfer-tax-api-asset-basics";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const ROOT = process.cwd();
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** 주석 줄을 걷어낸다 — 이력 주석이 종전 문자열을 **인용**하고 있고 그것은 지워선 안 된다. */
function codeOnly(rel: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of src(rel).split("\n")) {
    const t = raw.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    // JSX 주석 `{/* … */}`도 주석이다 — 이력 주석이 종전 문자열을 인용하므로 함께 걷는다.
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    out.push(raw);
  }
  return out.join("\n");
}

/* ══ R09 · R17 · B1 — 개발 용어가 화면·법령근거 자리에 없다 ═══════════════════ */
describe("R09·R17·B1 · 저장소 내부 용어가 사용자 화면에 없다", () => {
  const FILES = [
    "components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts",
    "components/calc/transfer/SettlementExemptionGuideCard.tsx",
    "components/calc/transfer/RedevelopmentBlockCards.tsx",
  ];

  it.each(FILES)("🔴 %s — 「본 PR」·「후속 PR」이 코드 문자열에 없다", (f) => {
    expect(codeOnly(f)).not.toMatch(/본 PR|후속 PR/);
  });

  it("🔴 트래킹 ID(C-F1)가 화면 문자열에 없다", () => {
    expect(codeOnly("components/calc/transfer/SettlementExemptionGuideCard.tsx")).not.toMatch(
      /C-F1/,
    );
  });

  it("🔑 legal 슬롯이 «근거»로 채워졌다 — 빈 말로 지우지 않았다", () => {
    const s = src("components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts");
    expect(s).toContain("사전-2019-법령해석재산-0649");
  });

  it("🔑 사용자가 할 일이 남았다 — 「별도 산정」 안내", () => {
    expect(src("components/calc/transfer/SettlementExemptionGuideCard.tsx")).toContain(
      "별도 산정",
    );
    expect(src("components/calc/transfer/RedevelopmentBlockCards.tsx")).toContain("별도 산정");
  });
});

/* ══ R02 — 조문 인용에 법령명이 붙는다 ═══════════════════════════════════════ */
describe("R02 · §114조의2 인용에 법령명이 있다", () => {
  it("🔴 화면 문자열의 §114조의2 앞에 「소득세법」이 있다", () => {
    const code = codeOnly("components/calc/transfer/SelfBuiltSection.tsx");
    const hits = [...code.matchAll(/§114조의2/g)];
    expect(hits.length).toBeGreaterThan(0);
    for (const m of hits) {
      const before = code.slice(Math.max(0, m.index! - 30), m.index!);
      expect(before).toContain("소득세법");
    }
  });
});

/* ══ R05 — trailing과 unit을 같이 넘기지 않는다 (죽은 prop) ══════════════════ */
describe("R05 · FieldCard unit이 trailing에 먹히지 않는다", () => {
  it("🔴 PreDeemedInputs에서 unit·trailing 동시 선언이 사라졌다", () => {
    const code = codeOnly("components/calc/transfer/inheritance/PreDeemedInputs.tsx");
    // FieldCard 하나의 여는 태그 안에 둘 다 있으면 unit은 렌더되지 않는다(FieldCard.tsx:79-82).
    const cards = code.split("<FieldCard").slice(1);
    for (const c of cards) {
      const head = c.split(">")[0] + c.split(">").slice(1).join(">").split("<")[0];
      const openTag = c.slice(0, c.indexOf("\n      >") >= 0 ? c.indexOf("\n      >") : head.length);
      if (openTag.includes("trailing=")) expect(openTag).not.toContain('unit="원"');
    }
  });

  it("🔑 trailing이 없는 칸의 unit은 그대로 살아 있다 (전량 삭제가 아니다)", () => {
    expect(src("components/calc/transfer/inheritance/PreDeemedInputs.tsx")).toContain('unit="원"');
  });
});

/* ══ R08 — 금액 셀 4클래스 ═══════════════════════════════════════════════════ */
describe("R08 · 신고서 양식 금액 셀이 규약 4클래스를 갖춘다", () => {
  it("🔴 tabular-nums가 있다 (components/calc/CLAUDE.md:176)", () => {
    const s = src("components/calc/results/transfer/FilingFormTable.tsx");
    const cell = s.split("px-3 py-1.5 text-right")[1] ?? "";
    for (const cls of ["font-mono", "tabular-nums", "whitespace-nowrap"]) {
      expect(cell.slice(0, 120)).toContain(cls);
    }
  });
});

/* ══ R19 — 다크모드 하드코딩 흰색 ════════════════════════════════════════════ */
describe("R19 · 거주 구간 카드가 테마 토큰을 쓴다", () => {
  it("🔴 ResidencePeriodSection에 bg-white 하드코딩이 없다", () => {
    expect(codeOnly("components/calc/transfer/ResidencePeriodSection.tsx")).not.toContain(
      "bg-white",
    );
  });
});

/* ══ R15 — 경고가 화면에 있는 말을 쓴다 ══════════════════════════════════════ */
describe("R15 · 지분율 경고가 라벨 축과 충돌하지 않는다", () => {
  it("🔴 「공유」로 고정하지 않는다 — 같은 위젯이 「취득 지분율」로도 뜬다", () => {
    const msg = ownershipRatioError("150", "100")!;
    expect(msg).toContain("지분율");
    expect(msg).not.toContain("공유 지분율");
  });

  it("🔑 「분자·분모」 금지 축은 그대로다 (원래 anchor 보존)", () => {
    expect(ownershipRatioError("150", "100")!).not.toMatch(/분자|분모/);
  });
});

/* ══ R03 — 임베드 시 하단이 다건 흐름을 벗어나지 않는다 ═══════════════════════ */
describe("R03 · 다건 임베드 step 0은 자산 목록으로 돌아간다", () => {
  it("🔴 임베드 분기가 배선됐다 (onBackToList)", () => {
    const s = src("app/calc/transfer-tax/TransferTaxCalculator.tsx");
    expect(s).toContain("onBackToList");
    expect(s).toContain("자산 목록으로");
  });

  it("🔴 다건 호출부가 콜백을 넘긴다 — 넘기지 않으면 분기가 죽는다", () => {
    expect(src("app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx")).toContain(
      'onBackToList={() => setStep("list")}',
    );
  });
});

/* ══ R07 — 초과 입력을 «말없이» 버리지 않는다 ════════════════════════════════ */
describe("R07 · 상가 정착면적 초과 입력", () => {
  it("🔴 음수 역산을 store에 쓰지 않는다", () => {
    expect(src("components/calc/transfer/mixed-use/MixedUseAreaInputs.tsx")).toContain(
      "if (residual < 0) return;",
    );
  });

  it("🔴 초과 사실을 경고로 밝힌다 (침묵 금지)", () => {
    const s = src("components/calc/transfer/mixed-use/MixedUseAreaInputs.tsx");
    expect(s).toContain("commercialFootprintExceeds");
    expect(s).toContain("초과분은 반영되지 않습니다");
  });
});

/* ══ R12 — 주택유형이 폼에 남는다 ════════════════════════════════════════════ */
describe("R12 · PHD 주택유형이 로컬 state가 아니다", () => {
  const asset = (over: Partial<AssetForm> = {}): AssetForm => ({
    ...makeDefaultAsset(1),
    usePreHousingDisclosure: true,
    ...over,
  });

  it("🔴 폼 값이 «공동주택»이면 그 라벨로 렌더된다", () => {
    render(
      <PreHousingDisclosureSection
        asset={asset({ phdHousingType: "apartment" })}
        transferDate="2024-06-30"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/최초 고시 공동주택가격/)).toBeDefined();
  });

  it("🔴 대조군 — 기본값(단독·다가구)은 종전 라벨 그대로", () => {
    render(
      <PreHousingDisclosureSection
        asset={asset()}
        transferDate="2024-06-30"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/최초 고시 개별주택가격/)).toBeDefined();
  });

  it("🔑 선택이 store로 나간다 — 로컬에 갇히지 않는다", () => {
    const onChange = vi.fn();
    render(
      <PreHousingDisclosureSection asset={asset()} transferDate="2024-06-30" onChange={onChange} />,
    );
    screen.getByText("공동주택 (아파트)").click();
    expect(onChange).toHaveBeenCalledWith({ phdHousingType: "apartment" });
  });
});

/* ══ R18 · R20 — 임대·NBL 화면의 침묵 제거 ═══════════════════════════════════ */
describe("R18 · 의제 성립 시 비활성이 키보드에도 걸린다", () => {
  it("🔴 inert가 붙는다 — pointer-events-none만으로는 Tab을 막지 못한다", () => {
    const s = src("components/calc/transfer/nbl/NblSectionContainer.tsx");
    expect(s).toContain("inert={exemptionStatus.isExempt");
  });
});

describe("R20 · 등록 미완이면 9유형이 무효라는 사실을 밝힌다", () => {
  const house = (over: Partial<HouseEntry> = {}): HouseEntry =>
    ({
      id: "h1",
      isLongTermRental: true,
      isRegisteredRental: false,
      rentalRegistrationDate: "",
      businessRegistrationDate: "",
      ...over,
    }) as HouseEntry;

  it("🔴 등록 OFF면 경고가 뜬다", () => {
    render(<HouseEntryEditor house={house()} onUpdate={vi.fn()} />);
    expect(screen.getByTestId("rental-registration-incomplete-warning")).toBeDefined();
  });

  it("🔴 등록 ON이어도 «날짜가 비면» 여전히 경고다 — 엔진 술어와 같은 기준", () => {
    render(
      <HouseEntryEditor
        house={house({ isRegisteredRental: true })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByTestId("rental-registration-incomplete-warning")).toBeDefined();
  });

  it("🔴 대조군 — 3요소가 다 차면 경고가 사라진다", () => {
    render(
      <HouseEntryEditor
        house={house({
          isRegisteredRental: true,
          rentalRegistrationDate: "2019-03-01",
          businessRegistrationDate: "2019-03-01",
        })}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("rental-registration-incomplete-warning")).toBeNull();
  });

  it("엔진과 같은 술어를 쓴다 (dual-truth 방지)", () => {
    expect(hasRentalBasicRegistration(true, "2019-03-01", "2019-03-01")).toBe(true);
    expect(hasRentalBasicRegistration(true, "", "2019-03-01")).toBe(false);
    expect(hasRentalBasicRegistration(false, "2019-03-01", "2019-03-01")).toBe(false);
  });
});
