import { ComprehensiveRecaptureCalculator } from "@/components/calc/comprehensive-recapture/ComprehensiveRecaptureCalculator";

export const metadata = {
  title: "합산배제 추징 계산기 — 종합부동산세",
  description:
    "합산배제 임대주택등이 요건을 충족하지 않게 된 경우의 추징세액·이자상당가산액 (종합부동산세법 §17⑤1호 · 시행령 §10)",
};

export default function ComprehensiveRecapturePage() {
  return <ComprehensiveRecaptureCalculator />;
}
