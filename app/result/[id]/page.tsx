import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCalculation } from "@/actions/calculations";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { ResultDetailClient } from "./ResultDetailClient";

interface ResultPageProps {
  params: Promise<{ id: string }>;
}

const TAX_TYPE_LABELS: Record<string, string> = {
  transfer: "양도소득세",
  inheritance: "상속세",
  gift: "증여세",
  acquisition: "취득세",
  property: "재산세",
  comprehensive_property: "종합부동산세",
};

export async function generateMetadata({ params }: ResultPageProps) {
  const { id } = await params;
  return {
    title: `계산 결과 #${id.slice(0, 8)} | KoreanTaxCalc`,
  };
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { id } = await params;

  // 로그인 확인 (보호 라우트)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/result/${id}`);
  }

  const { record, error } = await getCalculation(id);

  if (error || !record) {
    notFound();
  }

  const taxLabel = TAX_TYPE_LABELS[record.tax_type] ?? record.tax_type;
  const createdAt = new Date(record.created_at).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">
          {taxLabel} · {createdAt}
        </p>
        <h1 className="text-2xl font-bold">계산 결과 상세</h1>
      </div>

      <ResultDetailClient
        taxType={record.tax_type}
        result={record.result_data as unknown as TransferTaxResult}
        inputData={record.input_data}
      />
    </div>
  );
}
