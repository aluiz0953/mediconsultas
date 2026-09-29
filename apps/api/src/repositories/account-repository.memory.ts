import { randomUUID } from 'node:crypto';
import {
  removedEmail,
  type AccountAuth,
  type AccountRepository,
  type AccountRole,
  type AccountSearchFilter,
  type AccountStatus,
  type AccountSummary,
  type NewAccount,
} from './account-repository.js';

// In-memory test double for AccountRepository; production uses PgAccountRepository.
interface InMemoryAccount extends AccountAuth {
  fullName: string | null;
  createdAt: Date;
  deletedAt?: Date;
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly byId = new Map<string, InMemoryAccount>();

  async findAuthByEmail(email: string): Promise<AccountAuth | undefined> {
    return [...this.byId.values()].find((a) => a.email === email);
  }

  async findAuthById(id: string): Promise<AccountAuth | undefined> {
    return this.byId.get(id);
  }

  async findSummaryById(id: string): Promise<AccountSummary | undefined> {
    const account = this.byId.get(id);
    return account && !account.deletedAt ? this.toSummary(account) : undefined;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return [...this.byId.values()].some((a) => a.email === email);
  }

  async create(account: NewAccount): Promise<AccountSummary> {
    const record: InMemoryAccount = {
      id: randomUUID(),
      email: account.email,
      passwordHash: account.passwordHash,
      role: account.role,
      status: 'PENDING',
      failedLoginCount: 0,
      lockedUntil: null,
      fullName: account.fullName,
      createdAt: new Date(),
    };
    this.byId.set(record.id, record);
    return this.toSummary(record);
  }

  async updateEmail(id: string, email: string): Promise<void> {
    const account = this.byId.get(id);
    if (account) account.email = email;
  }

  async updateFullName(id: string, fullName: string): Promise<void> {
    const account = this.byId.get(id);
    if (account) account.fullName = fullName;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const account = this.byId.get(id);
    if (account) {
      account.passwordHash = passwordHash;
      account.failedLoginCount = 0;
      account.lockedUntil = null;
    }
  }

  async recordFailedLogin(id: string, failedLoginCount: number, lockedUntil: Date | null): Promise<void> {
    const account = this.byId.get(id);
    if (account) {
      account.failedLoginCount = failedLoginCount;
      account.lockedUntil = lockedUntil;
    }
  }

  async recordSuccessfulLogin(id: string): Promise<void> {
    const account = this.byId.get(id);
    if (account) {
      account.failedLoginCount = 0;
      account.lockedUntil = null;
    }
  }

  async search(filter: AccountSearchFilter): Promise<AccountSummary[]> {
    let results = [...this.byId.values()].filter((a) => !a.deletedAt);
    if (filter.query) {
      const needle = filter.query.trim().toLowerCase();
      results = results.filter(
        (a) => a.email.toLowerCase().includes(needle) || (a.fullName ?? '').toLowerCase().includes(needle),
      );
    }
    if (filter.role) results = results.filter((a) => a.role === filter.role);
    if (filter.status) results = results.filter((a) => a.status === filter.status);
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return results.slice(0, filter.limit ?? 50).map((a) => this.toSummary(a));
  }

  async updateStatus(id: string, status: AccountStatus): Promise<AccountSummary | undefined> {
    const account = this.byId.get(id);
    if (!account) return undefined;
    account.status = status;
    return this.toSummary(account);
  }

  async countActiveByRole(role: AccountRole): Promise<number> {
    return [...this.byId.values()].filter((a) => a.role === role && a.status === 'ACTIVE').length;
  }

  async updateRole(id: string, _oldRole: AccountRole, newRole: AccountRole): Promise<AccountSummary | undefined> {
    const account = this.byId.get(id);
    if (!account) return undefined;
    account.role = newRole;
    return this.toSummary(account);
  }

  async remove(id: string): Promise<void> {
    const account = this.byId.get(id);
    if (!account) return;
    account.status = 'DISABLED';
    account.email = removedEmail(id);
    account.deletedAt = new Date();
  }

  private toSummary(account: InMemoryAccount): AccountSummary {
    return {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
      fullName: account.fullName,
      createdAt: account.createdAt,
    };
  }
}
