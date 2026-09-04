// @vitest-environment jsdom
/**
 * anchor — 공유 지분율 범위 오류: 화면에 있는 말로, 입력 즉시, 한 술어로
 *
 * 🔴 종전 문구는 「지분율 분자는 분모를 초과할 수 없습니다」였다 — **분자/분모 2칸이던
 *    옛 UI 용어**다. 위젯이 단일 백분율 칸(`공유 지분율 [ ] %`)으로 바뀐 뒤 분모(=100)는
 *    화면 어디에도 없어, 150을 친 사용자는 무엇을 고쳐야 할지 알 수 없었다.
 *
 * 🔴 그리고 차단은 「다음」을 눌러야 떴다 — 150을 친 순간에는 아무 신호가 없었다.
 *
 * ⇒ `ownershipRatioError`를 단일 술어로 두고 ⑤ 인라인 경고와 ⑧ 계산 전 차단이 **같은 문구**를
 *   쓴다. 술어가 갈리면 「칸에는 경고가 없는데 다음을 누르면 막히는」 모순이 생긴다.
 *
 * 참고: 범위 검증 자체는 종전에도 있었다(`transfer-tax-validate-asset.ts`). 150%가 계산까지
 *      새어 나간 적은 없다 — 고친 것은 **문구와 시점**이지 차단의 유무가 아니다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

import fs from "fs";
import path from "path";

import {
  ownershipRatioError,
  formatOwnershipPercent,
} from "@/lib/calc/transfer-tax-api-asset-basics";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  OwnershipRatioInput,
  OwnershipRatioBlock,
} from "@/components/calc/transfer/OwnershipRatioInput";

const OVER_100 = "공유 지분율은 100%를 초과할 수 없습니다 (입력값 150%).";

function formWith(num: string, den: string): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-02-18";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    acquisitionArea: "500",
    transferArea: "500",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "1,000,000,000",
    ownershipNumerator: num,
    ownershipDenominator: den,
  } as AssetForm;
  return f;
}

describe("[OWN-PCT] 공유 지분율 오류 문구 — 단일 술어", () => {
  it.each([
    ["100", "100", null],
    ["50", "100", null],
    ["1", "2", null], // 레거시 분모(2칸 시절 저장분)도 정상
    ["", "", null], // 빈값은 미입력 게이트가 담당 — 타이핑 중 깜빡임 금지
    ["150", "100", OVER_100],
    ["101", "100", "공유 지분율은 100%를 초과할 수 없습니다 (입력값 101%)."],
    ["3", "2", "공유 지분율은 100%를 초과할 수 없습니다 (입력값 150%)."],
    ["0", "100", "공유 지분율은 0보다 커야 합니다."],
    ["-10", "100", "공유 지분율은 0보다 커야 합니다."],
    ["abc", "100", "공유 지분율은 숫자로 입력하세요."],
    ["50", "0", "공유 지분율을 다시 입력하세요 (저장된 지분 값이 올바르지 않습니다)."],
  ])("%s/%s → %s", (n, d, expected) => {
    expect(ownershipRatioError(n, d)).toBe(expected);
  });

  it("문구에 「분자」·「분모」가 없다 — 화면에 없는 말을 쓰지 않는다", () => {
    for (const [n, d] of [
      ["150", "100"],
      ["0", "100"],
      ["abc", "100"],
      ["50", "0"],
    ]) {
      const msg = ownershipRatioError(n, d)!;
      expect(msg).not.toMatch(/분자|분모/);
    }
  });
});

describe("[OWN-PCT] ⑤ 인라인 경고 ↔ ⑧ 계산 전 차단이 같은 문구다", () => {
  it("⑧ 차단 메시지는 자산 라벨 + 같은 술어의 문구다", () => {
    const form = formWith("150", "100");
    const msg = validateAssetEntry(form.assets[0], 0, form);
    expect(msg).toContain(OVER_100);
    expect(msg).not.toMatch(/분자|분모/);
  });

  it("⑤ 위젯은 150을 친 순간 같은 문구를 띄운다", () => {
    render(
      <OwnershipRatioInput numerator="150" denominator="100" onChange={vi.fn()} />,
    );
    expect(screen.getByText(OVER_100)).toBeTruthy();
  });

  it("⑤ 정상값(100)에는 경고가 없다", () => {
    render(
      <OwnershipRatioInput numerator="100" denominator="100" onChange={vi.fn()} />,
    );
    expect(screen.queryByText(/공유 지분율은/)).toBeNull();
  });

  it("⑤ 빈값(타이핑 시작 전)에는 경고가 없다", () => {
    render(<OwnershipRatioInput numerator="" denominator="" onChange={vi.fn()} />);
    expect(screen.queryByText(/공유 지분율은/)).toBeNull();
  });
});

describe("[OWN-PCT] 지분 표시는 화면 위젯과 같은 백분율 표기다", () => {
  it.each([
    ["50", "100", "50%"],
    ["100", "100", "100%"],
    ["1", "2", "50%"], // 레거시 분모 — 화면에는 50%로 보인다
    ["1", "3", "33.3333%"], // 위젯 pctValue와 같은 4자리 반올림
  ])("%s/%s → %s", (n, d, expected) => {
    expect(formatOwnershipPercent(n, d)).toBe(expected);
  });

  it("⑧ Gate-A 차단 문구가 50%로 뜬다 (종전 「50/100」)", () => {
    const form = formWith("50", "100");
    const msg = validateAssetEntry(form.assets[0], 0, form)!;
    expect(msg).toContain("지분 모드 자산(50%)");
    expect(msg).not.toContain("50/100");
  });

  it("⑤ 「100% 기준 입력」 안내 배너도 50%로 뜬다", () => {
    render(
      <OwnershipRatioBlock numerator="50" denominator="100" onChange={vi.fn()} />,
    );
    expect(screen.getByText(/시스템이 지분율\(50%\)을/)).toBeTruthy();
  });

  /**
   * 재유입 차단 — 안내문·오류문에 분자/분모를 그대로 박는 표기가 되살아나면
   * 사용자는 화면에 없는 값과 대조하게 된다. 표시는 `formatOwnershipPercent` 한 곳으로.
   */
  it("전송·표시 경로에 `분자}/{분모` 템플릿이 남아 있지 않다", () => {
    const roots = ["components/calc/transfer", "lib/calc"];
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) {
          const s = fs.readFileSync(p, "utf-8");
          if (
            /\{numerator\}\s*\/\s*\{denominator\}/.test(s) ||
            /ownershipNumerator\}\s*\/\s*\$\{[^}]*ownershipDenominator\}/.test(s)
          )
            bad.push(p);
        }
      }
    };
    for (const r of roots) walk(path.join(process.cwd(), r));
    expect(bad).toEqual([]);
  });
});
