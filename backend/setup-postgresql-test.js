#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupPostgreSQLTest() {
  console.log('🚀 PostgreSQL Test Setup');
  console.log('========================\n');
  
  console.log('To test PostgreSQL migration, you need a PostgreSQL database.');
  console.log('Here are some free options:\n');
  
  console.log('1. 🆓 Neon (neon.tech) - Free tier with 3GB storage');
  console.log('2. 🆓 Supabase (supabase.com) - Free tier with 500MB storage');
  console.log('3. 🆓 Railway (railway.app) - Free tier with $5 credit');
  console.log('4. 🆓 PlanetScale (planetscale.com) - Free tier with 1GB storage\n');
  
  console.log('📋 Steps to get a free PostgreSQL database:\n');
  console.log('1. Go to https://neon.tech (recommended)');
  console.log('2. Sign up for a free account');
  console.log('3. Create a new project');
  console.log('4. Copy the connection details\n');
  
  const answer = await question('Do you want to proceed with setting up a test database? (y/n): ');
  
  if (answer.toLowerCase() !== 'y') {
    console.log('❌ Setup cancelled');
    rl.close();
    return;
  }
  
  console.log('\n📝 Please provide your PostgreSQL connection details:\n');
  
  const host = await question('Database Host (e.g., db.abcdefghijklmnop.supabase.co): ');
  const port = await question('Database Port (default: 5432): ') || '5432';
  const database = await question('Database Name (default: postgres): ') || 'postgres';
  const username = await question('Database Username (default: postgres): ') || 'postgres';
  const password = await question('Database Password: ');
  
  if (!host || !password) {
    console.log('❌ Host and password are required');
    rl.close();
    return;
  }
  
  // Create test environment file
  const envContent = `# PostgreSQL Test Configuration
DB_TYPE=postgresql
DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${username}
DB_PASSWORD=${password}
NODE_ENV=development
`;
  
  try {
    await fs.writeFile('.env.postgresql-test', envContent);
    console.log('\n✅ Test environment file created: .env.postgresql-test');
    
    console.log('\n📋 Next steps:');
    console.log('1. Copy the contents of .env.postgresql-test to your .env file');
    console.log('2. Run: npm run db:test-connection');
    console.log('3. If successful, run: npm run db:migrate-to-postgresql');
    console.log('4. Test your application: npm run dev');
    
    console.log('\n⚠️  Important:');
    console.log('- Keep your database credentials secure');
    console.log('- This is for testing only - use a separate database for production');
    console.log('- You can switch back to SQLite by setting DB_TYPE=sqlite in .env');
    
  } catch (error) {
    console.error('❌ Failed to create test environment file:', error.message);
  }
  
  rl.close();
}

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// Run setup if called directly
if (require.main === module) {
  setupPostgreSQLTest()
    .then(() => {
      console.log('\n🎉 Setup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupPostgreSQLTest; 