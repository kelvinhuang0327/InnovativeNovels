import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Verification Failure: ${message}`)
    process.exit(1)
  }
}

console.log('🔍 Executing iOS Distribution Signing Readiness Verification...')

const rootDir = process.cwd()
const gitignorePath = path.join(rootDir, '.gitignore')
const pbxprojPath = path.join(rootDir, 'ios/App/App.xcodeproj/project.pbxproj')
const buildDir = path.join(rootDir, 'ios/build')
const archiveAppPath = path.join(buildDir, 'App.xcarchive/Products/Applications/App.app')
const ipaPath = path.join(buildDir, 'App.ipa')

// 1. Verify Git security exclusions
console.log('🛡️  Checking Git ignore protections against committing secrets/certificates...')
assert(fs.existsSync(gitignorePath), '.gitignore file is missing')
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
  assert(gitignoreContent.includes(pattern), `.gitignore missing required exclusion: ${pattern}`)
}
console.log('   ✅ Git ignore security rules verified.')

// 2. Verify Xcode project configuration
console.log('⚙️  Checking Xcode project signing configuration...')
assert(fs.existsSync(pbxprojPath), 'project.pbxproj is missing')
const pbxContent = fs.readFileSync(pbxprojPath, 'utf8')
assert(pbxContent.includes('PRODUCT_BUNDLE_IDENTIFIER = com.innovativenovels.app;'), 'Main App bundle identifier must be com.innovativenovels.app')
assert(pbxContent.includes('CODE_SIGN_STYLE = Automatic;'), 'Code signing style must be configured as Automatic')
console.log('   ✅ Xcode project configuration verified.')

// 3. Verify Archive & Bundle Structure
console.log('📦 Checking App.xcarchive bundle structure...')
assert(fs.existsSync(archiveAppPath), `Signed App.app bundle not found at ${archiveAppPath}`)
const appExec = path.join(archiveAppPath, 'App')
const infoPlist = path.join(archiveAppPath, 'Info.plist')
const codeSig = path.join(archiveAppPath, '_CodeSignature/CodeResources')
assert(fs.existsSync(appExec), 'App binary is missing inside bundle')
assert(fs.existsSync(infoPlist), 'Info.plist is missing inside bundle')
assert(fs.existsSync(codeSig), '_CodeSignature/CodeResources is missing inside bundle')
console.log('   ✅ App bundle structure verified.')

// 4. Verify Embedded Frameworks Signatures
console.log('🔏 Checking embedded framework signatures...')
const frameworksPath = path.join(archiveAppPath, 'Frameworks')
if (fs.existsSync(frameworksPath)) {
  const frameworks = fs.readdirSync(frameworksPath).filter(f => f.endsWith('.framework'))
  for (const fw of frameworks) {
    const fwPath = path.join(frameworksPath, fw)
    const res = execSync(`codesign --verify --verbose=2 "${fwPath}" 2>&1`, { encoding: 'utf8' })
    console.log(`   ✅ Framework ${fw}: ${res.trim() || 'valid on disk'}`)
  }
}

// 5. Verify Main Bundle Signature
console.log('🔏 Checking main App bundle signature...')
const codesignVerifyOut = execSync(`codesign --verify --deep --strict --verbose=2 "${archiveAppPath}" 2>&1`, { encoding: 'utf8' })
assert(
  codesignVerifyOut.includes('valid on disk') || codesignVerifyOut.includes('satisfies its Designated Requirement'),
  `codesign verification failed: ${codesignVerifyOut}`
)
const codesignDetailsOut = execSync(`codesign -dvvv "${archiveAppPath}" 2>&1`, { encoding: 'utf8' })
assert(codesignDetailsOut.includes('Identifier=com.innovativenovels.app'), 'Codesign identifier mismatch')
console.log('   ✅ Main App bundle signature verified.')

// 6. Verify Distribution IPA
console.log('📱 Checking iOS Distribution IPA package...')
assert(fs.existsSync(ipaPath), `Distribution IPA not found at ${ipaPath}`)
const zipListOut = execSync(`unzip -l "${ipaPath}"`, { encoding: 'utf8' })
assert(zipListOut.includes('Payload/App.app/App'), 'IPA does not contain Payload/App.app/App binary')
assert(zipListOut.includes('Payload/App.app/_CodeSignature/CodeResources'), 'IPA does not contain _CodeSignature')
console.log('   ✅ Distribution IPA structure and contents verified.')

console.log('\n==================================================')
console.log('IOS_SIGNED_FOR_DISTRIBUTION = VERIFIED')
console.log('==================================================\n')
