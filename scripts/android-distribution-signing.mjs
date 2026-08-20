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

export function isDebugCertificate({ distinguishedName = '' } = {}) {
  return /CN\s*=\s*Android Debug/i.test(String(distinguishedName))
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
  apk = {},
  aab = {},
  expectedSha256 = '',
  trackedSecrets = [],
  gitignoreMissing = [],
  debugKeystoreConfigured = false,
} = {}) {
  const reasons = []
  const apkExists = Boolean(apk.exists)
  const aabExists = Boolean(aab.exists)
  const releaseBuildable = apkExists || aabExists
  const apkSigned = Boolean(apk.signed)
  const aabSigned = Boolean(aab.signed)
  const signer = apk.signer || aab.signer || {}
  const distinguishedName = signer.distinguishedName || ''
  const actualSha256 = normalizeFingerprint(signer.sha256)
  const expected = normalizeFingerprint(expectedSha256)
  const debugSigner = debugKeystoreConfigured || isDebugCertificate({ distinguishedName })

  if (trackedSecrets.length > 0) {
    reasons.push(`Tracked signing secret material is present: ${trackedSecrets.join(', ')}`)
    return {
      releaseBuildable,
      distributionSigning: STATUS.REFUTED,
      reasons,
    }
  }

  if (gitignoreMissing.length > 0) {
    reasons.push(`.gitignore missing required exclusion: ${gitignoreMissing.join(', ')}`)
  }

  if (!releaseBuildable) {
    reasons.push('Release APK/AAB artifacts were not found. Run npm run build:android:release first.')
    return {
      releaseBuildable: false,
      distributionSigning: STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY,
      reasons,
    }
  }

  if (debugSigner && (apkSigned || aabSigned)) {
    reasons.push('Signer is the Android debug certificate, which cannot be a production/distribution identity.')
    return {
      releaseBuildable,
      distributionSigning: STATUS.REFUTED,
      reasons,
    }
  }

  if (!apkSigned && !aabSigned) {
    reasons.push('Release APK/AAB are unsigned.')
    reasons.push('No authorized Android release/upload signing identity is configured.')
    return {
      releaseBuildable: true,
      distributionSigning: STATUS.BLOCKED_BY_OWNER_AUTHORIZATION,
      reasons,
    }
  }

  if (apkExists && !apkSigned) {
    reasons.push('Release APK exists but is unsigned.')
  }
  if (aabExists && !aabSigned) {
    reasons.push('Release AAB exists but is unsigned.')
  }
  if (apkExists && apkSigned && apk.verifyPassed === false) {
    reasons.push('APK apksigner verification did not succeed.')
  }
  if (aabExists && aabSigned && aab.verifyPassed === false) {
    reasons.push('AAB jarsigner verification did not succeed.')
  }

  const applicationId = apk.applicationId || aab.applicationId || ''
  if (applicationId && applicationId !== EXPECTED_APPLICATION_ID) {
    reasons.push(`Application id is ${applicationId}, expected ${EXPECTED_APPLICATION_ID}.`)
  }

  if (apkSigned && aabSigned && apk.signer?.sha256 && aab.signer?.sha256) {
    if (normalizeFingerprint(apk.signer.sha256) !== normalizeFingerprint(aab.signer.sha256)) {
      reasons.push('APK and AAB signer fingerprints do not match.')
    }
  }

  if (debugKeystoreConfigured) {
    reasons.push('Configured keystore path is debug.keystore.')
  }

  if (gitignoreMissing.length > 0) {
    return {
      releaseBuildable,
      distributionSigning: STATUS.REFUTED,
      reasons,
    }
  }

  const bothArtifactsSigned =
    apkExists &&
    aabExists &&
    apkSigned &&
    aabSigned &&
    apk.verifyPassed !== false &&
    aab.verifyPassed !== false &&
    (!applicationId || applicationId === EXPECTED_APPLICATION_ID) &&
    reasons.length === 0

  if (!bothArtifactsSigned) {
    if (!apkSigned || !aabSigned) {
      return {
        releaseBuildable,
        distributionSigning: STATUS.BLOCKED_BY_OWNER_AUTHORIZATION,
        reasons,
      }
    }
    return {
      releaseBuildable,
      distributionSigning: STATUS.REFUTED,
      reasons,
    }
  }

  if (!expected) {
    reasons.push(
      'Artifact is signed by a non-debug certificate, but ANDROID_RELEASE_CERT_SHA256 is not set. Unknown or temporary signers are not distribution identities.',
    )
    return {
      releaseBuildable,
      distributionSigning: STATUS.BLOCKED_BY_OWNER_AUTHORIZATION,
      reasons,
    }
  }

  if (!actualSha256) {
    reasons.push('Signer certificate SHA-256 fingerprint could not be read.')
    return {
      releaseBuildable,
      distributionSigning: STATUS.REFUTED,
      reasons,
    }
  }

  if (actualSha256 !== expected) {
    reasons.push('Signer SHA-256 fingerprint does not match ANDROID_RELEASE_CERT_SHA256.')
    return {
      releaseBuildable,
      distributionSigning: STATUS.REFUTED,
      reasons,
    }
  }

  return {
    releaseBuildable: true,
    distributionSigning: STATUS.VERIFIED_LOCAL_SIGNING,
    reasons: [],
    signer: {
      distinguishedName,
      sha256: signer.sha256 || '',
      sha1: signer.sha1 || '',
    },
  }
}

export function ownerAuthorizationRequiredMessage() {
  return [
    'OWNER_AUTHORIZATION_REQUIRED',
    'ACTION: Create one long-lived Android release/upload signing identity for com.innovativenovels.app.',
    'WHY_REQUIRED: Release APK/AAB are buildable but no authorized release signing identity exists.',
    'MINIMUM_AUTHORIZATION_NEEDED: ANDROID_RELEASE_SIGNING_IDENTITY_CREATION_APPROVED',
  ].join('\n')
}
