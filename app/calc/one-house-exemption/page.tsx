import OneHouseJudgmentCalculator from "./OneHouseJudgmentCalculator";
import { ProfessionalClientGate } from "@/components/calc/ProfessionalClientGate";

export const metadata = {
  title: "1세대1주택 비과세 판정",
  description:
    "1세대1주택 양도소득세 비과세 여부 판정 — 보유 주택 수·보유·거주 요건, 일시적 2주택·상속·합가·농어촌·장기저당담보·상생임대 특례와 조건부 기한까지 (소득세법 §89①3호, 시행령 §154·§155)",
  openGraph: {
    title: "1세대1주택 비과세 판정",
    description: "보유 주택을 입력하면 비과세 여부와 조건부 기한을 판정합니다",
    type: "website",
  },
};

export default function OneHouseExemptionPage() {
  return (
    <ProfessionalClientGate>
      <OneHouseJudgmentCalculator />
    </ProfessionalClientGate>
  );
}
