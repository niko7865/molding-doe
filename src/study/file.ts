import { SCHEMA_VERSION, studySchema, type Study } from './schema'

export const FILE_EXTENSION = '.doe.json'

/**
 * Upgrades a raw study object from version n to n + 1, keyed by n.
 * Add an entry here whenever SCHEMA_VERSION is bumped; never edit an existing one.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {}

export class StudyFileError extends Error {}

export function serializeStudy(study: Study): string {
  return JSON.stringify(study, null, 2)
}

export function parseStudy(text: string): Study {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new StudyFileError('This file is not valid JSON, so it is not a study file.')
  }
  if (typeof raw !== 'object' || raw === null || typeof (raw as { schemaVersion?: unknown }).schemaVersion !== 'number') {
    throw new StudyFileError('This file has no schema version, so it is not a study file.')
  }
  let obj = raw as Record<string, unknown>
  let version = obj.schemaVersion as number
  if (version > SCHEMA_VERSION) {
    throw new StudyFileError(
      `This study was saved by a newer version of the app (format ${version}). Reload the page to update, then open it again.`,
    )
  }
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version]
    if (!migrate) throw new StudyFileError(`No upgrade path from study format ${version}.`)
    obj = { ...migrate(obj), schemaVersion: version + 1 }
    version++
  }
  const result = studySchema.safeParse(obj)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new StudyFileError(`The study file is damaged: ${issue.path.join('.') || 'root'}: ${issue.message}`)
  }
  return result.data
}

/** A filesystem-safe name for saving, e.g. "Housing DOE.doe.json". */
export function studyFileName(study: Study): string {
  const base = study.name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'study'
  return base + FILE_EXTENSION
}
