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
 * 두 곳:
 *   AcquisitionInfoBlock     단일 종목 축
 *   AcquisitionLotCard       매수 lot 축 — `SplitLotsBlock`(분할 양도)·`AcquisitionLotsMatrix`(다건 취득)
 *                            **둘의 단일 소스**다.
 *
 * 종전에는 lot 축이 두 파일에 복제돼 있어 여기서 파일 3개를 훑었다. 2026-09-04에
 * `AcquisitionLotCard`로 추출하면서 그 두 축이 한 파일로 합쳐졌다 — 라벨이 갈릴 여지가
 * **구조적으로 사라졌으므로** 소스 스캔 대상도 2곳이 된다.
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
  AcquisitionLotCard: "components/calc/stock-transfer/AcquisitionLotCard.tsx",
} as const;

/**
 * 복제 재발 가드 — lot 카드를 다시 복사해 넣으면 여기서 걸린다.
 * (종전 결함: 두 파일이 같은 JSX를 들고 있다가 「1주당 단가」 조문 인용이 한쪽에만 붙었다.)
 */
const LOT_CONSUMERS = [
  "components/calc/stock-transfer/SplitLotsBlock.tsx",
  "components/calc/stock-transfer/AcquisitionLotsMatrix.tsx",
] as const;

function src(f: keyof typeof FILES) {
  return fs.readFileSync(path.join(process.cwd(), FILES[f]), "utf-8");
}

/**
 * donorRelation 라디오 블록만 잘라낸다 (파일에 다른 RadioCardGroup이 있을 수 있다).
 *
 * ⚠️ `name` 문자열로 찾지 않는다 — 공용 `AcquisitionLotCard`는 name이 prop(`radioNamePrefix`)이라
 *    리터럴이 없다. **선택지 내용(「직계존비속」)** 으로 식별한다.
 */
function donorBlock(f: keyof typeof FILES) {
  const s = src(f);
  const marker = s.indexOf('label: "직계존비속"');
  expect(marker).toBeGreaterThan(-1);
  const i = s.lastIndexOf("<RadioCardGroup", marker);
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

  it.each(LOT_CONSUMERS)(
    "DR-5 %s — lot 카드를 직접 그리지 않고 AcquisitionLotCard를 쓴다 (복제 재발 차단)",
    (rel) => {
      const s = fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
      expect(s).toContain("<AcquisitionLotCard");
      // 자체 donorRelation 라디오를 다시 들이면 복제가 재발한 것이다
      expect(s).not.toMatch(/DonorRelation-\$\{idx\}/);
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
