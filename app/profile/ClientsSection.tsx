"use client";

import { useEffect, useState } from "react";
import { clientRepository } from "@/lib/storage/client-repository";
import { ClientSearchInput } from "@/components/calc/ClientSearchInput";
import { ClientForm } from "./ClientForm";
import type { Client } from "@/lib/storage/types";

const PAGE_SIZE = 20;
type EditState = { type: "add" } | { type: "edit"; client: Client } | null;

export function ClientsSection() {
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [editState, setEditState] = useState<EditState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function reload() {
    const list = await clientRepository.list();
    setAllClients(list);
  }

  useEffect(() => {
    clientRepository.list().then(setAllClients);
  }, []);

  function handleQueryChange(q: string) {
    setQuery(q);
    setPage(0);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    clientRepository.search(q).then(setSearchResults);
  }

  const isSearching = query.trim().length > 0;
  const displayList = isSearching ? searchResults : allClients;
  const totalPages = isSearching ? 1 : Math.ceil(allClients.length / PAGE_SIZE);
  const paginated = isSearching
    ? searchResults
    : allClients.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleAdd(data: Omit<Client, "id" | "userId" | "lastUsedAt" | "createdAt" | "updatedAt">) {
    await clientRepository.create(data);
    setEditState(null);
    await reload();
  }

  async function handleEdit(id: string, data: Omit<Client, "id" | "userId" | "lastUsedAt" | "createdAt" | "updatedAt">) {
    await clientRepository.update(id, data);
    setEditState(null);
    await reload();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await clientRepository.remove(id);
    setDeletingId(null);
    await reload();
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">의뢰인 관리</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            위임받은 납세자를 등록하여 의뢰인별로 세액을 계산·관리합니다.
          </p>
        </div>
        {editState === null && (
          <button
            type="button"
            onClick={() => setEditState({ type: "add" })}
            className="shrink-0 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            + 의뢰인 추가
          </button>
        )}
      </div>

      {/* 검색창 (5명 이상일 때 표시) */}
      {allClients.length >= 5 && (
        <ClientSearchInput value={query} onChange={handleQueryChange} />
      )}

      {/* 건수 안내 */}
      {allClients.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {isSearching
            ? `검색 결과 ${searchResults.length}명`
            : `전체 ${allClients.length}명${totalPages > 1 ? ` · ${page + 1}/${totalPages} 페이지` : ""}`}
        </p>
      )}

      {/* 추가 폼 */}
      {editState?.type === "add" && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary mb-3">새 의뢰인</p>
          <ClientForm
            onSubmit={handleAdd}
            onCancel={() => setEditState(null)}
          />
        </div>
      )}

      {/* 목록 */}
      {displayList.length === 0 && editState === null ? (
        <p className="text-sm text-muted-foreground text-center py-6 rounded-xl border border-dashed border-border">
          {isSearching ? "일치하는 의뢰인이 없습니다." : "등록된 의뢰인이 없습니다."}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {paginated.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-background">
                {editState?.type === "edit" && editState.client.id === c.id ? (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-primary mb-3">의뢰인 수정</p>
                    <ClientForm
                      initial={c}
                      onSubmit={(data) => handleEdit(c.id, data)}
                      onCancel={() => setEditState(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between p-4 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {c.birthDate && <span>{c.birthDate}</span>}
                        {c.phone && <span>{c.phone}</span>}
                        {c.email && <span className="truncate">{c.email}</span>}
                      </div>
                      {c.memo && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{c.memo}</p>
                      )}
                      {c.lastUsedAt && (
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          최근 사용: {new Date(c.lastUsedAt).toLocaleDateString("ko-KR")}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditState({ type: "edit", client: c })}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted/60 transition-colors"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        className="rounded-md border border-destructive/40 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* 페이지네이션 (검색 중에는 숨김) */}
          {!isSearching && totalPages > 1 && (
            <SectionPagination page={page} totalPages={totalPages} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

function SectionPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
  const end = Math.min(totalPages, start + 5);
  const pages = Array.from({ length: end - start }, (_, i) => start + i);

  return (
    <div className="flex items-center justify-center gap-1 pt-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-40"
      >
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={[
            "rounded-md px-2.5 py-1 text-xs border transition-colors",
            p === page
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted/60",
          ].join(" ")}
        >
          {p + 1}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}
