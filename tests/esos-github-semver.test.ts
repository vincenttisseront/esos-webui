import { describe, it, expect } from 'vitest'
import {
  filterSemverTags,
  sortSemverTagsDesc,
  pickLatestSemverTag,
  isSemverTagName,
} from '../server/utils/esos-github'
import type { GitHubTag } from '../server/utils/types'

function tag(name: string): GitHubTag {
  return {
    name,
    commit: { sha: 'abc', url: 'https://example.com' },
    tarballUrl: '',
    zipballUrl: '',
    downloadUrl: `https://example.com/${name}.zip`,
  }
}

describe('esos-github semver tags', () => {
  it('isSemverTagName accepts plain semver and strips v prefix via cleanTagName in filter', () => {
    expect(isSemverTagName('4.4.1')).toBe(true)
    expect(isSemverTagName('master_abc_opts')).toBe(false)
    expect(isSemverTagName('v4.4.0')).toBe(true)
  })

  it('filterSemverTags ignores master and non-semver tags', () => {
    const tags = [
      tag('4.4.0'),
      tag('master_deadbeef_opts'),
      tag('4.3.5'),
      tag('not-a-version'),
      tag('4.4.1'),
    ]
    const filtered = filterSemverTags(tags)
    expect(filtered.map(t => t.name).sort()).toEqual(['4.3.5', '4.4.0', '4.4.1'])
  })

  it('pickLatestSemverTag returns highest semver', () => {
    const tags = [tag('4.4.0'), tag('4.3.5'), tag('4.4.1'), tag('master_x')]
    expect(pickLatestSemverTag(tags)?.name).toBe('4.4.1')
  })

  it('sortSemverTagsDesc orders descending', () => {
    const sorted = sortSemverTagsDesc([tag('4.4.0'), tag('4.4.1'), tag('4.3.5')])
    expect(sorted.map(t => t.name)).toEqual(['4.4.1', '4.4.0', '4.3.5'])
  })
})
