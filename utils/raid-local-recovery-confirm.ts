/** Client-side confirmation phrases for local MD recovery (must match server). */

export function sanitizeNodeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ')
}

export function expectedLocalCleanupConfirmation(nodeLabel: string): string {
  return `CLEAN LOCAL NODE ${sanitizeNodeLabel(nodeLabel)}`
}

export function expectedLocalStopConfirmation(nodeLabel: string): string {
  return `STOP LOCAL NODE ${sanitizeNodeLabel(nodeLabel)}`
}
