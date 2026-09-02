/**
 * @vitest-environment jsdom
 *
 * §97의2① 「증여자와의 관계」 라디오 — **세 곳이 같은 필드다**.
 *
 * 진단(2026-09-02): 선택지가 배우자 / 직계존비속 / 그 밖의 관계(3~7자)이고
 * `description`이 **아예 없는데** `layout` 미지정이라 카드 3개가 세로로 쌓였다.
 * 잃을 설명이 없으므로 inline이 순수 이득이다 — 행 3 → 1.
 *
 * 🔴 같은 필드인데 라벨이 갈려 있었다: 종목-수준 두 곳은 「그 밖」,
 *    AcquisitionInfoBlock만 「그 밖의 관계」. 「그 밖의 관계」로 통일한다
 *    (부동산 양도세 `CarryoverGiftBlock.tsx:132` 산문 표현과도 일치).
 *
 * 세 곳:
 *   AcquisitionInfoBlock     단일 종목 축
 *   AcquisitionLotsMatrix    다건 취득 lot 축
 *   SplitLotsBlock           분할 양도 lot 축
 *
 * ⚠️ 값(spouse·lineal·other)은 엔진 계약이므로 **바꾸지 않는다** — 라벨만이다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

afterEach(cleanup);

/** 세 곳이 실제로 넘기는 형태 — 소스에서 직접 읽어 계약을 고정한다 */
import fs from "node:fs";
import path from "node:path";

const FILES = {
  AcquisitionInfoBlock: "components/calc/stock-transfer/AcquisitionInfoBlock.tsx",
  AcquisitionLotsMatrix: "components/calc/stock-transfer/AcquisitionLotsMatrix.tsx",
  SplitLotsBlock: "components/calc/stock-transfer/SplitLotsBlock.tsx",
} as const;

function src(f: keyof typeof FILES) {
  return fs.readFileSync(path.join(process.cwd(), FILES[f]), "utf-8");
}

/** donorRelation 라디오 블록만 잘라낸다 (파일에 다른 RadioCardGroup이 있을 수 있다) */
function donorBlock(f: keyof typeof FILES) {
  const s = src(f);
  const i = s.indexOf("DonorRelation-${idx}") >= 0
    ? s.lastIndexOf("<RadioCardGroup", s.indexOf("DonorRelation-${idx}"))
    : s.lastIndexOf("<RadioCardGroup", s.indexOf('name="donorRelation"'));
  expect(i).toBeGreaterThan(-1);
  const j = s.indexOf("/>", s.indexOf("]}", i));
  return s.slice(i, j);
}

describe("DR — 증여자와의 관계 라디오 (§97의2① 본문)", () => {
  it.each(Object.keys(FILES) as (keyof typeof FILES)[])(
    "DR-1 %s — layout=\"inline\" (세로 3행 쌓기 회귀 차단)",
    (f) => {
      expect(donorBlock(f)).toContain('layout="inline"');
    }
  );

  it.each(Object.keys(FILES) as (keyof typeof FILES)[])(
    "DR-2 %s — 라벨이 「그 밖의 관계」로 통일돼 있다",
    (f) => {
      const b = donorBlock(f);
      expect(b).toContain('label: "그 밖의 관계"');
      expect(b).not.toMatch(/label: "그 밖"/);
    }
  );

  it.each(Object.keys(FILES) as (keyof typeof FILES)[])(
    "DR-3 %s — 값(spouse·lineal·other)은 그대로다 (엔진 계약)",
    (f) => {
      const b = donorBlock(f);
      for (const v of ["spouse", "lineal", "other"]) {
        expect(b).toContain(`value: "${v}"`);
      }
    }
  );

  it("DR-4 inline은 description을 렌더하지 않는다 — 여기는 잃을 설명이 없음을 확인", () => {
    render(
      <RadioCardGroup
        name="donorRelation"
        value="spouse"
        onChange={() => {}}
        layout="inline"
        options={[
          { value: "spouse", label: "배우자" },
          { value: "lineal", label: "직계존비속" },
          { value: "other", label: "그 밖의 관계" },
        ]}
      />
    );
    const g = document.querySelector('[data-slot="radio-card-group"]')!;
    expect(g.getAttribute("data-layout")).toBe("inline");
    expect(g.querySelectorAll('input[name="donorRelation"]')).toHaveLength(3);
  });
});
