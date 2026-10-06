import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyAndroidDistributionSigning,
  describeSigningEnvPresence,
  EXPECTED_APPLICATION_ID,
  gitignoreHasPattern,
  hasGradlePropertiesSigningSecret,
  hasQuotedSigningSecret,
  isDebugCertificate,
  isDebugKeystorePath,
  missingGitignorePatterns,
  normalizeFingerprint,
  parseAaptPackageName,
  parseApksignerPrintCerts,
  parseJarsignerVerify,
  STATUS,
} from './android-distribution-signing.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const unsignedApk = {
  exists: true,
  signed: false,
  verifyPassed: false,
  applicationId: EXPECTED_APPLICATION_ID,
  signer: null,
}
const unsignedAab = {
  exists: true,
  signed: false,
  verifyPassed: false,
  signer: null,
}

describe('Android distribution signing truth gate', () => {
  it('requires Android keystore exclusions in tracked gitignore files', () => {
    const rootIgnore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')
    const androidIgnore = fs.readFileSync(path.join(repoRoot, 'android/.gitignore'), 'utf8')

    expect(gitignoreHasPattern(rootIgnore, '*.jks')).toBe(true)
    expect(gitignoreHasPattern(rootIgnore, '*.keystore')).toBe(true)
    expect(gitignoreHasPattern(androidIgnore, '*.jks')).toBe(true)
    expect(gitignoreHasPattern(androidIgnore, '*.keystore')).toBe(true)
    expect(missingGitignorePatterns([rootIgnore, androidIgnore])).toEqual([])
    expect(gitignoreHasPattern('#*.keystore\n', '*.keystore')).toBe(false)
  })

  it('keeps release signingConfig env-driven and free of quoted passwords', () => {
    const gradle = fs.readFileSync(path.join(repoRoot, 'android/app/build.gradle'), 'utf8')
    const properties = 'org.gradle.jvmargs=-Xmx1536m\n' // Synthetic properties only; never read local signing configuration.

    expect(gradle).toContain('ANDROID_KEYSTORE_PATH')
    expect(gradle).toContain('ANDROID_KEYSTORE_PASSWORD')
    expect(gradle).toContain('ANDROID_KEY_ALIAS')
    expect(gradle).toContain('ANDROID_KEY_PASSWORD')
    expect(gradle).toContain('signingConfigs')
    expect(gradle).toContain('debug.keystore')
    expect(hasQuotedSigningSecret(gradle)).toBe(false)
    expect(hasGradlePropertiesSigningSecret(properties)).toBe(false)
    expect(
      hasQuotedSigningSecret(`storePassword 'super-secret'\nkeyPassword "also-secret"`),
    ).toBe(true)
  })

  it('classifies unsigned release artifacts as owner-authorization blocked', () => {
    const result = classifyAndroidDistributionSigning({
      apk: unsignedApk,
      aab: unsignedAab,
    })
    expect(result.releaseBuildable).toBe(true)
    expect(result.distributionSigning).toBe(STATUS.BLOCKED_BY_OWNER_AUTHORIZATION)
    expect(result.distributionSigning).not.toBe(STATUS.VERIFIED_LOCAL_SIGNING)
  })

  it('refutes debug-certificate signatures as distribution signed', () => {
    const result = classifyAndroidDistributionSigning({
      apk: {
        exists: true,
        signed: true,
        verifyPassed: true,
        applicationId: EXPECTED_APPLICATION_ID,
        signer: {
          distinguishedName: 'C=US, O=Android, CN=Android Debug',
          sha256: '77:05:4A:89:B3:79:1F:ED:3C:19:9C:BA:DD:09:7E:90:A4:A9:D6:BA:73:FD:73:38:73:CC:55:26:6A:CF:D4:DB',
        },
      },
      aab: {
        exists: true,
        signed: true,
        verifyPassed: true,
        signer: {
          distinguishedName: 'C=US, O=Android, CN=Android Debug',
          sha256: '77:05:4A:89:B3:79:1F:ED:3C:19:9C:BA:DD:09:7E:90:A4:A9:D6:BA:73:FD:73:38:73:CC:55:26:6A:CF:D4:DB',
        },
      },
      expectedSha256: '77054a89b3791fed3c199cbadd097e90a4a9d6ba73fd733873cc55266acfd4db',
    })
    expect(result.distributionSigning).toBe(STATUS.REFUTED)
  })

  it('does not treat an arbitrary temporary signer as distribution verified', () => {
    const tempSigner = {
      distinguishedName: 'CN=Temporary Novel Key, O=Not Authorized',
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }
    const result = classifyAndroidDistributionSigning({
      apk: {
        exists: true,
        signed: true,
        verifyPassed: true,
        applicationId: EXPECTED_APPLICATION_ID,
        signer: tempSigner,
      },
      aab: {
        exists: true,
        signed: true,
        verifyPassed: true,
        signer: tempSigner,
      },
    })
    expect(result.distributionSigning).toBe(STATUS.BLOCKED_BY_OWNER_AUTHORIZATION)
    expect(result.distributionSigning).not.toBe(STATUS.VERIFIED_LOCAL_SIGNING)
  })

  it('verifies only a non-debug signer that matches the recorded fingerprint', () => {
    const fingerprint = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const signer = {
      distinguishedName: 'CN=InnovativeNovels Release, O=InnovativeNovels',
      sha256: fingerprint,
    }
    const result = classifyAndroidDistributionSigning({
      apk: {
        exists: true,
        signed: true,
        verifyPassed: true,
        applicationId: EXPECTED_APPLICATION_ID,
        signer,
      },
      aab: {
        applicationId: EXPECTED_APPLICATION_ID,
        exists: true,
        signed: true,
        verifyPassed: true,
        signer,
      },
      expectedSha256: fingerprint,
      debugFingerprint: 'd'.repeat(64),
    })
    expect(result.distributionSigning).toBe(STATUS.VERIFIED_LOCAL_SIGNING)
  })

  it('refutes a signer whose fingerprint does not match the recorded identity', () => {
    const signer = {
      distinguishedName: 'CN=Someone Else, O=Else',
      sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }
    const result = classifyAndroidDistributionSigning({
      apk: {
        exists: true,
        signed: true,
        verifyPassed: true,
        applicationId: EXPECTED_APPLICATION_ID,
        signer,
      },
      aab: {
        exists: true,
        signed: true,
        verifyPassed: true,
        signer,
      },
      expectedSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    })
    expect(result.distributionSigning).toBe(STATUS.REFUTED)
  })

  it('detects debug keystore paths and certificate DNs', () => {
    expect(isDebugKeystorePath('/Users/kelvin/.android/debug.keystore')).toBe(true)
    expect(isDebugKeystorePath('release.jks')).toBe(false)
    expect(isDebugCertificate({ distinguishedName: 'C=US, O=Android, CN=Android Debug' })).toBe(true)
    expect(isDebugCertificate({ distinguishedName: 'CN=InnovativeNovels Release' })).toBe(false)
    expect(normalizeFingerprint('AB:CD:EF')).toBe('abcdef')
  })

  it('parses unsigned and signed tool output without exposing secrets', () => {
    const unsignedApkOutput = 'DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF\n'
    const signedApkOutput = [
      'Signer #1 certificate DN: CN=InnovativeNovels Release, O=InnovativeNovels',
      'Signer #1 certificate SHA-256 digest: 01:23:45:67:89:AB',
      'Signer #1 certificate SHA-1 digest: AA:BB:CC',
    ].join('\n')
    const unsignedJar = 'jar is unsigned.\n'
    const signedJar = 'jar verified.\nOwner: CN=InnovativeNovels Release, O=InnovativeNovels\nSHA256: 01:23:45:67:89:AB\n'

    expect(parseApksignerPrintCerts(unsignedApkOutput).signed).toBe(false)
    expect(parseApksignerPrintCerts(signedApkOutput)).toMatchObject({
      signed: true,
      distinguishedName: 'CN=InnovativeNovels Release, O=InnovativeNovels',
      sha256: '01:23:45:67:89:AB',
    })
    expect(parseJarsignerVerify(unsignedJar).signed).toBe(false)
    expect(parseJarsignerVerify(signedJar).signed).toBe(true)
    expect(parseAaptPackageName("package: name='com.innovativenovels.app' versionCode='1'")).toBe(
      EXPECTED_APPLICATION_ID,
    )
  })

  it('reports signing env presence without retaining secret values', () => {
    const presence = describeSigningEnvPresence({
      ANDROID_KEYSTORE_PATH: '/secret/path/release.jks',
      ANDROID_KEYSTORE_PASSWORD: 'not-for-logs',
    })
    expect(presence.ANDROID_KEYSTORE_PATH).toBe('SET')
    expect(presence.ANDROID_KEYSTORE_PASSWORD).toBe('SET')
    expect(presence.ANDROID_KEY_ALIAS).toBe('UNSET')
    expect(presence.complete).toBe(false)
    expect(JSON.stringify(presence)).not.toContain('not-for-logs')
    expect(JSON.stringify(presence)).not.toContain('/secret/path/release.jks')
  })
})


describe('Canonical signing evidence requirements', () => {
  const fingerprint = 'a'.repeat(64)
  const signer = { distinguishedName: 'CN=Synthetic Release', sha256: fingerprint }
  const signedArtifact = { exists: true, signed: true, verifyPassed: true, applicationId: EXPECTED_APPLICATION_ID, signer }
  const evidence = { apk: signedArtifact, aab: signedArtifact, expectedSha256: fingerprint, debugFingerprint: 'd'.repeat(64) }

  it('does not verify an AAB whose application ID was not read', () => {
    expect(classifyAndroidDistributionSigning({ ...evidence, aab: { ...signedArtifact, applicationId: undefined } }).distributionSigning).toBe(STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY)
  })
  it('does not verify missing explicit signature-validation evidence', () => {
    expect(classifyAndroidDistributionSigning({ ...evidence, apk: { ...signedArtifact, verifyPassed: undefined } }).distributionSigning).toBe(STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY)
  })
  it('does not verify without the debug-certificate comparison', () => {
    expect(classifyAndroidDistributionSigning({ ...evidence, debugFingerprint: '' }).distributionSigning).toBe(STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY)
  })
  it('refutes the actual debug fingerprint even with a different certificate DN', () => {
    expect(classifyAndroidDistributionSigning({ ...evidence, debugFingerprint: fingerprint }).distributionSigning).toBe(STATUS.REFUTED)
  })
  it('refutes a malformed short fingerprint even when expected and actual match', () => {
    const shortSigner = { ...signer, sha256: 'abcdef' }
    expect(classifyAndroidDistributionSigning({ ...evidence, apk: { ...signedArtifact, signer: shortSigner }, aab: { ...signedArtifact, signer: shortSigner }, expectedSha256: 'abcdef' }).distributionSigning).toBe(STATUS.REFUTED)
  })
  it('requires both artifact outputs before claiming a buildable release', () => {
    const result = classifyAndroidDistributionSigning({ ...evidence, aab: { exists: false } })
    expect(result.releaseBuildable).toBe(false)
    expect(result.distributionSigning).toBe(STATUS.BLOCKED_BY_EXTERNAL_CAPABILITY)
  })
})
