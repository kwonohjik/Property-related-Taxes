import OneHouseJudgmentCalculator from "./OneHouseJudgmentCalculator";
import { ProfessionalClientGate } from "@/components/calc/ProfessionalClientGate";
import { checkOneHouseAiAdmin } from "@/lib/one-house-ai/admin-guard";

export const metadata = {
  title: "1세대1주택 비과세 판정",
  description:
    "1세대1주택 양도소득세 비과세 여부 판정 — 보유 주택 수·보유·거주 요건, 일시적 2주택·상속·합가·농어촌·장기저당담보·상생임대 특례와 양도 기한 안내까지 (소득세법 §89①3호, 시행령 §154·§155)",
  openGraph: {
    title: "1세대1주택 비과세 판정",
    description: "보유 주택을 입력하면 비과세 여부와 양도 기한을 판정합니다",
    type: "website",
  },
};

/**
 * 「원문으로 채우기 (AI)」는 개발 중 관리자 전용이다(하이브리드 AI 검토 도구 P4 — 사용자 결정 2026-10-19).
 * 관리자가 아니면 버튼을 그리지 않는다. 서버 경로(`/api/one-house-ai/extract`)도 같은 게이트로 다시 막는다.
 * 확인 중 오류가 나도 판정 메뉴는 그대로 열린다 — 버튼만 숨긴다.
 */
async function isAiExtractEnabled(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try {
    return (await checkOneHouseAiAdmin()).ok;
  } catch {
    return false;
  }
}

export default async function OneHouseExemptionPage() {
  const aiExtractEnabled = await isAiExtractEnabled();
  return (
    <ProfessionalClientGate>
      <OneHouseJudgmentCalculator aiExtractEnabled={aiExtractEnabled} />
    </ProfessionalClientGate>
  );
}
