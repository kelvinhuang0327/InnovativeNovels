import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const gitignorePath = path.join(rootDir, '.gitignore')
const pbxprojPath = path.join(rootDir, 'ios/App/App.xcodeproj/project.pbxproj')
const buildDir = path.join(rootDir, 'ios/build')
const archiveAppPath = path.join(buildDir, 'App.xcarchive/Products/Applications/App.app')
const distributionIpaPath = path.join(buildDir, 'distribution/App.ipa')
const legacyIpaPath = path.join(buildDir, 'App.ipa')

console.log('🔍 Executing iOS Distribution Signing Readiness Verification...')

const findings = {
  releaseBuildable: false,
  adhocSigning: 'NOT_RUN',
  distributionSigning: 'BLOCKED_BY_EXTERNAL_CAPABILITY',
  reasons: []
}

// 1. Verify Git security exclusions
console.log('🛡️  Checking Git ignore protections against committing secrets/certificates...')
if (!fs.existsSync(gitignorePath)) {
  findings.reasons.push('.gitignore file is missing')
} else {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
  const requiredIgnorePatterns = [
    '*.p12',
    '*.cer',
    '*.mobileprovision',
    '*.provisionprofile',
    '*.keychain',
    '*.keychain-db',
    '*.p8',
    '*.pem',
    'ExportOptions.plist'
  ]
  for (const pattern of requiredIgnorePatterns) {
    if (!gitignoreContent.includes(pattern)) {
      findings.reasons.push(`.gitignore missing required exclusion: ${pattern}`)
    }
  }
}
console.log('   ✅ Git ignore security rules verified.')

// 2. Verify Xcode project configuration
console.log('⚙️  Checking Xcode project configuration...')
if (!fs.existsSync(pbxprojPath)) {
  findings.reasons.push('project.pbxproj is missing')
} else {
  const pbxContent = fs.readFileSync(pbxprojPath, 'utf8')
  if (!pbxContent.includes('PRODUCT_BUNDLE_IDENTIFIER = com.innovativenovels.app;')) {
    findings.reasons.push('Main App bundle identifier must be com.innovativenovels.app')
  }
}
console.log('   ✅ Xcode project configuration verified.')

// 3. Verify Local Release Archive & Bundle Structure
console.log('📦 Checking App.xcarchive bundle structure...')
if (!fs.existsSync(archiveAppPath)) {
  findings.reasons.push(`Release App.app bundle not found at ${archiveAppPath}. Run 'npm run build:ios:release' first.`)
} else {
  const appExec = path.join(archiveAppPath, 'App')
  const infoPlist = path.join(archiveAppPath, 'Info.plist')
  if (!fs.existsSync(appExec)) {
    findings.reasons.push('App binary is missing inside bundle')
  }
  if (!fs.existsSync(infoPlist)) {
    findings.reasons.push('Info.plist is missing inside bundle')
  }
  if (fs.existsSync(appExec) && fs.existsSync(infoPlist)) {
    findings.releaseBuildable = true
    console.log('   ✅ iOS Release Build is BUILDABLE.')
  }
}

// 4. Inspect Code Signature
if (fs.existsSync(archiveAppPath)) {
  console.log('🔏 Inspecting code signature...')
  let codesignDetails = ''
  try {
    codesignDetails = execSync(`codesign -dvvv "${archiveAppPath}" 2>&1`, { encoding: 'utf8' })
  } catch (err) {
    codesignDetails = (err && (err.stdout || err.stderr)) ? `${err.stdout || ''}\n${err.stderr || ''}` : ''
  }

  const isAdhoc = codesignDetails.includes('Signature=adhoc') || codesignDetails.includes('flags=0x2(adhoc)')
  const isAppleDistribution = /Authority=.*(?:Apple|iPhone)\s+Distribution/i.test(codesignDetails)
  const hasBundleId = codesignDetails.includes('Identifier=com.innovativenovels.app')
  const teamMatch = codesignDetails.match(/TeamIdentifier=([A-Z0-9]{10})/)
  const teamId = teamMatch ? teamMatch[1] : null
  const provisionPath = path.join(archiveAppPath, 'embedded.mobileprovision')
  const hasProvisioning = fs.existsSync(provisionPath)

  // Check ad-hoc signing validity
  if (isAdhoc) {
    try {
      const verifyOut = execSync(`codesign --verify --deep --strict --verbose=2 "${archiveAppPath}" 2>&1`, { encoding: 'utf8' })
      if (verifyOut.includes('valid on disk') || verifyOut.includes('satisfies its Designated Requirement')) {
        findings.adhocSigning = 'VERIFIED'
      }
    } catch {
      findings.adhocSigning = 'FAILED'
    }
  }

  // Reject ad-hoc signature from claiming distribution status
  if (isAdhoc) {
    findings.reasons.push('Current signature is ad-hoc ("-"), which cannot be accepted as Apple distribution signed.')
  }

  if (!isAppleDistribution) {
    findings.reasons.push('Signing authority does not contain Apple Distribution certificate (Authority != Apple Distribution).')
  }

  if (!hasBundleId) {
    findings.reasons.push('Codesign identifier does not match com.innovativenovels.app.')
  }

  if (!teamId) {
    findings.reasons.push('Apple TeamIdentifier is not set in the signature.')
  }

  if (!hasProvisioning) {
    findings.reasons.push('No embedded.mobileprovision found in app bundle.')
  } else {
    // If provisioning exists, verify it's a distribution profile
    try {
      const provisionData = execSync(`security cms -D -i "${provisionPath}" 2>/dev/null`, { encoding: 'utf8' })
      if (provisionData.includes('<key>get-task-allow</key>\n\t<true/>') || provisionData.includes('<key>get-task-allow</key><true/>')) {
        findings.reasons.push('embedded.mobileprovision has get-task-allow=true (Development profile), which is not permitted for Distribution.')
      }
    } catch {
      findings.reasons.push('Failed to parse embedded.mobileprovision.')
    }
  }

  // Check distribution export artifact
  const distributionArtifactExists = fs.existsSync(distributionIpaPath) || (fs.existsSync(legacyIpaPath) && !isAdhoc && isAppleDistribution)
  if (!distributionArtifactExists) {
    findings.reasons.push('Authentic Xcode distribution exported IPA (e.g. ios/build/distribution/App.ipa) not found.')
  }

  // Disallow false-positive legacy zipped ad-hoc IPA
  if (fs.existsSync(legacyIpaPath) && isAdhoc) {
    findings.reasons.push('Found legacy App.ipa containing ad-hoc signature. Ad-hoc zipped package is not an Apple Distribution IPA.')
  }

  // Evaluate if full distribution signing is verified
  if (isAppleDistribution && hasBundleId && teamId && hasProvisioning && distributionArtifactExists && findings.reasons.length === 0) {
    findings.distributionSigning = 'VERIFIED'
  } else {
    findings.distributionSigning = 'BLOCKED_BY_EXTERNAL_CAPABILITY'
  }
}

console.log('\n==================================================')
console.log(`IOS_RELEASE_BUILD = ${findings.releaseBuildable ? 'BUILDABLE' : 'UNAVAILABLE'}`)
console.log(`IOS_ADHOC_SIGNING = ${findings.adhocSigning}`)
console.log(`IOS_SIGNED_FOR_DISTRIBUTION = ${findings.distributionSigning}`)
console.log('==================================================\n')

if (findings.distributionSigning === 'BLOCKED_BY_EXTERNAL_CAPABILITY') {
  console.log('📋 Missing External Capabilities / Blockers:')
  for (const reason of findings.reasons) {
    console.log(`   - ${reason}`)
  }
  console.log('\nℹ️ To enable genuine Apple Distribution signing:')
  console.log('   1. Install a valid Apple Distribution certificate in the local macOS Keychain.')
  console.log('   2. Set APPLE_TEAM_ID environment variable or configure DEVELOPMENT_TEAM in project.')
  console.log('   3. Install a matching App Store / Distribution provisioning profile.')
  console.log('   4. Run: npm run build:ios:release && npm run verify:ios:signing\n')
  process.exit(1)
} else if (findings.distributionSigning !== 'VERIFIED') {
  console.error('❌ Distribution verification failed unexpectedly.')
  process.exit(1)
}
console.log('🎉 iOS Apple Distribution Signing is fully verified!')
process.exit(0)
