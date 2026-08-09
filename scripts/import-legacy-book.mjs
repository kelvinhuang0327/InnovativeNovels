import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Script } from 'node:vm'
import { pathToFileURL } from 'node:url'

const CONTENT_BOOK_SCHEMA = 'innovative-novels/content-book/v1'

const ACCESS_BY_LEGACY_STATE = {
  cached: 'READABLE',
  free: 'READABLE',
  preview: 'PREVIEW',
  locked: 'LOCKED',
  unavailable: 'UNAVAILABLE',
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Legacy book field ${field} must be a non-empty string`)
  }

  return value
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Legacy book field ${field} must be a positive integer`)
  }

  return value
}

function normalizeBookId(legacyBookId) {
  return `book-legacy-${requireString(legacyBookId, 'id')}`
}

export function convertLegacyBook(legacyBook, { catalogSequence }) {
  const legacyBookId = requireString(legacyBook?.id, 'id')
  const bookId = normalizeBookId(legacyBookId)
  const chapters = legacyBook.chapters

  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error('Legacy book must contain at least one chapter')
  }

  const normalizedChapters = chapters.map((legacyChapter, index) => {
    const access = ACCESS_BY_LEGACY_STATE[legacyChapter.accessState]

    if (!access) {
      throw new Error(
        `Unsupported legacy chapter access state: ${legacyChapter.accessState}`,
      )
    }

    const chapter = {
      chapterId: `chapter-legacy-${legacyBookId}-${index + 1}`,
      sequence: index + 1,
      title: requireString(legacyChapter.title, `chapters[${index}].title`),
      access,
    }

    if (access === 'READABLE' || access === 'PREVIEW') {
      if (
        !Array.isArray(legacyChapter.paragraphs) ||
        legacyChapter.paragraphs.length === 0 ||
        legacyChapter.paragraphs.some(
          (paragraph) =>
            typeof paragraph !== 'string' || paragraph.trim().length === 0,
        )
      ) {
        throw new Error(
          `Accessible legacy chapter ${legacyChapter.id ?? index + 1} must contain prose`,
        )
      }

      chapter.prose = [...legacyChapter.paragraphs]
    }

    return chapter
  })

  return {
    schema: CONTENT_BOOK_SCHEMA,
    bookId,
    catalogSequence: requirePositiveInteger(catalogSequence, 'catalogSequence'),
    title: requireString(legacyBook.title, 'title'),
    authorName: requireString(legacyBook.authorName, 'authorName'),
    categoryLabel: requireString(legacyBook.categoryLabel, 'categoryLabel'),
    description: requireString(legacyBook.description, 'description'),
    chapters: normalizedChapters,
  }
}

export async function loadLegacyBooks(sourcePath) {
  const source = await readFile(sourcePath, 'utf8')
  const executableSource = source
    .replace(/^import[\s\S]*?;\s*/, '')
    .replace('export const sampleBooks =', 'const sampleBooks =')
    .replace('export const books = sampleBooks;', 'const books = sampleBooks;')
    .replace('export default books;', '')
    .concat('\nresult = { books, sampleBooks }')
  const context = {
    getGenreCoverAsset: () => ({ coverUrl: '' }),
    result: undefined,
  }

  new Script(executableSource, { filename: sourcePath }).runInNewContext(context)

  if (!Array.isArray(context.result?.books)) {
    throw new Error(`Could not load legacy books from ${sourcePath}`)
  }

  return context.result.books
}

function readOption(args, name) {
  const index = args.indexOf(name)
  const value = args[index + 1]

  if (index < 0 || !value) {
    throw new Error(`Missing required option ${name}`)
  }

  return value
}

export async function runConverter({ sourcePath, bookId, catalogSequence, outputPath }) {
  const legacyBooks = await loadLegacyBooks(sourcePath)
  const legacyBook = legacyBooks.find((book) => book.id === bookId)

  if (!legacyBook) {
    throw new Error(`Legacy book ${bookId} was not found in ${sourcePath}`)
  }

  const fixture = convertLegacyBook(legacyBook, { catalogSequence })
  await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  return fixture
}

async function main() {
  const args = process.argv.slice(2)
  await runConverter({
    sourcePath: resolve(readOption(args, '--source')),
    bookId: readOption(args, '--book-id'),
    catalogSequence: Number(readOption(args, '--catalog-sequence')),
    outputPath: resolve(readOption(args, '--output')),
  })
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
