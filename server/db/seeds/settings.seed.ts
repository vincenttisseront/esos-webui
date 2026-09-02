/**
 * Valeurs par défaut des paramètres applicatifs (cf. SDD v3.0 §2).
 * Seeded au 1er démarrage si la table est vide.
 */
export const DEFAULT_SETTINGS: Array<{ key: string; value: string; type: string }> = [
  // ── SSH ──────────────────────────────────────────────────────────
  { key: 'ssh.host',        value: '',      type: 'string'  },
  { key: 'ssh.port',        value: '22',    type: 'number'  },
  { key: 'ssh.username',    value: 'root',  type: 'string'  },
  { key: 'ssh.auth_type',   value: 'key',   type: 'string'  }, // 'key' | 'password'
  { key: 'ssh.private_key', value: '',      type: 'secret'  }, // Chiffré (v2.0)
  { key: 'ssh.password',    value: '',      type: 'secret'  }, // Chiffré (v2.0)

  // ── Collecte ─────────────────────────────────────────────────────
  { key: 'collector.enabled',         value: 'true', type: 'boolean' },
  { key: 'collector.interval_sec',    value: '30',   type: 'number'  },
  { key: 'collector.retention_hours', value: '24',   type: 'number'  },

  // ── Application ──────────────────────────────────────────────────
  { key: 'app.version',    value: '1.0.8', type: 'string'  },
  { key: 'app.setup_done', value: 'false', type: 'boolean' },

  // ── Alertes passives (seuils globaux) ────────────────────────────
  { key: 'alerts.volume_warn_pct',       value: '75',      type: 'number'  },
  { key: 'alerts.volume_critical_pct',   value: '90',      type: 'number'  },
  { key: 'alerts.session_enabled',       value: 'true',    type: 'boolean' },
  { key: 'alerts.session_policy',        value: 'strict',  type: 'string'  },
  { key: 'alerts.session_grace_sec',     value: '120',     type: 'number'  },
  { key: 'alerts.session_min_active',    value: '1',       type: 'number'  },
  { key: 'alerts.fc_port_enabled',       value: 'true',    type: 'boolean' },
]
