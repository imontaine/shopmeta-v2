// src/lib/skills-sync.ts
// Syncs bundled skills from the skills/ folder into PostgreSQL.
// Called at deployment startup (docker-entrypoint.sh) or via `pnpm db:seed-skills`.
//
// Idempotent: existing bundled skills are updated, new ones inserted,
// stale ones (no longer on disk) are deleted.

import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { getDb } from '#/lib/db/index'
import { skills } from '#/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { parseSkillMarkdown } from '#/lib/skills'

const SKILLS_DIR = join(process.cwd(), 'skills')
// Default org for bundled skills — all orgs see bundled skills via this sentinel
const BUNDLED_ORG = '*'

export async function syncBundledSkills(): Promise<{ synced: number; removed: number }> {
  const db = getDb()
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true }).catch(() => [])
  const skillDirs = entries.filter((e) => e.isDirectory())

  const syncedSlugs = new Set<string>()

  for (const dir of skillDirs) {
    const slug = dir.name
    const skillMdPath = join(SKILLS_DIR, slug, 'SKILL.md')

    let skillMd: string
    try {
      skillMd = await readFile(skillMdPath, 'utf-8')
    } catch {
      continue // Skip folders without SKILL.md
    }

    // Parse main SKILL.md
    const { body: mainBody, metadata } = parseSkillMarkdown(skillMd)

    // Concatenate rules/*.md files (if rules/ directory exists)
    let fullBody = mainBody
    const rulesDir = join(SKILLS_DIR, slug, 'rules')
    const ruleEntries = await readdir(rulesDir).catch(() => [] as string[])
    const mdFiles = (Array.isArray(ruleEntries) ? ruleEntries : [])
      .filter((f: string) => f.endsWith('.md') && !f.startsWith('_'))
      .sort()

    for (const ruleFile of mdFiles) {
      const ruleContent = await readFile(join(rulesDir, ruleFile), 'utf-8')
      fullBody += `\n\n---\n\n### ${basename(ruleFile, '.md')}\n\n${ruleContent}`
    }

    // Upsert: insert or update by (orgId, slug)
    const existing = await db
      .select({ id: skills.id })
      .from(skills)
      .where(and(eq(skills.orgId, BUNDLED_ORG), eq(skills.slug, slug)))

    if (existing.length > 0) {
      await db
        .update(skills)
        .set({
          name: metadata.name || slug,
          description: metadata.description || null,
          body: fullBody,
          alwaysApply: metadata.alwaysApply,
          source: 'bundled',
          updatedAt: new Date(),
        })
        .where(eq(skills.id, existing[0]!.id))
    } else {
      await db.insert(skills).values({
        orgId: BUNDLED_ORG,
        slug,
        name: metadata.name || slug,
        description: metadata.description || null,
        body: fullBody,
        source: 'bundled',
        alwaysApply: metadata.alwaysApply,
      })
    }

    syncedSlugs.add(slug)
  }

  // Remove stale bundled skills (on disk deleted but still in DB)
  const allBundled = await db
    .select({ id: skills.id, slug: skills.slug })
    .from(skills)
    .where(and(eq(skills.orgId, BUNDLED_ORG), eq(skills.source, 'bundled')))
  let removed = 0
  for (const row of allBundled) {
    if (!syncedSlugs.has(row.slug)) {
      await db.delete(skills).where(eq(skills.id, row.id))
      removed++
    }
  }

  return { synced: syncedSlugs.size, removed }
}

// Allow direct execution: pnpm db:seed-skills
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('skills-sync.ts') || process.argv[1].endsWith('skills-sync.js'))

if (isDirectExecution) {
  syncBundledSkills()
    .then((r) => console.log(`[seed-skills] Synced ${r.synced}, removed ${r.removed}`))
    .catch((e) => {
      console.error('[seed-skills] Failed:', e)
      process.exit(1)
    })
}
