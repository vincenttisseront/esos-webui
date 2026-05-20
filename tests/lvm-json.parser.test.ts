import { describe, expect, it } from 'vitest'
import { parseLvsJson, parsePvsJson, parseVgsJson } from '../server/utils/parsers/lvm-json.parser'

const PVS_SAMPLE = `{
  "report": [{ "pv": [{
    "pv_name": "/dev/md0",
    "vg_name": "vg0",
    "pv_size": "1000000000",
    "pv_free": "500000000",
    "pv_uuid": "pv-uuid-1",
    "dev_size": "1000000000",
    "pv_attr": "a--"
  }]}]
}`

const VGS_SAMPLE = `{
  "report": [{ "vg": [{
    "vg_name": "vg0",
    "vg_uuid": "vg-uuid-1",
    "vg_size": "1000000000",
    "vg_free": "500000000",
    "pv_count": "1",
    "lv_count": "1",
    "vg_attr": "wz--n-",
    "vg_clustered": "no"
  }]}]
}`

const LVS_SAMPLE = `{
  "report": [{ "lv": [{
    "lv_name": "lv_data",
    "lv_path": "/dev/vg0/lv_data",
    "vg_name": "vg0",
    "lv_size": "500000000",
    "lv_uuid": "lv-uuid-1",
    "lv_attr": "-wi-ao----"
  }]}]
}`

describe('lvm-json.parser', () => {
  it('parses pvs json', () => {
    const rows = parsePvsJson(PVS_SAMPLE)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.path).toBe('/dev/md0')
    expect(rows[0]?.vgName).toBe('vg0')
    expect(rows[0]?.sizeBytes).toBe(1_000_000_000)
  })

  it('parses vgs json', () => {
    const rows = parseVgsJson(VGS_SAMPLE)
    expect(rows[0]?.name).toBe('vg0')
    expect(rows[0]?.clustered).toBe(false)
  })

  it('parses lvs json with active attr', () => {
    const rows = parseLvsJson(LVS_SAMPLE)
    expect(rows[0]?.path).toBe('/dev/vg0/lv_data')
    expect(rows[0]?.active).toBe(true)
  })

  it('parses lvs when lv_name is vg/lv and vg_name empty', () => {
    const json = `{
      "report": [{ "lv": [{
        "lv_name": "data/photos",
        "lv_path": "/dev/data/photos",
        "lv_size": "10737418240",
        "lv_uuid": "u1",
        "lv_attr": "-wi-a-----"
      }]}]
    }`
    const rows = parseLvsJson(json)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.vgName).toBe('data')
    expect(rows[0]?.name).toBe('photos')
    expect(rows[0]?.path).toBe('/dev/data/photos')
  })

  it('parses lvs from lv_full_name', () => {
    const json = `{
      "report": [{ "lv": [{
        "lv_full_name": "data/photos",
        "lv_path": "/dev/data/photos",
        "lv_size": "10737418240",
        "lv_uuid": "u1",
        "lv_attr": "-wi-a-----"
      }]}]
    }`
    const rows = parseLvsJson(json)
    expect(rows[0]?.vgName).toBe('data')
    expect(rows[0]?.name).toBe('photos')
  })

  it('returns empty on invalid json', () => {
    expect(parsePvsJson('not json')).toEqual([])
  })
})
