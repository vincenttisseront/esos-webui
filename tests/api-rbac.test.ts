/**
 * RBAC unit tests — importe uniquement `server/utils/api-rbac` + `h3` (via ce module).
 * Pour valider ce fichier seul (sans `npm run test`, qui échoue tant que d'autres
 * suites ont des erreurs, ex. parse esbuild sur tests/raid.test.ts) :
 *   npm run test:rbac
 */
import { describe, it, expect } from 'vitest'
import { enforceMutationAccess, enforceReadAccess } from '../server/utils/api-rbac'
import {
  CLUSTER_NODE_SELECTION_DTO_KEYS,
  SAN_SELECTION_DTO_KEYS,
} from '../server/utils/selection-context'

function expectForbidden(fn: () => void) {
  expect(fn).toThrow()
}

describe('api-rbac (mutations default deny)', () => {
  it('RB01 — viewer cannot POST /api/targets', () => {
    expectForbidden(() => enforceMutationAccess('/api/targets', 'POST', 'viewer'))
  })

  it('RB02 — viewer cannot POST /api/cluster/sync', () => {
    expectForbidden(() => enforceMutationAccess('/api/cluster/sync', 'POST', 'viewer'))
  })

  it('RB03 — viewer can POST /api/auth/change-password', () => {
    expect(() => enforceMutationAccess('/api/auth/change-password', 'POST', 'viewer')).not.toThrow()
  })

  it('RB04 — viewer can POST /api/auth/logout', () => {
    expect(() => enforceMutationAccess('/api/auth/logout', 'POST', 'viewer')).not.toThrow()
  })

  it('RB05 — operator cannot POST /api/admin/ssh/test', () => {
    expectForbidden(() => enforceMutationAccess('/api/admin/ssh/test', 'POST', 'operator'))
  })

  it('RB06 — admin can POST /api/admin/ssh/test', () => {
    expect(() => enforceMutationAccess('/api/admin/ssh/test', 'POST', 'admin')).not.toThrow()
  })

  it('RB07 — operator can POST /api/cluster/sync', () => {
    expect(() => enforceMutationAccess('/api/cluster/sync', 'POST', 'operator')).not.toThrow()
  })

  it('RB08 — unknown mutation path is denied for admin', () => {
    expectForbidden(() => enforceMutationAccess('/api/unknown-mutation', 'POST', 'admin'))
  })

  it('RB09 — admin can POST /api/lvm/cluster/preflight', () => {
    expect(() => enforceMutationAccess('/api/lvm/cluster/preflight', 'POST', 'admin')).not.toThrow()
  })

  it('RB09b — operator can POST /api/lvm/cluster/preflight', () => {
    expect(() => enforceMutationAccess('/api/lvm/cluster/preflight', 'POST', 'operator')).not.toThrow()
  })

  it('RB09c — viewer cannot POST /api/lvm/cluster/preflight', () => {
    expectForbidden(() => enforceMutationAccess('/api/lvm/cluster/preflight', 'POST', 'viewer'))
  })

  it('RB09c2 — viewer cannot POST /api/cluster/alua/execute', () => {
    expectForbidden(() => enforceMutationAccess('/api/cluster/alua/execute', 'POST', 'viewer'))
  })

  it('RB09c3 — operator can POST /api/cluster/alua/execute', () => {
    expect(() => enforceMutationAccess('/api/cluster/alua/execute', 'POST', 'operator')).not.toThrow()
  })

  it('RB09d — admin can POST /api/lvm/pv/create/cluster', () => {
    expect(() => enforceMutationAccess('/api/lvm/pv/create/cluster', 'POST', 'admin')).not.toThrow()
  })

  it('RB09e — viewer cannot POST /api/lvm/pv/create/cluster', () => {
    expectForbidden(() => enforceMutationAccess('/api/lvm/pv/create/cluster', 'POST', 'viewer'))
  })

  it('RB09f — viewer cannot POST /api/lvm/preflight', () => {
    expectForbidden(() => enforceMutationAccess('/api/lvm/preflight', 'POST', 'viewer'))
  })

  it('RB10 — viewer cannot POST /api/fs/create', () => {
    expectForbidden(() => enforceMutationAccess('/api/fs/create', 'POST', 'viewer'))
  })

  it('RB10b — operator can POST /api/fs/create', () => {
    expect(() => enforceMutationAccess('/api/fs/create', 'POST', 'operator')).not.toThrow()
  })

  it('RB10c — viewer can GET /api/fs/overview', () => {
    expect(() => enforceReadAccess('/api/fs/overview', 'GET', 'viewer')).not.toThrow()
  })

  it('RB10d — viewer cannot DELETE /api/fs/vdisk', () => {
    expectForbidden(() => enforceMutationAccess('/api/fs/vdisk', 'DELETE', 'viewer'))
  })

  it('RB10e — viewer cannot POST /api/fs/vdisk', () => {
    expectForbidden(() => enforceMutationAccess('/api/fs/vdisk', 'POST', 'viewer'))
  })

  it('RB10f — viewer cannot POST /api/fs/fileio', () => {
    expectForbidden(() => enforceMutationAccess('/api/fs/fileio', 'POST', 'viewer'))
  })

  it('RB09g — operator can POST /api/lvm/pv/remove/cluster', () => {
    expect(() => enforceMutationAccess('/api/lvm/pv/remove/cluster', 'POST', 'operator')).not.toThrow()
  })

  it('RB09h — viewer cannot DELETE /api/lvm/pv', () => {
    expectForbidden(() => enforceMutationAccess('/api/lvm/pv', 'DELETE', 'viewer'))
  })

  it('RB10 — operator can POST /api/targets/t1/groups', () => {
    expect(() =>
      enforceMutationAccess('/api/targets/iqn.t1/groups', 'POST', 'operator'),
    ).not.toThrow()
  })

  it('RB10a — viewer cannot POST /api/targets/t1/groups', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/targets/iqn.t1/groups', 'POST', 'viewer'),
    )
  })

  it('RB10b — viewer cannot POST /api/targets/t1/groups/g1/initiators', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/targets/t1/groups/g1/initiators', 'POST', 'viewer'),
    )
  })

  it('RB10c — viewer cannot POST initiators/remove', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/targets/t1/groups/g1/initiators/remove', 'POST', 'viewer'),
    )
  })

  it('RB11 — operator can POST /api/targets/t1/groups/g1/luns', () => {
    expect(() =>
      enforceMutationAccess('/api/targets/t1/groups/g1/luns', 'POST', 'operator'),
    ).not.toThrow()
  })

  it('RB11a — viewer cannot POST /api/targets/t1/groups/g1/luns', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/targets/t1/groups/g1/luns', 'POST', 'viewer'),
    )
  })

  it('RB11b — viewer cannot POST luns/remove', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/targets/t1/groups/g1/luns/remove', 'POST', 'viewer'),
    )
  })
})

describe('api-rbac (auth-providers admin)', () => {
  it('RB40 — operator cannot PATCH /api/admin/auth-providers', () => {
    expectForbidden(() => enforceMutationAccess('/api/admin/auth-providers', 'PATCH', 'operator'))
  })

  it('RB41 — admin can PATCH /api/admin/auth-providers', () => {
    expect(() => enforceMutationAccess('/api/admin/auth-providers', 'PATCH', 'admin')).not.toThrow()
  })

  it('RB42 — operator cannot POST /api/admin/auth-providers/ldap/test', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/admin/auth-providers/ldap/test', 'POST', 'operator'),
    )
  })

  it('RB43 — admin can POST /api/admin/auth-providers/oidc/test', () => {
    expect(() =>
      enforceMutationAccess('/api/admin/auth-providers/oidc/test', 'POST', 'admin'),
    ).not.toThrow()
  })

  it('RB44 — viewer can GET /api/admin/auth-providers (read-only)', () => {
    expect(() => enforceReadAccess('/api/admin/auth-providers', 'GET', 'viewer')).not.toThrow()
  })

  it('RB44b — operator can GET /api/admin/auth-providers (read-only)', () => {
    expect(() => enforceReadAccess('/api/admin/auth-providers', 'GET', 'operator')).not.toThrow()
  })

  it('RB45 — admin can GET /api/admin/auth-providers', () => {
    expect(() => enforceReadAccess('/api/admin/auth-providers', 'GET', 'admin')).not.toThrow()
  })

  it('RB46 — viewer cannot GET ldap provisioning status', () => {
    expectForbidden(() =>
      enforceReadAccess('/api/admin/auth-providers/ldap/status', 'GET', 'viewer'),
    )
  })

  it('RB47 — admin can GET ldap provisioning status', () => {
    expect(() =>
      enforceReadAccess('/api/admin/auth-providers/ldap/status', 'GET', 'admin'),
    ).not.toThrow()
  })

  it('RB48 — operator cannot POST ldap directory search', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/admin/auth-providers/ldap/search', 'POST', 'operator'),
    )
  })

  it('RB49 — operator cannot GET ldap event log', () => {
    expectForbidden(() =>
      enforceReadAccess('/api/admin/auth-providers/ldap/events', 'GET', 'operator'),
    )
  })

  it('RB50 — admin can GET ldap event log', () => {
    expect(() =>
      enforceReadAccess('/api/admin/auth-providers/ldap/events', 'GET', 'admin'),
    ).not.toThrow()
  })
})

describe('api-rbac (deployment)', () => {
  it('RB53 — operator cannot POST /api/san/x/binary-deployments', () => {
    expectForbidden(() => enforceMutationAccess('/api/san/x/binary-deployments', 'POST', 'operator'))
  })

  it('RB54 — operator can GET /api/san/x/binary-deployments/latest', () => {
    expect(() => enforceReadAccess('/api/san/x/binary-deployments/latest', 'GET', 'operator')).not.toThrow()
  })

  it('RB50 — operator cannot POST /api/admin/deployment/jobs', () => {
    expectForbidden(() => enforceMutationAccess('/api/admin/deployment/jobs', 'POST', 'operator'))
  })

  it('RB51 — admin can POST /api/admin/deployment/catalog/import', () => {
    expect(() => enforceMutationAccess('/api/admin/deployment/catalog/import', 'POST', 'admin')).not.toThrow()
  })

  it('RB52 — operator can GET /api/admin/deployment/catalog', () => {
    expect(() => enforceReadAccess('/api/admin/deployment/catalog', 'GET', 'operator')).not.toThrow()
  })
})

describe('api-rbac (reads)', () => {
  it('RB10 — viewer cannot GET /api/admin/users', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/users', 'GET', 'viewer'))
  })

  it('RB11 — viewer can GET /api/raid/overview', () => {
    expect(() => enforceReadAccess('/api/raid/overview', 'GET', 'viewer')).not.toThrow()
  })

  it('RB11d — viewer can GET /api/advanced-storage/overview', () => {
    expect(() => enforceReadAccess('/api/advanced-storage/overview', 'GET', 'viewer')).not.toThrow()
  })

  it('RB11b — viewer can GET /api/lvm/overview', () => {
    expect(() => enforceReadAccess('/api/lvm/overview', 'GET', 'viewer')).not.toThrow()
  })

  it('RB11c — viewer can GET /api/lvm/cluster/inventory', () => {
    expect(() => enforceReadAccess('/api/lvm/cluster/inventory', 'GET', 'viewer')).not.toThrow()
  })

  it('RB20 — viewer cannot GET /api/admin/settings', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/settings', 'GET', 'viewer'))
  })

  it('RB21 — viewer cannot GET /api/admin/system-info', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/system-info', 'GET', 'viewer'))
  })

  it('RB22 — viewer cannot GET /api/admin/sans', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/sans', 'GET', 'viewer'))
  })

  it('RB23 — viewer cannot GET /api/admin/dependencies', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/dependencies', 'GET', 'viewer'))
  })

  it('RB24 — operator cannot GET /api/admin/settings', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/settings', 'GET', 'operator'))
  })

  it('RB25 — operator can GET /api/admin/sans', () => {
    expect(() => enforceReadAccess('/api/admin/sans', 'GET', 'operator')).not.toThrow()
  })

  it('RB26 — operator can GET /api/admin/dependencies', () => {
    expect(() => enforceReadAccess('/api/admin/dependencies', 'GET', 'operator')).not.toThrow()
  })

  it('RB27 — admin can GET /api/admin/settings', () => {
    expect(() => enforceReadAccess('/api/admin/settings', 'GET', 'admin')).not.toThrow()
  })

  it('RB28 — operator cannot GET /api/admin/cluster/probe (admin-only catch-all)', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/cluster/probe', 'GET', 'operator'))
  })

  it('RB30 — viewer can GET /api/context/selection', () => {
    expect(() => enforceReadAccess('/api/context/selection', 'GET', 'viewer')).not.toThrow()
  })

  it('RB31 — operator can GET /api/context/selection', () => {
    expect(() => enforceReadAccess('/api/context/selection', 'GET', 'operator')).not.toThrow()
  })

  it('RB32 — admin can HEAD /api/context/selection', () => {
    expect(() => enforceReadAccess('/api/context/selection', 'HEAD', 'admin')).not.toThrow()
  })

  it('RB33 — viewer cannot GET /api/admin/health (Batch 2D)', () => {
    expectForbidden(() => enforceReadAccess('/api/admin/health', 'GET', 'viewer'))
  })

  it('RB34 — operator can GET /api/admin/health (Batch 2D)', () => {
    expect(() => enforceReadAccess('/api/admin/health', 'GET', 'operator')).not.toThrow()
  })
})

describe('selection DTO allowlists (Batch 2A.1a)', () => {
  const forbiddenSanKeys = [
    'host',
    'port',
    'username',
    'authType',
    'keyFingerprint',
    'settings',
    'description',
    'driver',
    'createdAt',
    'updatedAt',
    'privateKey',
    'password',
    'encryptedKey',
    'encryptedPassword',
  ]

  it('SAN_SELECTION_DTO_KEYS excludes sensitive / credential-related names', () => {
    const allowed = new Set<string>(SAN_SELECTION_DTO_KEYS as readonly string[])
    for (const k of forbiddenSanKeys) {
      expect(allowed.has(k)).toBe(false)
    }
  })

  it('CLUSTER_NODE_SELECTION_DTO_KEYS excludes host and other admin-only node fields', () => {
    const allowed = new Set<string>(CLUSTER_NODE_SELECTION_DTO_KEYS as readonly string[])
    expect(allowed.has('host')).toBe(false)
    expect(allowed.has('username')).toBe(false)
  })
})

describe('api-rbac (targets access-control read)', () => {
  it('RB-AC-01 — viewer can GET /api/targets/access-control', () => {
    expect(() =>
      enforceReadAccess('/api/targets/access-control', 'GET', 'viewer'),
    ).not.toThrow()
  })
})

describe('api-rbac (upgrade assistant)', () => {
  it('RBUP-01 — operator can GET upgrade readiness', () => {
    expect(() =>
      enforceReadAccess('/api/admin/upgrade/readiness', 'GET', 'operator'),
    ).not.toThrow()
  })

  it('RBUP-02 — operator can GET upgrade plan by id', () => {
    expect(() =>
      enforceReadAccess('/api/admin/upgrade/plan/abc-123', 'GET', 'operator'),
    ).not.toThrow()
  })

  it('RBUP-03 — operator cannot POST upgrade package upload', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/admin/upgrade/package/upload', 'POST', 'operator'),
    )
  })

  it('RBUP-04 — operator cannot POST upgrade plan', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/admin/upgrade/plan', 'POST', 'operator'),
    )
  })

  it('RBUP-05 — admin can POST upgrade plan', () => {
    expect(() =>
      enforceMutationAccess('/api/admin/upgrade/plan', 'POST', 'admin'),
    ).not.toThrow()
  })

  it('RBUP-06 — admin can DELETE upgrade package', () => {
    expect(() =>
      enforceMutationAccess('/api/admin/upgrade/package', 'DELETE', 'admin'),
    ).not.toThrow()
  })
})
