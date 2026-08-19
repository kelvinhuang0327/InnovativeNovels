import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const developerDir = process.env.DEVELOPER_DIR || '/Applications/Xcode.app/Contents/Developer'
const buildDir = path.join(rootDir, 'ios/build')
const archivePath = path.join(buildDir, 'App.xcarchive')
const appBundlePath = path.join(archivePath, 'Products/Applications/App.app')
const frameworksPath = path.join(appBundlePath, 'Frameworks')
const ipaPath = path.join(buildDir, 'App.ipa')

console.log('🚀 Starting iOS Distribution Build and Signing Pipeline...')

// 1. Ensure build directory exists
fs.mkdirSync(buildDir, { recursive: true })

// 2. Set environment variables
const env = {
  ...process.env,
  DEVELOPER_DIR: developerDir,
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`
}

// 3. Determine signing identity to apply
const customSignIdentity = process.env.CODE_SIGN_IDENTITY || process.env.EXPANDED_CODE_SIGN_IDENTITY || '-'
console.log(`ℹ️ Signing Identity Mode: ${customSignIdentity === '-' ? 'Local / Ad-Hoc (-)' : customSignIdentity}`)

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
  'CODE_SIGNING_ALLOWED=NO',
  'CODE_SIGN_IDENTITY=""',
  'CODE_SIGNING_REQUIRED=NO'
].join(' ')

execSync(archiveCmd, { cwd: rootDir, env, stdio: 'inherit' })

if (!fs.existsSync(appBundlePath)) {
  console.error(`❌ Archive output bundle not found at: ${appBundlePath}`)
  process.exit(1)
}

// 5. Inside-out codesign of embedded frameworks
if (fs.existsSync(frameworksPath)) {
  const frameworks = fs.readdirSync(frameworksPath).filter(f => f.endsWith('.framework'))
  for (const fw of frameworks) {
    const fwPath = path.join(frameworksPath, fw)
    console.log(`🔏 Signing embedded framework: ${fw}...`)
    execSync(`codesign --force --sign "${customSignIdentity}" --timestamp=none "${fwPath}"`, {
      cwd: rootDir,
      env,
      stdio: 'inherit'
    })
  }
}

// 6. Sign main App bundle
console.log('🔏 Signing main App bundle...')
execSync(`codesign --force --sign "${customSignIdentity}" --timestamp=none "${appBundlePath}"`, {
  cwd: rootDir,
  env,
  stdio: 'inherit'
})

// 7. Verify code signature
console.log('🔍 Verifying code signature with codesign --verify...')
execSync(`codesign --verify --deep --strict --verbose=2 "${appBundlePath}"`, {
  cwd: rootDir,
  env,
  stdio: 'inherit'
})

// 8. Package distribution IPA
console.log('📦 Packaging distribution IPA...')
const payloadDir = path.join(buildDir, 'Payload')
fs.rmSync(payloadDir, { recursive: true, force: true })
fs.rmSync(ipaPath, { force: true })
fs.mkdirSync(payloadDir, { recursive: true })

execSync(`cp -R "${appBundlePath}" "${payloadDir}/"`, { cwd: rootDir, env })
execSync(`cd "${buildDir}" && zip -qr App.ipa Payload`, { cwd: rootDir, env })
fs.rmSync(payloadDir, { recursive: true, force: true })

if (!fs.existsSync(ipaPath)) {
  console.error(`❌ Distribution IPA failed to generate at: ${ipaPath}`)
  process.exit(1)
}

const stat = fs.statSync(ipaPath)
console.log(`✅ iOS Distribution IPA created successfully: ${ipaPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
console.log('✅ iOS Distribution Signing Readiness Pipeline Completed.')
