import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  describeSigningEnvPresence,
  isDebugKeystorePath,
  ownerAuthorizationRequiredMessage,
  STATUS,
} from './android-distribution-signing.mjs'

const rootDir = process.cwd()
const androidDir = path.join(rootDir, 'android')
const apkUnsignedPath = path.join(androidDir, 'app/build/outputs/apk/release/app-release-unsigned.apk')
const apkSignedPath = path.join(androidDir, 'app/build/outputs/apk/release/app-release.apk')
const aabPath = path.join(androidDir, 'app/build/outputs/bundle/release/app-release.aab')

console.log('🚀 Starting Android release build (distribution signing infrastructure)...')

const envPresence = describeSigningEnvPresence(process.env)
console.log('ℹ️ Signing environment (values not printed):')
for (const [key, value] of Object.entries(envPresence)) {
  if (key === 'complete' || key === 'debugKeystore') {
    continue
  }
  console.log(`   ${key}=${value}`)
}

if (envPresence.debugKeystore) {
  console.error('❌ ANDROID_KEYSTORE_PATH points at debug.keystore. Debug keystore cannot be used as a release/distribution identity.')
  console.log(`ANDROID_SIGNED_FOR_DISTRIBUTION = ${STATUS.REFUTED}`)
  process.exit(1)
}

if (!envPresence.complete) {
  console.log('ℹ️ No complete release signing identity in the environment.')
  console.log('   Gradle will produce unsigned release artifacts.')
}

const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.HOME || '', 'Library/Android/sdk')
const env = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || androidHome,
}

if (!fs.existsSync(path.join(androidDir, 'gradlew'))) {
  console.error('❌ android/gradlew is missing.')
  process.exit(1)
}

console.log('📦 Executing ./gradlew assembleRelease bundleRelease...')
execSync('./gradlew assembleRelease bundleRelease', {
  cwd: androidDir,
  env,
  stdio: 'inherit',
})

const signedApkExists = fs.existsSync(apkSignedPath)
const unsignedApkExists = fs.existsSync(apkUnsignedPath)
const aabExists = fs.existsSync(aabPath)

if (!signedApkExists && !unsignedApkExists && !aabExists) {
  console.error('❌ No Android release APK/AAB was produced.')
  process.exit(1)
}

console.log('\n==================================================')
console.log('ANDROID_RELEASE_BUILD = BUILDABLE')
if (signedApkExists && envPresence.complete) {
  console.log('ANDROID_SIGNING_APPLIED = YES (identity not yet truth-gated)')
  console.log('ANDROID_SIGNED_FOR_DISTRIBUTION = PENDING_TRUTH_GATE')
  console.log('Run: npm run verify:android:signing')
} else {
  console.log(`ANDROID_SIGNED_FOR_DISTRIBUTION = ${STATUS.BLOCKED_BY_OWNER_AUTHORIZATION}`)
  console.log(ownerAuthorizationRequiredMessage())
}
if (unsignedApkExists) {
  console.log(`APK: ${apkUnsignedPath}`)
}
if (signedApkExists) {
  console.log(`APK: ${apkSignedPath}`)
}
if (aabExists) {
  console.log(`AAB: ${aabPath}`)
}
console.log('==================================================\n')
