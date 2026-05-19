import type { InjectionKey } from 'vue'
import type { PreflightBlockerRef } from '~/types/raid'

export type RaidDetectionNavigateFn = (ref: PreflightBlockerRef) => void

export const raidDetectionNavigateKey: InjectionKey<RaidDetectionNavigateFn> = Symbol('raidDetectionNavigate')
