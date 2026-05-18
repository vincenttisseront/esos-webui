/**
 * Batch 2C — tests for remote config path allowlist and system-config input safety.
 */
import { describe, it, expect } from 'vitest'
import {
  ALLOWED_REMOTE_CONFIG_PATHS,
  assertAllowedRemoteConfigPath,
  shellSingleQuoteForRemote,
  validateLinuxIfname,
  validateNtpServerHost,
  validateSafeSmtpEmail,
  validateSearchDomain,
} from '../server/utils/remote-config-paths'

describe('assertAllowedRemoteConfigPath', () => {
  it('accepts all known system-config paths', () => {
    for (const p of ALLOWED_REMOTE_CONFIG_PATHS) {
      expect(() => assertAllowedRemoteConfigPath(p)).not.toThrow()
    }
  })

  it('rejects traversal and unknown paths', () => {
    expect(() => assertAllowedRemoteConfigPath('/etc/network.conf/../passwd')).toThrow()
    expect(() => assertAllowedRemoteConfigPath('/etc/passwd')).toThrow()
    expect(() => assertAllowedRemoteConfigPath('/etc/network.conf ')).toThrow()
    expect(() => assertAllowedRemoteConfigPath('')).toThrow()
  })
})

describe('validateSafeSmtpEmail', () => {
  it('accepts normal addresses', () => {
    expect(validateSafeSmtpEmail('admin@example.com')).toBeNull()
    expect(validateSafeSmtpEmail('a+b@sub.example.co.uk')).toBeNull()
  })

  it('rejects shell injection payloads', () => {
    expect(validateSafeSmtpEmail('root@x; rm -rf /')).not.toBeNull()
    expect(validateSafeSmtpEmail('$(whoami)@x.com')).not.toBeNull()
    expect(validateSafeSmtpEmail('a@b\ncc:evil')).not.toBeNull()
  })
})

describe('validateNtpServerHost', () => {
  it('accepts IPv4 and hostnames', () => {
    expect(validateNtpServerHost('0.pool.ntp.org')).toBeNull()
    expect(validateNtpServerHost('192.168.1.1')).toBeNull()
  })

  it('rejects shell metacharacters', () => {
    expect(validateNtpServerHost('pool.ntp.org; reboot')).not.toBeNull()
    expect(validateNtpServerHost('$(id)')).not.toBeNull()
  })
})

describe('validateLinuxIfname / validateSearchDomain', () => {
  it('accepts typical interface names', () => {
    expect(validateLinuxIfname('eth0')).toBeNull()
    expect(validateLinuxIfname('enp0s3')).toBeNull()
    expect(validateLinuxIfname('bond0.100')).toBeNull()
  })

  it('rejects injection in ifname', () => {
    expect(validateLinuxIfname('eth0;evil')).not.toBeNull()
    expect(validateLinuxIfname('a'.repeat(16))).not.toBeNull()
  })

  it('accepts empty or normal search domains', () => {
    expect(validateSearchDomain('')).toBeNull()
    expect(validateSearchDomain('corp.example.com')).toBeNull()
  })

  it('rejects injection in search domain', () => {
    expect(validateSearchDomain('corp;rm -rf')).not.toBeNull()
    expect(validateSearchDomain('$(id)')).not.toBeNull()
  })
})

describe('shellSingleQuoteForRemote', () => {
  it('wraps and escapes embedded single quotes', () => {
    expect(shellSingleQuoteForRemote("a'b")).toBe("'a'\\''b'")
  })
})
