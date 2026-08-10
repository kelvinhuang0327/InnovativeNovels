import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { applyPublishedAppendCandidate } from '../src/infrastructure/content/publishedAppendApply.ts'

function usage() {
  console.error(
    'Usage: npm run apply:published-append-candidate -- --candidate <path> --target <fixture-path> (--dry-run|--apply) [--root <fixture-root>]',
  )
}

function parseArguments(argumentsList) {
  const options = new Map()
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === '--dry-run' || argument === '--apply') {
      if (options.has('mode')) {
        throw new Error('Choose exactly one of --dry-run or --apply.')
      }
      options.set('mode', argument.slice(2))
      continue
    }

    if (argument === '--candidate' || argument === '--target' || argument === '--root') {
      const value = argumentsList[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`)
      }
      options.set(argument.slice(2), value)
      index += 1
      continue
    }

    throw new Error(`Unknown option: ${argument}`)
  }

  const candidatePath = options.get('candidate')
  const targetPath = options.get('target')
  const mode = options.get('mode')
  if (!candidatePath || !targetPath || !mode) {
    throw new Error('Candidate, target, and exactly one execution mode are required.')
  }

  return {
    candidatePath: resolve(candidatePath),
    targetPath: resolve(targetPath),
    fixtureRoot: resolve(options.get('root') ?? dirname(resolve(targetPath))),
    mode: mode === 'dry-run' ? 'dry-run' : 'apply',
  }
}

try {
  const options = parseArguments(process.argv.slice(2))
  const candidateSerialized = await readFile(options.candidatePath, 'utf8')
  const result = await applyPublishedAppendCandidate({
    candidateSerialized,
    fixtureRoot: options.fixtureRoot,
    targetFixturePath: options.targetPath,
    mode: options.mode,
  })

  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) {
    process.exitCode = 1
  }
} catch (error) {
  usage()
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
