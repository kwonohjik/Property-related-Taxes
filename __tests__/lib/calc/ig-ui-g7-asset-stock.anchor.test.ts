/**
 * 상속·증여 UI 리뷰 — G7 배치(재산카드·주식평가) 순수 anchor.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { INHERITANCE_CATEGORIES } from "@/lib/calc/deemed-category-policy";
import { GIFT_CATEGORIES } from "@/components/calc/inheritance/estate-card/estate-category-meta";
import { convertibleBondItemSchema } from "@/lib/validators/estate-item-schema";
import {
  evaluationCommitteeApplicationDeadline,
  evaluationCommitteeNotificationDeadline,
  inheritanceFilingDeadline,
} from "@/lib/calc/evaluation-committee-deadline";

const read = (p: string) => readFileSync(p, "utf-8");

describe("IG-040 — 카테고리 목록·라벨을 단일 출처에서 읽는다", () => {
  it("A-1 (양성): 두 단일 출처가 crypto_asset을 포함한다", () => {
    expect(INHERITANCE_CATEGORIES).toContain("crypto_asset");
    expect(GIFT_CATEGORIES).toContain("crypto_asset");
  });

  it("A-2: 다이얼로그가 사본을 갖지 않는다 — 라벨 override 1개만 로컬", () => {
    const src = read("components/calc/inheritance/estate-card/CategoryChangeDialog.tsx");
    expect(src).not.toMatch(/const INHERITANCE_CATEGORIES/);
    expect(src).not.toMatch(/const GIFT_CATEGORIES/);
    expect(src).not.toMatch(/const CATEGORY_LABELS/);
    expect(src).toMatch(/DIALOG_LABEL_OVERRIDES/);
    expect(src).toMatch(/전세보증금 반환채권 \(상속세 전용\)/); // 이 화면에서만 다른 문구
  });
});

describe("IG-044 — 상장 신주인수권증서도 ⑫Zod가 검증한다", () => {
  const base = {
    id: "cb-1",
    category: "convertible_bond",
    name: "신주인수권증서",
    cbSecurityType: "preemptive_right",
    cbTradedOnExchange: true,
  };

  it("A-3 (양성): 종가평균 미입력이면 차단한다 (종전엔 통과 → 평가액 0원)", () => {
    const r = convertibleBondItemSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.success ? [] : r.error.issues)).toMatch(
      /전체 거래일 종가평균을 입력하세요/,
    );
  });

  it("A-4 (음성·대조군): 입력하면 통과한다", () => {
    expect(convertibleBondItemSchema.safeParse({ ...base, cbExchange2mAvg: 12_000 }).success).toBe(true);
  });
});

describe("IG-058 — 평가심의위 신청·통지 기한 (상증령 §49의2⑤·⑥)", () => {
  const base = new Date(2024, 0, 15); // 2024-01-15

  it("A-5 (양성): 상속 신청기한 = 신고기한 − 4개월 · 통지 = −1개월", () => {
    const filing = inheritanceFilingDeadline(base);
    expect([filing.getMonth(), filing.getDate()]).toEqual([6, 31]); // 2024-07-31
    const apply = evaluationCommitteeApplicationDeadline(base, "inheritance");
    expect([apply.getMonth(), apply.getDate()]).toEqual([2, 31]);   // 2024-03-31
    const notify = evaluationCommitteeNotificationDeadline(base, "inheritance");
    expect([notify.getMonth(), notify.getDate()]).toEqual([5, 30]); // 2024-06-30
  });

  it("A-6 (양성): 증여 신청기한 = 신고기한 − 70일 · 통지 = −20일", () => {
    const apply = evaluationCommitteeApplicationDeadline(base, "gift");
    expect([apply.getMonth(), apply.getDate()]).toEqual([1, 20]);   // 2024-02-20
    const notify = evaluationCommitteeNotificationDeadline(base, "gift");
    expect([notify.getMonth(), notify.getDate()]).toEqual([3, 10]); // 2024-04-10
  });

  it("A-7 (음성): 신청기한은 신고기한과 «다르다» — 종전 결함 재발 차단", () => {
    for (const kind of ["inheritance", "gift"] as const) {
      const apply = evaluationCommitteeApplicationDeadline(base, kind);
      const filing =
        kind === "inheritance" ? inheritanceFilingDeadline(base) : new Date(2024, 3, 30);
      expect(apply.getTime()).toBeLessThan(filing.getTime());
    }
  });
});

describe("IG-043 · IG-121 · IG-056 · IG-135 — 게이트·배선 (소스 구조)", () => {
  it("A-8: §23의2 토글은 «주택»(apartment)에만 열린다 — 임대보증금 축 재사용 금지", () => {
    const src = read("components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx");
    expect(src).toMatch(/showCohabitToggle=\{cat === "real_estate_apartment" && mode === "inheritance"\}/);
    expect(src).not.toMatch(/showCohabitToggle=\{showLeaseDeposit/);
  });

  it("A-9: RTMS 자동조회 버튼이 평가기준일 미입력을 disabled로 본다", () => {
    const src = read("components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx");
    expect(src).toMatch(/!hasStandardPrice \|\| !valuationDate;/);
    expect(src).toMatch(/상속개시일을 먼저 입력해주세요/);
  });

  it("A-10: §63②3호 토글이 unlistedShareMode를 같은 patch에서 쓴다", () => {
    const src = read("components/calc/inheritance/stock/StockItemEditor.tsx");
    expect(src).toMatch(/unlistedShareMode: v \? "capital_increase" : "none",/);
  });

  it("A-11: 죽은 prop `onIntangibleDeductionChange`가 계약에서 사라졌다", () => {
    const src = read("components/calc/inheritance/unlisted-stock-v2/GoodwillCalculationTable.tsx");
    expect(src).not.toMatch(/onIntangibleDeductionChange\?: \(value: number\) => void;/);
  });
});

describe("IG-046 — 평가기간 외 목록이 후보 리스트 게이트 «밖»에 있다", () => {
  it("A-12: 안내 문구와 실제 렌더 위치가 일치한다", () => {
    const src = read("components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx");
    expect(src).not.toMatch(/건이 있습니다 \(위 목록에 표시\)/); // 종전 «렌더되던» 문구
    expect(src).toMatch(/아래 목록에서 펼쳐 볼 수 있습니다/);
    // 후보 리스트 블록이 닫힌 «뒤»에 기간 외 블록이 온다
    const listIdx = src.indexOf('{status === "ready" && candidates.length > 0 && (');
    const oopIdx = src.indexOf('data-testid="rtms-out-of-period-toggle"');
    expect(listIdx).toBeGreaterThan(-1);
    expect(oopIdx).toBeGreaterThan(listIdx);
    expect(src).toMatch(/\{outOfPeriod\.length > 0 && \(\n\s+<div className="mt-2">/);
  });
});
