import fs from 'node:fs'
import path from 'node:path'

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Wrapper Verification Failed: ${message}`)
    process.exit(1)
  }
}

console.log('🔍 Running Capacitor Wrapper Verification...')

const rootDir = process.cwd()

// 1. Verify capacitor.config.ts
const configPath = path.join(rootDir, 'capacitor.config.ts')
assert(fs.existsSync(configPath), 'capacitor.config.ts does not exist')
const configContent = fs.readFileSync(configPath, 'utf8')
assert(configContent.includes("appId: 'com.innovativenovels.preview'"), 'appId must be com.innovativenovels.preview')
assert(configContent.includes("appName: 'Innovative Novels'"), 'appName must be Innovative Novels')
assert(configContent.includes("webDir: 'dist'"), 'webDir must be dist')

// 2. Verify iOS project structure & asset sync
const iosPath = path.join(rootDir, 'ios')
const iosPublicIndex = path.join(rootDir, 'ios/App/App/public/index.html')
assert(fs.existsSync(iosPath), 'ios project directory does not exist')
assert(fs.existsSync(iosPublicIndex), 'ios web assets not synced (ios/App/App/public/index.html missing)')

// 3. Verify Android project structure & asset sync
const androidPath = path.join(rootDir, 'android')
const androidPublicIndex = path.join(rootDir, 'android/app/src/main/assets/public/index.html')
assert(fs.existsSync(androidPath), 'android project directory does not exist')
assert(fs.existsSync(androidPublicIndex), 'android web assets not synced (android/app/src/main/assets/public/index.html missing)')

// 4. Verify no runtime content API / remote server URL in config
assert(!configContent.includes('server:'), 'Capacitor config must not include a remote server URL')

console.log('✅ Capacitor Wrapper Verification Passed!')
