#!/usr/bin/env node

// Test Chrome path detection across platforms
const fs = require('fs');
const path = require('path');

function detectChromePath() {
  const platform = process.platform;
  
  let possiblePaths = [];
  
  switch (platform) {
    case 'win32':
      possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
      ];
      break;
    case 'darwin':
      possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ];
      break;
    case 'linux':
      possiblePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
      ];
      break;
    default:
      console.log(`Platform ${platform} not explicitly supported for Chrome path detection`);
      return null;
  }
  
  console.log(`Testing Chrome detection on ${platform}:`);
  console.log('Checking paths:', possiblePaths);
  
  for (const chromePath of possiblePaths) {
    try {
      if (fs.existsSync(chromePath)) {
        console.log(`✅ Found Chrome at: ${chromePath}`);
        return chromePath;
      } else {
        console.log(`❌ Not found: ${chromePath}`);
      }
    } catch (error) {
      console.log(`❌ Error checking ${chromePath}:`, error.message);
    }
  }
  
  console.log(`❌ Chrome not found at any expected paths for platform: ${platform}`);
  return null;
}

console.log('🔍 Testing Cross-Platform Chrome Detection\n');
const detectedPath = detectChromePath();

if (detectedPath) {
  console.log('\n✅ Chrome detection successful!');
  console.log('Detected path:', detectedPath);
  
  // Test if the detected Chrome executable is actually executable
  try {
    const stats = fs.statSync(detectedPath);
    console.log('✅ File exists and is accessible');
    console.log('File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
  } catch (error) {
    console.log('❌ File access error:', error.message);
  }
} else {
  console.log('\n❌ Chrome detection failed');
  console.log('This may indicate:');
  console.log('- Chrome is not installed');
  console.log('- Chrome is installed in a non-standard location');
  console.log('- Platform-specific paths need to be updated');
}

console.log('\n📋 Cross-platform path summary:');
console.log('Windows: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
console.log('macOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
console.log('Linux: /usr/bin/google-chrome-stable');