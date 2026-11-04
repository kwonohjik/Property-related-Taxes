/**
 * @vitest-environment jsdom
 *
 * anchor — 공실 유예 기간이 조문마다 다르다는 사실을 ⑤ 입력 화면과 ⑧ 검증 메시지 양쪽에서 고정한다 (D1-03).
 *
 * - §97의5만 6개월(조특령 §97의5①1호)
 * - §97 본문·단서·§97의2·§97의3·§97의4는 3월(조특령 §97⑤5호 → 조특칙 §44)
 *
 * 엔진 쪽 임계는 `__tests__/tax-engine/transfer/rental-97-vacancy-grace-by-article.anchor.test.ts`가 지킨다.
 * 이 파일은 그 앞단 두 곳 — 폼이 `RentalCommonFields`에 넘기는 `vacancyGraceMonths`와
 * `transfer-tax-validate-rental-97.ts`의 미선택 메시지 — 를 지킨다. 2026-11-04 분리(#2877) 때
 * ⑧ 메시지의 3개월/6개월을 맞바꿔도 vitest가 0건 실패였다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { Rental972InputForm } from "@/components/calc/transfer/rental/Rental972InputForm";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

afterEach(cleanup);

const noop = () => {};
const CASES: { type: string; grace: "3개월" | "6개월"; form: (v: Any) => ReactElement }[] = [
  { type: "rental_97_main", grace: "3개월", form: (v) => <Rental97MainInputForm value={v} onChange={noop} /> },
  { type: "rental_97_proviso", grace: "3개월", form: (v) => <Rental97MainInputForm value={v} onChange={noop} /> },
  { type: "rental_97_2", grace: "3개월", form: (v) => <Rental972InputForm value={v} onChange={noop} /> },
  { type: "rental_97_3", grace: "3개월", form: (v) => <Rental973InputForm value={v} onChange={noop} /> },
  { type: "rental_97_4", grace: "3개월", form: (v) => <Rental974InputForm value={v} onChange={noop} /> },
  { type: "rental_97_5", grace: "6개월", form: (v) => <Rental975InputForm value={v} onChange={noop} /> },
];
const other = (g: string) => (g === "3개월" ? "6개월" : "3개월");

describe("⑤ 입력 화면 — 공실 질문의 유예 기간", () => {
  for (const c of CASES) {
    it(`${c.type}: 「${c.grace}을 초과하는 공실 구간」`, () => {
      const { container } = render(c.form(getReductionDefault(c.type as Any)));
      const text = container.textContent ?? "";
      expect(text).toContain(`${c.grace}을 초과하는 공실 구간`);
      expect(text).not.toContain(`${other(c.grace)}을 초과하는 공실 구간`);
    });
  }
});

describe("⑧ 검증 — 공실 여부 미선택 메시지의 유예 기간이 ⑤와 같다", () => {
  for (const c of CASES) {
    it(`${c.type}: 미선택 → 「${c.grace}을 초과하는 공실 여부」`, () => {
      // 공실 검사 앞의 필수 칸만 채운다 — 그래야 첫 오류가 공실 미선택이다.
      const r = {
        ...getReductionDefault(c.type as Any),
        rentalStartDate: "2010-01-04",
        registrationDate: "2010-01-04",
        isPurchaseRental: true,
        isTaxRegistered: false,
        rentIncreaseViolationMode: "none",
        hasVacancyOverGrace: null,
      } as AssetReductionForm;
      const asset = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2009-06-01", reductions: [r] };
      const { result: issue, fieldOf } = collectWithFields(() =>
        validateStep2Reductions(2, { assets: [asset], transferDate: "2024-06-03" } as unknown as TransferFormData),
      );
      const message = issue?.message ?? "";
      expect(fieldOf(message)).toBe(`reduction.${c.type}.hasVacancyOverGrace`);
      expect(message).toContain(`${c.grace}을 초과하는 공실 여부`);
      expect(message).not.toContain(other(c.grace));
    });
  }
});
