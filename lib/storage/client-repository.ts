import Dexie from "dexie";
import { db } from "./db";
import { getCurrentUserId } from "./current-user";
import type { UserId } from "./constants";
import type { Client } from "./types";

export interface ClientRepository {
  list(): Promise<Client[]>;
  get(id: string): Promise<Client | null>;
  create(input: Omit<Client, "id" | "userId" | "createdAt" | "updatedAt">): Promise<Client>;
  update(
    id: string,
    patch: Partial<Pick<Client, "name" | "birthDate" | "phone" | "email" | "memo">>
  ): Promise<void>;
  remove(id: string): Promise<void>;
}

export function createClientRepository(uid: UserId): ClientRepository {
  return {
    async list() {
      return db.clients
        .where("[userId+createdAt]")
        .between([uid, Dexie.minKey], [uid, Dexie.maxKey])
        .reverse()
        .toArray();
    },

    async get(id) {
      const rec = await db.clients.get(id);
      if (!rec || rec.userId !== uid) return null;
      return rec;
    },

    async create({ name, birthDate, phone, email, memo }) {
      const now = new Date().toISOString();
      const client: Client = {
        id: crypto.randomUUID(),
        userId: uid,
        name,
        birthDate: birthDate ?? null,
        phone: phone ?? null,
        email: email ?? null,
        memo: memo ?? null,
        createdAt: now,
        updatedAt: now,
      };
      await db.clients.add(client);
      return client;
    },

    async update(id, patch) {
      const existing = await db.clients.get(id);
      if (!existing || existing.userId !== uid) return;
      await db.clients.update(id, { ...patch, updatedAt: new Date().toISOString() });
    },

    async remove(id) {
      const existing = await db.clients.get(id);
      if (!existing || existing.userId !== uid) return;
      await db.clients.delete(id);
    },
  };
}

export const clientRepository = createClientRepository(getCurrentUserId());
