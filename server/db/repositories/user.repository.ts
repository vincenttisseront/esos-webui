import { eq, sql, desc, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDB } from '../index'
import { users, loginEvents } from '../schema'
import { hashPassword, generatePassword } from '../../utils/password'
import type { CreateUserInput, UpdateUserInput, UserPublic, UserRole } from '../../utils/types'

/**
 * Repository des comptes locaux (cf. SDD v3.7) + sources externes (LDAP/OIDC).
 */

export type UserRow = typeof users.$inferSelect
export type AuthSource = 'local' | 'ldap' | 'oidc'

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string): Promise<UserRow | undefined> {
  const db = getDB()
  return db.query.users.findFirst({ where: eq(users.username, username) })
}

export async function getUserById(id: string): Promise<UserRow | undefined> {
  const db = getDB()
  return db.query.users.findFirst({ where: eq(users.id, id) })
}

export async function getUserByExternalIdentity(
  issuer: string,
  subject: string,
): Promise<UserRow | undefined> {
  const db = getDB()
  return db.query.users.findFirst({
    where: and(eq(users.externalIssuer, issuer), eq(users.externalSubject, subject)),
  })
}

export async function listUsers(): Promise<UserPublic[]> {
  const db  = getDB()
  const all = db.select().from(users).orderBy(users.createdAt).all()
  return all.map(toPublic)
}

export async function countUsers(): Promise<number> {
  const db   = getDB()
  const rows = db.select({ count: sql<number>`count(*)` }).from(users).all()
  return Number(rows[0]?.count ?? 0)
}

export async function countAdmins(): Promise<number> {
  const db   = getDB()
  const rows = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)))
    .all()
  return Number(rows[0]?.count ?? 0)
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

export async function createUser(
  input:     CreateUserInput,
  createdBy: string | null = null,
): Promise<{ id: string; generatedPassword: string | null }> {
  const db  = getDB()
  const id  = randomUUID()
  const now = new Date().toISOString()

  const rawPassword       = input.password || generatePassword(16)
  const generatedPassword = input.password ? null : rawPassword

  db.insert(users).values({
    id,
    username:            input.username,
    displayName:         input.displayName ?? null,
    passwordHash:        await hashPassword(rawPassword),
    role:                input.role ?? 'operator',
    active:              true,
    sessionVersion:      0,
    forcePasswordChange: input.forcePasswordChange,
    createdAt:           now,
    updatedAt:           now,
    createdBy:           createdBy ?? null,
    authSource:          'local',
    externalIssuer:      null,
    externalSubject:     null,
    lastExternalLoginAt: null,
  }).run()

  return { id, generatedPassword }
}

export interface CreateJitExternalUserInput {
  username:         string
  displayName:      string | null
  role:             UserRole
  active:           boolean
  authSource:       AuthSource
  externalIssuer:   string
  externalSubject:  string
  forcePasswordChange?: boolean
}

export function createJitExternalUser(input: CreateJitExternalUserInput): string {
  const db  = getDB()
  const id  = randomUUID()
  const now = new Date().toISOString()
  db.insert(users).values({
    id,
    username:            input.username,
    displayName:         input.displayName,
    passwordHash:        null,
    role:                input.role,
    active:              input.active,
    sessionVersion:      0,
    forcePasswordChange: input.forcePasswordChange ?? false,
    createdAt:           now,
    updatedAt:           now,
    createdBy:           null,
    authSource:          input.authSource,
    externalIssuer:      input.externalIssuer,
    externalSubject:     input.externalSubject,
    lastExternalLoginAt: now,
  }).run()
  return id
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<void> {
  const db  = getDB()
  const now = new Date().toISOString()
  db.update(users).set({ ...input, updatedAt: now }).where(eq(users.id, id)).run()
}

export async function resetPassword(
  id:                  string,
  forcePasswordChange: boolean = true,
): Promise<string> {
  const db  = getDB()
  const now = new Date().toISOString()
  const raw = generatePassword(16)

  db.update(users)
    .set({
      passwordHash:        await hashPassword(raw),
      forcePasswordChange,
      updatedAt:           now,
      authSource:          'local',
      externalIssuer:      null,
      externalSubject:     null,
      lastExternalLoginAt: null,
    })
    .where(eq(users.id, id))
    .run()

  return raw
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const db  = getDB()
  const now = new Date().toISOString()
  db.update(users)
    .set({
      passwordHash:        await hashPassword(newPassword),
      forcePasswordChange: false,
      updatedAt:           now,
      authSource:          'local',
    })
    .where(eq(users.id, userId))
    .run()
}

export async function deleteUser(id: string): Promise<void> {
  const db = getDB()
  db.delete(users).where(eq(users.id, id)).run()
}

export async function invalidateSessions(userId: string): Promise<void> {
  const db = getDB()
  db.update(users)
    .set({ sessionVersion: sql`session_version + 1` })
    .where(eq(users.id, userId))
    .run()
}

export async function updateLastLogin(userId: string): Promise<void> {
  const db = getDB()
  db.update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run()
}

/**
 * Met à jour la langue préférée d'un utilisateur (i18n).
 * `locale` est limité aux codes supportés par l'app (voir nuxt.config.ts).
 */
export async function setPreferredLocale(userId: string, locale: string | null): Promise<void> {
  const db  = getDB()
  const now = new Date().toISOString()
  db.update(users)
    .set({ preferredLocale: locale, updatedAt: now })
    .where(eq(users.id, userId))
    .run()
}

export async function touchExternalLogin(userId: string): Promise<void> {
  const db  = getDB()
  const now = new Date().toISOString()
  db.update(users)
    .set({ lastExternalLoginAt: now, updatedAt: now })
    .where(eq(users.id, userId))
    .run()
}

export function linkUserToFederatedIdentity(
  userId: string,
  authSource: AuthSource,
  issuer: string,
  subject: string,
): Promise<void> {
  const db  = getDB()
  const now = new Date().toISOString()
  if (authSource !== 'oidc' && authSource !== 'ldap') {
    throw new Error('linkUserToFederatedIdentity: source invalide')
  }
  db.update(users)
    .set({
      externalIssuer:  issuer,
      externalSubject: subject,
      authSource,
      updatedAt:       now,
    })
    .where(eq(users.id, userId))
    .run()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPublic(u: UserRow): UserPublic {
  return {
    id:                  u.id,
    username:            u.username,
    displayName:         u.displayName ?? null,
    role:                u.role as UserRole,
    active:              u.active,
    forcePasswordChange: u.forcePasswordChange,
    createdAt:           u.createdAt,
    lastLoginAt:         u.lastLoginAt ?? null,
    createdBy:           u.createdBy ?? null,
    authSource:          (u.authSource ?? 'local') as AuthSource,
  }
}

// ─── Historique des connexions (SDD v3.0 §6) ─────────────────────────────────

export type LoginEventRow = typeof loginEvents.$inferSelect

export async function recordLoginEvent(
  userId:    string,
  success:   boolean,
  ip?:       string,
  userAgent?: string,
): Promise<void> {
  const db = getDB()
  db.insert(loginEvents).values({
    userId,
    success,
    ip:        ip        ?? null,
    userAgent: userAgent ?? null,
    at:        new Date().toISOString(),
  }).run()
}

export async function getLoginHistory(limit = 20, userId?: string): Promise<LoginEventRow[]> {
  const db = getDB()
  return db
    .select()
    .from(loginEvents)
    .where(userId ? eq(loginEvents.userId, userId) : undefined)
    .orderBy(desc(loginEvents.at))
    .limit(limit)
    .all()
}
