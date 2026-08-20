import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptsDir, '..')
const androidDir = path.join(rootDir, 'android')
const gradleWrapperPath = path.join(androidDir, 'gradlew')
const verifierPath = path.join(scriptsDir, 'verify-android-distribution-signing.mjs')
const releaseApkPath = path.join(androidDir, 'app/build/outputs/apk/release/app-release-unsigned.apk')
const signedApkPath = path.join(androidDir, 'app/build/outputs/apk/release/app-release.apk')
const releaseAabPath = path.join(androidDir, 'app/build/outputs/bundle/release/app-release.aab')

const signingVariableNames = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD'
]

const signingValues = Object.fromEntries(signingVariableNames.map((name) => [name, process.env[name]]))
const hasAnySigningInput = Object.values(signingValues).some((value) => value !== undefined && value !== '')
const hasCompleteSigningInput = Object.values(signingValues).every((value) => value !== undefined && value !== '')

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function isSamePath(left, right) {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right)
  } catch {
    return path.resolve(left) === path.resolve(right)
  }
}

console.log('🚀 Starting Android release build and signing truth-gate pipeline...')
console.log(`ANDROID_RELEASE_SIGNING_INPUT = ${hasCompleteSigningInput ? 'CONFIGURED' : hasAnySigningInput ? 'INCOMPLETE' : 'NOT_CONFIGURED'}`)

if (hasAnySigningInput && !hasCompleteSigningInput) {
  fail('Android release signing requires all four ANDROID_KEYSTORE_* / ANDROID_KEY_* variables; no partial signing configuration is accepted.')
}

if (hasCompleteSigningInput) {
  const keystorePath = signingValues.ANDROID_KEYSTORE_PATH
  if (!path.isAbsolute(keystorePath)) {
    fail('ANDROID_KEYSTORE_PATH must be an absolute path outside the repository root.')
  }
  if (!fs.existsSync(keystorePath)) {
    fail('ANDROID_KEYSTORE_PATH does not point to an existing keystore.')
  }

  const canonicalRepositoryRoot = fs.realpathSync(rootDir)
  const canonicalKeystorePath = fs.realpathSync(keystorePath)
  const repositoryRootPrefix = canonicalRepositoryRoot.endsWith(path.sep)
    ? canonicalRepositoryRoot
    : `${canonicalRepositoryRoot}${path.sep}`
  if (canonicalKeystorePath === canonicalRepositoryRoot || canonicalKeystorePath.startsWith(repositoryRootPrefix)) {
    fail('ANDROID_KEYSTORE_PATH must point outside the repository root so private material stays untracked.')
  }

  const defaultDebugKeystorePath = path.join(os.homedir(), '.android/debug.keystore')
  if (path.basename(keystorePath).toLowerCase() === 'debug.keystore' || isSamePath(keystorePath, defaultDebugKeystorePath)) {
    fail('The Android debug keystore cannot be used for release signing.')
  }
}

if (!fs.existsSync(gradleWrapperPath)) {
  fail(`Gradle wrapper not found at ${gradleWrapperPath}.`)
}

console.log('📦 Building assembleRelease and bundleRelease...')
try {
  execFileSync(gradleWrapperPath, ['--no-daemon', 'assembleRelease', 'bundleRelease'], {
    cwd: androidDir,
    env: process.env,
    stdio: 'inherit'
  })
} catch (error) {
  process.exit(typeof error?.status === 'number' ? error.status : 1)
}

const releaseApkExists = fs.existsSync(releaseApkPath) || fs.existsSync(signedApkPath)
if (!releaseApkExists || !fs.existsSync(releaseAabPath)) {
  fail('Android release build did not produce both the release APK and release AAB outputs.')
}

console.log('ANDROID_RELEASE_BUILD = BUILDABLE')
console.log('🔍 Running Android signing truth gate...')

const verifierArgs = hasCompleteSigningInput ? ['--require-verified'] : []
try {
  execFileSync(process.execPath, [verifierPath, ...verifierArgs], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit'
  })
} catch (error) {
  process.exit(typeof error?.status === 'number' ? error.status : 1)
}
