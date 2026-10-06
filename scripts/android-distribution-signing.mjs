export const EXPECTED_APPLICATION_ID = 'com.innovativenovels.app'

export const ENV_KEYS = {
  KEYSTORE_PATH: 'ANDROID_KEYSTORE_PATH',
  KEYSTORE_PASSWORD: 'ANDROID_KEYSTORE_PASSWORD',
  KEY_ALIAS: 'ANDROID_KEY_ALIAS',
  KEY_PASSWORD: 'ANDROID_KEY_PASSWORD',
  RELEASE_CERT_SHA256: 'ANDROID_RELEASE_CERT_SHA256',
}

export const GITIGNORE_PATTERNS = ['*.jks', '*.keystore']

export const STATUS = {
  VERIFIED_LOCAL_SIGNING: 'VERIFIED_LOCAL_SIGNING',
  REFUTED: 'REFUTED',
  BLOCKED_BY_OWNER_AUTHORIZATION: 'BLOCKED_BY_OWNER_AUTHORIZATION',
  BLOCKED_BY_EXTERNAL_CAPABILITY: 'BLOCKED_BY_EXTERNAL_CAPABILITY',
}

const QUOTED_SIGNING_SECRET =
  /(?:storePassword|keyPassword)\s+['"][^'"\n]+['"]/

const GRADLE_PROPERTIES_SECRET =
  /(?:^|[\n\r])\s*(?:storePassword|keyPassword|RELEASE_STORE_PASSWORD|RELEASE_KEY_PASSWORD|MYAPP_RELEASE_STORE_PASSWORD|MYAPP_RELEASE_KEY_PASSWORD)\s*=\s*\S+/i

export function normalizeFingerprint(value) {
  if (!value) {
    return ''
  }
  return String(value).replace(/[^0-9a-fA-F]/g, '').toLowerCase()
}

export function isDebugCertificate({ distinguishedName = '', sha256 = '', debugFingerprint = '' } = {}) {
  const actual = normalizeFingerprint(sha256)
  const debug = normalizeFingerprint(debugFingerprint)
  return /android\s+debug/i.test(String(distinguishedName)) || Boolean(actual && debug && actual === debug)
}

export function isDebugKeystorePath(filePath) {
  if (!filePath) {
    return false
  }
  const normalized = String(filePath).replace(/\\/g, '/').toLowerCase()
  return normalized === 'debug.keystore' || normalized.endsWith('/debug.keystore')
}

export function hasQuotedSigningSecret(sourceText) {
  return QUOTED_SIGNING_SECRET.test(String(sourceText || ''))
}

export function hasGradlePropertiesSigningSecret(sourceText) {
  return GRADLE_PROPERTIES_SECRET.test(String(sourceText || ''))
}

export function gitignoreHasPattern(gitignoreText, pattern) {
  const lines = String(gitignoreText || '').split(/\r?\n/)
  return lines.some((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return false
    }
    return trimmed === pattern
  })
}

export function missingGitignorePatterns(gitignoreTexts, patterns = GITIGNORE_PATTERNS) {
  return patterns.filter(
    (pattern) => !gitignoreTexts.some((text) => gitignoreHasPattern(text, pattern)),
  )
}

export function readSigningEnv(env = process.env) {
  return {
    keystorePath: env[ENV_KEYS.KEYSTORE_PATH] || '',
    keystorePassword: env[ENV_KEYS.KEYSTORE_PASSWORD] || '',
    keyAlias: env[ENV_KEYS.KEY_ALIAS] || '',
    keyPassword: env[ENV_KEYS.KEY_PASSWORD] || '',
    expectedSha256: env[ENV_KEYS.RELEASE_CERT_SHA256] || '',
  }
}

export function describeSigningEnvPresence(env = process.env) {
  const values = readSigningEnv(env)
  return {
    ANDROID_KEYSTORE_PATH: values.keystorePath ? 'SET' : 'UNSET',
    ANDROID_KEYSTORE_PASSWORD: values.keystorePassword ? 'SET' : 'UNSET',
    ANDROID_KEY_ALIAS: values.keyAlias ? 'SET' : 'UNSET',
    ANDROID_KEY_PASSWORD: values.keyPassword ? 'SET' : 'UNSET',
    ANDROID_RELEASE_CERT_SHA256: values.expectedSha256 ? 'SET' : 'UNSET',
    complete: Boolean(
      values.keystorePath && values.keystorePassword && values.keyAlias && values.keyPassword,
    ),
    debugKeystore: isDebugKeystorePath(values.keystorePath),
  }
}

export function parseApksignerPrintCerts(output) {
  const text = String(output || '')
  const unsigned =
    /DOES NOT VERIFY/i.test(text) ||
    /Missing META-INF\/MANIFEST\.MF/i.test(text) ||
    /not signed/i.test(text) ||
    /JAR signer CERT\.RSA.*digest verification failed/i.test(text)

  const dnMatch = text.match(/certificate DN:\s*(.+)/i)
  const sha256Match = text.match(/SHA-256 digest:\s*([0-9A-Fa-f:]+)/i)
  const sha1Match = text.match(/SHA-1 digest:\s*([0-9A-Fa-f:]+)/i)
  const signed = !unsigned && Boolean(dnMatch || sha256Match)

  return {
    signed,
    verifyPassed: signed && !/DOES NOT VERIFY/i.test(text),
    distinguishedName: dnMatch ? dnMatch[1].trim() : '',
    sha256: sha256Match ? sha256Match[1].trim() : '',
    sha1: sha1Match ? sha1Match[1].trim() : '',
  }
}

export function parseJarsignerVerify(output) {
  const text = String(output || '')
  const unsigned = /jar is unsigned/i.test(text) || /no manifest/i.test(text)
  const verified = /jar verified/i.test(text)
  const ownerMatch = text.match(/Owner:\s*([^\n]+)/i)
  const sha256Match = text.match(/SHA(?:-)?256:\s*([0-9A-Fa-f:]+)/i)

  return {
    signed: verified && !unsigned,
    verifyPassed: verified && !unsigned,
    distinguishedName: ownerMatch ? ownerMatch[1].trim() : '',
    sha256: sha256Match ? sha256Match[1].trim() : '',
  }
}

export function parseAaptPackageName(output) {
  const match = String(output || '').match(/package:\s*name='([^']+)'/)
  return match ? match[1] : ''
}

export function classifyAndroidDistributionSigning({
  apk = {}, aab = {}, expectedSha256 = '', trackedSecrets = [],
  gitignoreMissing = [], debugKeystoreConfigured = false, debugFingerprint = '',
} = {}) {
  const releaseBuildable = Boolean(apk.exists && aab.exists)
  const result = (distributionSigning, reasons) => ({ releaseBuildable, distributionSigning, reasons })
  if (trackedSecrets.length || gitignoreMissing.length) {
    return result(STATUS.REFUTED, ['Tracked signing material or required keystore exclusions failed verification.'])
  }
  if (debugKeystoreConfigured) return result(STATUS.REFUTED, ['Configured signing path is debug.keystore.'])
  if (!releaseBuildable) return result(STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY, ['Both release APK and AAB artifacts are required.'])
  const artifacts = [apk, aab]
  const debug = normalizeFingerprint(debugFingerprint)
  if (artifacts.some(artifact => artifact.signed && isDebugCertificate({ ...artifact.signer, debugFingerprint }))) {
    return result(STATUS.REFUTED, ['Android debug certificates cannot be distribution identities.'])
  }
  if (artifacts.some(artifact => !artifact.signed)) {
    return result(STATUS.BLOCKED_BY_OWNER_AUTHORIZATION, ['Both release artifacts require authorized signatures.'])
  }
  if (artifacts.some(artifact => artifact.verifyPassed === false)) {
    return result(STATUS.REFUTED, ['Artifact signature verification failed.'])
  }
  const expected = normalizeFingerprint(expectedSha256)
  if (!expectedSha256) return result(STATUS.BLOCKED_BY_OWNER_AUTHORIZATION, ['An authorized release certificate fingerprint is required.'])
  if (expected.length !== 64) return result(STATUS.REFUTED, ['Expected certificate fingerprint is not SHA-256.'])
  const fingerprints = artifacts.map(artifact => normalizeFingerprint(artifact.signer?.sha256))
  if (fingerprints.some(fingerprint => fingerprint && (fingerprint.length !== 64 || fingerprint !== expected))) {
    return result(STATUS.REFUTED, ['Artifact certificate fingerprint does not match the authorized SHA-256 identity.'])
  }
  if (artifacts.some(artifact => artifact.applicationId && artifact.applicationId !== EXPECTED_APPLICATION_ID)) {
    return result(STATUS.REFUTED, ['Artifact application ID differs from the expected application.'])
  }
  if (artifacts.some(artifact => artifact.verifyPassed !== true || artifact.applicationId !== EXPECTED_APPLICATION_ID)
    || fingerprints.some(fingerprint => fingerprint.length !== 64) || debug.length !== 64) {
    return result(STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY, ['Explicit signature, both application IDs, certificate hashes, and debug-certificate comparison evidence are required.'])
  }
  return { ...result(STATUS.VERIFIED_LOCAL_SIGNING, []), signer: { ...apk.signer } }
}

export function ownerAuthorizationRequiredMessage() {
  return [
    'OWNER_AUTHORIZATION_REQUIRED',
    'ACTION: Create one long-lived Android release/upload signing identity for com.innovativenovels.app.',
    'WHY_REQUIRED: Release APK/AAB are buildable but no authorized release signing identity exists.',
    'MINIMUM_AUTHORIZATION_NEEDED: ANDROID_RELEASE_SIGNING_IDENTITY_CREATION_APPROVED',
  ].join('\n')
}
