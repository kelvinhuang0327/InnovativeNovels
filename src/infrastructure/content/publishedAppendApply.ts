import { randomBytes } from 'node:crypto'
import {
  open,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import type { ContentBookFixtureV1 } from '../../domain/catalog/contentBookFixture'
import {
  createPublishedBookSnapshot,
  fingerprintPublishedBook,
  parsePublishedAppendCandidate,
  serializeProductionFixture,
  type PublishedAppendCandidate,
  type PublishedBookSnapshot,
} from '../../domain/authoring/publishedAppendCandidate'
import {
  loadCatalogContent,
  type LoadedCatalogContent,
} from './catalogContentLoader'
import {
  parseContentBookFixture,
  type ParsedContentBook,
} from './catalogContentContract'

export type PublishedAppendApplyMode = 'dry-run' | 'apply'

export type PublishedAppendApplyErrorCode =
  | 'MALFORMED_CANDIDATE'
  | 'TARGET_OUTSIDE_ROOT'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_NOT_UNIQUE'
  | 'TARGET_MISMATCH'
  | 'TARGET_CATALOG_INVALID'
  | 'BASE_FINGERPRINT_MISSING'
  | 'BASE_CHANGED'
  | 'BASE_CONTENT_MISMATCH'
  | 'CANDIDATE_PREVIEW_MISMATCH'
  | 'NO_APPENDED_CHAPTERS'
  | 'APPEND_SEQUENCE_INVALID'
  | 'CHAPTER_ID_COLLISION'
  | 'INVALID_APPENDED_CHAPTER'
  | 'PRODUCTION_VALIDATION_FAILED'
  | 'ATOMIC_REPLACE_FAILED'
  | 'POST_APPLY_VERIFICATION_FAILED'

export interface PublishedAppendApplySuccess {
  readonly ok: true
  readonly mode: PublishedAppendApplyMode
  readonly targetFixturePath: string
  readonly targetBookId: string
  readonly currentBaseFingerprint: string
  readonly appendedSequences: readonly number[]
  readonly resultingChapterCount: number
  readonly validation: 'PASS'
  readonly applyAllowed: true
  readonly filesystemMutation: 'NONE' | 'ATOMIC_REPLACE'
}

export interface PublishedAppendApplyFailure {
  readonly ok: false
  readonly code: PublishedAppendApplyErrorCode
  readonly message: string
  readonly targetFixturePath: string
  readonly filesystemMutation: 'NONE' | 'UNKNOWN'
}

export type PublishedAppendApplyResult =
  | PublishedAppendApplySuccess
  | PublishedAppendApplyFailure

export type PublishedAppendFixtureValidator = (
  fixturePath: string,
  fixture: ContentBookFixtureV1,
) => void

export interface PublishedAppendApplyOptions {
  readonly candidateSerialized: string
  readonly fixtureRoot: string
  readonly targetFixturePath: string
  readonly mode: PublishedAppendApplyMode
  readonly validateProductionFixture?: PublishedAppendFixtureValidator
}

interface FixtureEntry {
  readonly fixturePath: string
  readonly raw: unknown
  readonly parsed: ParsedContentBook
}

interface AtomicReplaceSuccess {
  readonly ok: true
}

interface AtomicReplaceFailure {
  readonly ok: false
  readonly code:
    | 'BASE_CHANGED'
    | 'ATOMIC_REPLACE_FAILED'
    | 'POST_APPLY_VERIFICATION_FAILED'
  readonly message: string
  readonly filesystemMutation: 'NONE' | 'UNKNOWN'
}

type AtomicReplaceResult = AtomicReplaceSuccess | AtomicReplaceFailure

function failure(
  targetFixturePath: string,
  code: PublishedAppendApplyErrorCode,
  message: string,
  filesystemMutation: 'NONE' | 'UNKNOWN' = 'NONE',
): PublishedAppendApplyFailure {
  return { ok: false, code, message, targetFixturePath, filesystemMutation }
}

function isPathInsideRoot(root: string, target: string): boolean {
  const targetRelativePath = relative(root, target)
  return (
    targetRelativePath.length > 0 &&
    targetRelativePath !== '..' &&
    !targetRelativePath.startsWith(`..${sep}`) &&
    !isAbsolute(targetRelativePath)
  )
}

async function loadFixtureEntries(
  fixtureRoot: string,
): Promise<readonly FixtureEntry[]> {
  const entries = await readdir(fixtureRoot, { withFileTypes: true })
  const fixturePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(fixtureRoot, entry.name))
    .sort()

  return Promise.all(
    fixturePaths.map(async (fixturePath) => {
      const serialized = await readFile(fixturePath, 'utf8')
      const raw: unknown = JSON.parse(serialized)
      return {
        fixturePath,
        raw,
        parsed: parseContentBookFixture(fixturePath, raw),
      }
    }),
  )
}

function catalogModules(
  entries: readonly FixtureEntry[],
): Record<string, unknown> {
  return Object.fromEntries(
    entries.map((entry) => [`./books/${basename(entry.fixturePath)}`, entry.raw]),
  )
}

function snapshotFromParsedBook(
  parsed: ParsedContentBook,
): PublishedBookSnapshot {
  const proseByChapterId = new Map<string, readonly string[]>()
  const chapters = parsed.chapters.map(({ chapter, prose }) => {
    const chapterId = chapter.id as string
    if (prose) {
      proseByChapterId.set(chapterId, prose)
    }

    return {
      chapterId,
      sequence: chapter.sequence,
      title: chapter.title,
      access: chapter.access,
    }
  })
  const snapshot = createPublishedBookSnapshot(
    {
      book: {
        id: parsed.book.id as string,
        title: parsed.book.title,
        authorName: parsed.book.authorName,
        categoryLabel: parsed.book.categoryLabel,
      },
      catalogSequence: parsed.catalogSequence,
      description: parsed.description,
      chapters,
    },
    (chapterId) => proseByChapterId.get(chapterId),
  )

  if (!snapshot) {
    throw new Error('The validated production fixture could not become a snapshot.')
  }

  return snapshot
}

function previewBaseFixture(
  candidate: PublishedAppendCandidate,
): ContentBookFixtureV1 {
  return {
    ...candidate.updatedFixturePreview,
    chapters: candidate.updatedFixturePreview.chapters.slice(
      0,
      candidate.publishedChapterCount,
    ),
  }
}

function previewAppendMatchesCandidate(
  candidate: PublishedAppendCandidate,
): boolean {
  const previewTail = candidate.updatedFixturePreview.chapters.slice(
    candidate.publishedChapterCount,
  )
  const candidateTail = candidate.appendedChapters.map((chapter) => ({
    chapterId: chapter.chapterId,
    sequence: chapter.sequence,
    title: chapter.title,
    access: chapter.access,
    prose: [...chapter.prose],
  }))

  return JSON.stringify(previewTail) === JSON.stringify(candidateTail)
}

function hasValidAppendedChapterPayload(
  candidate: PublishedAppendCandidate,
): boolean {
  return candidate.appendedChapters.every(
    (chapter) =>
      chapter.access === CHAPTER_ACCESS.READABLE &&
      chapter.title.trim().length > 0 &&
      chapter.prose.length > 0 &&
      chapter.prose.every(
        (paragraph) =>
          typeof paragraph === 'string' && paragraph.trim().length > 0,
      ),
  )
}

function buildUpdatedFixture(
  liveFixture: ContentBookFixtureV1,
  candidate: PublishedAppendCandidate,
): ContentBookFixtureV1 {
  return {
    ...liveFixture,
    chapters: [
      ...liveFixture.chapters,
      ...candidate.appendedChapters.map((chapter) => ({
        chapterId: chapter.chapterId,
        sequence: chapter.sequence,
        title: chapter.title,
        access: chapter.access,
        prose: [...chapter.prose],
      })),
    ],
  }
}

async function atomicReplace(
  targetFixturePath: string,
  originalBytes: Buffer,
  replacement: string,
): Promise<AtomicReplaceResult> {
  const temporaryPath = join(
    dirname(targetFixturePath),
    `.${basename(targetFixturePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  )
  let renamed = false

  try {
    await writeFile(temporaryPath, replacement, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    const handle = await open(temporaryPath, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }

    const currentBytes = await readFile(targetFixturePath)
    if (!currentBytes.equals(originalBytes)) {
      await unlink(temporaryPath)
      return {
        ok: false,
        code: 'BASE_CHANGED',
        message: 'The live target changed while the replacement was prepared.',
        filesystemMutation: 'NONE',
      }
    }

    await rename(temporaryPath, targetFixturePath)
    renamed = true
    const writtenBytes = await readFile(targetFixturePath, 'utf8')
    if (writtenBytes !== replacement) {
      return {
        ok: false,
        code: 'POST_APPLY_VERIFICATION_FAILED',
        message: 'The replaced fixture did not match the prepared serialization.',
        filesystemMutation: 'UNKNOWN',
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      code: renamed ? 'POST_APPLY_VERIFICATION_FAILED' : 'ATOMIC_REPLACE_FAILED',
      message: error instanceof Error ? error.message : 'Atomic replacement failed.',
      filesystemMutation: renamed ? 'UNKNOWN' : 'NONE',
    }
  } finally {
    if (!renamed) {
      await unlink(temporaryPath).catch(() => undefined)
    }
  }
}

export async function applyPublishedAppendCandidate({
  candidateSerialized,
  fixtureRoot: fixtureRootInput,
  targetFixturePath: targetFixturePathInput,
  mode,
  validateProductionFixture = (fixturePath, fixture) => {
    parseContentBookFixture(fixturePath, fixture)
  },
}: PublishedAppendApplyOptions): Promise<PublishedAppendApplyResult> {
  const targetFixturePath = resolve(targetFixturePathInput)
  const fixtureRoot = resolve(fixtureRootInput)

  let candidateValue: unknown
  try {
    candidateValue = JSON.parse(candidateSerialized) as unknown
  } catch {
    return failure(
      targetFixturePath,
      'MALFORMED_CANDIDATE',
      'Candidate input is not valid JSON or is not a published append candidate.',
    )
  }

  const candidate = parsePublishedAppendCandidate(candidateValue)
  if (!candidate) {
    return failure(
      targetFixturePath,
      'MALFORMED_CANDIDATE',
      'Candidate input failed the PublishedAppendCandidate parser.',
    )
  }

  if (!isPathInsideRoot(fixtureRoot, targetFixturePath)) {
    return failure(
      targetFixturePath,
      'TARGET_OUTSIDE_ROOT',
      'The target fixture must be an exact file inside the fixture root.',
    )
  }

  let entries: readonly FixtureEntry[]
  let loadedCatalog: LoadedCatalogContent
  try {
    entries = await loadFixtureEntries(fixtureRoot)
    loadedCatalog = loadCatalogContent(catalogModules(entries))
  } catch (error) {
    return failure(
      targetFixturePath,
      'TARGET_CATALOG_INVALID',
      error instanceof Error ? error.message : 'The fixture catalog is invalid.',
    )
  }

  const targetEntry = entries.find(
    (entry) => resolve(entry.fixturePath) === targetFixturePath,
  )
  if (!targetEntry) {
    return failure(
      targetFixturePath,
      'TARGET_NOT_FOUND',
      'The exact target fixture does not exist in the fixture root.',
    )
  }

  const targetBookId = targetEntry.parsed.book.id as string
  const targetBookMatches = loadedCatalog.books.filter(
    ({ book }) => (book.id as string) === targetBookId,
  )
  if (targetBookMatches.length !== 1) {
    return failure(
      targetFixturePath,
      'TARGET_NOT_UNIQUE',
      `Target BookId ${targetBookId} must exist exactly once in the fixture catalog.`,
    )
  }

  if (
    candidate.targetPublishedBookId !== targetBookId ||
    candidate.bookId !== targetBookId
  ) {
    return failure(
      targetFixturePath,
      'TARGET_MISMATCH',
      `Candidate target ${candidate.targetPublishedBookId}/${candidate.bookId} does not match live target ${targetBookId}.`,
    )
  }

  const liveFixture = targetEntry.raw as ContentBookFixtureV1
  const originalBytes = Buffer.from(
    await readFile(targetFixturePath),
  )
  const snapshot = snapshotFromParsedBook(targetEntry.parsed)
  let currentBaseFingerprint: string
  try {
    currentBaseFingerprint = await fingerprintPublishedBook(snapshot)
  } catch (error) {
    return failure(
      targetFixturePath,
      'BASE_FINGERPRINT_MISSING',
      error instanceof Error ? error.message : 'The live base fingerprint is unavailable.',
    )
  }

  if (candidate.baseFixtureFingerprint.trim().length === 0) {
    return failure(
      targetFixturePath,
      'BASE_FINGERPRINT_MISSING',
      'Candidate base fingerprint is required.',
    )
  }

  if (candidate.baseFixtureFingerprint !== currentBaseFingerprint) {
    return failure(
      targetFixturePath,
      'BASE_CHANGED',
      'The live target fingerprint does not match candidate.baseFixtureFingerprint.',
    )
  }

  if (
    candidate.publishedChapterCount !== liveFixture.chapters.length ||
    candidate.lastPublishedSequence !==
      liveFixture.chapters[liveFixture.chapters.length - 1].sequence
  ) {
    return failure(
      targetFixturePath,
      'BASE_CONTENT_MISMATCH',
      'The live target chapter count or last sequence does not match the candidate base.',
    )
  }

  if (
    serializeProductionFixture(previewBaseFixture(candidate)) !==
    serializeProductionFixture(liveFixture)
  ) {
    return failure(
      targetFixturePath,
      'BASE_CONTENT_MISMATCH',
      'The candidate base preview does not match the live target fixture.',
    )
  }

  if (!previewAppendMatchesCandidate(candidate)) {
    return failure(
      targetFixturePath,
      'CANDIDATE_PREVIEW_MISMATCH',
      'The candidate append payload does not match its authoritative fixture preview.',
    )
  }

  if (candidate.appendedChapters.length === 0) {
    return failure(
      targetFixturePath,
      'NO_APPENDED_CHAPTERS',
      'A PublishedAppendCandidate must contain at least one new chapter.',
    )
  }

  const existingChapterIds = new Set(
    loadedCatalog.books.flatMap(({ chapters }) =>
      chapters.map((chapter) => chapter.id as string),
    ),
  )
  const appendedChapterIds = new Set<string>()
  const lastLiveSequence =
    liveFixture.chapters[liveFixture.chapters.length - 1].sequence
  for (const [index, chapter] of candidate.appendedChapters.entries()) {
    if (chapter.sequence !== lastLiveSequence + index + 1) {
      return failure(
        targetFixturePath,
        'APPEND_SEQUENCE_INVALID',
        'Appended sequences must begin at N+1 and remain continuous.',
      )
    }

    if (
      appendedChapterIds.has(chapter.chapterId) ||
      existingChapterIds.has(chapter.chapterId)
    ) {
      return failure(
        targetFixturePath,
        'CHAPTER_ID_COLLISION',
        'An appended ChapterId already exists in the production catalog or append payload.',
      )
    }

    appendedChapterIds.add(chapter.chapterId)
  }

  if (!hasValidAppendedChapterPayload(candidate)) {
    return failure(
      targetFixturePath,
      'INVALID_APPENDED_CHAPTER',
      'Every appended chapter must be READABLE and contain non-empty title and prose.',
    )
  }

  const updatedFixture = buildUpdatedFixture(liveFixture, candidate)
  try {
    validateProductionFixture(targetFixturePath, updatedFixture)
  } catch (error) {
    return failure(
      targetFixturePath,
      'PRODUCTION_VALIDATION_FAILED',
      error instanceof Error ? error.message : 'The updated fixture failed production validation.',
    )
  }

  if (mode === 'dry-run') {
    return {
      ok: true,
      mode,
      targetFixturePath,
      targetBookId,
      currentBaseFingerprint,
      appendedSequences: candidate.appendedChapters.map(
        (chapter) => chapter.sequence,
      ),
      resultingChapterCount: updatedFixture.chapters.length,
      validation: 'PASS',
      applyAllowed: true,
      filesystemMutation: 'NONE',
    }
  }

  const replacement = `${JSON.stringify(updatedFixture, null, 2)}\n`
  const replacementResult = await atomicReplace(
    targetFixturePath,
    originalBytes,
    replacement,
  )
  if (!replacementResult.ok) {
    return failure(
      targetFixturePath,
      replacementResult.code,
      replacementResult.message,
      replacementResult.filesystemMutation,
    )
  }

  return {
    ok: true,
    mode,
    targetFixturePath,
    targetBookId,
    currentBaseFingerprint,
    appendedSequences: candidate.appendedChapters.map(
      (chapter) => chapter.sequence,
    ),
    resultingChapterCount: updatedFixture.chapters.length,
    validation: 'PASS',
    applyAllowed: true,
    filesystemMutation: 'ATOMIC_REPLACE',
  }
}
