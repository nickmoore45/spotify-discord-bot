/**
 * Greg Bot - Dependency Check
 * Run: node src/check-deps.js
 */

console.log('=== Greg Bot Dependency Check ===\n');
let allGood = true;

// 1. Node.js version
console.log('1. Node.js version:');
const nodeVersion = process.versions.node;
const [major, minor] = nodeVersion.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 12)) {
  console.log(`   ✅ Node.js ${nodeVersion} (meets >=22.12.0 requirement)`);
} else {
  console.log(`   ❌ Node.js ${nodeVersion} — need 22.12.0+ for @discordjs/voice`);
  console.log('      Download from https://nodejs.org/en/download');
  allGood = false;
}

// 2. Transport encryption (AEAD modes)
console.log('\n2. Transport encryption (aead_aes256_gcm_rtpsize):');
const hasAesGcm = require('node:crypto').getCiphers().includes('aes-256-gcm');
if (hasAesGcm) {
  console.log('   ✅ Node built-in aes-256-gcm available (no extra library needed)');
} else {
  console.log('   ⚠️  aes-256-gcm not in Node crypto — need a fallback library');
  const libs = ['sodium-native', 'sodium', '@stablelib/xchacha20poly1305', '@noble/ciphers', 'libsodium-wrappers'];
  let found = false;
  for (const lib of libs) {
    try { require(lib); console.log(`   ✅ ${lib} found as fallback`); found = true; break; } catch {}
  }
  if (!found) {
    console.log('   ❌ No encryption fallback found. Install one:');
    console.log('      npm install libsodium-wrappers');
    allGood = false;
  }
}

// 3. @discordjs/voice
console.log('\n3. @discordjs/voice:');
try {
  const voice = require('@discordjs/voice');
  if (typeof voice.joinVoiceChannel === 'function') {
    console.log('   ✅ @discordjs/voice loaded');
    if (typeof voice.generateDependencyReport === 'function') {
      console.log('\n   --- generateDependencyReport() ---');
      const report = voice.generateDependencyReport();
      report.split('\n').forEach(line => console.log('   ' + line));
      console.log('   --- end report ---');
    }
  }
} catch (err) {
  console.log(`   ❌ @discordjs/voice failed to load: ${err.message}`);
  allGood = false;
}

// 4. DAVE protocol (E2EE — required since March 2, 2026)
console.log('\n4. DAVE protocol (E2EE):');
try {
  require('@snazzah/davey');
  console.log('   ✅ @snazzah/davey found (bundled with @discordjs/voice)');
} catch {
  console.log('   ⚠️  @snazzah/davey not found — DAVE E2EE may not work');
  console.log('      This should come bundled with @discordjs/voice >=0.18');
  console.log('      Try: npm install @snazzah/davey');
}

// 5. Opus encoder
console.log('\n5. Opus encoder (optional with OggOpus pipeline):');
let hasOpus = false;
try { require('@discordjs/opus'); console.log('   ✅ @discordjs/opus (native)'); hasOpus = true; } catch {}
try { require('opusscript'); console.log('   ✅ opusscript (JS fallback)'); hasOpus = true; } catch {}
if (!hasOpus) {
  console.log('   ℹ️  No Opus encoder — OK, ffmpeg libopus handles encoding');
}

// 6. ffmpeg
console.log('\n6. ffmpeg:');
const { execSync } = require('child_process');
try {
  const version = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
  console.log(`   ✅ ${version}`);
  try {
    const codecs = execSync('ffmpeg -codecs 2>&1', { encoding: 'utf8' });
    console.log(codecs.includes('libopus') ? '   ✅ libopus available' : '   ❌ libopus NOT available — need full/essentials gyan.dev build');
    if (!codecs.includes('libopus')) allGood = false;
  } catch {}
} catch {
  console.log('   ❌ ffmpeg NOT in PATH');
  allGood = false;
}

// 7. librespot
console.log('\n7. librespot:');
const binary = process.platform === 'win32' ? 'librespot.exe' : 'librespot';
try {
  execSync(`where ${binary}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(`   ✅ ${binary} found in PATH`);
} catch {
  try {
    execSync(`which ${binary}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`   ✅ ${binary} found in PATH`);
  } catch {
    console.log(`   ❌ ${binary} NOT in PATH`);
    allGood = false;
  }
}

// 8. Cleanup check
console.log('\n8. Cleanup check:');
let cleanupNeeded = false;
try { require('tweetnacl'); console.log('   ⚠️  tweetnacl installed — unneeded: npm uninstall tweetnacl'); cleanupNeeded = true; } catch {}
try { require('express'); console.log('   ⚠️  express installed — unneeded: npm uninstall express'); cleanupNeeded = true; } catch {}
if (!cleanupNeeded) console.log('   ✅ No stale packages');

// Summary
console.log('\n' + '='.repeat(45));
if (allGood) {
  console.log('✅ All checks passed! Run: npm start');
} else {
  console.log('❌ Fix the issues above, then run this again.');
}
