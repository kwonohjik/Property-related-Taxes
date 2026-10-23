import MultiHouseSurchargeCalculator from "./MultiHouseSurchargeCalculator";
import { ProfessionalClientGate } from "@/components/calc/ProfessionalClientGate";

export const metadata = {
  title: "다주택 중과 판정",
  description:
    "다주택 양도소득세 중과 여부와 사유 판정 — 조정대상지역·지역/가액 기준·중과 주택 수·배제 사유·한시 유예를 판정 순서대로 (소득세법 §104⑦, 시행령 §167의3·§167의4·§167의10·§167의11)",
  openGraph: {
    title: "다주택 중과 판정",
    description: "보유 주택을 입력하면 양도 예정 주택의 중과 여부와 사유를 판정합니다",
    type: "website",
  },
};

export default function MultiHouseSurchargePage() {
  return (
    <ProfessionalClientGate>
      <MultiHouseSurchargeCalculator />
    </ProfessionalClientGate>
  );
}
