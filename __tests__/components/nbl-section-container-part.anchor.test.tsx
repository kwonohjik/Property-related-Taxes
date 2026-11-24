/**
 * anchor: NblSectionContainer `part` prop (판정 메뉴 PR-1 · 계획서 `nbl-judgment-menu.ui.plan.md` §4 · U-1)
 *
 * 1) `part` 미지정 = 현행 DOM 바이트 동일 — 기준(`__fixtures__/nbl-section-container-baseline.json`: 케이스별 마크업 길이 + sha256)은
 *    **`part` 도입 전 master 코드에서** 떴다(전문은 케이스당 약 50KB라 해시만 둔다. 재생성은 `NBL_BASELINE_WRITE=1` — 현행 코드가 맞다고 확신할 때만).
 * 2) `part="judge"` ∪ `part="grace"` = 전체 · 교집합 = ∅ — 블록 단위로 단언한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const FIXTURE = path.join(process.cwd(), "__tests__/components/__fixtures__/nbl-section-container-baseline.json");
const TRANSFER = "2024-05-01";

function land(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(0),
    assetId: "asset-fixed-0", // 기본 id는 Date.now() 기반 — 라디오 name에 들어가 마크업이 호출마다 달라진다
    assetKind: "land",
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    acquisitionDate: "2015-03-01",
    addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionArea: "1000",
    ...overrides,
  } as AssetForm;
}

/** 기준 마크업 케이스 — 접힘·6지목·무지목·의제 성립·부득이 행 입력. 이름이 곧 fixture 키다. */
const CASES: Record<string, { asset: AssetForm; transferDate?: string }> = {
  collapsed: { asset: land({ nblUseDetailedJudgment: false }) },
  noLandType: { asset: land() },
  farmland: { asset: land({ nblLandType: "farmland", nblZoneType: "agriculture_forest" }) },
  forest: { asset: land({ nblLandType: "forest", nblZoneType: "management" }) },
  pasture: { asset: land({ nblLandType: "pasture", nblZoneType: "management" }) },
  housing_site: { asset: land({ nblLandType: "housing_site", nblZoneType: "general_residential" }) },
  villa_land: { asset: land({ nblLandType: "villa_land", nblZoneType: "green" }) },
  other_land: { asset: land({ nblLandType: "other_land", nblZoneType: "commercial" }) },
  exemptInheritance: {
    asset: land({
      acquisitionCause: "inheritance",
      acquisitionDate: "2005-03-01",
      decedentAcquisitionDate: "1990-01-01",
      nblLandType: "farmland",
      nblZoneType: "agriculture_forest",
    }),
    transferDate: "2009-06-01",
  },
  noTransferDate: { asset: land({ nblLandType: "farmland", nblZoneType: "agriculture_forest" }), transferDate: undefined },
};

/** `useId`·Base UI id(`_r_N_`)는 렌더 순서의 전역 카운터라 호출마다 달라진다 — 처음 등장한 순서대로 번호를 다시 매긴다. */
function normalizeIds(html: string): string {
  const seen = new Map<string, string>();
  return html.replace(/_r_[0-9a-z]+_/g, (m) => {
    if (!seen.has(m)) seen.set(m, `_r_${seen.size}_`);
    return seen.get(m) as string;
  });
}

function markup(asset: AssetForm, transferDate: string | undefined, part?: "judge" | "grace"): string {
  const props = part ? { part } : {};
  const { container, unmount } = render(
    // `part`는 PR-1에서 추가되는 선택 prop이다 — 도입 전 코드에서도 이 파일이 컴파일되도록 느슨하게 넘긴다.
    <NblSectionContainer asset={asset} onAssetChange={() => {}} transferDate={transferDate} {...(props as object)} />,
  );
  const html = normalizeIds(container.innerHTML);
  unmount();
  return html;
}

const digest = (html: string) => ({ length: html.length, sha256: createHash("sha256").update(html).digest("hex") });

describe("NblSectionContainer — part 미지정 DOM 불변 (기준 마크업)", () => {
  if (process.env.NBL_BASELINE_WRITE === "1") {
    it("기준 마크업 기록", () => {
      const out: Record<string, { length: number; sha256: string }> = {};
      for (const [name, c] of Object.entries(CASES)) {
        const html = markup(c.asset, "transferDate" in c ? c.transferDate : TRANSFER);
        out[name] = digest(html);
        // 같은 입력 두 번 렌더가 같은 문자열인지(useId 비결정 확인)
        expect(markup(c.asset, "transferDate" in c ? c.transferDate : TRANSFER)).toBe(html);
      }
      writeFileSync(FIXTURE, JSON.stringify(out, null, 1) + "\n");
    });
    return;
  }
  const baseline = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, { length: number; sha256: string }>;
  it("fixture 키 = 케이스 키", () => {
    expect(Object.keys(baseline).sort()).toEqual(Object.keys(CASES).sort());
  });
  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: 현행 마크업과 동일`, () => {
      expect(digest(markup(c.asset, "transferDate" in c ? c.transferDate : TRANSFER))).toEqual(baseline[name]);
    });
  }
});

/* ══ part 분할 — judge ∪ grace = 전체, judge ∩ grace = ∅ ═══════════════════════ */

/** 블록 식별 문구 — 컨테이너 소스의 각 블록이 그리는 정본 텍스트. */
const JUDGE_BLOCKS = ["무조건 사업용 토지 판정 (소득령 §168의14③)", "토지 지목", "용도지역"] as const;
const GRACE_BLOCKS = ["도시편입일", "부득이한 사유 유예기간", "양도일 의제 (경매·공매·장기매각)"] as const;
const HEADER_BLOCKS = ["비사업용 토지 정밀 판정", "접기"] as const;

function textOf(asset: AssetForm, part?: "judge" | "grace"): string {
  const props = part ? { part } : {};
  const { container, unmount } = render(
    <NblSectionContainer asset={asset} onAssetChange={() => {}} transferDate={TRANSFER} {...(props as object)} />,
  );
  const text = container.textContent ?? "";
  unmount();
  return text;
}

describe("NblSectionContainer — part 분할", () => {
  const farmland = land({ nblLandType: "farmland", nblZoneType: "agriculture_forest" });

  it("미지정 = 모든 블록 + 머리·접기", () => {
    const t = textOf(farmland);
    for (const b of [...JUDGE_BLOCKS, ...GRACE_BLOCKS, ...HEADER_BLOCKS]) expect(t, b).toContain(b);
  });

  it("judge = 의제·지목·용도지역만 — 편입일·부득이·의제일·머리·접기 없음", () => {
    const t = textOf(farmland, "judge");
    for (const b of JUDGE_BLOCKS) expect(t, b).toContain(b);
    for (const b of [...GRACE_BLOCKS, ...HEADER_BLOCKS]) expect(t, b).not.toContain(b);
  });

  it("grace = 편입일·부득이·의제일만 — 의제·지목·머리·접기 없음", () => {
    const t = textOf(farmland, "grace");
    for (const b of GRACE_BLOCKS) expect(t, b).toContain(b);
    for (const b of [...JUDGE_BLOCKS, ...HEADER_BLOCKS]) expect(t, b).not.toContain(b);
  });

  it("두 부분 모두 지목 게이트(도시편입일·의제일)는 현행 그대로 — 주택부수토지는 편입일·의제일이 숨고 부득이만 보인다", () => {
    const t = textOf(land({ nblLandType: "housing_site", nblZoneType: "general_residential" }), "grace");
    expect(t).toContain("부득이한 사유 유예기간");
    expect(t).not.toContain("도시편입일");
    expect(t).not.toContain("양도일 의제 (경매·공매·장기매각)");
  });

  it("part 지정 시 정밀 판정이 꺼진 자산도 접힘 분기가 아니라 펼쳐 보인다(접기가 판정을 끄지 못한다)", () => {
    const off = land({ nblUseDetailedJudgment: false, nblLandType: "farmland", nblZoneType: "agriculture_forest" });
    expect(textOf(off, "judge")).toContain("토지 지목");
    expect(textOf(off, "judge")).not.toContain("+ 상세 판정 시작");
    expect(textOf(off)).toContain("+ 상세 판정 시작");
  });

  it("래퍼 data-testid=nbl-per-category는 두 부분 각각 정확히 1개 — 의제 성립 시 inert", () => {
    const exempt = CASES.exemptInheritance;
    for (const part of ["judge", "grace"] as const) {
      const { container, unmount } = render(
        <NblSectionContainer asset={exempt.asset} onAssetChange={() => {}} transferDate={exempt.transferDate} part={part} />,
      );
      const wrappers = container.querySelectorAll('[data-testid="nbl-per-category"]');
      expect(wrappers.length, part).toBe(1);
      expect(wrappers[0].hasAttribute("inert"), part).toBe(true);
      unmount();
    }
  });

  it("소스 anchor — inert 래퍼가 컨테이너에 남아 있다(ui-review-batch3 R18과 같은 계약)", () => {
    const s = readFileSync(path.join(process.cwd(), "components/calc/transfer/nbl/NblSectionContainer.tsx"), "utf8");
    expect(s).toContain("inert={exemptionStatus.isExempt");
  });
});
