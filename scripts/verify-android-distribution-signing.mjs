import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STATUS,
  classifyAndroidDistributionSigning,
  gitignoreHasPattern,
  GITIGNORE_PATTERNS,
  hasGradlePropertiesSigningSecret,
  hasQuotedSigningSecret,
  isDebugCertificate,
  missingGitignorePatterns,
  ownerAuthorizationRequiredMessage,
  parseAaptPackageName,
  parseApksignerPrintCerts,
  parseJarsignerVerify,
  readSigningEnv,
} from './android-distribution-signing.mjs'

const rootDir = process.cwd()
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = fs.existsSync(path.join(rootDir, 'android/app/build.gradle'))
  ? rootDir
  : path.resolve(scriptDir, '..')

const apkUnsignedPath = path.join(repoRoot, 'android/app/build/outputs/apk/release/app-release-unsigned.apk')
const apkSignedPath = path.join(repoRoot, 'android/app/build/outputs/apk/release/app-release.apk')
const aabPath = path.join(repoRoot, 'android/app/build/outputs/bundle/release/app-release.aab')
const gitignorePath = path.join(repoRoot, '.gitignore')
const androidGitignorePath = path.join(repoRoot, 'android/.gitignore')
const appGradlePath = path.join(repoRoot, 'android/app/build.gradle')
const gradlePropertiesPath = path.join(repoRoot, 'android/gradle.properties')

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function resolveAndroidSdk() {
  if (process.env.ANDROID_HOME) {
    return process.env.ANDROID_HOME
  }
  if (process.env.ANDROID_SDK_ROOT) {
    return process.env.ANDROID_SDK_ROOT
  }
  const localProperties = readIfExists(path.join(repoRoot, 'android/local.properties'))
  const sdkMatch = localProperties.match(/^sdk\.dir=(.+)$/m)
  if (sdkMatch) {
    return sdkMatch[1].trim().replace(/\\:/g, ':')
  }
  return path.join(process.env.HOME || '', 'Library/Android/sdk')
}

function findBuildToolsBinary(name) {
  const sdk = resolveAndroidSdk()
  const buildToolsDir = path.join(sdk, 'build-tools')
  if (!fs.existsSync(buildToolsDir)) {
    return ''
  }
  const versions = fs.readdirSync(buildToolsDir).sort().reverse()
  for (const version of versions) {
    const candidate = path.join(buildToolsDir, version, name)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return ''
}

function runCaptured(command, args) {
  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, output: stdout }
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`
    return { ok: false, output }
  }
}

function inspectApk(apkPath, tools) {
  if (!fs.existsSync(apkPath)) {
    return { exists: false, signed: false, verifyPassed: false, applicationId: '', signer: null, path: apkPath }
  }

  const verify = runCaptured(tools.apksigner, ['verify', '--print-certs', apkPath])
  const parsed = parseApksignerPrintCerts(verify.output)
  let applicationId = ''
  if (tools.aapt) {
    const dump = runCaptured(tools.aapt, ['dump', 'badging', apkPath])
    applicationId = parseAaptPackageName(dump.output)
  }

  return {
    exists: true,
    path: apkPath,
    signed: parsed.signed,
    verifyPassed: Boolean(verify.ok && parsed.verifyPassed),
    applicationId,
    signer: {
      distinguishedName: parsed.distinguishedName,
      sha256: parsed.sha256,
      sha1: parsed.sha1,
    },
    toolOutput: verify.output,
  }
}

function inspectAab(bundlePath) {
  if (!fs.existsSync(bundlePath)) {
    return { exists: false, signed: false, verifyPassed: false, signer: null, path: bundlePath }
  }

  const verify = runCaptured('jarsigner', ['-verify', '-verbose', '-certs', bundlePath])
  const parsed = parseJarsignerVerify(verify.output)
  let signer = {
    distinguishedName: parsed.distinguishedName,
    sha256: parsed.sha256,
    sha1: '',
  }

  if (parsed.signed) {
    const cert = runCaptured('keytool', ['-printcert', '-jarfile', bundlePath])
    const dnMatch = cert.output.match(/Owner:\s*(.+)/i)
    const sha256Match = cert.output.match(/SHA256:\s*([0-9A-Fa-f:]+)/i)
    const sha1Match = cert.output.match(/SHA1:\s*([0-9A-Fa-f:]+)/i)
    signer = {
      distinguishedName: dnMatch ? dnMatch[1].trim() : signer.distinguishedName,
      sha256: sha256Match ? sha256Match[1].trim() : signer.sha256,
      sha1: sha1Match ? sha1Match[1].trim() : signer.sha1,
    }
  }

  return {
    exists: true,
    path: bundlePath,
    signed: parsed.signed,
    verifyPassed: parsed.verifyPassed,
    signer,
    toolOutput: verify.output,
  }
}

function trackedSecretFindings() {
  const findings = []
  const gradleText = readIfExists(appGradlePath)
  if (hasQuotedSigningSecret(gradleText)) {
    findings.push('android/app/build.gradle contains a quoted storePassword/keyPassword')
  }
  const propertiesText = readIfExists(gradlePropertiesPath)
  if (hasGradlePropertiesSigningSecret(propertiesText)) {
    findings.push('android/gradle.properties contains a signing password assignment')
  }

  try {
    const tracked = execFileSync('git', ['ls-files', '*.jks', '*.keystore', 'android/keystore.properties'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    for (const filePath of tracked) {
      findings.push(`tracked signing artifact: ${filePath}`)
    }
  } catch {
    findings.push('git ls-files could not be executed to audit tracked keystores')
  }

  return findings
}

function resolveApkPath() {
  if (process.env.ANDROID_VERIFY_APK) {
    return process.env.ANDROID_VERIFY_APK
  }
  if (fs.existsSync(apkSignedPath)) {
    return apkSignedPath
  }
  return apkUnsignedPath
}

function resolveAabPath() {
  return process.env.ANDROID_VERIFY_AAB || aabPath
}

function main() {
  console.log('🔍 Executing Android Distribution Signing Readiness Verification...')

  const gitignoreText = readIfExists(gitignorePath)
  const androidGitignoreText = readIfExists(androidGitignorePath)
  const gitignoreMissing = missingGitignorePatterns([gitignoreText, androidGitignoreText])
  for (const pattern of GITIGNORE_PATTERNS) {
    const inRoot = gitignoreHasPattern(gitignoreText, pattern)
    const inAndroid = gitignoreHasPattern(androidGitignoreText, pattern)
    if (!inRoot && !inAndroid) {
      console.log(`   ❌ Missing gitignore exclusion: ${pattern}`)
    }
  }
  if (gitignoreMissing.length === 0) {
    console.log('   ✅ Git ignore security rules verified.')
  }

  const trackedSecrets = trackedSecretFindings()
  if (trackedSecrets.length === 0) {
    console.log('   ✅ No tracked Android signing secrets found.')
  } else {
    for (const finding of trackedSecrets) {
      console.log(`   ❌ ${finding}`)
    }
  }

  const apksigner = findBuildToolsBinary('apksigner')
  const aapt = findBuildToolsBinary('aapt')
  if (!apksigner) {
    console.log('   ❌ apksigner not found under the Android SDK build-tools.')
  }
  if (!aapt) {
    console.log('   ⚠️ aapt not found; application id will be checked from metadata when available.')
  }

  const apk = apksigner
    ? inspectApk(resolveApkPath(), { apksigner, aapt })
    : { exists: fs.existsSync(resolveApkPath()), signed: false, verifyPassed: false, applicationId: '', signer: null, path: resolveApkPath() }
  const aab = inspectAab(resolveAabPath())
  const signingEnv = readSigningEnv(process.env)

  if (apk.exists) {
    console.log(`📦 APK: ${apk.path}`)
    console.log(`   signed=${apk.signed} apksignerPass=${Boolean(apk.verifyPassed)} applicationId=${apk.applicationId || 'UNKNOWN'}`)
  } else {
    console.log(`📦 APK not found at ${apk.path}`)
  }
  if (aab.exists) {
    console.log(`📦 AAB: ${aab.path}`)
    console.log(`   signed=${aab.signed} jarsignerPass=${Boolean(aab.verifyPassed)}`)
  } else {
    console.log(`📦 AAB not found at ${aab.path}`)
  }

  const signer = apk.signer?.distinguishedName ? apk.signer : aab.signer
  if (signer?.distinguishedName || signer?.sha256) {
    console.log('🔏 Signer metadata (non-secret):')
    if (signer.distinguishedName) {
      console.log(`   DN: ${signer.distinguishedName}`)
    }
    if (signer.sha256) {
      console.log(`   SHA-256: ${signer.sha256}`)
    }
    if (signer.sha1) {
      console.log(`   SHA-1: ${signer.sha1}`)
    }
    if (isDebugCertificate(signer)) {
      console.log('   identityClass=ANDROID_DEBUG')
    }
  }

  if (!apksigner && apk.exists) {
    const result = {
      releaseBuildable: true,
      distributionSigning: STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY,
      reasons: ['apksigner is required to verify APK signatures and was not found.'],
    }
    return finish(result, apk, aab)
  }

  const result = classifyAndroidDistributionSigning({
    apk: {
      exists: apk.exists,
      signed: apk.signed,
      verifyPassed: apk.verifyPassed,
      applicationId: apk.applicationId,
      signer: apk.signer,
    },
    aab: {
      exists: aab.exists,
      signed: aab.signed,
      verifyPassed: aab.verifyPassed,
      signer: aab.signer,
    },
    expectedSha256: signingEnv.expectedSha256,
    trackedSecrets,
    gitignoreMissing,
    debugKeystoreConfigured: Boolean(signingEnv.keystorePath && signingEnv.keystorePath.toLowerCase().endsWith('debug.keystore')),
  })

  return finish(result, apk, aab)
}

function finish(result, apk, aab) {
  console.log('\n==================================================')
  console.log(`ANDROID_RELEASE_BUILD = ${result.releaseBuildable ? 'BUILDABLE' : 'UNAVAILABLE'}`)
  console.log(`ANDROID_SIGNED_FOR_DISTRIBUTION = ${result.distributionSigning}`)
  console.log('==================================================\n')

  if (result.distributionSigning === STATUS.VERIFIED_LOCAL_SIGNING) {
    console.log('🎉 Android local release signing is verified.')
    if (result.signer?.sha256) {
      console.log(`   recordedFingerprintSHA256=${result.signer.sha256}`)
    }
    process.exit(0)
  }

  console.log('📋 Findings:')
  for (const reason of result.reasons) {
    console.log(`   - ${reason}`)
  }

  if (result.distributionSigning === STATUS.BLOCKED_BY_OWNER_AUTHORIZATION) {
    console.log(`\n${ownerAuthorizationRequiredMessage()}\n`)
    process.exit(2)
  }

  if (result.distributionSigning === STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY) {
    process.exit(3)
  }

  if (apk.signed && isDebugCertificate(apk.signer || {})) {
    console.log('ANDROID_SIGNED_FOR_DISTRIBUTION = REFUTED because the signer is the Android debug certificate.')
  }
  process.exit(1)
}

main()
