"use server";

/**
 * calculations Server Actions
 * - 계산 이력 저장, 조회, 삭제
 * - Supabase `calculations` 테이블 사용
 * - 환경변수 미설정 시 graceful skip
 */

import { createClient } from "@/lib/supabase/server";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

export type TaxType =
  | "transfer"
  | "inheritance"
  | "gift"
  | "acquisition"
  | "property"
  | "comprehensive_property";

export interface CalculationRecord {
  id: string;
  tax_type: TaxType;
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown>;
  tax_law_version: string;
  created_at: string;
}

export interface SaveResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * 계산 이력 저장
 * 로그인된 사용자만 저장 가능. 비로그인 시 success: false 반환.
 */
export async function saveCalculation(params: {
  taxType: TaxType;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  taxLawVersion: string;
}): Promise<SaveResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // 사용자당 최대 200건 — 초과 시 가장 오래된 이력 삭제
    const { count } = await supabase
      .from("calculations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= 200) {
      // 가장 오래된 1건 삭제
      const { data: oldest } = await supabase
        .from("calculations")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (oldest) {
        await supabase.from("calculations").delete().eq("id", oldest.id);
      }
    }

    const { data, error } = await supabase
      .from("calculations")
      .insert({
        user_id: user.id,
        tax_type: params.taxType,
        input_data: params.inputData,
        result_data: params.resultData,
        tax_law_version: params.taxLawVersion,
      })
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * 계산 이력 목록 조회 (로그인 필수)
 */
export async function listCalculations(params?: {
  taxType?: TaxType;
  limit?: number;
  offset?: number;
}): Promise<{ records: CalculationRecord[]; total: number; error?: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { records: [], total: 0, error: "Supabase not configured" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { records: [], total: 0, error: "Not authenticated" };
    }

    let query = supabase
      .from("calculations")
      .select("id, tax_type, input_data, result_data, tax_law_version, created_at", {
        count: "exact",
      })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (params?.taxType) {
      query = query.eq("tax_type", params.taxType);
    }

    const limit = params?.limit ?? 20;
    const offset = params?.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return { records: [], total: 0, error: error.message };
    }

    return {
      records: (data ?? []) as CalculationRecord[],
      total: count ?? 0,
    };
  } catch (e) {
    return {
      records: [],
      total: 0,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/**
 * 계산 이력 단건 조회
 */
export async function getCalculation(
  id: string,
): Promise<{ record: CalculationRecord | null; error?: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { record: null, error: "Supabase not configured" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { record: null, error: "Not authenticated" };
    }

    const { data, error } = await supabase
      .from("calculations")
      .select("id, tax_type, input_data, result_data, tax_law_version, created_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      return { record: null, error: error.message };
    }

    return { record: data as CalculationRecord };
  } catch (e) {
    return { record: null, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * 계산 이력 삭제
 */
export async function deleteCalculation(id: string): Promise<SaveResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("calculations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * 비로그인 → 로그인 전환 시 pendingResult를 DB에 이관
 * zustand store의 result를 전달받아 저장
 */
export async function migratePendingResult(params: {
  taxType: TaxType;
  inputData: Record<string, unknown>;
  resultData: TransferTaxResult;
  taxLawVersion?: string;
}): Promise<SaveResult> {
  return saveCalculation({
    taxType: params.taxType,
    inputData: params.inputData,
    resultData: params.resultData as unknown as Record<string, unknown>,
    taxLawVersion: params.taxLawVersion ?? new Date().toISOString().split("T")[0],
  });
}
