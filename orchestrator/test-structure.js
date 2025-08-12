#!/usr/bin/env node
/**
 * Simple test script to verify orchestrator service structure
 * Run with: node test-structure.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Orchestrator Service Structure...\n');

const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'Dockerfile',
  'README.md',
  '.env.example',
  'src/index.ts',
  'src/config/index.ts',
  'src/config/database.ts', 
  'src/services/OrchestratorService.ts',
  'src/services/PaymentProviderService.ts',
  'src/services/AuditLoggerService.ts',
  'src/queues/QueueService.ts',
  'src/workers/RemittanceWorker.ts',
  'src/workers/CallbackWorker.ts',
  'src/types/index.ts',
  'src/utils/index.ts',
  'prisma/schema.prisma'
];

const requiredDirs = [
  'src',
  'src/config',
  'src/services', 
  'src/queues',
  'src/workers',
  'src/types',
  'src/utils',
  'prisma'
];

let allGood = true;

// Check directories
console.log('📁 Checking directories...');
requiredDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir}`);
  } else {
    console.log(`❌ ${dir} - MISSING`);
    allGood = false;
  }
});

console.log('\n📄 Checking files...');
// Check files
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    console.log(`✅ ${file} (${stats.size} bytes)`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allGood = false;
  }
});

// Check package.json content
console.log('\n📦 Checking package.json...');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['@prisma/client', 'axios', 'bull', 'express', 'ioredis', 'uuid'];
  
  requiredDeps.forEach(dep => {
    if (pkg.dependencies && pkg.dependencies[dep]) {
      console.log(`✅ Dependency: ${dep}`);
    } else {
      console.log(`❌ Missing dependency: ${dep}`);
      allGood = false;
    }
  });
  
  if (pkg.scripts && pkg.scripts.dev && pkg.scripts.build && pkg.scripts.start) {
    console.log('✅ Required scripts present');
  } else {
    console.log('❌ Missing required scripts');
    allGood = false;
  }
} catch (error) {
  console.log('❌ Error reading package.json:', error.message);
  allGood = false;
}

console.log('\n🔧 Checking TypeScript config...');
try {
  const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  if (tsconfig.compilerOptions && tsconfig.compilerOptions.baseUrl && tsconfig.compilerOptions.paths) {
    console.log('✅ TypeScript path mapping configured');
  } else {
    console.log('❌ TypeScript path mapping not configured');
    allGood = false;
  }
} catch (error) {
  console.log('❌ Error reading tsconfig.json:', error.message);
  allGood = false;
}

console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('🎉 ALL CHECKS PASSED! Orchestrator service structure is complete.');
  console.log('\n📋 Next steps:');
  console.log('1. npm install (install dependencies)');
  console.log('2. cp .env.example .env (configure environment)');
  console.log('3. npx prisma generate (generate Prisma client)');
  console.log('4. npm run dev (start development server)');
} else {
  console.log('⚠️  SOME CHECKS FAILED. Please review the missing files/directories above.');
  process.exit(1);
}

console.log('='.repeat(50));

// Additional info
console.log('\n📊 Project Statistics:');
console.log(`Total files checked: ${requiredFiles.length}`);
console.log(`Total directories checked: ${requiredDirs.length}`);

// Calculate total size
let totalSize = 0;
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    totalSize += fs.statSync(file).size;
  }
});
console.log(`Total project size: ${(totalSize / 1024).toFixed(2)} KB`);

console.log('\n🏗️  Architecture Summary:');
console.log('• PostgreSQL-based ledger with ACID transactions');
console.log('• Redis queue system for reliable job processing');
console.log('• Payment provider integration with async callbacks');
console.log('• Comprehensive audit logging and error handling');
console.log('• Docker containerization ready');
console.log('• TypeScript with path mapping configured');

process.exit(0);
