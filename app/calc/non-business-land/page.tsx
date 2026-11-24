import NblJudgmentCalculator from "./NblJudgmentCalculator";
import { ProfessionalClientGate } from "@/components/calc/ProfessionalClientGate";

export const metadata = {
  title: "비사업용 토지 판정",
  description:
    "토지의 사업용·비사업용 여부 판정 — 지목·용도지역·소유기간·사용기간·부득이한 사유·무조건 사업용 의제를 입력하면 판정과 그 근거를 보여 줍니다 (소득세법 §104의3, 시행령 §168의6~§168의14)",
  openGraph: {
    title: "비사업용 토지 판정",
    description: "토지 1필지의 사업용·비사업용 여부를 판정합니다",
    type: "website",
  },
};

export default function NonBusinessLandPage() {
  return (
    <ProfessionalClientGate>
      <NblJudgmentCalculator />
    </ProfessionalClientGate>
  );
}
