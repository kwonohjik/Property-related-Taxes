import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCalculations, deleteCalculation } from "@/actions/calculations";
import { HistoryClient } from "./HistoryClient";

export const metadata = {
  title: "계산 이력 | KoreanTaxCalc",
};

const TAX_TYPE_LABELS: Record<string, string> = {
  transfer: "양도소득세",
  transfer_multi: "양도소득세 (다건)",
  inheritance: "상속세",
  gift: "증여세",
  acquisition: "취득세",
  property: "재산세",
  comprehensive_property: "종합부동산세",
};

export default async function HistoryPage() {
  // 로그인 확인 (보호 라우트)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/history");
  }

  const { records, total, error } = await listCalculations({ limit: 50 });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <h1 className="text-2xl font-bold">계산 이력</h1>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          이력을 불러오지 못했습니다. Supabase 연결을 확인하세요.
        </div>
      ) : (
        <HistoryClient
          initialRecords={records}
          initialTotal={total}
          taxTypeLabels={TAX_TYPE_LABELS}
          deleteAction={deleteCalculation}
        />
      )}
    </div>
  );
}
