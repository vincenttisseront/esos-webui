import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core'

/**
 * Clusters HA (SDD v3.8) — objet nommé regroupant plusieurs SANs.
 */
export const clusters = sqliteTable('clusters', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Référentiel des serveurs ESOS gérés (cf. SDD v2.0 §4.2).
 */
export const sans = sqliteTable('sans', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  host: text('host').notNull(),
  port: integer('port').notNull().default(22),
  username: text('username').notNull(),
  driver: text('driver').notNull().default('iscsi'),
  status: text('status').notNull().default('active'),
  // ── Cluster (SDD v3.8) ─────────────────────────────────────────────
  clusterEnabled: integer('cluster_enabled', { mode: 'boolean' }).notNull().default(false),
  clusterRole:    text('cluster_role'),   // 'primary' | 'secondary' | null
  clusterPeer:    text('cluster_peer'),   // ID du nœud pair
  clusterId:      text('cluster_id'),     // → clusters.id
  readOnly:       integer('read_only', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Credentials SSH chiffrés (AES-256-GCM). Séparés de `sans` pour
 * isolation de sécurité. Cf. SDD v2.0 §4.3.
 */
export const sanSshCredentials = sqliteTable('san_ssh_credentials', {
  id: text('id').primaryKey(),
  sanId: text('san_id')
    .notNull()
    .references(() => sans.id, { onDelete: 'cascade' }),
  authType: text('auth_type').notNull(),
  encryptedKey: text('encrypted_key'),
  encryptedPassword: text('encrypted_password'),
  keyFingerprint: text('key_fingerprint'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Paramètres clé/valeur extensibles par SAN. Cf. SDD v2.0 §4.4.
 */
export const sanSettings = sqliteTable('san_settings', {
  id: text('id').primaryKey(),
  sanId: text('san_id')
    .notNull()
    .references(() => sans.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Comptes locaux (cf. SDD v3.7 — multi-utilisateurs avec rôles).
 * Mot de passe haché en Argon2id.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name'),
  /** Null when `auth_source` is ldap/oidc (JIT or linked external-only). */
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('operator'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sessionVersion: integer('session_version').notNull().default(0),
  forcePasswordChange: integer('force_password_change', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastLoginAt: text('last_login_at'),
  createdBy: text('created_by'),
  /** `local` | `ldap` | `oidc` */
  authSource: text('auth_source').notNull().default('local'),
  externalIssuer: text('external_issuer'),
  externalSubject: text('external_subject'),
  lastExternalLoginAt: text('last_external_login_at'),
  /** Préférence i18n (`fr` | `en` | null). NULL = suit le cookie / navigateur. */
  preferredLocale: text('preferred_locale'),
})

/**
 * OIDC authorization attempts (PKCE verifier, state/nonce hashes) for multi-instance safety.
 */
export const oidcAuthAttempts = sqliteTable('oidc_auth_attempts', {
  id: text('id').primaryKey(),
  stateHash: text('state_hash').notNull(),
  nonceHash: text('nonce_hash').notNull(),
  codeVerifierEncrypted: text('code_verifier_encrypted').notNull(),
  nonceEncrypted: text('nonce_encrypted').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
})

/**
 * Métriques historiques time-series (cf. SDD v2.4 §3).
 * Points bruts collectés toutes les 30s — rétention 24h.
 */
export const metricSamples = sqliteTable('metric_samples', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  sanId:      text('san_id').notNull(),
  timestamp:  integer('timestamp').notNull(),
  category:   text('category').notNull(),
  subject:    text('subject').notNull(),
  metricName: text('metric_name').notNull(),
  value:      real('value').notNull(),
})

/**
 * Paramètres applicatifs configurables (cf. SDD v3.0 §2).
 * Stockage clé-valeur typé — secrets chiffrés AES-256-GCM.
 */
export const appSettings = sqliteTable('app_settings', {
  key:       text('key').primaryKey(),
  value:     text('value').notNull(),
  type:      text('type').notNull(), // 'string' | 'number' | 'boolean' | 'secret'
  updatedAt: text('updated_at').notNull(),
})

/**
 * Fenêtre de grâce pour alertes « session » (SDD — seuils configurables).
 * Clé composite (san_id, dedupe_key) ; first_violation_at = epoch ms.
 */
export const alertSessionState = sqliteTable(
  'alert_session_state',
  {
    sanId:            text('san_id').notNull(),
    dedupeKey:        text('dedupe_key').notNull(),
    firstViolationAt: integer('first_violation_at', { mode: 'number' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sanId, t.dedupeKey] }),
  }),
)

/**
 * Historique des tentatives de connexion (cf. SDD v3.0 §6).
 */
export const loginEvents = sqliteTable('login_events', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    text('user_id').notNull(),
  success:   integer('success', { mode: 'boolean' }).notNull(),
  ip:        text('ip'),
  userAgent: text('user_agent'),
  at:        text('at').notNull(),
})

/**
 * Opérations RAID persistées (SDD v3.12 §15 — Phase 5+).
 * En Phase 1 l'in-memory store est utilisé; cette table est prête pour migration.
 */
export const raidOperations = sqliteTable('raid_operations', {
  id:          text('id').primaryKey(),
  sanId:       text('san_id').notNull(),
  backend:     text('backend').notNull(),       // 'hardware' | 'software_md'
  action:      text('action').notNull(),
  riskLevel:   text('risk_level').notNull(),
  status:      text('status').notNull(),        // RaidOperationStatus
  summary:     text('summary').notNull(),
  createdAt:   integer('created_at').notNull(),
  startedAt:   integer('started_at'),
  finishedAt:  integer('finished_at'),
  createdBy:   text('created_by').notNull(),
  preflightJson: text('preflight_json').notNull(),
  error:       text('error'),
})

export const raidOperationSteps = sqliteTable('raid_operation_steps', {
  id:            text('id').primaryKey(),
  operationId:   text('operation_id').notNull().references(() => raidOperations.id, { onDelete: 'cascade' }),
  label:         text('label').notNull(),
  command:       text('command'),
  status:        text('status').notNull(),
  stdoutPreview: text('stdout_preview'),
  stderrPreview: text('stderr_preview'),
  startedAt:     integer('started_at'),
  finishedAt:    integer('finished_at'),
})

/**
 * Version applicative ESOS WebUI (SDD v3.13).
 * Une seule ligne avec id = 'global'.
 */
export const appVersion = sqliteTable('app_version', {
  id:              text('id').primaryKey(), // toujours 'global'
  version:         text('version').notNull(),
  build:           text('build'),
  gitCommit:       text('git_commit'),
  gitBranch:       text('git_branch'),
  buildDate:       text('build_date'),
  environment:     text('environment'),
  dbSchemaVersion: integer('db_schema_version').notNull().default(0),
  updatedAt:       text('updated_at').notNull(),
})

/**
 * Historique des changements de version WebUI (SDD v3.13).
 */
export const appVersionHistory = sqliteTable('app_version_history', {
  id:                text('id').primaryKey(),
  version:           text('version').notNull(),
  previousVersion:   text('previous_version'),
  build:             text('build'),
  previousBuild:     text('previous_build'),
  gitCommit:         text('git_commit'),
  previousGitCommit: text('previous_git_commit'),
  gitBranch:         text('git_branch'),
  buildDate:         text('build_date'),
  dbSchemaVersion:   integer('db_schema_version').notNull().default(0),
  appliedAt:         text('applied_at').notNull(),
  source:            text('source').notNull(), // 'startup' | 'migration' | 'manual' | 'ci'
  notes:             text('notes'),
})
