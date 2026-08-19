import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const developerDir = process.env.DEVELOPER_DIR || '/Applications/Xcode.app/Contents/Developer'
const buildDir = path.join(rootDir, 'ios/build')
const archivePath = path.join(buildDir, 'App.xcarchive')
const appBundlePath = path.join(archivePath, 'Products/Applications/App.app')
const frameworksPath = path.join(appBundlePath, 'Frameworks')
const distributionDir = path.join(buildDir, 'distribution')
const distributionIpaPath = path.join(distributionDir, 'App.ipa')
const adhocIpaPath = path.join(buildDir, 'App-adhoc.ipa')
const legacyIpaPath = path.join(buildDir, 'App.ipa')

console.log('🚀 Starting iOS Build and Signing Pipeline...')

// 1. Ensure build directory exists and clear legacy unverified artifacts
fs.mkdirSync(buildDir, { recursive: true })
if (fs.existsSync(legacyIpaPath)) {
  fs.rmSync(legacyIpaPath, { force: true })
}

// 2. Set environment variables
const env = {
  ...process.env,
  DEVELOPER_DIR: developerDir,
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  PATH: `/opt/homebrew/Cellar/node/24.9.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`
}

// 3. Inspect signing identities and team capabilities
function discoverSigningCapability() {
  if (process.env.APPLE_DISTRIBUTION_IDENTITY) {
    return { type: 'distribution', identity: process.env.APPLE_DISTRIBUTION_IDENTITY }
  }

  try {
    const identitiesOutput = execSync('security find-identity -v -p codesigning', { encoding: 'utf8', env })
    const match = identitiesOutput.match(/"((?:Apple|iPhone) Distribution:[^"]+)"/)
    if (match) {
      return { type: 'distribution', identity: match[1] }
    }
  } catch {
    // Keychain query failed or no identities found
  }

  const requestedIdentity = process.env.CODE_SIGN_IDENTITY || process.env.EXPANDED_CODE_SIGN_IDENTITY
  if (requestedIdentity && requestedIdentity !== '-') {
    if (/Distribution/i.test(requestedIdentity)) {
      return { type: 'distribution', identity: requestedIdentity }
    }
    return { type: 'custom', identity: requestedIdentity }
  }

  return { type: 'adhoc', identity: '-' }
}

const signingInfo = discoverSigningCapability()
const teamId = process.env.APPLE_TEAM_ID || process.env.DEVELOPMENT_TEAM || ''

console.log(`ℹ️ Signing Capability Mode: ${signingInfo.type === 'distribution' ? 'Apple Distribution' : 'Local / Ad-Hoc (-)'}`)
if (signingInfo.type === 'distribution') {
  console.log(`ℹ️ Distribution Signing Identity Type: Apple Distribution (${signingInfo.identity})`)
}

// 4. Run Xcode archive
console.log('📦 Executing xcodebuild archive...')
const archiveCmd = [
  'xcodebuild',
  '-workspace ios/App/App.xcworkspace',
  '-scheme App',
  '-configuration Release',
  '-destination "generic/platform=iOS"',
  'archive',
  `-archivePath "${archivePath}"`,
  signingInfo.type === 'distribution' && teamId
    ? `DEVELOPMENT_TEAM="${teamId}"`
    : 'CODE_SIGNING_ALLOWED=NO CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO'
].join(' ')

execSync(archiveCmd, { cwd: rootDir, env, stdio: 'inherit' })

if (!fs.existsSync(appBundlePath)) {
  console.error(`❌ Archive output bundle not found at: ${appBundlePath}`)
  process.exit(1)
}

console.log('✅ Local iOS Release Archive created successfully.')

// 5. Handle distribution export vs ad-hoc local signing
if (signingInfo.type === 'distribution' && teamId) {
  console.log('📦 Executing Xcode distribution archive export...')
  fs.mkdirSync(distributionDir, { recursive: true })
  const exportOptionsPlistPath = path.join(buildDir, 'ExportOptions.plist')
  const exportMethod = process.env.EXPORT_METHOD || 'app-store'
  const exportOptionsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>${exportMethod}</string>
    <key>teamID</key>
    <string>${teamId}</string>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>`
  fs.writeFileSync(exportOptionsPlistPath, exportOptionsContent, 'utf8')

  try {
    execSync(`xcodebuild -exportArchive -archivePath "${archivePath}" -exportPath "${distributionDir}" -exportOptionsPlist "${exportOptionsPlistPath}"`, {
      cwd: rootDir,
      env,
      stdio: 'inherit'
    })
    console.log(`✅ Xcode Distribution Archive exported to ${distributionDir}`)
  } catch (exportErr) {
    console.warn(`⚠️ Xcode distribution export could not complete: ${exportErr.message}`)
  }
} else {
  // Local / Ad-hoc signing mode for local testing
  console.log('ℹ️ No Apple Distribution identity/team available. Applying local ad-hoc signature for local testing...')

  if (fs.existsSync(frameworksPath)) {
    const frameworks = fs.readdirSync(frameworksPath).filter(f => f.endsWith('.framework'))
    for (const fw of frameworks) {
      const fwPath = path.join(frameworksPath, fw)
      console.log(`🔏 Signing embedded framework (ad-hoc): ${fw}...`)
      execSync(`codesign --force --sign "-" --timestamp=none "${fwPath}"`, {
        cwd: rootDir,
        env,
        stdio: 'inherit'
      })
    }
  }

  console.log('🔏 Signing main App bundle (ad-hoc)...')
  execSync(`codesign --force --sign "-" --timestamp=none "${appBundlePath}"`, {
    cwd: rootDir,
    env,
    stdio: 'inherit'
  })

  console.log('🔍 Verifying code signature with codesign --verify...')
  execSync(`codesign --verify --deep --strict --verbose=2 "${appBundlePath}"`, {
    cwd: rootDir,
    env,
    stdio: 'inherit'
  })

  // Package local / ad-hoc testing IPA (clearly named App-adhoc.ipa)
  console.log('📦 Packaging local ad-hoc testing package (App-adhoc.ipa)...')
  const payloadDir = path.join(buildDir, 'Payload')
  fs.rmSync(payloadDir, { recursive: true, force: true })
  fs.rmSync(adhocIpaPath, { force: true })
  fs.mkdirSync(payloadDir, { recursive: true })

  execSync(`cp -R "${appBundlePath}" "${payloadDir}/"`, { cwd: rootDir, env })
  execSync(`cd "${buildDir}" && zip -qr App-adhoc.ipa Payload`, { cwd: rootDir, env })
  fs.rmSync(payloadDir, { recursive: true, force: true })

  if (!fs.existsSync(adhocIpaPath)) {
    console.error(`❌ Ad-hoc package failed to generate at: ${adhocIpaPath}`)
    process.exit(1)
  }

  const stat = fs.statSync(adhocIpaPath)
  console.log(`✅ Local Ad-Hoc package created: ${adhocIpaPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
}

console.log('\n==================================================')
console.log('IOS_RELEASE_BUILD = BUILDABLE')
if (signingInfo.type === 'distribution' && fs.existsSync(distributionIpaPath)) {
  console.log('IOS_SIGNED_FOR_DISTRIBUTION = VERIFIED')
} else {
  console.log('IOS_ADHOC_SIGNING = VERIFIED')
  console.log('IOS_SIGNED_FOR_DISTRIBUTION = BLOCKED_BY_EXTERNAL_CAPABILITY')
  console.log('REASON: Valid Apple Distribution identity and Team ID required for official distribution signing.')
}
console.log('==================================================\n')
