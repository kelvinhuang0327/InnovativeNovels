import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptsDir, '..')
const androidDir = path.join(rootDir, 'android')
const expectedApplicationId = 'com.innovativenovels.app'
const requireVerified = process.argv.includes('--require-verified')
const toolEnvironment = {
  ...process.env,
  LANG: 'C',
  LC_ALL: 'C'
}

const signingVariableNames = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD'
]

function argumentValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    console.error(`❌ ${flag} requires an artifact path.`)
    process.exit(2)
  }
  return path.resolve(rootDir, value)
}

const apkOverridePath = argumentValue('--apk')
const aabOverridePath = argumentValue('--aab')
const apkPathCandidates = apkOverridePath ? [apkOverridePath] : [
  path.join(androidDir, 'app/build/outputs/apk/release/app-release.apk'),
  path.join(androidDir, 'app/build/outputs/apk/release/app-release-unsigned.apk')
]
const aabPath = aabOverridePath || path.join(androidDir, 'app/build/outputs/bundle/release/app-release.aab')

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function isExistingFile(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function isExecutable(filePath) {
  try {
    const stat = fs.statSync(filePath)
    return stat.isFile() && (process.platform === 'win32' || (stat.mode & 0o111) !== 0)
  } catch {
    return false
  }
}

function findOnPath(command) {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue
    const candidate = path.join(directory, command)
    if (isExecutable(candidate)) return candidate
  }
  return null
}

function sdkRoots() {
  return unique([
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    path.join(os.homedir(), 'Library/Android/sdk'),
    path.join(os.homedir(), 'Android/Sdk')
  ])
}

function versionParts(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10)).map((part) => Number.isFinite(part) ? part : 0)
}

function compareVersions(left, right) {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference !== 0) return difference
  }
  return 0
}

function findSdkTool(toolName) {
  const explicitToolPath = process.env[`ANDROID_${toolName.toUpperCase()}_PATH`]
  if (explicitToolPath && isExistingFile(explicitToolPath)) return explicitToolPath

  for (const sdkRoot of sdkRoots()) {
    const buildToolsRoot = path.join(sdkRoot, 'build-tools')
    if (fs.existsSync(buildToolsRoot)) {
      const versions = fs.readdirSync(buildToolsRoot)
        .filter((entry) => /^\d+(?:\.\d+)+$/.test(entry))
        .sort(compareVersions)
        .reverse()
      for (const version of versions) {
        const candidate = path.join(buildToolsRoot, version, toolName)
        if (isExecutable(candidate)) return candidate
      }
    }

    const latestCandidate = path.join(sdkRoot, 'cmdline-tools/latest/bin', toolName)
    if (isExecutable(latestCandidate)) return latestCandidate
  }

  return findOnPath(toolName)
}

function run(command, args) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: rootDir,
      env: toolEnvironment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { exitCode: 0, output: stdout }
  } catch (error) {
    const stdout = Buffer.isBuffer(error?.stdout) ? error.stdout.toString('utf8') : (error?.stdout || '')
    const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : (error?.stderr || '')
    return {
      exitCode: typeof error?.status === 'number' ? error.status : 1,
      output: `${stdout}\n${stderr}`
    }
  }
}

function normalizeFingerprint(value) {
  return value.replace(/[^a-f0-9]/gi, '').toLowerCase()
}

function parseFingerprint(output) {
  const patterns = [
    /certificate SHA-256 digest:\s*([0-9a-f: ]{32,})/i,
    /SHA256:\s*([0-9a-f: ]{32,})/i,
    /SHA-256:\s*([0-9a-f: ]{32,})/i
  ]
  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (match) {
      const fingerprint = normalizeFingerprint(match[1])
      if (fingerprint.length === 64) return fingerprint
    }
  }
  return null
}

function parseDistinguishedName(output) {
  const match = output.match(/Signer #1 certificate DN:\s*(.+)/i) || output.match(/Owner:\s*(.+)/i)
  return match ? match[1].trim() : null
}

function parsePackageName(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.length > 0 ? lines.at(-1) : null
}

function findBundletool() {
  const explicitExecutable = process.env.ANDROID_BUNDLETOOL_PATH || process.env.BUNDLETOOL_PATH
  if (explicitExecutable && isExecutable(explicitExecutable)) return { type: 'executable', path: explicitExecutable }

  const executable = findOnPath('bundletool')
  if (executable) return { type: 'executable', path: executable }

  const explicitJar = process.env.ANDROID_BUNDLETOOL_JAR || process.env.BUNDLETOOL_JAR
  if (explicitJar && isExistingFile(explicitJar)) {
    const java = findOnPath('java')
    if (java) return { type: 'jar', path: explicitJar, java }
  }

  return null
}

function runBundletool(bundletool, args) {
  if (!bundletool) return null
  if (bundletool.type === 'jar') return run(bundletool.java, ['-jar', bundletool.path, ...args])
  return run(bundletool.path, args)
}

function readDebugCertificateFingerprint() {
  const debugKeystoreCandidates = unique([
    path.join(os.homedir(), '.android/debug.keystore'),
    path.join(androidDir, 'debug.keystore'),
    path.join(androidDir, 'app/debug.keystore')
  ])
  const debugKeystorePath = debugKeystoreCandidates.find(isExistingFile)
  const keytool = findOnPath('keytool')
  if (!debugKeystorePath || !keytool) return { fingerprint: null, available: false }

  const result = run(keytool, [
    '-list',
    '-v',
    '-keystore',
    debugKeystorePath,
    '-storepass',
    'android',
    '-alias',
    'androiddebugkey'
  ])
  return {
    fingerprint: result.exitCode === 0 ? parseFingerprint(result.output) : null,
    available: result.exitCode === 0
  }
}

function isDebugCertificate(fingerprint, distinguishedName, debugFingerprint) {
  return (fingerprint && debugFingerprint && fingerprint === debugFingerprint)
    || /android\s+debug/i.test(distinguishedName || '')
}

function expectedFingerprint() {
  const configured = process.env.ANDROID_RELEASE_CERT_SHA256
  if (!configured) return null
  const normalized = normalizeFingerprint(configured)
  return normalized.length === 64 ? normalized : 'INVALID'
}

function signingInputState() {
  const values = Object.fromEntries(signingVariableNames.map((name) => [name, process.env[name]]))
  const hasAny = Object.values(values).some((value) => value !== undefined && value !== '')
  const complete = Object.values(values).every((value) => value !== undefined && value !== '')
  return { hasAny, complete }
}

function inspectTrackedSigningSecurity() {
  const git = findOnPath('git')
  if (!git) return { status: 'BLOCKED', reasons: ['git is unavailable; tracked-secret verification could not run.'] }

  const result = run(git, ['ls-files', '-z'])
  if (result.exitCode !== 0) return { status: 'BLOCKED', reasons: ['git could not enumerate tracked files for signing-secret verification.'] }

  const trackedPaths = result.output.split('\0').filter(Boolean)
  const reasons = []
  const trackedKeystores = trackedPaths.filter((filePath) => /\.(?:jks|keystore)$/i.test(filePath))
  if (trackedKeystores.length > 0) reasons.push('A tracked .jks or .keystore file exists.')

  const configPaths = unique([
    'android/app/build.gradle',
    'android/variables.gradle',
    'package.json',
    'scripts/build-android-distribution.mjs',
    'scripts/verify-android-distribution-signing.mjs',
    ...trackedPaths.filter((filePath) => /(?:^|\/)(?:gradle\.properties|\.env(?:\..*)?)$/i.test(filePath) || /\.gradle(?:\.kts)?$/i.test(filePath))
  ])
  const literalSecretPatterns = [
    /-----BEGIN [^-\n]*PRIVATE KEY-----/i,
    /^\s*storePassword\s*(?:=|:)?\s*["'`][^$"'`]+["'`]/im,
    /^\s*keyPassword\s*(?:=|:)?\s*["'`][^$"'`]+["'`]/im,
    /^\s*ANDROID_(?:KEYSTORE|KEY)_PASSWORD\s*=\s*["'`][^$"'`]+["'`]/im
  ]
  for (const filePath of configPaths) {
    const absolutePath = path.join(rootDir, filePath)
    let content
    try {
      content = fs.readFileSync(absolutePath, 'utf8')
    } catch {
      continue
    }
    if (literalSecretPatterns.some((pattern) => pattern.test(content))) {
      reasons.push(`Tracked signing configuration contains a literal signing secret: ${filePath}.`)
    }
  }

  const configuredKeystorePath = process.env.ANDROID_KEYSTORE_PATH
  if (configuredKeystorePath) {
    if (!path.isAbsolute(configuredKeystorePath)) {
      reasons.push('ANDROID_KEYSTORE_PATH must be absolute so private material cannot resolve inside the repository.')
    } else {
      const canonicalRepositoryRoot = fs.realpathSync(rootDir)
      const candidatePath = fs.existsSync(configuredKeystorePath)
        ? fs.realpathSync(configuredKeystorePath)
        : path.resolve(configuredKeystorePath)
      const repositoryRootPrefix = canonicalRepositoryRoot.endsWith(path.sep)
        ? canonicalRepositoryRoot
        : `${canonicalRepositoryRoot}${path.sep}`
      if (candidatePath === canonicalRepositoryRoot || candidatePath.startsWith(repositoryRootPrefix)) {
        reasons.push('ANDROID_KEYSTORE_PATH must point outside the repository root so private material stays untracked.')
      }
    }
  }

  const gitignorePath = path.join(rootDir, '.gitignore')
  if (!isExistingFile(gitignorePath)) {
    reasons.push('.gitignore is missing.')
  } else {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
    for (const requiredPattern of ['*.jks', '*.keystore']) {
      if (!gitignoreContent.split(/\r?\n/).some((line) => line.trim() === requiredPattern)) {
        reasons.push(`.gitignore is missing the exact Android signing exclusion ${requiredPattern}.`)
      }
    }
  }

  const buildGradlePath = path.join(rootDir, 'android/app/build.gradle')
  if (!isExistingFile(buildGradlePath)) {
    reasons.push('android/app/build.gradle is missing.')
  } else {
    const buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8')
    for (const variableName of signingVariableNames) {
      if (!buildGradleContent.includes(`System.getenv('${variableName}')`)) {
        reasons.push(`android/app/build.gradle does not source ${variableName} from the environment.`)
      }
    }
  }

  return { status: reasons.length === 0 ? 'PASS' : 'REFUTED', reasons }
}

function apkApplicationId(apkPath) {
  const aapt2 = findSdkTool('aapt2')
  const apkanalyzer = findSdkTool('apkanalyzer')
  if (aapt2) {
    const result = run(aapt2, ['dump', 'packagename', apkPath])
    return result.exitCode === 0 ? { value: parsePackageName(result.output), tool: aapt2 } : { value: null, tool: aapt2 }
  }
  if (apkanalyzer) {
    const result = run(apkanalyzer, ['manifest', 'application-id', apkPath])
    return result.exitCode === 0 ? { value: parsePackageName(result.output), tool: apkanalyzer } : { value: null, tool: apkanalyzer }
  }
  return { value: null, tool: null }
}

function verifyApk(apkPath, debugCertificate, expected) {
  const result = {
    status: 'BLOCKED_BY_EXTERNAL_CAPABILITY',
    path: apkPath,
    applicationId: null,
    signerFingerprint: null,
    signerDistinguishedName: null,
    signatureVerified: false,
    reasons: []
  }
  if (!isExistingFile(apkPath)) {
    result.reasons.push('Release APK artifact is missing.')
    return result
  }

  const application = apkApplicationId(apkPath)
  result.applicationId = application.value
  if (!application.tool) result.reasons.push('No Android APK manifest inspection tool is available.')
  else if (!application.value) result.reasons.push('APK application ID could not be read.')
  else if (application.value !== expectedApplicationId) result.reasons.push(`APK application ID is ${application.value}, not ${expectedApplicationId}.`)

  const apksigner = findSdkTool('apksigner')
  if (!apksigner) {
    result.reasons.push('Android apksigner is unavailable.')
    return result
  }

  const verification = run(apksigner, ['verify', '--verbose', '--print-certs', apkPath])
  result.signatureVerified = verification.exitCode === 0 && /Signer #\d+ certificate SHA-256 digest:/i.test(verification.output)
  result.signerFingerprint = parseFingerprint(verification.output)
  result.signerDistinguishedName = parseDistinguishedName(verification.output)

  if (!result.signatureVerified) {
    if (/missing META-INF|jar is unsigned|does not verify|unsigned/i.test(verification.output)) {
      result.reasons.push('APK is unsigned.')
    } else {
      result.reasons.push('APK signature verification failed.')
    }
  }
  if (!result.signerFingerprint) result.reasons.push('APK signer certificate SHA-256 fingerprint could not be read.')
  if (!debugCertificate.available || !debugCertificate.fingerprint) result.reasons.push('Android debug certificate comparison could not be completed.')
  if (isDebugCertificate(result.signerFingerprint, result.signerDistinguishedName, debugCertificate.fingerprint)) result.reasons.push('APK is signed with the Android debug certificate.')
  if (expected === 'INVALID') result.reasons.push('ANDROID_RELEASE_CERT_SHA256 is not a valid SHA-256 fingerprint.')
  else if (!expected) result.reasons.push('ANDROID_RELEASE_CERT_SHA256 is not configured; signer identity is unknown.')
  else if (result.signerFingerprint !== expected) result.reasons.push('APK signer fingerprint does not match ANDROID_RELEASE_CERT_SHA256.')

  const hasRefutation = result.reasons.some((reason) => /not |failed|invalid|debug|unsigned|unknown|could not|unavailable/i.test(reason))
  if (result.reasons.some((reason) => /debug|does not match|not a valid|signature verification failed|application ID is/i.test(reason))) result.status = 'REFUTED'
  else if (result.signatureVerified && result.signerFingerprint && result.applicationId === expectedApplicationId && expected && expected !== 'INVALID' && result.signerFingerprint === expected && debugCertificate.available && debugCertificate.fingerprint) result.status = 'VERIFIED'
  else if (!hasRefutation) result.status = 'BLOCKED_BY_EXTERNAL_CAPABILITY'
  return result
}

function aabApplicationId(aabArtifactPath, bundletool) {
  const result = runBundletool(bundletool, ['dump', 'manifest', `--bundle=${aabArtifactPath}`])
  if (!result || result.exitCode !== 0) return null
  const xmlMatch = result.output.match(/<manifest\b[^>]*\bpackage=["']([^"']+)["']/i)
  if (xmlMatch) return xmlMatch[1]
  const textMatch = result.output.match(/\bpackage(?:Name)?\s*[:=]\s*([A-Za-z0-9_.]+)/i)
  return textMatch ? textMatch[1] : null
}

function verifyAab(debugCertificate, expected) {
  const result = {
    status: 'BLOCKED_BY_EXTERNAL_CAPABILITY',
    path: aabPath,
    applicationId: null,
    signerFingerprint: null,
    signerDistinguishedName: null,
    signatureVerified: false,
    reasons: []
  }
  if (!isExistingFile(aabPath)) {
    result.reasons.push('Release AAB artifact is missing.')
    return result
  }

  const jarsigner = findOnPath('jarsigner')
  const keytool = findOnPath('keytool')
  if (!jarsigner || !keytool) {
    result.reasons.push('JDK jarsigner/keytool are unavailable for AAB verification.')
    return result
  }

  // Local upload certificates are intentionally self-signed; identity is enforced by the expected fingerprint below.
  const verification = run(jarsigner, ['-verify', '-certs', aabPath])
  const hasFatalSignatureFailure = /jar is unsigned|no manifest|jar verification failed|does not verify|invalid signature|signature[^\n]*(?:failed|invalid|error)|digest[^\n]*error/i.test(verification.output)
  result.signatureVerified = verification.exitCode === 0 && /jar verified\./i.test(verification.output) && !hasFatalSignatureFailure
  result.signerFingerprint = parseFingerprint(verification.output)
  if (!result.signerFingerprint) {
    const certificate = run(keytool, ['-printcert', '-jarfile', aabPath])
    result.signerFingerprint = parseFingerprint(certificate.output)
    result.signerDistinguishedName = parseDistinguishedName(certificate.output)
  } else {
    result.signerDistinguishedName = parseDistinguishedName(verification.output)
  }

  if (!result.signatureVerified) {
    if (/jar is unsigned|no manifest/i.test(verification.output)) result.reasons.push('AAB is unsigned.')
    else result.reasons.push('AAB JAR signature verification failed.')
  }
  if (!result.signerFingerprint) result.reasons.push('AAB signer certificate SHA-256 fingerprint could not be read.')
  if (!debugCertificate.available || !debugCertificate.fingerprint) result.reasons.push('Android debug certificate comparison could not be completed.')
  if (isDebugCertificate(result.signerFingerprint, result.signerDistinguishedName, debugCertificate.fingerprint)) result.reasons.push('AAB is signed with the Android debug certificate.')
  if (expected === 'INVALID') result.reasons.push('ANDROID_RELEASE_CERT_SHA256 is not a valid SHA-256 fingerprint.')
  else if (!expected) result.reasons.push('ANDROID_RELEASE_CERT_SHA256 is not configured; signer identity is unknown.')
  else if (result.signerFingerprint !== expected) result.reasons.push('AAB signer fingerprint does not match ANDROID_RELEASE_CERT_SHA256.')

  const bundletool = findBundletool()
  if (!bundletool) {
    result.reasons.push('bundletool is unavailable; AAB manifest/application ID validation is blocked.')
  } else if (result.signatureVerified) {
    const bundleValidation = runBundletool(bundletool, ['validate', `--bundle=${aabPath}`])
    if (!bundleValidation || bundleValidation.exitCode !== 0) result.reasons.push('bundletool validation failed for the AAB.')
    result.applicationId = aabApplicationId(aabPath, bundletool)
    if (!result.applicationId) result.reasons.push('AAB application ID could not be read with bundletool.')
    else if (result.applicationId !== expectedApplicationId) result.reasons.push(`AAB application ID is ${result.applicationId}, not ${expectedApplicationId}.`)
  }

  if (result.reasons.some((reason) => /debug|does not match|not a valid|signature verification failed|application ID is|bundletool validation failed/i.test(reason))) result.status = 'REFUTED'
  else if (result.signatureVerified && result.signerFingerprint && result.applicationId === expectedApplicationId && expected && expected !== 'INVALID' && result.signerFingerprint === expected && debugCertificate.available && debugCertificate.fingerprint && bundletool) result.status = 'VERIFIED'
  return result
}

function printArtifactResult(label, result) {
  console.log(`${label}_STATUS = ${result.status}`)
  console.log(`${label}_EXISTS = ${isExistingFile(result.path) ? 'YES' : 'NO'}`)
  console.log(`${label}_APPLICATION_ID = ${result.applicationId || 'NOT_READ'}`)
  console.log(`${label}_SIGNATURE_VERIFICATION = ${result.signatureVerified ? 'PASS' : 'NOT_VERIFIED'}`)
  console.log(`${label}_SIGNER_SHA256 = ${result.signerFingerprint || 'NOT_READ'}`)
  if (result.signerDistinguishedName) console.log(`${label}_SIGNER_DN = ${result.signerDistinguishedName}`)
  for (const reason of result.reasons) console.log(`${label}_REASON = ${reason}`)
}

console.log('🔍 Executing Android Distribution Signing Readiness Verification...')

const releaseApkPath = apkPathCandidates.find(isExistingFile) || apkPathCandidates[0]
const releaseBuildable = isExistingFile(releaseApkPath) && isExistingFile(aabPath)
const signingInput = signingInputState()
const expected = expectedFingerprint()
const debugCertificate = readDebugCertificateFingerprint()
const security = inspectTrackedSigningSecurity()
if (signingInput.hasAny && !signingInput.complete) {
  security.status = 'REFUTED'
  security.reasons.push('Android release signing input is incomplete; all four signing variables are required together.')
}
const apk = verifyApk(releaseApkPath, debugCertificate, expected)
const aab = verifyAab(debugCertificate, expected)

let distributionStatus = 'BLOCKED_BY_EXTERNAL_CAPABILITY'
if (security.status === 'REFUTED') distributionStatus = 'REFUTED'
else if (apk.status === 'REFUTED' || aab.status === 'REFUTED') distributionStatus = 'REFUTED'
else if (security.status === 'PASS' && signingInput.complete && apk.status === 'VERIFIED' && aab.status === 'VERIFIED') distributionStatus = 'VERIFIED_LOCAL_SIGNING'

console.log('\n==================================================')
console.log(`ANDROID_RELEASE_BUILD = ${releaseBuildable ? 'BUILDABLE' : 'UNAVAILABLE'}`)
console.log(`ANDROID_SIGNING_INPUT = ${signingInput.complete ? 'CONFIGURED' : signingInput.hasAny ? 'INCOMPLETE' : 'NOT_CONFIGURED'}`)
console.log(`ANDROID_TRACKED_SECRET_CHECK = ${security.status}`)
for (const reason of security.reasons) console.log(`ANDROID_SECURITY_REASON = ${reason}`)
printArtifactResult('ANDROID_APK', apk)
printArtifactResult('ANDROID_AAB', aab)
console.log(`ANDROID_SIGNED_FOR_DISTRIBUTION = ${distributionStatus}`)
console.log('==================================================\n')

if (!signingInput.hasAny && apk.status === 'BLOCKED_BY_EXTERNAL_CAPABILITY' && aab.status === 'BLOCKED_BY_EXTERNAL_CAPABILITY') {
  console.log('OWNER_AUTHORIZATION_REQUIRED')
  console.log('ACTION: Create one long-lived Android release/upload signing identity for com.innovativenovels.app.')
  console.log('WHY_REQUIRED: Release APK/AAB are buildable but no authorized release signing identity is configured.')
  console.log('MINIMUM_AUTHORIZATION_NEEDED: ANDROID_RELEASE_SIGNING_IDENTITY_CREATION_APPROVED')
}

if (requireVerified && distributionStatus !== 'VERIFIED_LOCAL_SIGNING') process.exit(1)
if (distributionStatus === 'REFUTED') process.exit(1)
process.exit(0)
