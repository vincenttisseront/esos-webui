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

/** Optional N-node membership (migration 0014). */
export const clusterNodes = sqliteTable(
  'cluster_nodes',
  {
    clusterId: text('cluster_id')
      .notNull()
      .references(() => clusters.id, { onDelete: 'cascade' }),
    sanId: text('san_id')
      .notNull()
      .references(() => sans.id, { onDelete: 'cascade' }),
    role: text('role'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  t => ({
    pk: primaryKey({ columns: [t.clusterId, t.sanId] }),
  }),
)

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
  /** Directory login (e.g. sAMAccountName) for provisioned users. */
  externalLogin: text('external_login'),
  externalEmail: text('external_email'),
  lastExternalLoginAt: text('last_external_login_at'),
  /** Préférence i18n (`fr` | `en` | null). NULL = suit le cookie / navigateur. */
  preferredLocale: text('preferred_locale'),
  /** Préférence thème (`light` | `dark` | `system` | null). NULL = suit le cookie. */
  preferredTheme: text('preferred_theme'),
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
 * LDAP test / login / provisioning audit (sanitized; no passwords).
 * Retention: 30 days and max 5000 rows (enforced on insert).
 */
export const ldapAuthEvents = sqliteTable('ldap_auth_events', {
  id:                 text('id').primaryKey(),
  at:                 text('at').notNull(),
  eventType:          text('event_type').notNull(),
  action:             text('action').notNull(),
  step:               text('step').notNull(),
  result:             text('result').notNull(),
  safeCode:           text('safe_code'),
  username:           text('username'),
  provider:           text('provider').notNull().default('ldap'),
  urlHost:            text('url_host'),
  baseDn:             text('base_dn'),
  renderedFilter:     text('rendered_filter'),
  ldapErrorName:      text('ldap_error_name'),
  ldapErrorCode:      text('ldap_error_code'),
  diagnosticMessage:  text('diagnostic_message'),
  matchedDn:          text('matched_dn'),
  referralsJson:      text('referrals_json'),
  durationMs:         integer('duration_ms'),
  requestIp:          text('request_ip'),
  userAgent:          text('user_agent'),
  stepResultsJson:    text('step_results_json'),
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
/** Container binary catalog + multi-SAN deployment jobs. */
export const deploymentBinaries = sqliteTable('deployment_binaries', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  version:         text('version'),
  filename:        text('filename').notNull(),
  sourcePath:      text('source_path'),
  storedPath:      text('stored_path').notNull(),
  sizeBytes:       integer('size_bytes').notNull(),
  sha256:          text('sha256').notNull().unique(),
  kind:            text('kind').notNull(),
  installSpecJson: text('install_spec_json').notNull().default('{}'),
  status:          text('status').notNull().default('registered'),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
})

export const deploymentJobs = sqliteTable('deployment_jobs', {
  id:          text('id').primaryKey(),
  binaryId:    text('binary_id').notNull().references(() => deploymentBinaries.id),
  scope:       text('scope').notNull().default('multi_san'),
  requestedBy: text('requested_by').notNull(),
  status:      text('status').notNull(),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
})

export const deploymentJobTargets = sqliteTable('deployment_job_targets', {
  id:           text('id').primaryKey(),
  jobId:        text('job_id').notNull().references(() => deploymentJobs.id, { onDelete: 'cascade' }),
  sanId:        text('san_id').notNull(),
  status:       text('status').notNull(),
  remotePath:   text('remote_path'),
  logs:         text('logs').notNull().default(''),
  errorMessage: text('error_message'),
  startedAt:    text('started_at'),
  finishedAt:   text('finished_at'),
})

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
