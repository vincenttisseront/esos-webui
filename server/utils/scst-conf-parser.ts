import type {
  ScstConfig,
  Handler,
  Device,
  Driver,
  Target,
  Group,
  Lun,
} from '~/types/esos'

/**
 * Parser for `/etc/scst.conf` (cf. SDD v1.2 §7).
 *
 * Strategy: nested-block state machine. The stack tracks the current
 * lexical scope. A line ending with `{` opens a new block (push); a line
 * containing only `}` closes one (pop).
 */

type ParserContext =
  | { level: 0 }
  | { level: 1; type: 'handler'; handler: Handler }
  | { level: 1; type: 'driver'; driver: Driver }
  | { level: 2; type: 'device'; handler: Handler; device: Device }
  | { level: 2; type: 'target'; driver: Driver; target: Target }
  | { level: 3; type: 'group'; driver: Driver; target: Target; group: Group }
  | { level: 3; type: 'lun_attrs'; lun: Lun }

function unquote(value: string): string {
  return value.replace(/^"(.*)"$/, '$1')
}

export class ScstConfParseError extends Error {
  constructor(message: string, public readonly line?: number) {
    super(message)
    this.name = 'ScstConfParseError'
  }
}

export function parseScstConf(raw: string): ScstConfig {
  const config: ScstConfig = { handlers: [], drivers: [] }
  const stack: ParserContext[] = [{ level: 0 }]

  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line || line.startsWith('#')) continue

    if (line === '}') {
      if (stack.length > 1) stack.pop()
      continue
    }

    const ctx = stack[stack.length - 1]
    const opensBlock = line.endsWith('{')

    switch (ctx.level) {
      case 0: {
        const handlerMatch = line.match(/^HANDLER\s+(\S+)\s*\{?$/)
        if (handlerMatch) {
          const handler: Handler = { name: handlerMatch[1], devices: [] }
          config.handlers.push(handler)
          if (opensBlock) {
            stack.push({ level: 1, type: 'handler', handler })
          }
          break
        }
        const driverMatch = line.match(/^TARGET_DRIVER\s+(\S+)\s*\{?$/)
        if (driverMatch) {
          const driver: Driver = {
            name: driverMatch[1],
            enabled: true,
            targets: [],
          }
          config.drivers.push(driver)
          if (opensBlock) {
            stack.push({ level: 1, type: 'driver', driver })
          }
          break
        }
        // Other top-level scalars (setup_id, ...) are ignored.
        break
      }

      case 1: {
        if (ctx.type === 'handler') {
          const deviceMatch = line.match(/^DEVICE\s+(\S+)\s*\{?$/)
          if (deviceMatch) {
            const device: Device = {
              name: deviceMatch[1],
              handler: ctx.handler.name,
              filename: '',
              attrs: {},
            }
            ctx.handler.devices.push(device)
            if (opensBlock) {
              stack.push({ level: 2, type: 'device', handler: ctx.handler, device })
            }
            break
          }
          break
        }

        if (ctx.type === 'driver') {
          // Driver-level `enabled 0/1` (rev.1 D5).
          const enabledMatch = line.match(/^enabled\s+(\d)$/)
          if (enabledMatch) {
            ctx.driver.enabled = enabledMatch[1] === '1'
            break
          }

          const targetMatch = line.match(/^TARGET\s+(\S+)\s*\{?$/)
          if (targetMatch) {
            const target: Target = {
              name: targetMatch[1],
              driver: ctx.driver.name,
              enabled: true,
              hwTarget: false,
              attrs: {},
              groups: [],
              luns: [],
              sessions: [],
            }
            ctx.driver.targets.push(target)
            if (opensBlock) {
              stack.push({ level: 2, type: 'target', driver: ctx.driver, target })
            }
            break
          }
        }
        break
      }

      case 2: {
        if (ctx.type === 'device') {
          const attrMatch = line.match(/^(\S+)\s+(.+)$/)
          if (attrMatch) {
            const key = attrMatch[1]
            const value = unquote(attrMatch[2].trim())
            if (key === 'filename') ctx.device.filename = value
            else ctx.device.attrs[key] = value
          }
          break
        }

        if (ctx.type === 'target') {
          // `HW_TARGET` — flag without value (rev.1 D2).
          if (line === 'HW_TARGET') {
            ctx.target.hwTarget = true
            break
          }

          const enabledMatch = line.match(/^enabled\s+(\d)$/)
          if (enabledMatch) {
            ctx.target.enabled = enabledMatch[1] === '1'
            break
          }

          const groupMatch = line.match(/^GROUP\s+(\S+)\s*\{?$/)
          if (groupMatch) {
            const group: Group = {
              name: groupMatch[1],
              initiators: [],
              luns: [],
            }
            ctx.target.groups.push(group)
            if (opensBlock) {
              stack.push({
                level: 3,
                type: 'group',
                driver: ctx.driver,
                target: ctx.target,
                group,
              })
            }
            break
          }

          // LUN directly under target — no group (rev.1 D4, e.g. copy_manager).
          const lunMatch = line.match(/^LUN\s+(\d+)\s+(\S+)\s*\{?$/)
          if (lunMatch) {
            const lun: Lun = {
              id: Number.parseInt(lunMatch[1], 10),
              device: lunMatch[2],
              readOnly: false,
              attrs: {},
            }
            ctx.target.luns.push(lun)
            if (opensBlock) {
              stack.push({ level: 3, type: 'lun_attrs', lun })
            }
            break
          }

          // Generic target attributes — `rel_tgt_id`, etc. (rev.1 D3).
          const attrMatch = line.match(/^(\S+)\s+(.+)$/)
          if (attrMatch) {
            ctx.target.attrs[attrMatch[1]] = unquote(attrMatch[2].trim())
          }
          break
        }
        break
      }

      case 3: {
        if (ctx.type === 'group') {
          const initMatch = line.match(/^INITIATOR\s+(\S+)$/)
          if (initMatch) {
            ctx.group.initiators.push(initMatch[1])
            break
          }

          const lunMatch = line.match(/^LUN\s+(\d+)\s+(\S+)\s*\{?$/)
          if (lunMatch) {
            const lun: Lun = {
              id: Number.parseInt(lunMatch[1], 10),
              device: lunMatch[2],
              readOnly: false,
              attrs: {},
            }
            ctx.group.luns.push(lun)
            if (opensBlock) {
              stack.push({ level: 3, type: 'lun_attrs', lun })
            }
            break
          }
          break
        }

        if (ctx.type === 'lun_attrs') {
          if (/^read_only\s+1$/.test(line)) {
            ctx.lun.readOnly = true
            break
          }
          const attrMatch = line.match(/^(\S+)\s+(.+)$/)
          if (attrMatch) {
            ctx.lun.attrs[attrMatch[1]] = unquote(attrMatch[2].trim())
          }
          break
        }
        break
      }
    }
  }

  return config
}

/**
 * Tolerant wrapper used by the readers (cf. SDD v1.2 §13).
 */
export function parseScstConfSafe(raw: string): ScstConfig {
  if (!raw || raw.trim().length === 0) {
    return { handlers: [], drivers: [] }
  }
  try {
    return parseScstConf(raw)
  } catch (err) {
    throw new ScstConfParseError(
      `Failed to parse scst.conf: ${(err as Error).message}`,
    )
  }
}
