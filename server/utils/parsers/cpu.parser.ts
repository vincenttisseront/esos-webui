import type { CPUInfo } from '../types'

export function parseLSCPU(output: string): Partial<CPUInfo> {
  const kv = new Map<string, string>()
  for (const line of output.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    kv.set(line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim())
  }

  return {
    modelName:      kv.get('Model name')                ?? 'Unknown',
    architecture:   kv.get('Architecture')              ?? 'Unknown',
    physicalCores:  parseInt(kv.get('Core(s) per socket') ?? '1', 10) * parseInt(kv.get('Socket(s)') ?? '1', 10),
    logicalCores:   parseInt(kv.get('CPU(s)')           ?? '1', 10),
    sockets:        parseInt(kv.get('Socket(s)')        ?? '1', 10),
    coresPerSocket: parseInt(kv.get('Core(s) per socket') ?? '1', 10),
    threadsPerCore: parseInt(kv.get('Thread(s) per core') ?? '1', 10),
    maxMhz:         parseFloat(kv.get('CPU max MHz')    ?? '0'),
    minMhz:         parseFloat(kv.get('CPU min MHz')    ?? '0'),
    l1dCache:       kv.get('L1d cache')                 ?? '',
    l1iCache:       kv.get('L1i cache')                 ?? '',
    l2Cache:        kv.get('L2 cache')                  ?? '',
    l3Cache:        kv.get('L3 cache')                  ?? '',
    numaNodes:      parseInt(kv.get('NUMA node(s)')     ?? '1', 10),
    flags:          (kv.get('Flags') ?? '').split(' ').filter(Boolean),
    currentMhz:     [],
    usagePct:       0,
  }
}
