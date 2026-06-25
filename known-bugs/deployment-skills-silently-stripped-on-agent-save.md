# Deployment Skills Silently Stripped on Agent Save

| Field         | Value                                      |
|---------------|--------------------------------------------|
| **Version**   | LibreChat v0.8.7-rc1 (`055585f`)           |
| **Severity**  | High — blocks all deployment-skill usage   |
| **Status**    | Workaround applied                         |
| **Found**     | 2026-06-24                                 |
| **PR Ref**    | [#12823](https://github.com/danny-avila/LibreChat/pull/12823) introduced the validation |

---

## Symptom

When editing an agent in the Agent Builder and attaching a **deployment skill** (loaded from `DEPLOYMENT_SKILLS_DIR`), the API silently drops the skill and disables the feature:

**Request payload:**
```json
{
  "skills": ["e8a19b8e4262a5640fde52f7"],
  "skills_enabled": true
}
```

**Response:**
```json
{
  "skills": [],
  "skills_enabled": false
}
```

No error is returned — the save succeeds but the skills are gone.

---

## Root Cause

Two systems disagree on where deployment skills live:

### 1. Deployment Skills are In-Memory Only

`packages/api/src/skills/deployment.ts` loads skills from the filesystem into an in-memory `DeploymentSkillRegistry`. The `_id` is **deterministic** — derived from a SHA-1 hash of the skill name:

```typescript
// deployment.ts:668
const skillId = stableObjectId(`deployment-skill:${name}`);

// deployment.ts:1053-1054
function stableObjectId(seed: string): Types.ObjectId {
  return new Types.ObjectId(
    crypto.createHash('sha1').update(seed).digest('hex').slice(0, 24)
  );
}
```

For `clickhouse-best-practices`:
```
sha1("deployment-skill:clickhouse-best-practices").slice(0, 24)
= "e8a19b8e4262a5640fde52f7"
```

These skills are **never written to MongoDB** — they exist only in the Node.js process memory.

### 2. Agent Save Validates Against MongoDB Only

`packages/data-schemas/src/methods/agent.ts` (lines 459-469) validates skill IDs during agent updates:

```typescript
// agent.ts:459-469
if (Array.isArray(directUpdates.skills) && directUpdates.skills.length > 0) {
  const prunedSkills = await filterExistingSkillIds(
    mongoose,
    directUpdates.skills as string[],
  );
  directUpdates.skills = prunedSkills;
  updateData.skills = prunedSkills;
  if (prunedSkills.length === 0) {
    directUpdates.skills_enabled = false;   // ← forced off
    updateData.skills_enabled = false;
  }
}
```

`filterExistingSkillIds` (`packages/data-schemas/src/methods/skill.ts:848-864`) queries **only** the MongoDB `Skill` collection:

```typescript
export async function filterExistingSkillIds(
  mongoose: typeof import('mongoose'),
  skillIds: string[],
): Promise<string[]> {
  const candidates = [
    ...new Set(skillIds.filter(isValidObjectIdString).map(id => id.toLowerCase())),
  ];
  if (candidates.length === 0) return [];
  const Skill = mongoose.models.Skill;
  const docs = await Skill.find(
    { _id: { $in: candidates.map(id => new ObjectId(id)) } },
    { _id: 1 },
  ).lean();
  const existing = new Set(docs.map(doc => doc._id.toString()));
  return candidates.filter(id => existing.has(id));
}
```

Since deployment skills don't exist in MongoDB, `filterExistingSkillIds` returns `[]`, and the agent save forces `skills_enabled = false`.

### The Gap

`filterExistingSkillIds` does **not** consult the `DeploymentSkillRegistry`. The `data-schemas` package (where this function lives) has no dependency on the `api` package (where the registry lives), so the in-memory deployment skills are invisible to the validation layer.

---

## Affected Flows

- Creating an agent with deployment skills attached
- Updating an existing agent to add deployment skills
- Reverting an agent version that had deployment skills (`agent.ts:949-955`)

---

## Workaround

Insert a stub `Skill` document into MongoDB so `filterExistingSkillIds` finds it.

### Option A: `skill-seed` Init Container (what we use)

Added a `skill-seed` service to `docker-compose.yml` that runs after `skill-init`:

```yaml
skill-seed:
  image: mongo:7
  container_name: librechat-skill-seed
  depends_on:
    skill-init:
      condition: service_completed_successfully
  networks:
    - librechat_default
  entrypoint: /bin/sh
  command:
    - -c
    - |
      mongosh mongodb://librechat-mongodb:27017/LibreChat --eval '
        var skillId = ObjectId("e8a19b8e4262a5640fde52f7");
        var existing = db.skills.findOne({ _id: skillId });
        if (!existing) {
          db.skills.insertOne({
            _id: skillId,
            name: "clickhouse-best-practices",
            description: "MUST USE when reviewing ClickHouse schemas, queries, or configurations.",
            body: "",
            frontmatter: {},
            category: "",
            author: ObjectId("de9100000000000000000000"),
            authorName: "Deployment",
            version: 1,
            source: "deployment",
            sourceMetadata: { deployment: true },
            fileCount: 0,
            alwaysApply: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          print("Skill seeded in MongoDB");
        } else {
          print("Skill already exists in MongoDB");
        }
      '
```

### Option B: One-Shot Mongosh (alternative)

```bash
mongosh mongodb://localhost:27017/LibreChat --eval '
  db.skills.insertOne({
    _id: ObjectId("e8a19b8e4262a5640fde52f7"),
    name: "clickhouse-best-practices",
    description: "Deployment skill stub",
    body: "", frontmatter: {}, category: "",
    author: ObjectId("de9100000000000000000000"),
    authorName: "Deployment", version: 1,
    source: "deployment",
    sourceMetadata: { deployment: true },
    fileCount: 0, alwaysApply: false,
    createdAt: new Date(), updatedAt: new Date()
  });
'
```

### Computing IDs for Other Deployment Skills

```javascript
const crypto = require('crypto');
const name = 'your-skill-name';
const id = crypto.createHash('sha1')
  .update(`deployment-skill:${name}`)
  .digest('hex')
  .slice(0, 24);
console.log(id); // Use as ObjectId in the seed
```

---

## Proper Fix (upstream)

`filterExistingSkillIds` should also check the `DeploymentSkillRegistry`:

```typescript
export async function filterExistingSkillIds(
  mongoose: typeof import('mongoose'),
  skillIds: string[],
  deploymentRegistry?: { hasId(id: string): boolean },
): Promise<string[]> {
  const candidates = [
    ...new Set(skillIds.filter(isValidObjectIdString).map(id => id.toLowerCase())),
  ];
  if (candidates.length === 0) return [];

  // Check deployment registry first (in-memory)
  const deploymentIds = deploymentRegistry
    ? candidates.filter(id => deploymentRegistry.hasId(id))
    : [];
  const remaining = candidates.filter(id => !deploymentIds.includes(id));

  // Check MongoDB for the rest
  const Skill = mongoose.models.Skill;
  const docs = remaining.length > 0
    ? await Skill.find({ _id: { $in: remaining.map(id => new ObjectId(id)) } }, { _id: 1 }).lean()
    : [];
  const dbIds = new Set(docs.map(doc => doc._id.toString()));

  return candidates.filter(id => deploymentIds.includes(id) || dbIds.has(id));
}
```

This requires threading the registry through the `data-schemas` → `api` boundary, likely via dependency injection similar to how `AgentDeps` works.
