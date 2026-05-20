import { createError } from 'h3'
import type { SSHSessionManager } from './ssh-session-manager'
import {
  expectedBindScstConfirmation,
  expectedLvCreateConfirmation,
  expectedLvRemoveConfirmation,
  expectedPvCreateConfirmation,
  expectedPvRemoveConfirmation,
  expectedVgCreateConfirmation,
  expectedVgRemoveConfirmation,
} from './lvm-validation'

function shellQuote(arg: string): string {
  if (/^[a-zA-Z0-9_./:@+-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

export async function runPvCreate(
  manager: SSHSessionManager,
  path: string,
  force: boolean,
): Promise<{ stdout: string; stderr: string }> {
  const args = ['pvcreate', '-y', '-v']
  if (force) args.push('--force')
  args.push(path)
  return manager.exec(args.map(shellQuote).join(' '), 60_000)
}

export async function runVgCreate(
  manager: SSHSessionManager,
  name: string,
  pvPaths: string[],
): Promise<{ stdout: string; stderr: string }> {
  const cmd = ['vgcreate', '-v', name, ...pvPaths].map(shellQuote).join(' ')
  return manager.exec(cmd, 60_000)
}

export async function runLvCreate(
  manager: SSHSessionManager,
  vgName: string,
  lvName: string,
  sizeBytes: number,
): Promise<{ stdout: string; stderr: string }> {
  const cmd = [
    'lvcreate',
    '-y',
    '-v',
    '-L', String(sizeBytes),
    '-n', lvName,
    vgName,
  ].map(shellQuote).join(' ')
  return manager.exec(cmd, 120_000)
}

export async function runPvRemove(manager: SSHSessionManager, path: string) {
  return manager.exec(['pvremove', '-y', '-f', path].map(shellQuote).join(' '), 60_000)
}

export async function runVgRemove(manager: SSHSessionManager, name: string) {
  return manager.exec(['vgremove', '-y', '-f', name].map(shellQuote).join(' '), 60_000)
}

export async function runLvRemove(manager: SSHSessionManager, vgName: string, lvName: string) {
  return manager.exec(['lvremove', '-y', '-f', `${vgName}/${lvName}`].map(shellQuote).join(' '), 60_000)
}

export function buildPvCreatePreview(path: string, force: boolean): string {
  return force ? `pvcreate -y -v --force ${path}` : `pvcreate -y -v ${path}`
}

export function buildVgCreatePreview(name: string, pvPaths: string[]): string {
  return `vgcreate -v ${name} ${pvPaths.join(' ')}`
}

export function buildLvCreatePreview(vgName: string, lvName: string, sizeBytes: number): string {
  return `lvcreate -y -v -L ${sizeBytes} -n ${lvName} ${vgName}`
}

export function assertConfirmation(expected: string, actual: string): void {
  if (actual.trim() !== expected) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation requise : ${expected}`,
    })
  }
}

export {
  expectedPvCreateConfirmation,
  expectedVgCreateConfirmation,
  expectedLvCreateConfirmation,
  expectedPvRemoveConfirmation,
  expectedVgRemoveConfirmation,
  expectedLvRemoveConfirmation,
  expectedBindScstConfirmation,
}
