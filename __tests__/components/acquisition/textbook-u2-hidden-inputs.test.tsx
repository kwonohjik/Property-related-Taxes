/** 취득세 교재 대조 U2 — 숨은 입력 칸: 증여 시가인정액(Step1)·전체 주택 시가표준액 카드(Step3, 종전엔 토글이 열리지 않음) */
import { it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Step1 } from "@/components/calc/acquisition/Step1";
import { Step3 } from "@/components/calc/acquisition/Step3";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";
function S3({ f }: { f: FormState }) {
  const [form, setForm] = useState(f);
  return <Step3 form={form} set={(k, v) => setForm((p) => ({ ...p, [k]: v }))} isHousing isIndividual isCorporation={false} isGiftLike={["gift","burdened_gift","donation"].includes(f.acquisitionCause)} />;
}
it("U2 — 증여 시가인정액 칸 노출 · 전체 주택 시가표준액 카드 열림(1억 배제·증여 3억)", () => {
  const gift: FormState = { ...INITIAL_FORM, propertyType: "housing", acquisitionCause: "gift" };
  const t1 = render(<Step1 form={gift} set={() => {}} isHousing />).container.textContent ?? "";
  expect(t1).toContain("시가인정액 (매매사례가액");
  expect(t1).not.toContain("특수관계인 간 거래");
  const buy: FormState = { ...gift, acquisitionCause: "purchase" };
  const t1b = render(<Step1 form={buy} set={() => {}} isHousing />).container.textContent ?? "";
  expect(t1b).toContain("특수관계인 간 거래");
  // Step3 gift single house: card visible and openable
  const r = render(<S3 f={gift} />);
  expect(r.container.textContent).toContain("지분·부속토지 증여 — 전체 주택 시가표준액");
  const sw = r.getAllByRole("switch").find((el) => (el.closest("[data-testid],div")?.textContent ?? "").includes("지분·부속토지 증여")) ?? r.getAllByRole("switch")[0];
  fireEvent.click(sw);
  expect(r.container.textContent).toContain("전체 주택 시가표준액");
  expect(r.container.querySelectorAll("input").length).toBeGreaterThan(0);
  // multi-house purchase: 1억 card openable
  const m = render(<S3 f={{ ...buy, houseCountAfter: "3" }} />);
  const before = m.container.querySelectorAll("input").length;
  const sw2 = m.getAllByRole("switch").find((el) => (el.parentElement?.parentElement?.textContent ?? "").includes("1억/2억 이하 중과 배제"));
  fireEvent.click(sw2!);
  expect(m.container.querySelectorAll("input").length).toBeGreaterThan(before);
  expect(m.container.textContent).toContain("정비구역 소재");
});
