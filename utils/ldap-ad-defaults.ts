/** Re-export AD defaults for client-side admin UI (Vitest-safe). */
export {
  domainRootDnFromDn,
  domainRootDnFromUrl,
  suggestUpnBindFromDn,
  suggestNetbiosBindFromDn,
  ldapAdRecommendedDefaults,
  ldapAdFullPreset,
  type LdapAdRecommendedDefaults,
  type LdapAdFullPreset,
} from '../server/utils/ldap-ad-defaults'
